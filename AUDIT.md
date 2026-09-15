# Audit — 2026-09-14

Full review of the app (frontend in `src/`, Rust backend in `src-tauri/`, SQLite
layer in `src/db`, domain logic in `src/lib`). Nothing was changed while
auditing; this file is the work list.

## How to read this file

- **Type** — `bug` (confirmed by reading the code, and reproduced where noted),
  `suspicion` (plausible, not reproduced; each one says what would confirm it),
  `improvement` (not broken, but worth doing).
- **Severity** — `high` / `medium` / `low`: how bad it is when it happens.
- **Batch** — the order of attack, 1 first. Each batch is meant to be one
  branch and one PR.
- **Verified** — `reproduced` (run and observed), `read` (checked line by line
  against the code during consolidation), `subagent` (checked by the auditing
  subagent reading the code; not re-read during consolidation).
- Line numbers are as of commit `264e85e`; they drift as batches land.
- When an item is done, tick its box here in the same PR.

Decided while auditing: UI copy is **voseo**; amounts are formatted with
**`es-AR`**. Encryption at rest, paid tiers and mobile are out of scope by
earlier decision and are not listed.

## Batches

| Batch | Theme                 | Why in this order                                       |
| ----- | --------------------- | ------------------------------------------------------- |
| 1     | Data safety           | The only items that can destroy or falsify data today   |
| 2     | Visibly broken        | Failures the user runs into, plus the exchange-rate set |
| 3     | Integrity and imports | Transactional writes, import correctness, ledger rules  |
| 4     | Copy and formatting   | Voseo, `es-AR`, English leaking into the UI             |
| 5     | UI consistency and UX | Shared primitives, tokens, delete/undo flows            |
| 6     | Performance           | Reload strategy, context split, async commands          |
| 7     | Hardening and cleanup | Security surface, platform paths, dead code, build      |

## Tracking table

| ID   | Title                                                              | Type        | Severity | Batch | Done |
| ---- | ------------------------------------------------------------------ | ----------- | -------- | ----- | ---- |
| B-01 | Saving a backup over the live database wipes it                    | bug         | high     | 1     | [ ]  |
| S-01 | Backup may be stale or internally inconsistent (WAL)               | suspicion   | medium   | 1     | [ ]  |
| B-02 | Confirming a non-oldest occurrence silently drops the earlier ones | bug         | high     | 1     | [ ]  |
| I-01 | No guard against editing an already-shipped migration              | improvement | medium   | 1     | [ ]  |
| B-03 | Cierres crashes on a closed month with only transfers              | bug         | high     | 2     | [ ]  |
| B-04 | Native menu actions do nothing when fired from another view        | bug         | high     | 2     | [ ]  |
| B-05 | A manual exchange-rate correction is overwritten on relaunch       | bug         | medium   | 2     | [ ]  |
| B-06 | Every failed mutation shows two error toasts                       | bug         | medium   | 2     | [ ]  |
| B-07 | A failed reload is reported as a failed mutation                   | bug         | low      | 2     | [ ]  |
| B-08 | Changing the dollar type fetches the rate twice                    | bug         | low      | 2     | [ ]  |
| S-02 | A late response for the previous dollar type can win               | suspicion   | low      | 2     | [ ]  |
| S-03 | Fetched rates may be keyed to tomorrow's date (UTC)                | suspicion   | low      | 2     | [ ]  |
| B-09 | Multi-statement writes are not atomic; double submit duplicates    | bug         | medium   | 3     | [ ]  |
| B-10 | Statement importer applies rules of the wrong category type        | bug         | medium   | 3     | [ ]  |
| B-11 | Savings goal due in under a month always shows "not on track"      | bug         | medium   | 3     | [ ]  |
| B-12 | Every new category gets the same grey                              | bug         | medium   | 3     | [ ]  |
| B-13 | Chart and printed report cap at 12 months while totals do not      | bug         | low      | 3     | [ ]  |
| B-14 | Tags differing only in non-ASCII case become duplicates            | bug         | low      | 3     | [ ]  |
| B-15 | Deleting a transaction leaves orphan tags                          | bug         | low      | 3     | [ ]  |
| B-16 | An expected movement stays confirmed after its transaction is gone | bug         | low      | 3     | [ ]  |
| B-17 | Windows: attachment name is the full path                          | bug         | low      | 3     | [ ]  |
| I-02 | Import dedupe drops legitimate repeats within one file             | improvement | medium   | 3     | [ ]  |
| I-03 | Re-importing the app's own CSV fails after Excel (es-AR)           | improvement | low      | 3     | [ ]  |
| I-04 | Deleting an account re-creates unassigned transactions             | improvement | low      | 3     | [ ]  |
| I-05 | Missing integrity constraints                                      | improvement | low      | 3     | [ ]  |
| I-06 | Amounts are REAL and summed without rounding                       | improvement | low      | 3     | [ ]  |
| I-07 | Copy mixes tuteo and voseo                                         | improvement | medium   | 4     | [ ]  |
| I-08 | `es-ES` locale and a new `Intl` formatter per call                 | improvement | low      | 4     | [ ]  |
| B-18 | Raw OS errors in English reach the user; size rounding is wrong    | bug         | low      | 4     | [ ]  |
| B-19 | Loan badge renders "Debo·Martín" without spaces                    | bug         | low      | 4     | [ ]  |
| I-09 | `index.html` still carries the template's lang, title and favicon  | improvement | low      | 4     | [ ]  |
| I-10 | "Aportar hoy" input has no accessible name                         | improvement | low      | 4     | [ ]  |
| B-20 | Attachments dialog briefly shows the previous transaction's files  | bug         | low      | 5     | [ ]  |
| B-21 | Category rules card shows its empty state while loading            | bug         | low      | 5     | [ ]  |
| I-11 | Delete confirmation copied 9 times; two deletes unconfirmed        | improvement | medium   | 5     | [ ]  |
| I-12 | Income/expense colours hardcoded instead of tokens                 | improvement | medium   | 5     | [ ]  |
| I-13 | `TransactionForm` does not follow `FormDialog` / `useDialogForm`   | improvement | medium   | 5     | [ ]  |
| I-14 | `useUpdater` instantiated twice with independent state             | improvement | medium   | 5     | [ ]  |
| I-15 | Hand-rolled progress bars duplicate `ui/progress-bar`              | improvement | low      | 5     | [ ]  |
| I-16 | "Descartar" is irreversible; offer undo instead                    | improvement | medium   | 5     | [ ]  |
| I-17 | Delete dialogs do not mention cascading effects                    | improvement | low      | 5     | [ ]  |
| I-18 | Every mutation reloads the whole dataset                           | improvement | medium   | 6     | [ ]  |
| I-19 | One giant context re-renders every consumer on each mutation       | improvement | medium   | 6     | [ ]  |
| I-20 | Sync Tauri commands run on the main thread                         | improvement | medium   | 6     | [ ]  |
| I-21 | "Registrar todas" and imports do one round trip per item           | improvement | low      | 6     | [ ]  |
| I-22 | "Today" goes stale with the app open overnight                     | improvement | low      | 6     | [ ]  |
| I-23 | Pending counts computed in several places                          | improvement | low      | 6     | [ ]  |
| I-24 | File commands accept any path, and there is no CSP                 | improvement | medium   | 7     | [ ]  |
| I-25 | Capabilities grant more than is used                               | improvement | low      | 7     | [ ]  |
| I-26 | `read_file_base64` reads the whole file before checking its size   | improvement | low      | 7     | [ ]  |
| B-22 | Backup and Settings look for the DB in the wrong folder on Linux   | bug         | low      | 7     | [ ]  |
| I-27 | Dead code, unused tokens and template assets                       | improvement | low      | 7     | [ ]  |
| I-28 | Dependencies, release profile and version in three places          | improvement | low      | 7     | [ ]  |

