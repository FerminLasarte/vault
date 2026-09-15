import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseMigrations } from "./testing/migrations";

// The migrations are SQL strings inside Rust, so nothing type-checks them and a
// mistake only surfaces when the app opens the database — where a single failing
// migration makes `Database.load` reject and the whole app come up empty.
//
// The important detail is `PRAGMA foreign_keys=ON`. sqlx (and therefore
// tauri-plugin-sql) enables it, but the sqlite3 CLI defaults it OFF, so running
// these statements by hand passes migrations that fail in the real app. That
// exact gap let a broken migration ship once; every run here enforces them.

let workspace: string;

function newDatabase(name: string): string {
  return join(workspace, `${name}.db`);
}

function sql(database: string, statements: string): string {
  return execFileSync("sqlite3", [database], {
    input: statements,
    encoding: "utf8",
  });
}

// Mirrors how tauri-plugin-sql applies them: foreign keys enforced, one
// transaction per migration, stopping at the first failure.
function applyMigrations(database: string, from = 0): void {
  for (const migration of parseMigrations()) {
    if (migration.version <= from) continue;
    try {
      sql(database, `PRAGMA foreign_keys=ON;\nBEGIN;\n${migration.sql}\nCOMMIT;\n`);
    } catch (error) {
      throw new Error(
        `Migration ${migration.version} (${migration.description}) failed: ${
          (error as { stderr?: string }).stderr ?? String(error)
        }`,
        { cause: error },
      );
    }
  }
}

function query(database: string, statement: string): string {
  return sql(database, statement).trim();
}

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), "vault-migrations-"));
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

