use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::query::Query;
use sqlx::sqlite::SqliteArguments;
use sqlx::{Sqlite, SqlitePool};

// One statement of a batch, as the frontend sends it (see src/db/index.ts).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    query: String,
    #[serde(default)]
    values: Vec<JsonValue>,
    // When set, the statement must change exactly this many rows or the whole
    // batch is undone. This is what turns "advance the plan from 2 to 3" into a
    // compare-and-set: a second click finds the plan already at 3, changes
    // nothing, and takes its transaction down with it.
    expect_changes: Option<u64>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StatementResult {
    rows_affected: u64,
    last_insert_id: i64,
}

// The frontend's stand-in for "the id the statement at this position
// inserted", which it cannot know when it builds the batch.
const INSERTED_ID_OF: &str = "insertedIdOf";

// Binds the way tauri-plugin-sql does, so a statement means the same thing
// whether it runs alone or inside a batch — except that whole numbers are bound
// as integers rather than as floats.
fn bind<'q>(
    query: Query<'q, Sqlite, SqliteArguments<'q>>,
    value: JsonValue,
    results: &[StatementResult],
) -> Result<Query<'q, Sqlite, SqliteArguments<'q>>, String> {
    Ok(match value {
        JsonValue::Null => query.bind(None::<String>),
        JsonValue::String(text) => query.bind(text),
        JsonValue::Bool(flag) => query.bind(flag),
        JsonValue::Number(number) => match number.as_i64() {
            Some(integer) => query.bind(integer),
            None => query.bind(number.as_f64().unwrap_or_default()),
        },
        JsonValue::Object(object) => {
            let index = object
                .get(INSERTED_ID_OF)
                .and_then(JsonValue::as_u64)
                .ok_or_else(|| format!("Unsupported parameter: {object:?}"))?;
            let earlier = results
                .get(index as usize)
                .ok_or_else(|| format!("Statement {index} has not run yet"))?;
            query.bind(earlier.last_insert_id)
        }
        JsonValue::Array(_) => return Err("Unsupported parameter: array".to_string()),
    })
}

// Runs every statement on one connection inside one transaction: either all of
// them are written or none is.
//
// This has to live in Rust. The plugin sends each `execute` to whichever pooled
// connection is free, so a BEGIN issued from the frontend would open a
// transaction on one connection while the statements after it ran on others.
//
// BEGIN IMMEDIATE takes the write lock up front. A deferred transaction that
// read first and wrote later could hit SQLITE_BUSY at the upgrade, which the
// busy timeout does not wait out.
pub async fn run_batch(
    pool: &SqlitePool,
    statements: Vec<Statement>,
) -> Result<Vec<StatementResult>, String> {
    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;
    let mut results = Vec::with_capacity(statements.len());

    for (index, statement) in statements.into_iter().enumerate() {
        let mut query = sqlx::query(&statement.query);
        for value in statement.values {
            query = bind(query, value, &results)?;
        }

        let done = query
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;

        if let Some(expected) = statement.expect_changes {
            if done.rows_affected() != expected {
                // Dropping the transaction without committing rolls it back.
                return Err(format!(
                    "Statement {index} changed {} rows instead of {expected}",
                    done.rows_affected()
                ));
            }
        }

        results.push(StatementResult {
            rows_affected: done.rows_affected(),
            last_insert_id: done.last_insert_rowid(),
        });
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;

    async fn open_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE plans (id INTEGER PRIMARY KEY, confirmed INTEGER NOT NULL);
             CREATE TABLE movements (id INTEGER PRIMARY KEY, plan_id INTEGER, amount REAL);
             INSERT INTO plans (id, confirmed) VALUES (1, 0);",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    fn statements(value: serde_json::Value) -> Vec<Statement> {
        serde_json::from_value(value).unwrap()
    }

    async fn count_movements(pool: &SqlitePool) -> i64 {
        sqlx::query("SELECT COUNT(*) FROM movements")
            .fetch_one(pool)
            .await
            .unwrap()
            .get(0)
    }

    async fn confirmed(pool: &SqlitePool) -> i64 {
        sqlx::query("SELECT confirmed FROM plans WHERE id = 1")
            .fetch_one(pool)
            .await
            .unwrap()
            .get(0)
    }

    fn confirm_first() -> serde_json::Value {
        json!([
            {
                "query": "UPDATE plans SET confirmed = confirmed + 1 WHERE id = $1 AND confirmed = $2",
                "values": [1, 0],
                "expectChanges": 1
            },
            {
                "query": "INSERT INTO movements (plan_id, amount) VALUES ($1, $2)",
                "values": [1, 99.5]
            }
        ])
    }

    #[test]
    fn writes_every_statement() {
        tauri::async_runtime::block_on(async {
            let pool = open_pool().await;

            let results = run_batch(&pool, statements(confirm_first())).await.unwrap();

            assert_eq!(results.len(), 2);
            assert_eq!(results[1].last_insert_id, 1);
            assert_eq!(confirmed(&pool).await, 1);
            assert_eq!(count_movements(&pool).await, 1);
        });
    }

    #[test]
    fn a_compare_and_set_that_misses_undoes_the_whole_batch() {
        tauri::async_runtime::block_on(async {
            let pool = open_pool().await;
            run_batch(&pool, statements(confirm_first())).await.unwrap();

            // The second click: same payload, plan already advanced.
            let result = run_batch(&pool, statements(confirm_first())).await;

            assert!(result.is_err());
            assert_eq!(confirmed(&pool).await, 1);
            assert_eq!(count_movements(&pool).await, 1);
        });
    }

    #[test]
    fn a_failing_statement_undoes_the_ones_before_it() {
        tauri::async_runtime::block_on(async {
            let pool = open_pool().await;

            let result = run_batch(
                &pool,
                statements(json!([
                    { "query": "INSERT INTO movements (plan_id, amount) VALUES (1, 10)" },
                    { "query": "INSERT INTO nowhere (id) VALUES (1)" }
                ])),
            )
            .await;

            assert!(result.is_err());
            assert_eq!(count_movements(&pool).await, 0);
        });
    }

    #[test]
    fn refers_to_an_id_inserted_earlier_in_the_batch() {
        tauri::async_runtime::block_on(async {
            let pool = open_pool().await;
            sqlx::query("INSERT INTO movements (plan_id, amount) VALUES (NULL, 1)")
                .execute(&pool)
                .await
                .unwrap();

            run_batch(
                &pool,
                statements(json!([
                    { "query": "INSERT INTO plans (confirmed) VALUES (0)" },
                    {
                        "query": "INSERT INTO movements (plan_id, amount) VALUES ($1, 5)",
                        "values": [{ "insertedIdOf": 0 }]
                    }
                ])),
            )
            .await
            .unwrap();

            let plan_id: i64 = sqlx::query("SELECT plan_id FROM movements WHERE amount = 5")
                .fetch_one(&pool)
                .await
                .unwrap()
                .get(0);
            assert_eq!(plan_id, 2);
        });
    }

    #[test]
    fn refuses_a_reference_to_a_statement_that_has_not_run() {
        tauri::async_runtime::block_on(async {
            let pool = open_pool().await;

            let result = run_batch(
                &pool,
                statements(json!([{
                    "query": "INSERT INTO movements (plan_id, amount) VALUES ($1, 5)",
                    "values": [{ "insertedIdOf": 3 }]
                }])),
            )
            .await;

            assert!(result.is_err());
            assert_eq!(count_movements(&pool).await, 0);
        });
    }
}