---

## Batch 1 — Data safety

### B-01 · Saving a backup over the live database wipes it

- **Type:** bug · **Severity:** high · **Batch:** 1 · **Verified:** reproduced
- **Where:** `src-tauri/src/lib.rs:74` (`backup_database`); the same
  truncation applies to `write_text_file` (`lib.rs:17`) and `write_file_base64`
  (`lib.rs:50`). Triggered from `src/components/views/SettingsView.tsx:165`.
- **What happens:** nothing compares the destination with the live
  `vault-ai.db`. `fs::copy(a, a)` opens the destination with truncate, so it
  empties the source and copies 0 bytes — reproduced on macOS: `Ok(0)`, file
  left at 0 bytes, also via `./sub/../db.bin`. The `wal_checkpoint(TRUNCATE)`
  run just before has already emptied the WAL, so nothing is left to recover.
  Exporting a CSV or an attachment copy onto `vault-ai.db` would likewise
  replace the database with that file.
- **Why it matters:** Ajustes shows the database path, so the user only has to
  browse to that folder, keep the name and accept "Reemplazar". Unlikely, but
  the loss is total and irreversible.
- **Proposal:** in Rust, canonicalise the destination's folder plus file name
  and compare it with the database path (and its `-wal`/`-shm` siblings); on a
  match return a Spanish error ("No se puede guardar sobre la base de datos en
  uso"). Apply the same guard to the other two write commands. Write to a
  temporary file in the destination folder and `fs::rename` it into place, so a
  failure halfway never destroys an earlier backup. Combine with S-01.
- [ ] Done

### S-01 · Backup may be stale or internally inconsistent (WAL)

- **Type:** suspicion · **Severity:** medium · **Batch:** 1 · **Verified:**
  subagent (WAL mode confirmed from the live file header, bytes 18–19 = `02 02`)
- **Where:** `src/db/index.ts:928-931` (`checkpointDatabase`),
  `src-tauri/src/lib.rs:65-77` (`backup_database`),
  `src/components/views/SettingsView.tsx:165-181` (`handleBackup`).
- **What happens:**
  - `PRAGMA wal_checkpoint(TRUNCATE)` runs on whichever pooled connection is
    free (plugin-sql uses a sqlx pool of up to 10) and its result row
    (`busy`, `log`, `checkpointed`) is discarded, so a partial checkpoint
    (another connection holding a read) fails silently.
  - The checkpoint runs _before_ the save dialog opens; anything written while
    the dialog is open (silent rate refresh, `setSetting` for notifications)
    stays in `-wal`, and `fs::copy` copies only the main file.
  - Suspected: an autocheckpoint writing to the main file during `fs::copy`
    could produce a torn copy.
- **How to confirm:** `select` the pragma and log `busy`; write data with the
  dialog open; run `PRAGMA integrity_check` on copies taken with the app in use.
- **Proposal:** replace checkpoint + `fs::copy` with `VACUUM INTO $1` (a
  consistent SQLite snapshot that includes the WAL) into a temporary file in
  the destination folder, then have Rust `rename` it (with B-01's guard). At
  minimum, checkpoint after the dialog returns, right before the copy.
- [ ] Done

### B-02 · Confirming a non-oldest occurrence silently drops the earlier ones

- **Type:** bug · **Severity:** high · **Batch:** 1 · **Verified:** read
- **Where:**
  - Recurring: buttons at `src/components/RecurringSection.tsx:167` (confirm)
    and `:180` (dismiss) → `markRecurringConfirmed`, `src/db/index.ts:673-678`.
  - Installments: `src/components/views/CommitmentsView.tsx:194-201` →
    `src/context/AppDataContext.tsx:676` → `advanceInstallmentPlan`,
    `src/db/index.ts:486-490`.
  - Loans: `src/components/LoansSection.tsx:251-257` →
    `src/context/AppDataContext.tsx:635` → `advanceLoan`,
    `src/db/index.ts:578-585`.
- **What happens:** every pending row has its own button, but what is stored
  is absolute (`confirmed_count = index + 1`, `last_confirmed_date = date`).
  With instalments 1 and 2 due, registering 2 first inserts its transaction and
  sets `confirmed_count = 2`: instalment 1 vanishes with no transaction, and
  the outstanding debt drops by a payment that never happened. Same for a
  recurring series with 1/8 and 1/9 pending: confirming or dismissing 1/9 makes
  1/8 disappear.
- **Why it matters:** movements and debts are lost silently; balances and
  closes end up wrong.
- **Proposal:** enable the actions only on the oldest pending occurrence of
  each plan/series; the rest disabled with a tooltip ("Primero registrá la
  cuota N"). Also validate in the mutation (`index === confirmed_count`, or
  `date` is the first pending one) and reject otherwise. B-09's compare-and-set
  makes the database enforce it too.
- [ ] Done

### I-01 · No guard against editing an already-shipped migration

- **Type:** improvement · **Severity:** medium · **Batch:** 1 · **Verified:**
  subagent (sqlx source read)
- **Where:** migrations in `src-tauri/src/lib.rs:83-749`; parsed for tests by
  `src/db/testing/migrations.ts`; load error shown by
  `src/context/AppDataContext.tsx:457-462`.
- **What happens:** sqlx stores a checksum per applied migration and fails
  with `VersionMismatch` if its SQL changes at all — even whitespace inside the
  string (`sqlx-core` 0.8.6, `migrate/migrator.rs:175-176`). The plugin runs
  migrations inside `Database.load`, so an edited migration makes every
  existing install fail to load: the app shows "No se pudieron cargar los
  datos" and stays empty with no way out. No test protects against it.
- **Proposal:** a test (Vitest, reusing `src/db/testing/migrations.ts`, or a
  Rust `#[test]`) with a `{version: sha256}` fixture that fails when the SQL of
  an already-shipped version changes.
- [ ] Done

---

## Batch 2 — Visibly broken

### B-03 · Cierres crashes on a closed month with only transfers

- **Type:** bug · **Severity:** high · **Batch:** 2 · **Verified:** read
- **Where:** `src/components/views/ClosesView.tsx:65`, `:107`, `:119`; root
  cause in `src/lib/monthlyClose.ts:244-246` (`closedMonthKeys`), also
  `:259` (`hasClose`) and `:170` (`closeForCurrency`); notification in
  `src/lib/notifications.ts:56`.
- **What happens:** `closedMonthKeys` counts any transaction, transfers
  included. `ClosesView` builds each row from `buildMonthlyTrend` →
  `calculateSummary`, which only sums income and expenses, and then filters
  out currencies with both at zero. For a month with only transfers,
  `month.totals` is empty, `const [main, ...rest] = []` leaves `main`
  undefined and `main.income` throws; the view's `ErrorBoundary`
  (`src/App.tsx:126`) replaces the whole screen. Same root cause:
  - `hasClose` and the notification announce "Tu cierre de mes está listo"
    for that month.
  - `closeForCurrency` checks `month.count === 0`, and `count` includes
    transfers, so the PDF gets an all-zero block for that currency.
- **Example:** April has one transfer Banco → Efectivo and nothing else →
  Cierres cannot be opened.
- **Proposal:** one helper ("the month has at least one income or expense")
  used by `closedMonthKeys`, `hasClose`, `closeForCurrency` and the
  notification; and `ClosesView` skips rows with no totals as a safety net.
  Add a test with a transfers-only month.
- [ ] Done

### B-04 · Native menu actions do nothing when fired from another view

- **Type:** bug · **Severity:** high · **Batch:** 2 · **Verified:** read
- **Where:** `src/App.tsx:77-80` (`handleAction`);
  `src/components/views/TransactionsView.tsx:185-189`;
  `src/components/views/StatisticsView.tsx:295-304`;
  `src/components/views/SettingsView.tsx:283-306`; Rust emits only
  `ACTION_EVENT`, `src-tauri/src/menu.rs:202-208`.
- **What happens:** `handleAction` switches the view and sets `request` in the
  same batch, so the target view mounts with `request` already set. Its "last
  handled seq" is initialised from that same request
  (`useState(request?.seq ?? 0)` / `useRef(request?.seq ?? 0)`), so the
  request counts as handled without ever running. From any other view, "Nueva
  transacción" does not open the dialog, "Imprimir informe" does not print,
  and backup / export / import / check for updates do not run — they only
  navigate. They work only if the owning view is already on screen.
  (`useRequestedTab` handles the equivalent case correctly for tabs, by
  honouring the request in its initial state.)
- **Why it matters:** it is the menu's main use case and it fails silently.
- **Proposal:** initialise the handled seq to 0 so a view honours a pending
  request on mount, or have `App` clear `request` once consumed (an
  `onRequestHandled()` callback). Add a test that mounts a view with a
  pending request.
- [ ] Done

### B-05 · A manual exchange-rate correction is overwritten on relaunch

- **Type:** bug · **Severity:** medium · **Batch:** 2 · **Verified:** read
- **Where:** `src/db/index.ts:1046-1057` (`upsertExchangeRate`); callers
  `src/context/AppDataContext.tsx:355` (`refreshExchangeRate`, run silently on
  startup from `:471-477`) and `:387` (`setRateType`); manual save at
  `:430-441`.
- **What happens:** the single-row upsert lacks the
  `WHERE exchange_rates.source <> 'manual'` guard that the batch upsert has
  (`src/db/index.ts:1034`). The manual rate is stored under today's date; the
  next fetch returns the same date and replaces it. Contradicts
  `src/lib/exchangeRate.ts:49-50` ("a manual correction is never overwritten by
  a later download"). The existing test (`src/db/index.test.ts:332`) only
  covers the batch path.
- **Example:** 10:00, save sell = 1500 for 2026-09-14; relaunch at 15:00; the
  fetch brings 2026-09-14 and the row goes back to the API figure.
- **Why it matters:** the correction disappears without notice and every
  conversion that day uses another rate.
- **Proposal:** add `WHERE exchange_rates.source <> 'manual' OR
excluded.source = 'manual'` to the single upsert, plus a test for that path.
- [ ] Done

### B-06 · Every failed mutation shows two error toasts

- **Type:** bug · **Severity:** medium · **Batch:** 2 · **Verified:** read
- **Where:** `src/context/AppDataContext.tsx:492-495` (`runMutation` toasts and
  rethrows); `src/lib/globalErrors.ts:15-18` (`unhandledrejection` handler).
- **What happens:** nobody catches the rethrow: `handleConfirmDelete` in 9
  files (e.g. `BudgetsSection.tsx:64`, `TransactionsView.tsx:208`); the
  `void confirmX()` calls in `LoansSection.tsx:252`,
  `RecurringSection.tsx:167,180`, `ExpectedSection.tsx:170,181`,
  `CommitmentsView.tsx:195`, `CategoryRulesCard.tsx:123`; and every dialog
  (react-hook-form 7.82 rethrows from `onValid`). The rejection reaches the
  global handler, which adds "Una operación no pudo completarse".
  Extra case: in `SettingsView.tsx:254-270`, a failing `importTransactions`
  shows "No se pudieron importar…" plus "No se pudo leer el archivo", and the
  second one is false.
- **Why it matters:** noise, and the generic message buries the specific one.
- **Proposal:** `runMutation` stops rethrowing and returns `Promise<boolean>`;
  dialogs close only on `true`. If rethrowing is kept, mark the error as
  already reported and have the global handler ignore it.
- [ ] Done

### B-07 · A failed reload is reported as a failed mutation

- **Type:** bug · **Severity:** low · **Batch:** 2 · **Verified:** read
- **Where:** `src/context/AppDataContext.tsx:488-495`.
- **What happens:** `await refresh()` sits in the same `try` as the mutation.
  If the write succeeded but the reload failed, the user sees e.g. "No se pudo
  agregar la transacción", retries, and creates a duplicate.
- **Proposal:** catch `refresh` separately: success toast for the mutation, and
  a distinct "No se pudieron recargar los datos". Do it together with B-06.
- [ ] Done

### B-08 · Changing the dollar type fetches the rate twice

- **Type:** bug · **Severity:** low · **Batch:** 2 · **Verified:** subagent
- **Where:** `src/context/AppDataContext.tsx:374-393` (`setRateType`),
  `:350-368` (`refreshExchangeRate`), `:471-477` (effect).
- **What happens:** `setRateType` fetches and upserts; changing `rateType`
  recreates `refreshExchangeRate` (deps `[rateType]`), which re-fires the
  effect at `:471` and fetches and upserts a second time.
- **Proposal:** drop the fetch from `setRateType`, or make the effect depend
  only on `isLoading` and read the type from a ref.
- [ ] Done

### S-02 · A late response for the previous dollar type can win

- **Type:** suspicion · **Severity:** low · **Batch:** 2 · **Verified:**
  subagent
- **Where:** `src/context/AppDataContext.tsx:350-368` and `:374-393`.
- **What happens:** neither path checks that the response matches the active
  type. The startup silent refresh (old type) or a quick sequence of changes
  could resolve late and `setExchangeRate` a figure of the previous type, which
  `ExchangeRateBar` would label with the new type's name.
- **How to confirm:** switch types several times with network throttling.
- **Proposal:** ignore the response when `rate.rate_type` differs from the
  current type (kept in a ref). Do it together with B-08.
- [ ] Done

### S-03 · Fetched rates may be keyed to tomorrow's date (UTC)

- **Type:** suspicion · **Severity:** low · **Batch:** 2 · **Verified:**
  subagent
- **Where:** `src/lib/exchangeRate.ts:111` and `:123-125` (`todayKey`).
- **What happens:** the row's date is `fechaActualizacion.slice(0, 10)`, falling
  back to `toISOString()` (UTC), while the app uses local dates
  (`todayIsoDate`). If the API timestamp is UTC, a quote updated after 21:00
  in Argentina is stored under tomorrow; since `getLatestExchangeRate` orders
  by `date DESC` (`src/db/index.ts:942`), that row beats today's manual
  correction.
- **How to confirm:** inspect a real dolarapi payload (does it end in `Z`?).
- **Proposal:** derive the local date: `toIsoDate(new Date(fechaActualizacion))`
  and use the local `todayIsoDate` as fallback.
- [ ] Done

---

## Batch 3 — Integrity and imports

### B-09 · Multi-statement writes are not atomic; double submit duplicates

- **Type:** bug · **Severity:** medium · **Batch:** 3 · **Verified:** read
- **Where:**
  - `confirmLoanPayment`: `src/context/AppDataContext.tsx:624` insert, `:635`
    `advanceLoan`.
  - `confirmInstallment`: `:665` insert, `:676` advance.
  - `confirmRecurring`: `:706` insert, `:717` mark confirmed.
  - `confirmExpected`: `:769` insert, `:780` close.
  - `setTransactionTags`: `src/db/index.ts:848-866` (DELETE, then N inserts).
  - `deleteCategory` (`src/db/index.ts:104-110`) and `deletePaymentMethod`
    (`:150-162`).
- **What happens:** each `execute` goes to any free pooled connection, so a
  `BEGIN` from JS would land on a different connection than the statements
  after it — transactions are not possible from the frontend. If the second
  statement fails (e.g. `SQLITE_BUSY` after the 5 s timeout), the transaction
  is written but the plan does not advance; it is proposed again and confirming
  it again duplicates it. A failure halfway through `setTransactionTags` leaves
  the transaction without tags. And since `advanceLoan` /
  `advanceInstallmentPlan` write an absolute value, a double click before the
  re-render (`disabled={isMutating}` depends on React state) inserts the same
  instalment twice.
- **Proposal:** a Rust command that takes the pool from
  `app.state::<tauri_plugin_sql::DbInstances>()`, opens `pool.begin()`, runs a
  list of statements and commits. For confirmations use compare-and-set:
  `UPDATE … SET confirmed_count = confirmed_count + 1 WHERE id = $1 AND
confirmed_count = $2`, inserting the transaction only if `rowsAffected = 1`.
- [ ] Done

### B-10 · Statement importer applies rules of the wrong category type

- **Type:** bug · **Severity:** medium · **Batch:** 3 · **Verified:** read
- **Where:** `src/lib/importMapping.ts:239`; compare `src/lib/csv.ts:364-374`
  and `src/components/TransactionForm.tsx:309-311`, which do check.
- **What happens:** `matchCategoryId` is used without checking that the
  category's type matches the movement's. A rule "mercado pago" → Compras
  (expense) files an incoming "Transferencia recibida Mercado Pago" as income
  under Compras, which then shows up in income breakdowns and closes.
- **Proposal:** extract `matchCategoryIdForType(description, rules,
categories, type)` into `src/lib/categoryRules.ts` and use it in all three
  places.
- [ ] Done

### B-11 · Savings goal due in under a month always shows "not on track"

- **Type:** bug · **Severity:** medium · **Batch:** 3 · **Verified:** read
- **Where:** `src/lib/savings.ts:128-131`; `monthsBetween` at `:152-160`;
  rendered at `src/components/views/SavingsView.tsx:190-193`.
- **What happens:** with less than a month left, `monthsBetween` returns 0,
  which is treated like a past deadline (`requiredMonthlyPace = Infinity`,
  `isOnTrack = false`).
- **Example:** today 2026-08-22, deadline 2026-09-21, $1 left, pace $5000 per
  month → shown in red as "el ritmo no alcanza". No test covers it.
- **Proposal:** separate "already past" (`target_date < today`) from "less
  than a month left"; for the latter compare the remainder against
  `monthlyPace × days / 30`. Add the test.
- [ ] Done

### B-12 · Every new category gets the same grey

- **Type:** bug · **Severity:** medium · **Batch:** 3 · **Verified:** read
- **Where:** `src/components/CategoryDialog.tsx:20`, `:30`, `:63`, `:76`;
  chart at `src/components/charts/CategoryBreakdownChart.tsx:66-67,94-98`
  (via `src/lib/finance.ts:200`); seed "Otros" at `src-tauri/src/lib.rs:127`.
- **What happens:** the schema has `color` but the form has no field for it;
  every new category is saved with `DEFAULT_COLOR` (`#64748b`), the same as the
  seeded "Otros". In the category pie chart, user-created slices and legend
  dots are indistinguishable.
- **Proposal:** auto-assign the first unused colour from a palette (fewest
  clicks), and/or a row of swatches like `EMOJI_SUGGESTIONS`.
- [ ] Done

### B-13 · Chart and printed report cap at 12 months while totals do not

- **Type:** bug · **Severity:** low · **Batch:** 3 · **Verified:** subagent
- **Where:** `src/lib/finance.ts:246` and `:258` (`maxMonths = 12`); used by
  `src/components/views/StatisticsView.tsx:345-349` and `src/lib/report.ts:98`.
- **What happens:** with a custom range 2025-01-01 → 2026-09-14, `SummaryBar`
  and `report.summary` add up 21 months, but the chart and the report's
  monthly table show only 2025-10 → 2026-09. The printed report does not add
  up to itself.
- **Proposal:** cap only the chart; the report lists every month (or states
  that the range was trimmed).
- [ ] Done

### B-14 · Tags differing only in non-ASCII case become duplicates

- **Type:** bug · **Severity:** low · **Batch:** 3 · **Verified:** subagent
  (reproduced with `node:sqlite`)
- **Where:** `src/db/index.ts:839-857`; column defined `COLLATE NOCASE` at
  `src-tauri/src/lib.rs:441`; promise in the comment at `src/db/index.ts:830-832`.
- **What happens:** JS dedupes with `toLocaleLowerCase("es")`, but SQLite's
  `NOCASE` folds only ASCII: "Ñandú"/"ñandú" and "Ámbito"/"ámbito" end up as
  separate tags.
- **Proposal:** in `setTransactionTags`, read `SELECT id, name FROM tags`,
  match with `toLocaleLowerCase("es")` and reuse the existing tag before
  inserting.
- [ ] Done

### B-15 · Deleting a transaction leaves orphan tags

- **Type:** bug · **Severity:** low · **Batch:** 3 · **Verified:** read
- **Where:** `src/db/index.ts:255-258` (`deleteTransaction`); cleanup only in
  `setTransactionTags` (`:863-866`); cascade at `src-tauri/src/lib.rs:445-446`.
- **What happens:** `ON DELETE CASCADE` removes the `transaction_tags` rows,
  but the "delete unused tags" step only runs when tags are saved. A tag left
  on no transaction keeps being suggested until some other transaction is
  saved — exactly what that comment wants to prevent.
- **Proposal:** run the same cleanup after `deleteTransaction`, or an
  `AFTER DELETE ON transaction_tags` trigger.
- [ ] Done

### B-16 · An expected movement stays confirmed after its transaction is gone

- **Type:** bug · **Severity:** low · **Batch:** 3 · **Verified:** read
- **Where:** written at `src/db/index.ts:776`; never read anywhere in `src/`;
  FK `ON DELETE SET NULL` at `src-tauri/src/lib.rs:741-742`; promise in
  `src/db/schema.ts:181-183`.
- **What happens:** `expected_movements.transaction_id` is written but never
  read. Deleting the transaction that `confirmExpected` created leaves the
  movement `confirmed`: it disappears from the ledger and the projection with
  no way to reopen it. The column also has no index, so every transaction
  delete scans `expected_movements` (small table, minor impact).
- **Proposal:** reopen it (back to `pending`) when its transaction is deleted —
  e.g. a trigger, or in `deleteTransaction` — or drop the promise. Add
  `CREATE INDEX` on `expected_movements(transaction_id)`.
- [ ] Done

### B-17 · Windows: attachment name is the full path

- **Type:** bug · **Severity:** low · **Batch:** 3 · **Verified:** read
- **Where:** `src/lib/files.ts:96` and `:149` (`path.split("/")`).
- **What happens:** Windows is shipped (`windows-latest` in `release.yml`) and
  its dialog returns `\` paths. The attachment is stored with
  `file_name = C:\Users\...\recibo.pdf`, which shows in the UI; and
  `saveAttachmentCopy` does `join(documentDir, absolutePath)`, suggesting the
  original location instead of Documentos.
- **Proposal:** `split(/[\\/]/)` or `basename()` from `@tauri-apps/api/path`.
- [ ] Done

### I-02 · Import dedupe drops legitimate repeats within one file

- **Type:** improvement · **Severity:** medium · **Batch:** 3 · **Verified:**
  subagent
- **Where:** `src/lib/importMapping.ts:252-253`, `src/lib/csv.ts:383-384`;
  message at `src/components/ImportMappingDialog.tsx:331`.
- **What happens:** two identical SUBE fares on the same day keep only one, and
  the UI says they "ya existían", which is false in that case.
- **Proposal:** count occurrences per key; skip a file row only when the
  database already holds as many as the file brings.
- [ ] Done

### I-03 · Re-importing the app's own CSV fails after Excel (es-AR)

- **Type:** improvement · **Severity:** low · **Batch:** 3 · **Verified:**
  subagent
- **Where:** `src/components/views/SettingsView.tsx:246` (`parseCsv` without
  `detectDelimiter`); `src/lib/csv.ts:176-181` (`Number()`).
- **What happens:** a CSV exported by the app, opened and saved by Excel with
  es-AR settings (`;` and `1234,56`), fails entirely with "Faltan columnas
  obligatorias".
- **Proposal:** reuse `detectDelimiter` and `parseFlexibleAmount`, as
  `src/lib/files.ts:163-164` does for statements.
- [ ] Done

### I-04 · Deleting an account re-creates unassigned transactions

- **Type:** improvement · **Severity:** low · **Batch:** 3 · **Verified:** read
- **Where:** `src/db/index.ts:150-162` (`deletePaymentMethod`), `:164-171`
  (`countTransactionsForPaymentMethod`, used only in tests); dialog at
  `src/components/views/AccountsView.tsx:269-273`; migration 13 at
  `src-tauri/src/lib.rs:353-388`; `src/lib/finance.ts:291-293`.
- **What happens:** deleting an account sets `payment_method_id = NULL` — the
  exact state migration 13 had to repair because such transactions "count
  towards no balance". The dialog warns without figures. Deleting an account
  also leaves linked savings goals as "Sin cuenta" at $0
  (`src-tauri/src/lib.rs:584`, `src/lib/savings.ts:89-90`); see I-17.
- **Proposal:** reassign to the "Sin asignar (<moneda>)" account instead of
  NULL and show `countTransactionsForPaymentMethod` in the dialog — or delete
  that function.
- [ ] Done

### I-05 · Missing integrity constraints

- **Type:** improvement · **Severity:** low · **Batch:** 3 · **Verified:**
  subagent
- **Where:** schema in `src-tauri/src/lib.rs`; edits at `src/db/index.ts:449-472`
  and `:545-569`.
- **What happens:** no `CHECK (currency IN ('ARS','USD'))` (migration 8 had to
  rescue rows that had vanished from every view because of this), no
  `amount > 0`, no rule that a transfer has a destination account, and editing
  a plan does not enforce `installment_count >= confirmed_count` (dialogs only
  validate min/max).
- **Proposal:** `BEFORE INSERT/UPDATE … RAISE(ABORT)` triggers — no table
  rebuild needed.
- [ ] Done

### I-06 · Amounts are REAL and summed without rounding

- **Type:** improvement · **Severity:** low · **Batch:** 3 · **Verified:**
  subagent
- **Where:** amount columns are `REAL` (`src-tauri/src/lib.rs:169, 245, 263,
267, 471, …`); `src/lib/finance.ts` sums with no rounding.
- **What happens:** floating-point error accumulates in balances. Formatting
  hides it, but boundary comparisons (budget exhausted, goal reached) can fail.
- **Proposal:** round to cents at aggregation points. Migrating to integer
  cents would mean rebuilding `transactions` (and its referencing tables,
  `lib.rs:431-434`) — not worth it today.
- [ ] Done

---

## Batch 4 — Copy and formatting

### I-07 · Copy mixes tuteo and voseo

- **Type:** improvement · **Severity:** medium · **Batch:** 4 · **Verified:**
  read (at least 49 tuteo forms vs 17 voseo by a partial grep)
- **Where (tuteo examples):** "Selecciona…" in every validation message;
  "Elige un emoji" (`CategoryDialog.tsx:28`); "Introduce un saldo válido"
  (`PaymentMethodDialog.tsx:23`); "Crea una en la sección Cuentas"
  (`TransactionForm.tsx:503`, `SavingsGoalDialog.tsx:229`); "Escribe y pulsa
  Enter" (`TagInput.tsx:84`); "Gestiona tus cuentas", "Todavía no tienes
  cuentas" (`AccountsView.tsx:114,193`); "Organiza tus ingresos"
  (`CategoriesView.tsx:100`); "Conéctate… cárgala" (`ExchangeRateBar.tsx:61-62`).
  Mixed within one sentence: "Elige la cuenta que querés seguir"
  (`SavingsGoalDialog.tsx:43`).
- **Decision:** voseo everywhere ("Seleccioná", "Elegí", "Ingresá", "Creá",
  "Escribí y presioná Enter", "Gestioná", "no tenés", "Conectate… cargala").
- **Proposal:** one pass over every Spanish string (including toasts,
  placeholders, aria-labels, `RELEASE_NOTES.md`, native menu labels in
  `src-tauri/src/menu.rs`, and Rust error strings); then add the rule to the
  language policy in `CLAUDE.md`.
- [ ] Done

### I-08 · `es-ES` locale and a new `Intl` formatter per call

- **Type:** improvement · **Severity:** low · **Batch:** 4 · **Verified:** read
- **Where:** `src/lib/format.ts:7`, `:17`, `:64`.
- **What happens:** `es-ES` prints "1234,50 ARS" (no thousands separator at 4
  digits) next to "12.345,50 ARS". `formatCurrency`, `formatPercent` and
  `formatMonthLabel` build a new `Intl.*Format` per call, and they are called
  per row.
- **Decision:** `es-AR` → "$ 1.234,50" and "US$ 1.234,50".
- **Proposal:** switch the locale and cache formatters in a `Map` keyed by
  currency. Update `src/lib/format.test.ts` and check the printed PDFs
  (Cierres, Informe).
- [ ] Done

### B-18 · Raw OS errors in English reach the user; size rounding is wrong

- **Type:** bug · **Severity:** low · **Batch:** 4 · **Verified:** subagent
  (listed as a suspicion by the frontend review, confirmed by the Rust review)
- **Where:** `src-tauri/src/lib.rs:17`, `22`, `31`, `50`, `76` return
  `io::Error::to_string()`; `src/components/AttachmentsDialog.tsx:77` shows it
  as is (`toast.error(String(error))`); size check at `lib.rs:34-38`.
- **What happens:** the user can see "Operation not permitted (os error 1)" or
  "No such file or directory (os error 2)" next to the Spanish size-limit
  message. The size limit uses integer division: a 5.9 MB file reads "pesa 5 MB
  y el máximo es 5 MB".
- **Proposal:** a `fn user_error(e: std::io::Error) -> String` that maps common
  `ErrorKind`s (`NotFound`, `PermissionDenied`, …) to Spanish with a generic
  fallback; format the size with one decimal. In the frontend, show the Rust
  message only for known errors, otherwise a fixed Spanish text.
- [ ] Done

### B-19 · Loan badge renders "Debo·Martín" without spaces

- **Type:** bug · **Severity:** low · **Batch:** 4 · **Verified:** read
- **Where:** `src/components/LoansSection.tsx:226-227`; the same file uses
  `" · "` at `:315`.
- **What happens:** JSX trims the line break, so the dot is glued to both words.
- **Proposal:** `{LOAN_DIRECTION_LABELS[…]} · {counterparty}`.
- [ ] Done

### I-09 · `index.html` still carries the template's lang, title and favicon

- **Type:** improvement · **Severity:** low · **Batch:** 4 · **Verified:** read
- **Where:** `index.html:2`, `:5`, `:7`; `public/vite.svg`, `public/tauri.svg`.
- **What happens:** `lang="en"` (VoiceOver reads the Spanish UI with an English
  voice), `<title>Tauri + React + Typescript</title>`, favicon `/vite.svg`.
  `public/tauri.svg` is referenced nowhere.
- **Proposal:** `lang="es-AR"`, title "Vault", remove the template assets.
- [ ] Done

### I-10 · "Aportar hoy" input has no accessible name

- **Type:** improvement · **Severity:** low · **Batch:** 4 · **Verified:**
  subagent
- **Where:** `src/components/views/SavingsView.tsx:202-214`.
- **What happens:** only a placeholder; no `Label` or `aria-label`.
- **Proposal:** `aria-label={`Aporte para ${entry.goal.name}`}` or an `sr-only`
  `Label`.
- [ ] Done

---

## Batch 5 — UI consistency and UX

### B-20 · Attachments dialog briefly shows the previous transaction's files

- **Type:** bug · **Severity:** low · **Batch:** 5 · **Verified:** read
- **Where:** `src/components/AttachmentsDialog.tsx:34`, `:50-54`, `:58-63`.
- **What happens:** on a transaction change the preview is cleared during
  render, but `attachments` keeps the old list until `listAttachments`
  returns. Their "Eliminar" buttons are live, and out-of-order responses are
  not discarded — a receipt of another transaction could be deleted from a
  dialog titled for this one.
- **Proposal:** `setAttachments([])` in the same block that resets `preview`;
  ignore responses whose `transactionId` is no longer current.
- [ ] Done

### B-21 · Category rules card shows its empty state while loading

- **Type:** bug · **Severity:** low · **Batch:** 5 · **Verified:** read
- **Where:** `src/components/CategoryRulesCard.tsx:78-89`.
- **What happens:** it does not pass `isLoading` to `ListCard`, so "Todavía no
  hay reglas…" flashes during the initial load. Every other list card passes
  it.
- **Proposal:** read `isLoading` from `useAppData()` and pass it through.
- [ ] Done

### I-11 · Delete confirmation copied 9 times; two deletes unconfirmed

- **Type:** improvement · **Severity:** medium · **Batch:** 5 · **Verified:**
  subagent
- **Where:** the same ~30-line `AlertDialog` in `BudgetsSection.tsx:169-194`,
  `LoansSection.tsx:405-430`, `RecurringSection.tsx:304-329`,
  `ExpectedSection.tsx:259-284`, `CommitmentsView.tsx:338-363`,
  `TransactionsView.tsx:554-580`, `AccountsView.tsx:261-286`,
  `CategoriesView.tsx:191-218`, `SavingsView.tsx:239-264`. Unconfirmed:
  `CategoryRulesCard.tsx:117-127` and `AttachmentsDialog.tsx:108-112,169-179`
  (irreversible: the bytes only live in the database).
- **Proposal:** a `ConfirmDeleteDialog` (title, description, `onConfirm`,
  `isMutating`) used by every delete — or, for the two unconfirmed ones, an
  undo toast (I-16).
- [ ] Done

### I-12 · Income/expense colours hardcoded instead of tokens

- **Type:** improvement · **Severity:** medium · **Batch:** 5 · **Verified:**
  subagent
- **Where:** `text-red-600 dark:text-red-400` / `text-emerald-600
dark:text-emerald-400` in ~14 places: `SummaryBar.tsx:69-76`,
  `MonthOverviewCards.tsx:50-60,85`, `RecentTransactions.tsx:95-96`,
  `TransactionsView.tsx:434-436`, `LoansSection.tsx:51-52`,
  `ExpectedSection.tsx:48-49`, `RecurringSection.tsx:154-155`,
  `CommitmentsView.tsx:185`, `AccountsView.tsx:159,221`,
  `ClosesView.tsx:129,139`, `UpcomingMonths.tsx:25`. `ui/progress-bar.tsx:20`
  uses `bg-emerald-600` with no dark variant. `IncomeVsExpenseChart.tsx:30-31`
  uses `#10b981` / `#ef4444` (500 shades), not matching the 600 text.
- **Proposal:** `--positive` / `--negative` tokens in `src/index.css` (light and
  dark) mapped in `@theme inline`; use `text-positive` / `text-negative` and
  `var(--positive)` in charts.
- [ ] Done

### I-13 · `TransactionForm` does not follow `FormDialog` / `useDialogForm`

- **Type:** improvement · **Severity:** medium · **Batch:** 5 · **Verified:**
  subagent
- **Where:** `src/components/views/TransactionsView.tsx:582-599`;
  `src/components/TransactionForm.tsx:133-172`, `:342-357`.
- **What happens:** the dialog is hand-built — no `DialogDescription`, no
  "Cancelar" button, unlike every other form. The "reset to enter another"
  logic (`TransactionForm.tsx:342-357`) is dead because
  `TransactionsView.tsx:205` always closes the dialog.
- **Proposal:** migrate to `FormDialog` + `useDialogForm`, and decide
  explicitly whether "guardar y cargar otra" exists (if yes, wire it; if not,
  delete the reset).
- [ ] Done

### I-14 · `useUpdater` instantiated twice with independent state

- **Type:** improvement · **Severity:** medium · **Batch:** 5 · **Verified:**
  subagent
- **Where:** `src/components/UpdatePrompt.tsx:14`,
  `src/components/views/SettingsView.tsx:102`.
- **What happens:** the Ajustes card does not know the toast already offered
  version X; installing from the toast shows no progress in Ajustes; "Buscar
  actualizaciones" from the menu creates a second `Update` resource.
- **Proposal:** an `UpdaterProvider` sharing one state.
- [ ] Done

### I-15 · Hand-rolled progress bars duplicate `ui/progress-bar`

- **Type:** improvement · **Severity:** low · **Batch:** 5 · **Verified:**
  subagent
- **Where:** `src/components/LoansSection.tsx:376-381`,
  `src/components/views/CommitmentsView.tsx:292-297`.
- **Proposal:** `<ProgressBar ratio={paidRatio} />`.
- [ ] Done

### I-16 · "Descartar" is irreversible; offer undo instead

- **Type:** improvement · **Severity:** medium · **Batch:** 5 · **Verified:**
  subagent
- **Where:** `src/components/RecurringSection.tsx:174-186`,
  `src/components/ExpectedSection.tsx:175-185`; `src/lib/expected.ts:15-17`.
- **What happens:** "Descartar" (X) sits right next to "Registrar" (✓), asks
  nothing and cannot be undone; a dismissed expected movement never appears in
  any list again.
- **Proposal:** a sonner toast with a "Deshacer" action that restores
  `last_confirmed_date` / `status = 'pending'` — undo over confirmation, in
  line with the UI principles. Same idea for "Registrar": delete the created
  transaction and revert the counter.
- [ ] Done

### I-17 · Delete dialogs do not mention cascading effects

- **Type:** improvement · **Severity:** low · **Batch:** 5 · **Verified:**
  subagent
- **Where:** category delete cascades to budgets and rules
  (`src-tauri/src/lib.rs:469`, `:418`) but the dialog
  (`src/components/views/CategoriesView.tsx:200-204`) only mentions
  transactions. Account delete leaves linked savings goals as "Sin cuenta" at
  $0 (`lib.rs:584`, `src/lib/savings.ts:89-90`); the dialog
  (`src/components/views/AccountsView.tsx:270-272`) does not say so.
- **Proposal:** list how many budgets, rules or goals are affected. Fits in the
  `ConfirmDeleteDialog` of I-11.
- [ ] Done

---

## Batch 6 — Performance

### I-18 · Every mutation reloads the whole dataset

- **Type:** improvement · **Severity:** medium · **Batch:** 6 · **Verified:**
  subagent
- **Where:** `src/context/AppDataContext.tsx:279-345` (`refresh`), `:479-501`
  (`runMutation`); transactions query with two correlated subqueries per row
  at `src/db/index.ts:175-197`.
- **What happens:** each mutation re-runs 18 queries over IPC/JSON: every
  transaction and the full exchange-rate history (thousands of rows since 2018,
  per `src-tauri/src/lib.rs:627-628`) — creating a budget reloads the whole
  rate history. All 12 lists get new references, invalidating every `useMemo`
  in every mounted view. `getLatestExchangeRate` returns what the last element
  of `listExchangeRates` already has.
- **Proposal:** `runMutation` takes which domains to reload
  (`reloadTransactions`, `reloadLoans`, …); load the rate history only on rate
  type change or backfill; derive the latest rate from the history.
- [ ] Done

### I-19 · One giant context re-renders every consumer on each mutation

- **Type:** improvement · **Severity:** medium · **Batch:** 6 · **Verified:**
  subagent
- **Where:** `src/context/AppDataContext.tsx:503-899`.
- **What happens:** `isMutating` and `isRefreshingRate` are in the `value`
  deps, so each mutation re-renders every consumer twice (Sidebar, sections,
  each `ExchangeRateBar`); the silent rate refresh on startup does too.
- **Proposal:** split into three contexts: data, actions (stable) and status
  (`isMutating` / `isRefreshingRate`).
- [ ] Done

### I-20 · Sync Tauri commands run on the main thread

- **Type:** improvement · **Severity:** medium · **Batch:** 6 · **Verified:**
  read (commands are plain `fn`) + subagent (`tauri-macros` 2.6.3)
- **Where:** `src-tauri/src/lib.rs:15-77`.
- **What happens:** non-`async` commands run on the main thread in Tauri v2.
  Copying the database (which grows with base64 attachments), reading and
  encoding 5 MB, or writing files freezes the window and the menu meanwhile.
- **Proposal:** `#[tauri::command(async)]` or `async fn` (arguments are
  already owned `String`s). `print_window` can stay as is.
- [ ] Done

### I-21 · "Registrar todas" and imports do one round trip per item

- **Type:** improvement · **Severity:** low · **Batch:** 6 · **Verified:**
  subagent
- **Where:** "Registrar todas/todos" at
  `src/components/views/CommitmentsView.tsx:99-105`,
  `src/components/RecurringSection.tsx:76-82`,
  `src/components/LoansSection.tsx:161-167`; import at
  `src/db/index.ts:915-924` (`insertTransactions`); `addTransaction` calls
  `setTransactionTags` even with `[]` (`src/context/AppDataContext.tsx:539`).
- **What happens:** N items → N mutations, N full reloads, N success toasts,
  and no summary of what was done if one fails halfway. Import: one INSERT per
  row plus 2 + 2N statements per tagged row, including a
  `DELETE FROM tags WHERE id NOT IN (…)` that scans the table each time.
- **Proposal:** one mutation that loops, reloads once and toasts "N
  movimientos registrados"; batched `INSERT … RETURNING id` for imports with a
  single tag cleanup at the end, inside B-09's Rust transaction; skip
  `setTransactionTags` when there are no tags.
- [ ] Done

### I-22 · "Today" goes stale with the app open overnight

- **Type:** improvement · **Severity:** low · **Batch:** 6 · **Verified:**
  subagent
- **Where:** `src/App.tsx:53-60` (badges);
  `src/components/views/StatisticsView.tsx:121`, `:207-214`, `:315-316`,
  `:360`; `useMemo(…, todayIsoDate())` in
  `src/components/RecurringSection.tsx:47-50`,
  `src/components/ExpectedSection.tsx:94-102`,
  `src/components/views/CommitmentsView.tsx:64-67`,
  `src/components/LoansSection.tsx:135-138`.
- **What happens:** those memos depend on data only, not on the date. Left open
  overnight, `dateRange.to` is still yesterday (today's movements are out of
  Análisis), the selector shows "Personalizado" and the projection disappears
  (`:360`); badges and pending lists miss what fell due today until the next
  mutation.
- **Proposal:** a `useToday()` hook that ticks at midnight and on window focus,
  used as a memo dependency; store the Statistics period as "last 12 months"
  rather than fixed dates.
- [ ] Done

### I-23 · Pending counts computed in several places

- **Type:** improvement · **Severity:** low · **Batch:** 6 · **Verified:**
  subagent
- **Where:** `src/components/views/StatisticsView.tsx:207-214` repeats the four
  collectors of `src/lib/pendingBadges.ts:32-36`, which are also computed in
  `src/App.tsx:53` and in `useNotifications`.
- **Proposal:** compute once in the context, together with I-22's `today`, so
  the badge, the notice and the section cannot disagree.
- [ ] Done

---

## Batch 7 — Hardening and cleanup

### I-24 · File commands accept any path, and there is no CSP

- **Type:** improvement (security) · **Severity:** medium · **Batch:** 7 ·
  **Verified:** read (`"csp": null`) + subagent
- **Where:** `src-tauri/src/lib.rs:11-51`; `src-tauri/tauri.conf.json:24-26`.
- **What happens:** the comment at `lib.rs:11-14` says the commands only touch
  the path chosen in the dialog, but Rust does not enforce it — they accept any
  `String`. Any JS running in the webview could read `~/.ssh/*` or write
  `~/.zshrc`, and without a CSP there is no second barrier. Not exploitable on
  its own today (React escapes everything, small XSS surface). The comment's
  premise is also off: `tauri-plugin-dialog` 2.7.2 already adds the chosen path
  to the fs plugin scope dynamically.
- **Proposal:** open the dialogs from Rust (`tauri_plugin_dialog::DialogExt`
  inside async commands) so the path never comes from JS — e.g.
  `export_csv(default_name, contents)`, `pick_attachment()`,
  `backup_database(default_name)`. Define a CSP, starting from
  `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
blob:; connect-src ipc: http://ipc.localhost https://dolarapi.com
https://api.argentinadatos.com; object-src 'none'; base-uri 'self'`, plus a
  `devCsp` allowing `ws://localhost:1420` for Vite HMR. Test XLSX import and
  attachment preview afterwards.
- [ ] Done

### I-25 · Capabilities grant more than is used

- **Type:** improvement · **Severity:** low · **Batch:** 7 · **Verified:**
  subagent
- **Where:** `src-tauri/capabilities/default.json:13` (`dialog:default`), `:10`
  (`opener:default`).
- **What happens:** `dialog:default` enables `message`, `ask` and `confirm`,
  unused (only `open` and `save` are, `src/lib/files.ts:3`). `opener:default`
  includes `reveal-item-in-dir`, unused (only `openUrl` with `mailto:`,
  `src/components/SuggestionDialog.tsx:40`). Everything else granted is used,
  and nothing is missing.
- **Proposal:** `dialog:allow-open`, `dialog:allow-save`,
  `opener:allow-open-url` scoped to `mailto:*`.
- [ ] Done

### I-26 · `read_file_base64` reads the whole file before checking its size

- **Type:** improvement · **Severity:** low · **Batch:** 7 · **Verified:**
  subagent
- **Where:** `src-tauri/src/lib.rs:31-39`; also used for statements at
  `src/lib/files.ts:152`.
- **What happens:** the file is loaded fully into memory and only then
  rejected. The 5 MB cap meant for receipts also blocks XLSX statements, where
  the user only sees "No se pudo leer el archivo".
- **Proposal:** check `fs::metadata(&path)?.len()` before reading; a separate
  limit (or command) for bank statements.
- [ ] Done

### B-22 · Backup and Settings look for the DB in the wrong folder on Linux

- **Type:** bug · **Severity:** low · **Batch:** 7 · **Verified:** read +
  subagent (plugin source)
- **Where:** `src-tauri/src/lib.rs:67-72` (`app_data_dir()`),
  `src/components/views/SettingsView.tsx:119` (`appDataDir()`); plugin opens
  `sqlite:vault-ai.db` under `app_config_dir()` (`tauri-plugin-sql` 2.4.0,
  `wrapper.rs:79-86`).
- **What happens:** identical on macOS and Windows (the only release targets),
  different on Linux (`~/.config/<id>` vs `~/.local/share/<id>`): the backup
  fails with "No such file" and Ajustes shows a wrong path. Linux is not in the
  release matrix, but `bundle.targets` is `"all"` and CI runs on Ubuntu.
- **Proposal:** use `app_config_dir()` / `appConfigDir()`; move `"vault-ai.db"`
  to one constant (repeated today in `lib.rs:72`, `lib.rs:775`,
  `src/db/index.ts:31`, `SettingsView.tsx:121`). Do it with B-01 if convenient.
- [ ] Done

### I-27 · Dead code, unused tokens and template assets

- **Type:** improvement · **Severity:** low · **Batch:** 7 · **Verified:**
  subagent (spot-checked: `countTransactionsForPaymentMethod`, `react.svg`)
- **Items:**
  - `src/assets/react.svg` — not referenced.
  - `public/vite.svg`, `public/tauri.svg` — template (see I-09).
  - `--chart-1..5` tokens (`src/index.css:19-23,70-74,105-109`) — unused;
    charts use hex and per-category colours.
  - `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-ring` —
    unused; the dark `--sidebar-primary` is still shadcn's default blue
    (`index.css:112`).
  - Exported types nobody imports: `EmptyState` (`ListCard.tsx:13`),
    `TrendEntry` (`IncomeVsExpenseChart.tsx:18`), `PrintRequest`
    (`usePrintRequest.ts:4`), `UpdaterStatus` / `AvailableUpdate` / `Updater`
    (`useUpdater.ts:6-24`) — drop the `export`.
  - `countTransactionsForPaymentMethod` (`src/db/index.ts:164`) — test-only;
    use it (I-04) or delete it.
  - `expected_movements.transaction_id` — write-only today (see B-16).
- [ ] Done

### I-28 · Dependencies, release profile and version in three places

- **Type:** improvement · **Severity:** low · **Batch:** 7 · **Verified:**
  subagent (built a copy without `serde`)
- **Items:**
  - `serde` is unused (`src-tauri/Cargo.toml:25`); `serde_json` is needed
    (`generate_context!`).
  - `base64 = "0.23.1"` (`Cargo.toml:29`) adds a third version to the tree
    (the lock already has 0.21.7 and 0.22.1); 0.22 reuses Tauri's.
  - No `[profile.release]`: `lto = true`, `codegen-units = 1`, `strip = true`,
    `panic = "abort"` shrink the binary and the update download (the macOS
    universal build carries two architectures).
  - `shadcn` (a CLI with a large tree; only its CSS is used, `index.css:3`),
    `tailwindcss` and `@tailwindcss/vite` are in `dependencies`; move them to
    `devDependencies` (no effect on the shipped bundle, only intent and install
    size). Lazy-loading recharts is not worth it (Statistics is the initial
    view); `read-excel-file` is already dynamic (`files.ts:157`).
  - Version lives in `tauri.conf.json:4`, `Cargo.toml:3` and `package.json:4`
    with nothing checking they match (the updater compares against
    `tauri.conf.json`). Use `"version": "../package.json"` in
    `tauri.conf.json`.
- [ ] Done