// The SQL of every migration that has reached users, as a sha256 of the string
// in src-tauri/src/lib.rs.
//
// sqlx records a checksum for each migration it applies and refuses to open the
// database if the SQL of an applied version later changes — whitespace
// included. The plugin runs migrations inside `Database.load`, so an edited
// migration makes every existing install come up empty on "No se pudieron
// cargar los datos", with no way out. A shipped migration is therefore frozen:
// fix it with a new one instead.
//
// When a release ships new migrations, add their hashes here (the failure
// message below prints them).
const SHIPPED_MIGRATIONS: Record<number, string> = {
  1: "3eca9c5d8b69f8fae8a029620e220cb2fdd6fc49c78925975059b3b7057e2bff",
  2: "e1d7880244d287647af523a10045b7f5b5703c9fd49474534dad77d347a70cac",
  3: "635defd68e0fb3995d1d09e11a4dc89a6e2969035e8e05477c90a0996ee14f25",
  4: "4206baf3f472704a6fbb3c1a1fe41d43714e898e4d4a79d10b87cf85e0e9979f",
  5: "c95f2621837f519fbbfd53739b633475478f7a72f2d7e7567b897123f93f0f65",
  6: "aee563a55dca6db6b93e4c099ca38a74e610ebb7a0d353b08453d7bd8cab8eae",
  7: "05182c69a5cf499009028724edfc2dc36c7cc2c4ad8c1f78b772c9946f261e64",
  8: "0abf7944eefb507329b6b36e04b3f731410f994d6161d441eac2be9448d0a384",
  9: "cf2d99837ab296d3fbd392bf12cc79e39af87afd0608d0053de869d3316081d3",
  10: "49a87ecc8415f97e815681cd604d7b682fdcf402cb2a829f3313c3802e83fd3b",
  11: "a63848fee0b882e439c4a1db35d84016d19c31b00fb37b8702d7509f56190a7c",
  12: "f41b1707903d72c35fbf116faa87c686d8f64086f599cc260201789b45c013d8",
  13: "ed1afed713ee3b2517d3a7577b32c95fe04846e58b088f7951c76b2096def620",
  14: "f91a8db12a0e513adfe43489ccd4ecf493bb09d3653b17a10b0a43ec6df3e1b5",
  15: "747844880f84b50a771c3b1bc10eac2f3d0a64078ab60d3cf8ed97fd0290ed7e",
  16: "009b993ba078ab57d5a61ad17423880a6d5772ee32a7c3133bda93cce3b0ef9c",
  17: "e9a1c1634986e74542a5f89795285ac03963b68d75d1deef97c3b0672d856dd5",
  18: "1bea2a4e6eb321257be9d8b26d077526fd51542de1773894a8a02591c8cb41a1",
  19: "66ffddd76e22d84b0aa271a9668cfe9d17de11922f34278143d6aa8407008373",
  20: "926ffbd2a0d7e0c0c35926038321ecb483939122aeb52333ab2c1fae9758148a",
  21: "73651d6d748431dc9a718cc306430a3026071738255c3833a9dab220580589a8",
  22: "6de0e062f4a231e02d60c3a37ae1e03fb3512d8d6485422734aeeb163a5268eb",
  23: "9d27c35105765759873df65aceddd7b341eddc0fbb174ebffb8d3397ec1926ea",
  24: "f8239465605fba1e58bb381432ea2cca9ef7809559e84d72d8d21cc662e35883",
  25: "bebc7b7b1d7d6738192831deb8e7f0235b92e62980d3068b24a8a34c25ae94c2",
  26: "e35bd0b95cc9de105239aaadf66b2b61236276aab98d573bfc50f36aa74053da",
  // Not in a release yet, but already applied to a real database by a running
  // `tauri dev`, which sqlx would refuse to open just the same.
  27: "9b45b1c90ac537a953aa044a3c957e14290f9c2f87cd2e6023735523877b25a8",
  28: "970ead188133e4994dd6f98da6ae0e7a01dec2490a9b20fe904ff02161667dbc",
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("shipped migrations", () => {
  it("are never edited", () => {
    const current = new Map(
      parseMigrations().map((migration) => [migration.version, sha256(migration.sql)]),
    );

    for (const [version, hash] of Object.entries(SHIPPED_MIGRATIONS)) {
      expect(
        current.get(Number(version)),
        `Migration ${version} has already shipped and its SQL changed. Existing ` +
          `installs would fail to open the database; revert it and add a new ` +
          `migration instead.`,
      ).toBe(hash);
    }
  });

  it("are only ever followed by new versions", () => {
    const lastShipped = Math.max(...Object.keys(SHIPPED_MIGRATIONS).map(Number));
    const unshipped = parseMigrations().filter((m) => m.version > lastShipped);

    // Not a failure: a migration under development may still change. This only
    // documents what to add to SHIPPED_MIGRATIONS once it is released.
    for (const migration of unshipped) {
      console.info(
        `Unshipped migration ${migration.version}: "${sha256(migration.sql)}"`,
      );
    }
    expect(parseMigrations().length).toBeGreaterThanOrEqual(lastShipped);
  });
});

describe("migrations", () => {
  it("declares versions that are sequential and unique", () => {
    const versions = parseMigrations().map((migration) => migration.version);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions[0]).toBe(1);
    expect(versions.at(-1)).toBe(versions.length);
  });

  it("applies cleanly to a brand new database", () => {
    const database = newDatabase("fresh");
    expect(() => applyMigrations(database)).not.toThrow();
    expect(query(database, "PRAGMA foreign_key_check;")).toBe("");
  });

  it("produces the schema the data layer expects", () => {
    const database = newDatabase("schema");
    applyMigrations(database);

    const tables = query(
      database,
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
    ).split("\n");
    expect(tables).toEqual(
      expect.arrayContaining([
        "attachments",
        "budgets",
        "categories",
        "category_rules",
        "exchange_rates",
        "payment_methods",
        "recurring_transactions",
        "tags",
        "transaction_tags",
        "transactions",
      ]),
    );

    const columns = query(
      database,
      "SELECT name FROM pragma_table_info('transactions') ORDER BY name;",
    ).split("\n");
    expect(columns).toEqual(
      expect.arrayContaining([
        "amount",
        "category_id",
        "currency",
        "date",
        "description",
        "destination_amount",
        "destination_payment_method_id",
        "id",
        "payment_method_id",
        "type",
      ]),
    );
  });

  it("indexes the columns every list and filter sorts by", () => {
    const database = newDatabase("indexes");
    applyMigrations(database);
    const indexes = query(
      database,
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name;",
    ).split("\n");
    expect(indexes).toContain("idx_transactions_date");
    expect(indexes).toContain("idx_transactions_category");
    expect(indexes).toContain("idx_transactions_payment_method");
  });

  it("accepts every supported transaction type and rejects anything else", () => {
    const database = newDatabase("types");
    applyMigrations(database);

    // A transfer has to say where the money went (migration 28); account 1 is
    // one of the accounts migration 5 seeds.
    for (const [type, destination] of [
      ["income", "NULL"],
      ["expense", "NULL"],
      ["transfer", "1"],
    ]) {
      expect(() =>
        sql(
          database,
          `INSERT INTO transactions
             (amount, type, destination_payment_method_id, description, date, currency)
           VALUES (1, '${type}', ${destination}, 'x', '2026-01-01', 'ARS');`,
        ),
      ).not.toThrow();
    }

    expect(() =>
      sql(
        database,
        `INSERT INTO transactions (amount, type, description, date, currency)
         VALUES (1, 'nonsense', 'x', '2026-01-01', 'ARS');`,
      ),
    ).toThrow();
  });

  // Foreign keys are enforced, so a category that a rule points at could not be
  // deleted at all without the cascade — the Categories view would just fail.
  it("removes a category's rules along with the category", () => {
    const database = newDatabase("cascade");
    applyMigrations(database);
    sql(
      database,
      `INSERT INTO category_rules (pattern, category_id) VALUES ('netflix', 5);`,
    );
    expect(query(database, "SELECT COUNT(*) FROM category_rules;")).toBe("1");

    sql(database, "PRAGMA foreign_keys=ON; DELETE FROM categories WHERE id = 5;");
    expect(query(database, "SELECT COUNT(*) FROM category_rules;")).toBe("0");
  });

  // Both tables point AT transactions, so deleting one must not leave orphans
  // behind — and with foreign keys enforced it could not, but the cascade is
  // what makes the delete succeed at all rather than failing.
  it("removes a transaction's tags and attachments along with it", () => {
    const database = newDatabase("transaction-cascade");
    applyMigrations(database);
    sql(
      database,
      `INSERT INTO transactions (id, amount, type, description, date, currency)
         VALUES (1, 10, 'expense', 'x', '2026-01-01', 'ARS');
       INSERT INTO tags (id, name) VALUES (1, 'viaje');
       INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (1, 1);
       INSERT INTO attachments
         (transaction_id, file_name, mime_type, byte_size, content_base64, created_at)
         VALUES (1, 'a.png', 'image/png', 3, 'AAA', '2026-01-01T00:00:00Z');`,
    );

    sql(database, "PRAGMA foreign_keys=ON; DELETE FROM transactions WHERE id = 1;");
    expect(query(database, "SELECT COUNT(*) FROM transaction_tags;")).toBe("0");
    expect(query(database, "SELECT COUNT(*) FROM attachments;")).toBe("0");
  });

  it("rejects a budget period it does not understand", () => {
    const database = newDatabase("budget-check");
    applyMigrations(database);
    expect(() =>
      sql(
        database,
        `INSERT INTO budgets (category_id, currency, amount, period)
         VALUES (3, 'ARS', 100, 'weekly');`,
      ),
    ).toThrow();
  });

  it("leaves a new install without the placeholder accounts", () => {
    const database = newDatabase("placeholders");
    applyMigrations(database);
    expect(
      query(
        database,
        "SELECT COUNT(*) FROM payment_methods WHERE name LIKE 'Sin asignar%';",
      ),
    ).toBe("0");
  });
});

