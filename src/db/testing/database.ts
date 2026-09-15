import { DatabaseSync } from "node:sqlite";
import { parseMigrations } from "./migrations";
import type { BatchStatement, QueryResult, SqlConnection } from "@/db";

// An in-memory database with the app's real schema, exposing the same two
// methods the app calls. The point is that the SQL under test is executed
// rather than asserted against as a string: a wrong column name, a broken JOIN
// or a foreign key that does not hold up will fail here the same way it would
// fail in the app.
export function createTestDatabase(): SqlConnection & { close: () => void } {
  const db = new DatabaseSync(":memory:");

  // sqlx enables this and the app therefore runs with it on. The default is
  // OFF, and the difference is not cosmetic: without it, deletes do not cascade
  // and orphan rows appear that the real app could never produce.
  db.exec("PRAGMA foreign_keys = ON");

  for (const migration of parseMigrations()) {
    db.exec(migration.sql);
  }

  // The app writes `$1`, `$2`… which SQLite reads as *named* parameters, so
  // they have to be bound by name rather than by position.
  function bind(values: unknown[]): Record<string, unknown> {
    return Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
  }

  return {
    select<T>(query: string, values: unknown[] = []): Promise<T> {
      const rows = db.prepare(query).all(bind(values) as never);
      // node:sqlite returns null-prototype objects; spreading them gives the
      // plain objects the rest of the app (and Vitest's matchers) expect.
      return Promise.resolve(rows.map((row) => ({ ...row })) as T);
    },

    execute(query: string, values: unknown[] = []): Promise<QueryResult> {
      const result = db.prepare(query).run(bind(values) as never);
      return Promise.resolve({
        rowsAffected: Number(result.changes),
        lastInsertId: Number(result.lastInsertRowid),
      });
    },

    // Mirrors db::run_batch in src-tauri/src/db.rs: one transaction, undone
    // as a whole when a statement fails or changes the wrong number of rows.
    batch(statements: BatchStatement[]): Promise<QueryResult[]> {
      const results: QueryResult[] = [];
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.forEach((statement, index) => {
          const values = (statement.values ?? []).map((value) => {
            if (value !== null && typeof value === "object" && "insertedIdOf" in value) {
              const earlier = results[(value as { insertedIdOf: number }).insertedIdOf];
              if (earlier === undefined) {
                throw new Error(`Statement ${index} refers to one that has not run`);
              }
              return earlier.lastInsertId;
            }
            return value;
          });

          const result = db.prepare(statement.query).run(bind(values) as never);
          const changes = Number(result.changes);
          if (
            statement.expectChanges !== undefined &&
            changes !== statement.expectChanges
          ) {
            throw new Error(
              `Statement ${index} changed ${changes} rows instead of ${statement.expectChanges}`,
            );
          }
          results.push({
            rowsAffected: changes,
            lastInsertId: Number(result.lastInsertRowid),
          });
        });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      return Promise.resolve(results);
    },

    close() {
      db.close();
    },
  };
}
