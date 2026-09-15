use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};

mod db;
mod files;
mod menu;

// Deliberately still "vault-ai.db" after the app was renamed to Vault; see the
// note in src/db/index.ts. The two constants must name the same file.
const DATABASE_FILE: &str = "vault-ai.db";
const DATABASE_URL: &str = "sqlite:vault-ai.db";

// Where the SQL plugin keeps the database: it resolves `sqlite:` URLs against
// the app config folder, not the data folder.
fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join(DATABASE_FILE))
}

// File I/O lives in Rust rather than behind the fs plugin: the plugin scopes
// every path up front, which for a "save wherever you like" export would mean
// granting the webview blanket access to the user's home directory. These
// commands only ever touch the exact path the user picked in the native dialog,
// and never the live database (see files::guard_destination).
#[tauri::command]
fn write_text_file(app: tauri::AppHandle, path: String, contents: String) -> Result<(), String> {
    files::write_atomically(Path::new(&path), &database_path(&app)?, contents.as_bytes())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| error.to_string())
}

// Largest receipt accepted. Attachments are stored inside the database, so an
// unbounded file would bloat every backup from then on.
const MAX_ATTACHMENT_BYTES: usize = 5 * 1024 * 1024;

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;

    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "El archivo pesa {} MB y el máximo es {} MB",
            bytes.len() / (1024 * 1024),
            MAX_ATTACHMENT_BYTES / (1024 * 1024)
        ));
    }

    Ok(BASE64.encode(bytes))
}

#[tauri::command]
fn write_file_base64(app: tauri::AppHandle, path: String, contents: String) -> Result<(), String> {
    let bytes = BASE64
        .decode(contents)
        .map_err(|error| format!("El adjunto está dañado: {error}"))?;

    files::write_atomically(Path::new(&path), &database_path(&app)?, &bytes)
}

// Opens the system print dialog for this window.
//
// `window.print()` from JavaScript is a no-op in the macOS webview — it does
// not throw, it simply does nothing — so the only way to reach the print
// dialog is from the native side.
#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
}

const DATABASE_NOT_OPEN: &str = "La base de datos no está abierta";

// Saves a snapshot of the live database, taken through the SQL plugin's own
// connection pool so it sees exactly what the app sees (see files::backup_to).
#[tauri::command]
async fn backup_database(app: tauri::AppHandle, destination: String) -> Result<(), String> {
    let database = database_path(&app)?;
    let instances = app.state::<DbInstances>();
    let instances = instances.0.read().await;
    let Some(DbPool::Sqlite(pool)) = instances.get(DATABASE_URL) else {
        return Err(DATABASE_NOT_OPEN.to_string());
    };

    files::backup_to(pool, &database, Path::new(&destination)).await
}

// Writes several statements as one transaction, on the SQL plugin's own pool
// (see db::run_batch for why the frontend cannot do this itself).
#[tauri::command]
async fn execute_batch(
    app: tauri::AppHandle,
    statements: Vec<db::Statement>,
) -> Result<Vec<db::StatementResult>, String> {
    let instances = app.state::<DbInstances>();
    let instances = instances.0.read().await;
    let Some(DbPool::Sqlite(pool)) = instances.get(DATABASE_URL) else {
        return Err(DATABASE_NOT_OPEN.to_string());
    };

    db::run_batch(pool, statements).await
}