describe("upgrading a populated database", () => {
  // Reproduces a real install that stopped at version 7: history in a currency
  // the app no longer supports, and movements with no account attached.
  function legacyAtVersion7(): string {
    const database = newDatabase(`v7-${Math.random().toString(36).slice(2)}`);
    for (const migration of parseMigrations()) {
      if (migration.version > 7) break;
      sql(database, `PRAGMA foreign_keys=ON;\nBEGIN;\n${migration.sql}\nCOMMIT;\n`);
    }
    sql(
      database,
      `INSERT INTO transactions (amount, type, category_id, payment_method_id, description, date, currency)
       VALUES (1500.0, 'expense', 3, NULL, 'Gasto viejo en euros', '2026-03-04', 'EUR'),
              (250.0, 'expense', 3, 1, 'Gasto con cuenta', '2026-03-05', 'ARS'),
              (900.0, 'income', 1, NULL, 'Ingreso suelto', '2026-03-06', 'USD');`,
    );
    return database;
  }

  it("upgrades without losing a single row", () => {
    const database = legacyAtVersion7();
    const before = query(database, "SELECT COUNT(*) FROM transactions;");
    applyMigrations(database, 7);
    expect(query(database, "SELECT COUNT(*) FROM transactions;")).toBe(before);
  });

  it("keeps the totals identical across the upgrade", () => {
    const database = legacyAtVersion7();
    const total = "SELECT ROUND(SUM(amount), 2) FROM transactions;";
    const before = query(database, total);
    applyMigrations(database, 7);
    expect(query(database, total)).toBe(before);
  });

  it("rescues history stored in a currency that is no longer supported", () => {
    const database = legacyAtVersion7();
    expect(
      Number(query(database, "SELECT COUNT(*) FROM transactions WHERE currency='EUR';")),
    ).toBeGreaterThan(0);

    applyMigrations(database, 7);

    expect(
      query(
        database,
        "SELECT COUNT(*) FROM transactions WHERE currency NOT IN ('ARS','USD');",
      ),
    ).toBe("0");
  });

  it("attaches every unassigned movement to a placeholder account", () => {
    const database = legacyAtVersion7();
    applyMigrations(database, 7);
    expect(
      query(
        database,
        "SELECT COUNT(*) FROM transactions WHERE payment_method_id IS NULL;",
      ),
    ).toBe("0");
    expect(
      Number(
        query(
          database,
          "SELECT COUNT(*) FROM payment_methods WHERE name LIKE 'Sin asignar%';",
        ),
      ),
    ).toBeGreaterThan(0);
  });

  it("leaves no dangling references behind", () => {
    const database = legacyAtVersion7();
    applyMigrations(database, 7);
    expect(query(database, "PRAGMA foreign_key_check;")).toBe("");
  });

  it("keeps the accounts that already existed", () => {
    const database = legacyAtVersion7();
    const before = Number(query(database, "SELECT COUNT(*) FROM payment_methods;"));
    applyMigrations(database, 7);
    const after = Number(
      query(
        database,
        "SELECT COUNT(*) FROM payment_methods WHERE name NOT LIKE 'Sin asignar%';",
      ),
    );
    expect(after).toBe(before);
  });

  // Guards the specific failure that shipped once: rebuilding a table other
  // rows point at trips the foreign key check unless the references are parked
  // first, and it only shows up with enforcement on.
  it("survives the account table rebuild while rows reference it", () => {
    const database = legacyAtVersion7();
    expect(() => applyMigrations(database, 7)).not.toThrow();
    expect(
      Number(
        query(
          database,
          "SELECT COUNT(*) FROM transactions WHERE payment_method_id IS NOT NULL;",
        ),
      ),
    ).toBeGreaterThan(0);
  });

  // Re-running a migration that has already been applied is deliberately NOT
  // asserted. sqlx records every applied version in _sqlx_migrations and never
  // runs one twice, and some legitimate migrations cannot be re-run even in
  // principle — SQLite has no "ADD COLUMN IF NOT EXISTS", so migration 25 fails
  // outright the second time. Demanding idempotence would mean rebuilding a
  // whole table just to add one column, which is more risk, not less.
  //
  // What does matter is the real scenario: a database already at the latest
  // version, opened again. Nothing should run, and nothing should change.
  it("leaves an already-migrated database untouched when reopened", () => {
    const database = legacyAtVersion7();
    applyMigrations(database, 7);

    const rows = query(database, "SELECT COUNT(*) FROM transactions;");
    const accounts = query(database, "SELECT COUNT(*) FROM payment_methods;");
    const latest = Math.max(...parseMigrations().map((entry) => entry.version));

    applyMigrations(database, latest);

    expect(query(database, "SELECT COUNT(*) FROM transactions;")).toBe(rows);
    expect(query(database, "SELECT COUNT(*) FROM payment_methods;")).toBe(accounts);
  });
});