// Run automatically by the SQL plugin the moment the frontend opens the
// connection (`Database.load`), before that call resolves — so the schema
// is guaranteed to exist by the time any query runs, regardless of when or
// how many times the frontend's own init code executes.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_categories_table",
            sql: "
                CREATE TABLE IF NOT EXISTS categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                    color TEXT NOT NULL,
                    icon TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_transactions_table",
            sql: "
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    amount REAL NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                    category_id INTEGER REFERENCES categories(id),
                    payment_method TEXT NOT NULL,
                    description TEXT,
                    date TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        // Runs exactly once (tracked by sqlx in _sqlx_migrations), so the
        // transaction form always has a category to attach to on first launch.
        Migration {
            version: 3,
            description: "seed_default_categories",
            sql: "
                INSERT INTO categories (name, type, color, icon) VALUES
                    ('Salario', 'income', '#10b981', 'wallet'),
                    ('Freelance', 'income', '#06b6d4', 'briefcase'),
                    ('Comida', 'expense', '#f97316', 'utensils'),
                    ('Transporte', 'expense', '#3b82f6', 'car'),
                    ('Ocio', 'expense', '#a855f7', 'popcorn'),
                    ('Otros', 'expense', '#64748b', 'more-horizontal');
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_currency_to_transactions",
            sql: "
                ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_payment_methods_table",
            sql: "
                CREATE TABLE IF NOT EXISTS payment_methods (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('bank', 'cash', 'wallet', 'card')),
                    currency TEXT NOT NULL
                );

                INSERT INTO payment_methods (name, type, currency) VALUES
                    ('Efectivo ARS', 'cash', 'ARS'),
                    ('Efectivo USD', 'cash', 'USD'),
                    ('Mercado Pago', 'wallet', 'ARS'),
                    ('Cuenta Bancaria ARS', 'bank', 'ARS'),
                    ('Cuenta Bancaria USD', 'bank', 'USD');
            ",
            kind: MigrationKind::Up,
        },
        // SQLite cannot drop or retype a column in place on older versions, so
        // the table is rebuilt. Legacy free-text payment methods are matched
        // back to the seeded rows by name where possible; anything unmatched
        // becomes NULL rather than blocking the migration.
        Migration {
            version: 6,
            description: "link_transactions_to_payment_methods",
            sql: "
                CREATE TABLE transactions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    amount REAL NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                    category_id INTEGER REFERENCES categories(id),
                    payment_method_id INTEGER REFERENCES payment_methods(id),
                    description TEXT,
                    date TEXT NOT NULL,
                    currency TEXT NOT NULL DEFAULT 'ARS'
                );

                INSERT INTO transactions_new
                    (id, amount, type, category_id, payment_method_id, description, date, currency)
                SELECT
                    t.id,
                    t.amount,
                    t.type,
                    t.category_id,
                    (SELECT p.id FROM payment_methods p
                      WHERE p.currency = t.currency
                        AND ((t.payment_method = 'cash' AND p.type = 'cash')
                          OR (t.payment_method = 'mercado_pago' AND p.name = 'Mercado Pago')
                          OR (t.payment_method = 'bank_transfer' AND p.type = 'bank'))
                      LIMIT 1),
                    t.description,
                    t.date,
                    t.currency
                FROM transactions t;

                DROP TABLE transactions;
                ALTER TABLE transactions_new RENAME TO transactions;
            ",
            kind: MigrationKind::Up,
        },
        // The `icon` column originally held lucide icon names. Categories are
        // now labelled with a user-chosen emoji, so the existing seeds are
        // translated in place and the column keeps serving the same purpose.
        Migration {
            version: 7,
            description: "convert_category_icons_to_emoji",
            sql: "
                UPDATE categories SET icon = '💼' WHERE icon = 'briefcase';
                UPDATE categories SET icon = '💰' WHERE icon = 'wallet';
                UPDATE categories SET icon = '🍽️' WHERE icon = 'utensils';
                UPDATE categories SET icon = '🚗' WHERE icon = 'car';
                UPDATE categories SET icon = '🍿' WHERE icon = 'popcorn';
                UPDATE categories SET icon = '📦' WHERE icon = 'more-horizontal';
                UPDATE categories SET icon = '🏷️'
                    WHERE icon IS NULL OR icon = '' OR icon GLOB '*[a-zA-Z-]*';
            ",
            kind: MigrationKind::Up,
        },
        // The app now supports exactly two currencies (see src/lib/currency.ts).
        // Rows saved under any other code — notably the 'EUR' default that
        // migration 4 introduced — were still stored but no longer reachable by
        // any filter, so they had silently disappeared from every view. They are
        // reassigned to ARS: the amounts are kept verbatim, since re-valuing
        // historical figures without a rate for their date would invent data.
        Migration {
            version: 8,
            description: "normalize_unsupported_currencies",
            sql: "
                UPDATE transactions SET currency = 'ARS'
                    WHERE currency NOT IN ('ARS', 'USD');
                UPDATE payment_methods SET currency = 'ARS'
                    WHERE currency NOT IN ('ARS', 'USD');
            ",
            kind: MigrationKind::Up,
        },
        // Accounts previously had no balance at all, so the Accounts view could
        // not answer "how much do I have here?". Existing rows default to 0,
        // which means their balance starts out as the sum of whatever movements
        // are already recorded — the user sets the real opening figure by hand.
        Migration {
            version: 9,
            description: "add_initial_balance_to_payment_methods",
            sql: "
                ALTER TABLE payment_methods
                    ADD COLUMN initial_balance REAL NOT NULL DEFAULT 0;
            ",
            kind: MigrationKind::Up,
        },
        // Transfers between the user's own accounts are neither income nor
        // expense: counting them as either would double the totals and distort
        // every chart. They get their own type, plus a destination account and
        // a destination amount — the latter lets a transfer cross currencies
        // (pesos out, dollars in) by recording both legs verbatim, with no
        // exchange rate involved. The table is rebuilt because SQLite cannot
        // widen an existing CHECK constraint in place.
        Migration {
            version: 10,
            description: "add_transfers_to_transactions",
            sql: "
                CREATE TABLE transactions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    amount REAL NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
                    category_id INTEGER REFERENCES categories(id),
                    payment_method_id INTEGER REFERENCES payment_methods(id),
                    destination_payment_method_id INTEGER REFERENCES payment_methods(id),
                    destination_amount REAL,
                    description TEXT,
                    date TEXT NOT NULL,
                    currency TEXT NOT NULL DEFAULT 'ARS'
                );

                INSERT INTO transactions_new
                    (id, amount, type, category_id, payment_method_id, description, date, currency)
                SELECT id, amount, type, category_id, payment_method_id, description, date, currency
                FROM transactions;

                DROP TABLE transactions;
                ALTER TABLE transactions_new RENAME TO transactions;
            ",
            kind: MigrationKind::Up,
        },
        // Cached exchange rates, one row per day. The app fetches the current
        // rate online but always persists it here, so conversions keep working
        // offline with the last known figure instead of failing outright — and
        // so a past movement can eventually be valued at its own date's rate.
        Migration {
            version: 11,
            description: "create_exchange_rates_table",
            sql: "
                CREATE TABLE IF NOT EXISTS exchange_rates (
                    date TEXT PRIMARY KEY,
                    buy REAL NOT NULL,
                    sell REAL NOT NULL,
                    source TEXT NOT NULL,
                    fetched_at TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        // A placeholder account for orphaned history cannot honestly claim to be
        // cash or a bank, and the CHECK constraint admitted nothing else, so the
        // table has to be rebuilt — SQLite cannot widen a CHECK in place.
        //
        // Unlike the earlier rebuilds, this one replaces a table that other rows
        // point AT. With foreign keys enforced (which is sqlx's default, and the
        // reason a plain sqlite3 run of this migration is misleading), dropping
        // it fails outright, and `defer_foreign_keys` only moves the same failure
        // to COMMIT because a schema change never clears the violation counter.
        // So the references are parked, the table is swapped while nothing points
        // at it, and then they are put back — all inside the one transaction the
        // migration runs in, so a failure anywhere rolls the whole thing back.
        Migration {
            version: 12,
            description: "add_other_payment_method_type",
            sql: "
                CREATE TEMP TABLE parked_refs AS
                    SELECT id, payment_method_id, destination_payment_method_id
                    FROM transactions;

                UPDATE transactions
                    SET payment_method_id = NULL,
                        destination_payment_method_id = NULL;

                CREATE TABLE payment_methods_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('bank', 'cash', 'wallet', 'card', 'other')),
                    currency TEXT NOT NULL,
                    initial_balance REAL NOT NULL DEFAULT 0
                );

                INSERT INTO payment_methods_new (id, name, type, currency, initial_balance)
                SELECT id, name, type, currency, initial_balance FROM payment_methods;

                DROP TABLE payment_methods;
                ALTER TABLE payment_methods_new RENAME TO payment_methods;

                UPDATE transactions SET
                    payment_method_id = (
                        SELECT p.payment_method_id FROM parked_refs p
                        WHERE p.id = transactions.id
                    ),
                    destination_payment_method_id = (
                        SELECT p.destination_payment_method_id FROM parked_refs p
                        WHERE p.id = transactions.id
                    );

                DROP TABLE parked_refs;
            ",
            kind: MigrationKind::Up,
        },
        // Transactions recorded before accounts existed were left unattached by
        // migration 6, so they contributed to no balance at all. They are moved
        // onto a per-currency placeholder rather than onto a real account, which
        // would credit money to somewhere it never passed through. The accounts
        // are only created when there is actually something to put in them, so a
        // fresh install does not inherit two empty placeholders.
        Migration {
            version: 13,
            description: "attach_orphan_transactions_to_placeholder_accounts",
            sql: "
                INSERT INTO payment_methods (name, type, currency, initial_balance)
                SELECT 'Sin asignar (ARS)', 'other', 'ARS', 0
                WHERE EXISTS (
                    SELECT 1 FROM transactions
                    WHERE payment_method_id IS NULL AND currency = 'ARS'
                );

                INSERT INTO payment_methods (name, type, currency, initial_balance)
                SELECT 'Sin asignar (USD)', 'other', 'USD', 0
                WHERE EXISTS (
                    SELECT 1 FROM transactions
                    WHERE payment_method_id IS NULL AND currency = 'USD'
                );

                UPDATE transactions
                SET payment_method_id =
                    (SELECT id FROM payment_methods WHERE name = 'Sin asignar (ARS)')
                WHERE payment_method_id IS NULL AND currency = 'ARS';

                UPDATE transactions
                SET payment_method_id =
                    (SELECT id FROM payment_methods WHERE name = 'Sin asignar (USD)')
                WHERE payment_method_id IS NULL AND currency = 'USD';
            ",
            kind: MigrationKind::Up,
        },
        // Every list and filter in the app sorts or narrows by these columns, and
        // the table had no index at all — fine at 50 rows, not at a few thousand.
        Migration {
            version: 14,
            description: "index_transaction_lookup_columns",
            sql: "
                CREATE INDEX IF NOT EXISTS idx_transactions_date
                    ON transactions(date);
                CREATE INDEX IF NOT EXISTS idx_transactions_category
                    ON transactions(category_id);
                CREATE INDEX IF NOT EXISTS idx_transactions_payment_method
                    ON transactions(payment_method_id);
                CREATE INDEX IF NOT EXISTS idx_transactions_destination
                    ON transactions(destination_payment_method_id);
            ",
            kind: MigrationKind::Up,
        },
        // Text rules that map a description to a category, so recurring
        // descriptions ("Netflix", "Coto") stop needing to be classified by
        // hand. ON DELETE CASCADE because foreign keys are enforced: without it,
        // deleting a category that a rule points at would fail outright.
        Migration {
            version: 15,
            description: "create_category_rules_table",
            sql: "
                CREATE TABLE IF NOT EXISTS category_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pattern TEXT NOT NULL,
                    category_id INTEGER NOT NULL
                        REFERENCES categories(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_category_rules_category
                    ON category_rules(category_id);
            ",
            kind: MigrationKind::Up,
        },
        // Tags cut across categories: a transaction belongs to exactly one
        // category but can carry any number of tags ("viaje bariloche"), which
        // is what makes one-off groupings possible without polluting the
        // category taxonomy.
        //
        // NOTE for future migrations: transaction_tags points AT transactions.
        // Rebuilding the transactions table from here on must park these
        // references first, the way migration 12 does for payment_methods —
        // foreign keys are enforced, so a plain DROP TABLE will fail.
        Migration {
            version: 16,
            description: "create_tags_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE COLLATE NOCASE
                );

                CREATE TABLE IF NOT EXISTS transaction_tags (
                    transaction_id INTEGER NOT NULL
                        REFERENCES transactions(id) ON DELETE CASCADE,
                    tag_id INTEGER NOT NULL
                        REFERENCES tags(id) ON DELETE CASCADE,
                    PRIMARY KEY (transaction_id, tag_id)
                );

                CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag
                    ON transaction_tags(tag_id);
            ",
            kind: MigrationKind::Up,
        },
        // A spending cap per category. Budgets are per currency because ARS and
        // USD totals are never comparable, and per period because some limits
        // are naturally monthly (groceries) and others annual (insurance).
        // The UNIQUE constraint stops the same cap being defined twice, which
        // would make "how much is left?" ambiguous.
        Migration {
            version: 17,
            description: "create_budgets_table",
            sql: "
                CREATE TABLE IF NOT EXISTS budgets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_id INTEGER NOT NULL
                        REFERENCES categories(id) ON DELETE CASCADE,
                    currency TEXT NOT NULL,
                    amount REAL NOT NULL,
                    period TEXT NOT NULL CHECK (period IN ('monthly', 'annual')),
                    UNIQUE (category_id, currency, period)
                );
            ",
            kind: MigrationKind::Up,
        },
        // Templates for movements that repeat: rent, salary, subscriptions.
        // They are proposals, not transactions — nothing reaches the ledger until
        // the user confirms it, so a rent increase or a month that did not happen
        // never turns into a wrong record.
        //
        // `start_date` is the anchor the whole series is derived from, which is
        // what keeps a template due on the 31st from collapsing onto the 28th
        // after one February. `last_confirmed_date` is the most recent occurrence
        // already accepted or dismissed; everything after it is still pending.
        // ON DELETE SET NULL so removing a category or account leaves the
        // template usable rather than failing the delete outright.
        Migration {
            version: 18,
            description: "create_recurring_transactions_table",
            sql: "
                CREATE TABLE IF NOT EXISTS recurring_transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT NOT NULL,
                    amount REAL NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                    payment_method_id INTEGER
                        REFERENCES payment_methods(id) ON DELETE SET NULL,
                    currency TEXT NOT NULL,
                    frequency TEXT NOT NULL
                        CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
                    start_date TEXT NOT NULL,
                    last_confirmed_date TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1
                );
            ",
            kind: MigrationKind::Up,
        },
        // Receipts live inside the database rather than in a folder beside it,
        // so the existing backup covers them with no extra machinery.
        //
        // Stored base64 in a TEXT column, not as a BLOB: tauri-plugin-sql binds
        // parameters as JSON and only understands null, string and number, so a
        // byte array would be written as serialised JSON rather than binary.
        // Base64 costs about a third more space and is otherwise equivalent.
        Migration {
            version: 19,
            description: "create_attachments_table",
            sql: "
                CREATE TABLE IF NOT EXISTS attachments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    transaction_id INTEGER NOT NULL
                        REFERENCES transactions(id) ON DELETE CASCADE,
                    file_name TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    byte_size INTEGER NOT NULL,
                    content_base64 TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_attachments_transaction
                    ON attachments(transaction_id);
            ",
            kind: MigrationKind::Up,
        },
        // Purchases paid in instalments. Modelled as a plan rather than as N
        // transactions written up front: each instalment is proposed on its due
        // date and only becomes a real movement once confirmed, so a plan that
        // gets cancelled or refinanced never leaves invented history behind.
        //
        // `confirmed_count` is how many instalments have been dealt with; what
        // is still owed is derived from it, which keeps the two from drifting
        // apart the way a stored balance would.
        Migration {
            version: 20,
            description: "create_installment_plans_table",
            sql: "
                CREATE TABLE IF NOT EXISTS installment_plans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT NOT NULL,
                    total_amount REAL NOT NULL,
                    installment_count INTEGER NOT NULL CHECK (installment_count > 0),
                    currency TEXT NOT NULL,
                    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                    payment_method_id INTEGER
                        REFERENCES payment_methods(id) ON DELETE SET NULL,
                    first_due_date TEXT NOT NULL,
                    confirmed_count INTEGER NOT NULL DEFAULT 0
                        CHECK (confirmed_count >= 0),
                    created_at TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        // Savings goals. How progress is measured is chosen per goal, because
        // both ways are legitimate and neither covers the other: 'account'
        // watches the real balance of an account and needs no bookkeeping at
        // all, while 'contributions' lets several goals share one account, or
        // track saving that no single account reflects.
        Migration {
            version: 21,
            description: "create_savings_goals_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS savings_goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    target_amount REAL NOT NULL CHECK (target_amount > 0),
                    currency TEXT NOT NULL,
                    tracking_mode TEXT NOT NULL
                        CHECK (tracking_mode IN ('account', 'contributions')),
                    payment_method_id INTEGER
                        REFERENCES payment_methods(id) ON DELETE SET NULL,
                    target_date TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS savings_contributions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_id INTEGER NOT NULL
                        REFERENCES savings_goals(id) ON DELETE CASCADE,
                    amount REAL NOT NULL,
                    date TEXT NOT NULL,
                    note TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_savings_contributions_goal
                    ON savings_contributions(goal_id);
            ",
            kind: MigrationKind::Up,
        },
        // A small key-value store for things the app needs to remember about
        // itself rather than about the user's money — starting with when the
        // last backup was taken, which is what the reminder is measured from.
        //
        // Deliberately inside the database: a backup then carries the moment it
        // was made, so restoring one on a new machine does not pretend a fresh
        // copy was just taken.
        Migration {
            version: 22,
            description: "create_app_settings_table",
            sql: "
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        // One dollar rate was never going to be enough: the official, blue, MEP,
        // CCL, crypto and card quotes are all real prices, and which one values
        // a movement honestly depends on how that movement actually happened.
        //
        // The primary key has to widen from `date` to `(date, rate_type)`, and
        // SQLite cannot alter a primary key in place, so the table is rebuilt.
        // Existing rows are the MEP series that has already been downloaded —
        // thousands of quotes back to 2018 — so they are carried over as
        // 'bolsa' rather than discarded.
        Migration {
            version: 23,
            description: "add_rate_type_to_exchange_rates",
            sql: "
                CREATE TABLE exchange_rates_new (
                    date TEXT NOT NULL,
                    rate_type TEXT NOT NULL DEFAULT 'bolsa',
                    buy REAL NOT NULL,
                    sell REAL NOT NULL,
                    source TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    PRIMARY KEY (date, rate_type)
                );

                INSERT INTO exchange_rates_new
                    (date, rate_type, buy, sell, source, fetched_at)
                SELECT date, 'bolsa', buy, sell, source, fetched_at
                FROM exchange_rates;

                DROP TABLE exchange_rates;
                ALTER TABLE exchange_rates_new RENAME TO exchange_rates;
            ",
            kind: MigrationKind::Up,
        },
        // Loans, which the instalment plans above cannot express: they have a
        // direction (money I owe versus money owed to me) and they can carry
        // interest, so each payment splits into capital and interest instead of
        // being one flat figure.
        //
        // Following the same principle as installment_plans, only
        // `confirmed_count` is stored. Every payment, its due date, the split
        // between capital and interest and the outstanding balance are derived
        // from the loan's terms (see src/lib/loans.ts), so nothing can drift
        // out of sync with anything else.
        //
        // `annual_rate` of 0 is deliberately valid and collapses the French
        // system into equal payments — which is exactly what an interest-free
        // loan between two people is, with no special case anywhere.
        Migration {
            version: 24,
            description: "create_loans_table",
            sql: "
                CREATE TABLE IF NOT EXISTS loans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    direction TEXT NOT NULL
                        CHECK (direction IN ('borrowed', 'lent')),
                    counterparty TEXT NOT NULL,
                    description TEXT NOT NULL,
                    principal REAL NOT NULL CHECK (principal > 0),
                    currency TEXT NOT NULL,
                    annual_rate REAL NOT NULL DEFAULT 0 CHECK (annual_rate >= 0),
                    installment_count INTEGER NOT NULL
                        CHECK (installment_count > 0),
                    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                    payment_method_id INTEGER
                        REFERENCES payment_methods(id) ON DELETE SET NULL,
                    first_due_date TEXT NOT NULL,
                    confirmed_count INTEGER NOT NULL DEFAULT 0
                        CHECK (confirmed_count >= 0),
                    created_at TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        // What a purchase in instalments really costs is not visible from the
        // financed total alone: the useful figure is the difference against the
        // cash price, which is the other number the shop actually quotes.
        //
        // Deliberately the cash price rather than an interest rate. Nobody is
        // told the rate of "12 cuotas fijas" — they are shown two prices — so
        // asking for a rate would mean asking the user to derive it.
        //
        // Nullable, because plenty of purchases are genuinely interest-free and
        // older rows predate the column; NULL means "not recorded", which is
        // different from "no surcharge".
        Migration {
            version: 25,
            description: "add_cash_price_to_installment_plans",
            sql: "
                ALTER TABLE installment_plans ADD COLUMN cash_price REAL;
            ",
            kind: MigrationKind::Up,
        },
        // One-off movements the user knows are coming: a wedding in November,
        // this year's VTV, a bonus in December.
        //
        // Deliberately not a recurring template — those already cover anything
        // that repeats, yearly included — and deliberately not an instalment
        // plan of one, which is what someone would otherwise reach for: a plan
        // counts towards `outstandingByCurrency`, so a purchase that has not
        // happened yet would show up as debt against the user's net worth.
        //
        // `status` has three values rather than being a boolean because
        // deciding against something and going through with it are different
        // facts, and the app should not lose which one happened.
        Migration {
            version: 26,
            description: "create_expected_movements_table",
            sql: "
                CREATE TABLE IF NOT EXISTS expected_movements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT NOT NULL,
                    amount REAL NOT NULL CHECK (amount > 0),
                    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                    currency TEXT NOT NULL,
                    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                    payment_method_id INTEGER
                        REFERENCES payment_methods(id) ON DELETE SET NULL,
                    due_date TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'dismissed')),
                    transaction_id INTEGER
                        REFERENCES transactions(id) ON DELETE SET NULL,
                    created_at TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        // Deleting a transaction reopens the expected movement it was confirmed
        // into, which means finding that movement by `transaction_id` — and the
        // foreign key's ON DELETE SET NULL was already making the same search on
        // every transaction delete, scanning the whole table each time.
        Migration {
            version: 27,
            description: "index_expected_movements_transaction",
            sql: "
                CREATE INDEX IF NOT EXISTS idx_expected_movements_transaction
                    ON expected_movements(transaction_id);
            ",
            kind: MigrationKind::Up,
        },
        // Rules the dialogs already check but nothing below them enforced. A
        // row in a currency the app does not know silently vanishes from every
        // view (migration 8 once had to rescue such rows); a transfer with no
        // destination moves money out of one account and into none; a plan
        // edited down below the instalments already paid claims more paid than
        // it has.
        //
        // Triggers rather than CHECK constraints because adding a CHECK means
        // rebuilding the table, and transactions has other tables pointing at
        // it. They guard writes only, so rows already stored are left as they
        // are, and the UPDATE triggers fire only when a guarded column is
        // written — an old transfer that lost its destination can still be
        // moved to another account or recategorised.
        Migration {
            version: 28,
            description: "enforce_integrity_rules",
            sql: "
                CREATE TRIGGER IF NOT EXISTS transactions_check_insert
                BEFORE INSERT ON transactions
                BEGIN
                    SELECT RAISE(ABORT, 'transactions: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                    SELECT RAISE(ABORT, 'transactions: amount must be positive')
                        WHERE NEW.amount <= 0;
                    SELECT RAISE(ABORT, 'transactions: destination amount must be positive')
                        WHERE NEW.destination_amount IS NOT NULL AND NEW.destination_amount <= 0;
                    SELECT RAISE(ABORT, 'transactions: a transfer needs a destination account')
                        WHERE NEW.type = 'transfer' AND NEW.destination_payment_method_id IS NULL;
                END;

                CREATE TRIGGER IF NOT EXISTS transactions_check_update
                BEFORE UPDATE OF amount, type, currency, destination_payment_method_id,
                    destination_amount ON transactions
                BEGIN
                    SELECT RAISE(ABORT, 'transactions: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                    SELECT RAISE(ABORT, 'transactions: amount must be positive')
                        WHERE NEW.amount <= 0;
                    SELECT RAISE(ABORT, 'transactions: destination amount must be positive')
                        WHERE NEW.destination_amount IS NOT NULL AND NEW.destination_amount <= 0;
                    SELECT RAISE(ABORT, 'transactions: a transfer needs a destination account')
                        WHERE NEW.type = 'transfer' AND NEW.destination_payment_method_id IS NULL;
                END;

                CREATE TRIGGER IF NOT EXISTS payment_methods_check_insert
                BEFORE INSERT ON payment_methods
                BEGIN
                    SELECT RAISE(ABORT, 'payment_methods: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS payment_methods_check_update
                BEFORE UPDATE OF currency ON payment_methods
                BEGIN
                    SELECT RAISE(ABORT, 'payment_methods: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS recurring_transactions_check_insert
                BEFORE INSERT ON recurring_transactions
                BEGIN
                    SELECT RAISE(ABORT, 'recurring_transactions: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS recurring_transactions_check_update
                BEFORE UPDATE OF currency ON recurring_transactions
                BEGIN
                    SELECT RAISE(ABORT, 'recurring_transactions: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS expected_movements_check_insert
                BEFORE INSERT ON expected_movements
                BEGIN
                    SELECT RAISE(ABORT, 'expected_movements: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS expected_movements_check_update
                BEFORE UPDATE OF currency ON expected_movements
                BEGIN
                    SELECT RAISE(ABORT, 'expected_movements: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS savings_goals_check_insert
                BEFORE INSERT ON savings_goals
                BEGIN
                    SELECT RAISE(ABORT, 'savings_goals: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS savings_goals_check_update
                BEFORE UPDATE OF currency ON savings_goals
                BEGIN
                    SELECT RAISE(ABORT, 'savings_goals: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS budgets_check_insert
                BEFORE INSERT ON budgets
                BEGIN
                    SELECT RAISE(ABORT, 'budgets: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS budgets_check_update
                BEFORE UPDATE OF currency ON budgets
                BEGIN
                    SELECT RAISE(ABORT, 'budgets: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS installment_plans_check_insert
                BEFORE INSERT ON installment_plans
                BEGIN
                    SELECT RAISE(ABORT, 'installment_plans: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS installment_plans_check_update
                BEFORE UPDATE OF currency, installment_count, confirmed_count
                    ON installment_plans
                BEGIN
                    SELECT RAISE(ABORT, 'installment_plans: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                    SELECT RAISE(ABORT, 'installment_plans: more instalments paid than the plan has')
                        WHERE NEW.confirmed_count > NEW.installment_count;
                END;

                CREATE TRIGGER IF NOT EXISTS loans_check_insert
                BEFORE INSERT ON loans
                BEGIN
                    SELECT RAISE(ABORT, 'loans: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                END;

                CREATE TRIGGER IF NOT EXISTS loans_check_update
                BEFORE UPDATE OF currency, installment_count, confirmed_count ON loans
                BEGIN
                    SELECT RAISE(ABORT, 'loans: currency must be ARS or USD')
                        WHERE NEW.currency NOT IN ('ARS', 'USD');
                    SELECT RAISE(ABORT, 'loans: more payments made than the loan has')
                        WHERE NEW.confirmed_count > NEW.installment_count;
                END;
            ",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        // Restores the size and position the window was last closed at, and
        // saves them again on exit.
        //
        // Everything except the decorations: restoring those re-applies a
        // standard title bar over the transparent one configured in
        // tauri.conf.json, which put the native bar back on every launch and
        // left a strip the app cannot draw into.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations())
                .build(),
        )
        .setup(|app| {
            app.set_menu(menu::build(app.handle())?)?;
            Ok(())
        })
        .on_menu_event(|app, event| menu::handle_event(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            read_text_file,
            read_file_base64,
            write_file_base64,
            backup_database,
            execute_batch,
            print_window
        ]);

    // Desktop only, because the updater crate is not built for mobile targets.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
