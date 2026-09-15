import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { pendingOccurrences } from "@/lib/recurring";
import type {
  AttachmentMeta,
  BudgetPeriod,
  BudgetWithCategory,
  Category,
  CategoryRuleWithCategory,
  CategoryType,
  ExchangeRate,
  ExpectedMovement,
  ExpectedMovementWithNames,
  PaymentMethod,
  PaymentMethodType,
  NewTransaction,
  InstallmentPlan,
  InstallmentPlanWithNames,
  Loan,
  LoanDirection,
  LoanWithNames,
  RecurrenceFrequencyValue,
  SavingsContribution,
  SavingsGoalWithNames,
  SavingsTrackingMode,
  RecurringTransaction,
  RecurringTransactionWithNames,
  Tag,
  TransactionWithCategory,
} from "./schema";

// Deliberately still "vault-ai.db" after the app was renamed to Vault. The file
// name is what the plugin opens; changing it would create a second, empty
// database and leave the real one sitting untouched beside it. It is invisible
// to the user, and renaming it would need a migration that moves real financial
// data for no benefit.
const DATABASE_URL = "sqlite:vault-ai.db";

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

// One statement of a write that must land whole or not at all.
export interface BatchStatement {
  query: string;
  values?: unknown[];
  // When set, the statement must change exactly this many rows or the whole
  // batch is undone. Used as a compare-and-set, so a second click on the same
  // "Registrar" finds the row already moved on and writes nothing.
  expectChanges?: number;
}

// Stands for the id that the statement at `index` of the same batch inserted,
// which is not known when the batch is put together.
export function insertedIdOf(index: number): { insertedIdOf: number } {
  return { insertedIdOf: index };
}

// The surface of the connection this module actually uses. Naming it means the
// query functions below can run against anything that honours it — in practice
// the plugin in the app, and an in-memory database with the same schema under
// test (see ./testing/database).
export interface SqlConnection {
  select<T>(query: string, values?: unknown[]): Promise<T>;
  execute(query: string, values?: unknown[]): Promise<QueryResult>;
  // Runs the statements as one transaction. The plugin cannot: it sends each
  // `execute` to whichever pooled connection is free, so a BEGIN sent from
  // here would not cover the statements after it. Rust does it instead (see
  // execute_batch in src-tauri/src/lib.rs).
  batch(statements: BatchStatement[]): Promise<QueryResult[]>;
}

let dbPromise: Promise<SqlConnection> | null = null;

// Returns a cached connection, opening it (once) on first call. Opening the
// connection is what triggers the Rust-side migrations (see src-tauri/src/lib.rs),
// which create the schema and seed the default data — so by the time
// this promise resolves, the database is fully ready.
function getDb(): Promise<SqlConnection> {
  if (!dbPromise) {
    dbPromise = Database.load(DATABASE_URL).then((plugin) => ({
      select: (query, values) => plugin.select(query, values),
      execute: (query, values) => plugin.execute(query, values),
      batch: (statements) => invoke<QueryResult[]>("execute_batch", { statements }),
    }));
  }
  return dbPromise;
}

// Substitutes the connection, for tests only. Without this the only way to
// exercise these queries would be to mock the module wholesale, which asserts
// that some SQL string was passed somewhere and proves nothing about whether
// the SQL is correct. Pass null to restore the real connection.
export function setDatabaseForTesting(connection: SqlConnection | null): void {
  dbPromise = connection === null ? null : Promise.resolve(connection);
}

// Ensures the connection (and thus the Rust migrations) has run. Safe to
// call from multiple components on mount; they all share the same promise.
export function initDatabase(): Promise<SqlConnection> {
  return getDb();
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  return db.select<Category[]>("SELECT * FROM categories ORDER BY name");
}

export interface NewCategory {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
}

export async function insertCategory(category: NewCategory): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO categories (name, type, color, icon) VALUES ($1, $2, $3, $4)",
    [category.name, category.type, category.color, category.icon],
  );
}

export async function updateCategory(id: number, category: NewCategory): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE categories SET name = $1, type = $2, color = $3, icon = $4 WHERE id = $5",
    [category.name, category.type, category.color, category.icon, id],
  );
}

// Transactions reference categories with a nullable FK, so deleting a category
// detaches it from its history rather than destroying the records.
export async function deleteCategory(id: number): Promise<void> {
  const db = await getDb();
  await db.batch([
    {
      query: "UPDATE transactions SET category_id = NULL WHERE category_id = $1",
      values: [id],
    },
    { query: "DELETE FROM categories WHERE id = $1", values: [id] },
  ]);
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const db = await getDb();
  return db.select<PaymentMethod[]>(
    "SELECT * FROM payment_methods ORDER BY currency, name",
  );
}

export interface NewPaymentMethod {
  name: string;
  type: PaymentMethodType;
  currency: string;
  initialBalance: number;
}

export async function insertPaymentMethod(method: NewPaymentMethod): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO payment_methods (name, type, currency, initial_balance)
     VALUES ($1, $2, $3, $4)`,
    [method.name, method.type, method.currency, method.initialBalance],
  );
}

export async function updatePaymentMethod(
  id: number,
  method: NewPaymentMethod,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE payment_methods
     SET name = $1, type = $2, currency = $3, initial_balance = $4
     WHERE id = $5`,
    [method.name, method.type, method.currency, method.initialBalance, id],
  );
}

// The "Sin asignar" account in the currency of account $1, other than $1
// itself; NULL when there is none yet.
const UNASSIGNED_ACCOUNT_OF = `(
  SELECT p.id FROM payment_methods p
  JOIN payment_methods m ON m.id = $1
  WHERE p.id <> m.id
    AND p.currency = m.currency
    AND p.name = 'Sin asignar (' || m.currency || ')'
  ORDER BY p.id LIMIT 1
)`;

// Deleting an account keeps its history and its money. Its movements, and the
// balance it opened with, move to the "Sin asignar" account of its currency —
// the placeholder migration 13 introduced for movements that belong to no
// account — which is created if there is none yet, so the total the user holds
// does not change. Detaching them instead left movements that counted towards
// no balance (the state migration 13 had to repair) and quietly took the
// account's money out of the total.
export async function deletePaymentMethod(id: number): Promise<void> {
  const db = await getDb();
  await db.batch([
    {
      query: `INSERT INTO payment_methods (name, type, currency, initial_balance)
              SELECT 'Sin asignar (' || m.currency || ')', 'other', m.currency, 0
              FROM payment_methods m
              WHERE m.id = $1
                AND ${UNASSIGNED_ACCOUNT_OF} IS NULL
                AND (m.initial_balance <> 0 OR EXISTS (
                  SELECT 1 FROM transactions t
                  WHERE t.payment_method_id = m.id
                     OR t.destination_payment_method_id = m.id
                ))`,
      values: [id],
    },
    {
      query: `UPDATE payment_methods
              SET initial_balance = initial_balance +
                (SELECT initial_balance FROM payment_methods WHERE id = $1)
              WHERE id = ${UNASSIGNED_ACCOUNT_OF}`,
      values: [id],
    },
    {
      query: `UPDATE transactions SET payment_method_id = ${UNASSIGNED_ACCOUNT_OF}
              WHERE payment_method_id = $1`,
      values: [id],
    },
    {
      query: `UPDATE transactions SET destination_payment_method_id = ${UNASSIGNED_ACCOUNT_OF}
              WHERE destination_payment_method_id = $1`,
      values: [id],
    },
    { query: "DELETE FROM payment_methods WHERE id = $1", values: [id] },
  ]);
}

// Joins the category and payment method names in SQL so the UI never has to
// display a raw id or look them up client-side.
export async function listTransactionsWithCategory(): Promise<TransactionWithCategory[]> {
  const db = await getDb();
  return db.select<TransactionWithCategory[]>(
    `SELECT t.*,
            c.name AS category_name,
            c.color AS category_color,
            c.icon AS category_icon,
            p.name AS payment_method_name,
            d.name AS destination_payment_method_name,
            d.currency AS destination_currency,
            (SELECT group_concat(g.name, ',')
             FROM transaction_tags tt
             JOIN tags g ON g.id = tt.tag_id
             WHERE tt.transaction_id = t.id) AS tag_names,
            (SELECT COUNT(*) FROM attachments a
             WHERE a.transaction_id = t.id) AS attachment_count
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN payment_methods p ON p.id = t.payment_method_id
     LEFT JOIN payment_methods d ON d.id = t.destination_payment_method_id
     ORDER BY t.date DESC, t.id DESC`,
  );
}

function insertTransactionStatement(transaction: NewTransaction): BatchStatement {
  return {
    query: `INSERT INTO transactions
              (amount, type, category_id, payment_method_id, destination_payment_method_id,
               destination_amount, description, date, currency)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    values: [
      transaction.amount,
      transaction.type,
      transaction.categoryId,
      transaction.paymentMethodId,
      transaction.destinationPaymentMethodId,
      transaction.destinationAmount,
      transaction.description,
      transaction.date,
      transaction.currency,
    ],
  };
}

function updateTransactionStatement(
  id: number,
  transaction: NewTransaction,
): BatchStatement {
  return {
    query: `UPDATE transactions
            SET amount = $1,
                type = $2,
                category_id = $3,
                payment_method_id = $4,
                destination_payment_method_id = $5,
                destination_amount = $6,
                description = $7,
                date = $8,
                currency = $9
            WHERE id = $10`,
    values: [
      transaction.amount,
      transaction.type,
      transaction.categoryId,
      transaction.paymentMethodId,
      transaction.destinationPaymentMethodId,
      transaction.destinationAmount,
      transaction.description,
      transaction.date,
      transaction.currency,
      id,
    ],
  };
}

export async function insertTransaction(transaction: NewTransaction): Promise<number> {
  const db = await getDb();
  const { query, values } = insertTransactionStatement(transaction);
  const result = await db.execute(query, values);
  return result.lastInsertId as number;
}

export async function updateTransaction(
  id: number,
  transaction: NewTransaction,
): Promise<void> {
  const db = await getDb();
  const { query, values } = updateTransactionStatement(id, transaction);
  await db.execute(query, values);
}

// The transaction and its tags as one write, so a failure partway never leaves
// a new movement without the tags it was saved with.
//
// A new transaction has no tags to replace and unlinks none, so there is
// nothing to clear first and nothing to sweep after — and with no tags at all,
// nothing to read either: the write is the one INSERT.
export async function insertTransactionWithTags(
  transaction: NewTransaction,
  tags: string[],
): Promise<number> {
  const db = await getDb();
  const [inserted] = await db.batch([
    insertTransactionStatement(transaction),
    ...(tags.length === 0
      ? []
      : linkTagStatements(insertedIdOf(0), tags, await knownTags(db))),
  ]);
  return inserted.lastInsertId as number;
}

export async function updateTransactionWithTags(
  id: number,
  transaction: NewTransaction,
  tags: string[],
): Promise<void> {
  const db = await getDb();
  await db.batch([
    updateTransactionStatement(id, transaction),
    ...(await tagStatements(db, id, tags)),
  ]);
}

// Takes with it what only existed because of the transaction. Attachments and
// tag links go by cascade; the rest is done here, in the same write.
export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDb();
  await db.batch([
    // An expected movement confirmed into this transaction goes back to
    // waiting. Left "confirmed", it disappeared from the ledger and from the
    // projection with nothing left to reopen it from.
    {
      query: `UPDATE expected_movements
              SET status = 'pending', transaction_id = NULL
              WHERE transaction_id = $1 AND status = 'confirmed'`,
      values: [id],
    },
    { query: "DELETE FROM transactions WHERE id = $1", values: [id] },
    DELETE_UNUSED_TAGS,
  ]);
}

// Metadata only; `getAttachmentContent` fetches the bytes when they are needed.
export async function listAttachments(transactionId: number): Promise<AttachmentMeta[]> {
  const db = await getDb();
  return db.select<AttachmentMeta[]>(
    `SELECT id, transaction_id, file_name, mime_type, byte_size, created_at
     FROM attachments
     WHERE transaction_id = $1
     ORDER BY created_at, id`,
    [transactionId],
  );
}

export async function getAttachmentContent(id: number): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ content_base64: string }[]>(
    "SELECT content_base64 FROM attachments WHERE id = $1",
    [id],
  );
  return rows[0]?.content_base64 ?? null;
}

export interface NewAttachment {
  transactionId: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentBase64: string;
}

export async function insertAttachment(attachment: NewAttachment): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO attachments
       (transaction_id, file_name, mime_type, byte_size, content_base64, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      attachment.transactionId,
      attachment.fileName,
      attachment.mimeType,
      attachment.byteSize,
      attachment.contentBase64,
      new Date().toISOString(),
    ],
  );
}

export async function deleteAttachment(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM attachments WHERE id = $1", [id]);
}

export async function listSavingsGoals(): Promise<SavingsGoalWithNames[]> {
  const db = await getDb();
  return db.select<SavingsGoalWithNames[]>(
    `SELECT g.*, p.name AS payment_method_name
     FROM savings_goals g
     LEFT JOIN payment_methods p ON p.id = g.payment_method_id
     ORDER BY g.created_at DESC, g.id DESC`,
  );
}

// Every goal's contributions in one query: there are few of them and the
// progress calculation needs them all at once anyway.
export async function listSavingsContributions(): Promise<SavingsContribution[]> {
  const db = await getDb();
  return db.select<SavingsContribution[]>(
    "SELECT * FROM savings_contributions ORDER BY date, id",
  );
}

export interface NewSavingsGoal {
  name: string;
  targetAmount: number;
  currency: string;
  trackingMode: SavingsTrackingMode;
  paymentMethodId: number | null;
  targetDate: string | null;
}

export async function insertSavingsGoal(goal: NewSavingsGoal): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO savings_goals
       (name, target_amount, currency, tracking_mode, payment_method_id,
        target_date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      goal.name,
      goal.targetAmount,
      goal.currency,
      goal.trackingMode,
      // An account only means something in account mode; storing one in the
      // other mode would leave a stale link if the mode is switched back.
      goal.trackingMode === "account" ? goal.paymentMethodId : null,
      goal.targetDate,
      new Date().toISOString(),
    ],
  );
}

export async function updateSavingsGoal(id: number, goal: NewSavingsGoal): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE savings_goals
     SET name = $1, target_amount = $2, currency = $3, tracking_mode = $4,
         payment_method_id = $5, target_date = $6
     WHERE id = $7`,
    [
      goal.name,
      goal.targetAmount,
      goal.currency,
      goal.trackingMode,
      goal.trackingMode === "account" ? goal.paymentMethodId : null,
      goal.targetDate,
      id,
    ],
  );
}

export async function deleteSavingsGoal(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM savings_goals WHERE id = $1", [id]);
}

export async function insertSavingsContribution(
  goalId: number,
  amount: number,
  date: string,
  note: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO savings_contributions (goal_id, amount, date, note) VALUES ($1, $2, $3, $4)",
    [goalId, amount, date, note],
  );
}

export async function deleteSavingsContribution(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM savings_contributions WHERE id = $1", [id]);
}

export async function listInstallmentPlans(): Promise<InstallmentPlanWithNames[]> {
  const db = await getDb();
  return db.select<InstallmentPlanWithNames[]>(
    `SELECT i.*,
            c.name AS category_name,
            c.icon AS category_icon,
            p.name AS payment_method_name
     FROM installment_plans i
     LEFT JOIN categories c ON c.id = i.category_id
     LEFT JOIN payment_methods p ON p.id = i.payment_method_id
     ORDER BY i.first_due_date DESC, i.id DESC`,
  );
}

export interface NewInstallmentPlan {
  description: string;
  totalAmount: number;
  installmentCount: number;
  currency: string;
  categoryId: number | null;
  paymentMethodId: number | null;
  firstDueDate: string;
  // Optional: what the purchase would have cost paid outright.
  cashPrice: number | null;
}

export async function insertInstallmentPlan(plan: NewInstallmentPlan): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO installment_plans
       (description, total_amount, installment_count, currency, category_id,
        payment_method_id, first_due_date, cash_price, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      plan.description,
      plan.totalAmount,
      plan.installmentCount,
      plan.currency,
      plan.categoryId,
      plan.paymentMethodId,
      plan.firstDueDate,
      plan.cashPrice,
      new Date().toISOString(),
    ],
  );
}

export async function updateInstallmentPlan(
  id: number,
  plan: NewInstallmentPlan,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE installment_plans
     SET description = $1, total_amount = $2, installment_count = $3,
         currency = $4, category_id = $5, payment_method_id = $6,
         first_due_date = $7, cash_price = $8
     WHERE id = $9`,
    [
      plan.description,
      plan.totalAmount,
      plan.installmentCount,
      plan.currency,
      plan.categoryId,
      plan.paymentMethodId,
      plan.firstDueDate,
      plan.cashPrice,
      id,
    ],
  );
}

export async function deleteInstallmentPlan(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM installment_plans WHERE id = $1", [id]);
}

export async function listLoans(): Promise<LoanWithNames[]> {
  const db = await getDb();
  return db.select<LoanWithNames[]>(
    `SELECT l.*,
            c.name AS category_name,
            c.icon AS category_icon,
            p.name AS payment_method_name
     FROM loans l
     LEFT JOIN categories c ON c.id = l.category_id
     LEFT JOIN payment_methods p ON p.id = l.payment_method_id
     ORDER BY l.first_due_date DESC, l.id DESC`,
  );
}

export interface NewLoan {
  direction: LoanDirection;
  counterparty: string;
  description: string;
  principal: number;
  currency: string;
  annualRate: number;
  installmentCount: number;
  categoryId: number | null;
  paymentMethodId: number | null;
  firstDueDate: string;
}

export async function insertLoan(loan: NewLoan): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO loans
       (direction, counterparty, description, principal, currency, annual_rate,
        installment_count, category_id, payment_method_id, first_due_date,
        created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      loan.direction,
      loan.counterparty,
      loan.description,
      loan.principal,
      loan.currency,
      loan.annualRate,
      loan.installmentCount,
      loan.categoryId,
      loan.paymentMethodId,
      loan.firstDueDate,
      new Date().toISOString(),
    ],
  );
}

export async function updateLoan(id: number, loan: NewLoan): Promise<void> {
  const db = await getDb();
  // `confirmed_count` is deliberately left alone: editing the terms of a loan
  // must not undo or invent payments that were already recorded.
  await db.execute(
    `UPDATE loans
     SET direction = $1, counterparty = $2, description = $3, principal = $4,
         currency = $5, annual_rate = $6, installment_count = $7,
         category_id = $8, payment_method_id = $9, first_due_date = $10
     WHERE id = $11`,
    [
      loan.direction,
      loan.counterparty,
      loan.description,
      loan.principal,
      loan.currency,
      loan.annualRate,
      loan.installmentCount,
      loan.categoryId,
      loan.paymentMethodId,
      loan.firstDueDate,
      id,
    ],
  );
}

export async function deleteLoan(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM loans WHERE id = $1", [id]);
}

export async function listRecurringTransactions(): Promise<
  RecurringTransactionWithNames[]
> {
  const db = await getDb();
  return db.select<RecurringTransactionWithNames[]>(
    `SELECT r.*,
            c.name AS category_name,
            c.icon AS category_icon,
            p.name AS payment_method_name
     FROM recurring_transactions r
     LEFT JOIN categories c ON c.id = r.category_id
     LEFT JOIN payment_methods p ON p.id = r.payment_method_id
     ORDER BY r.is_active DESC, r.description`,
  );
}

export interface NewRecurringTransaction {
  description: string;
  amount: number;
  type: CategoryType;
  categoryId: number | null;
  paymentMethodId: number | null;
  currency: string;
  frequency: RecurrenceFrequencyValue;
  startDate: string;
  isActive: boolean;
}

export async function insertRecurringTransaction(
  recurring: NewRecurringTransaction,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO recurring_transactions
       (description, amount, type, category_id, payment_method_id, currency,
        frequency, start_date, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      recurring.description,
      recurring.amount,
      recurring.type,
      recurring.categoryId,
      recurring.paymentMethodId,
      recurring.currency,
      recurring.frequency,
      recurring.startDate,
      recurring.isActive ? 1 : 0,
    ],
  );
}

export async function updateRecurringTransaction(
  id: number,
  recurring: NewRecurringTransaction,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE recurring_transactions
     SET description = $1, amount = $2, type = $3, category_id = $4,
         payment_method_id = $5, currency = $6, frequency = $7,
         start_date = $8, is_active = $9
     WHERE id = $10`,
    [
      recurring.description,
      recurring.amount,
      recurring.type,
      recurring.categoryId,
      recurring.paymentMethodId,
      recurring.currency,
      recurring.frequency,
      recurring.startDate,
      recurring.isActive ? 1 : 0,
      id,
    ],
  );
}

export async function deleteRecurringTransaction(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM recurring_transactions WHERE id = $1", [id]);
}

// Instalments and loan payments are settled strictly in order. A schedule only
// stores how many are paid, so settling a later one would silently count every
// earlier one as paid too, with no movement behind it. Checked against the row
// as stored rather than what the screen last rendered, so "Registrar todas"
// can still work through a schedule one payment after another.
function assertNextInSchedule(
  kind: string,
  row: { id: number; confirmed_count: number; installment_count: number },
  index: number,
): void {
  if (index !== row.confirmed_count || index >= row.installment_count) {
    throw new Error(
      `Payment ${index + 1} of ${kind} ${row.id} is not the next one due ` +
        `(${row.confirmed_count} of ${row.installment_count} already confirmed)`,
    );
  }
}

// The same rule for a recurring series: it stores the last occurrence decided
// on, so deciding a later one would settle every pending one before it.
function assertNextOccurrence(template: RecurringTransaction, date: string): void {
  const [next] = pendingOccurrences(
    template.start_date,
    template.frequency,
    template.last_confirmed_date,
    date,
    1,
  );
  if (next !== date) {
    throw new Error(
      `${date} is not the next pending occurrence of recurring transaction ${template.id}`,
    );
  }
}

async function getLoan(id: number): Promise<Loan | null> {
  const db = await getDb();
  const rows = await db.select<Loan[]>("SELECT * FROM loans WHERE id = $1", [id]);
  return rows[0] ?? null;
}

async function getInstallmentPlan(id: number): Promise<InstallmentPlan | null> {
  const db = await getDb();
  const rows = await db.select<InstallmentPlan[]>(
    "SELECT * FROM installment_plans WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

async function getRecurringTransaction(id: number): Promise<RecurringTransaction | null> {
  const db = await getDb();
  const rows = await db.select<RecurringTransaction[]>(
    "SELECT * FROM recurring_transactions WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

// Moves a schedule on by one payment, but only from the position the caller
// read. Schedules store a count, so a second click registering the same payment
// would otherwise write it twice; this way it finds the count already moved on,
// changes nothing, and the batch it belongs to — the transaction included — is
// undone with it.
function advanceScheduleStatement(
  table: "loans" | "installment_plans",
  id: number,
  index: number,
): BatchStatement {
  return {
    query: `UPDATE ${table}
            SET confirmed_count = confirmed_count + 1
            WHERE id = $1 AND confirmed_count = $2 AND confirmed_count < installment_count`,
    values: [id, index],
    expectChanges: 1,
  };
}

// The same compare-and-set for a recurring series, which stores the last
// occurrence decided on rather than a count. Called both when an occurrence is
// accepted into the ledger and when it is dismissed, since either way the user
// has decided about it and it must stop being proposed.
function advanceSeriesStatement(
  id: number,
  from: string | null,
  date: string,
): BatchStatement {
  return {
    query: `UPDATE recurring_transactions
            SET last_confirmed_date = $1
            WHERE id = $2 AND last_confirmed_date IS $3`,
    values: [date, id, from],
    expectChanges: 1,
  };
}

// Takes back a step the user just took on a commitment, for the "Deshacer" in
// the toast that confirms it. Handed out by the step itself, the only place
// that knows what it wrote.
export type Undo = () => Promise<void>;

// Deletes the transaction a step created, as part of undoing that step. It has
// to still be there: one the user has deleted since means there is nothing
// left to take back, and the whole undo writes nothing.
function deleteCreatedTransactionStatements(transactionId: number): BatchStatement[] {
  return [
    {
      query: "DELETE FROM transactions WHERE id = $1",
      values: [transactionId],
      expectChanges: 1,
    },
    DELETE_UNUSED_TAGS,
  ];
}

// Moves a schedule back by one payment and deletes the movement that payment
// recorded, but only while it is still the last payment registered: the same
// compare-and-set as advancing, the other way round. Undoing instalment 3
// after instalment 4 has gone in would leave a hole in the middle of the plan.
function undoScheduleStatements(
  table: "loans" | "installment_plans",
  id: number,
  index: number,
  transactionId: number,
): BatchStatement[] {
  return [
    {
      query: `UPDATE ${table}
              SET confirmed_count = confirmed_count - 1
              WHERE id = $1 AND confirmed_count = $2`,
      values: [id, index + 1],
      expectChanges: 1,
    },
    ...deleteCreatedTransactionStatements(transactionId),
  ];
}

// Puts a series back where it stood before an occurrence was decided on — at
// `from` — and deletes the movement if one was recorded. Only while that
// occurrence is still the last one decided, for the same reason as a schedule.
function undoSeriesStatements(
  id: number,
  from: string | null,
  date: string,
  transactionId: number | null,
): BatchStatement[] {
  return [
    {
      query: `UPDATE recurring_transactions
              SET last_confirmed_date = $1
              WHERE id = $2 AND last_confirmed_date = $3`,
      values: [from, id, date],
      expectChanges: 1,
    },
    ...(transactionId === null ? [] : deleteCreatedTransactionStatements(transactionId)),
  ];
}

// An undo that writes these statements as one batch: every compare-and-set in
// it holds, or nothing is written.
function undoing(statements: BatchStatement[]): Undo {
  return async () => {
    const db = await getDb();
    await db.batch(statements);
  };
}

// The movement a loan payment records. A payment on money I owe leaves my
// pocket; a payment on money owed to me arrives in it. Recording both as
// expenses would make being repaid look like a cost.
function loanPaymentTransaction(
  loan: Loan,
  index: number,
  date: string,
  amount: number,
): NewTransaction {
  return {
    amount,
    type: loan.direction === "borrowed" ? "expense" : "income",
    currency: loan.currency,
    categoryId: loan.category_id,
    paymentMethodId: loan.payment_method_id,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    description: `${loan.description} (${index + 1}/${loan.installment_count})`,
    date,
  };
}

function installmentTransaction(
  plan: InstallmentPlan,
  index: number,
  date: string,
  amount: number,
): NewTransaction {
  return {
    amount,
    type: "expense",
    currency: plan.currency,
    categoryId: plan.category_id,
    paymentMethodId: plan.payment_method_id,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    description: `${plan.description} (${index + 1}/${plan.installment_count})`,
    date,
  };
}

function occurrenceTransaction(
  template: RecurringTransaction,
  date: string,
): NewTransaction {
  return {
    amount: template.amount,
    type: template.type,
    currency: template.currency,
    categoryId: template.category_id,
    paymentMethodId: template.payment_method_id,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    description: template.description,
    date,
  };
}

// Records the payment as a real movement and advances the loan by one, as a
// single write: neither can land without the other. Returns how to take it
// back, or null when the loan is gone and nothing was written.
export async function recordLoanPayment(
  id: number,
  index: number,
  date: string,
  amount: number,
): Promise<Undo | null> {
  const loan = await getLoan(id);
  if (!loan) return null;
  assertNextInSchedule("loan", loan, index);

  const db = await getDb();
  const [, inserted] = await db.batch([
    advanceScheduleStatement("loans", id, index),
    insertTransactionStatement(loanPaymentTransaction(loan, index, date, amount)),
  ]);
  return undoing(
    undoScheduleStatements("loans", id, index, inserted.lastInsertId as number),
  );
}

// Records one instalment as paid: writes the movement and advances the plan,
// as a single write. Returns how to take it back.
export async function recordInstallment(
  id: number,
  index: number,
  date: string,
  amount: number,
): Promise<Undo | null> {
  const plan = await getInstallmentPlan(id);
  if (!plan) return null;
  assertNextInSchedule("installment plan", plan, index);

  const db = await getDb();
  const [, inserted] = await db.batch([
    advanceScheduleStatement("installment_plans", id, index),
    insertTransactionStatement(installmentTransaction(plan, index, date, amount)),
  ]);
  return undoing(
    undoScheduleStatements(
      "installment_plans",
      id,
      index,
      inserted.lastInsertId as number,
    ),
  );
}

// Turns one proposed occurrence into a real transaction and moves the series
// past it, as a single write, so it is never proposed — or recorded — twice.
// Returns how to take it back.
export async function recordRecurringOccurrence(
  id: number,
  date: string,
): Promise<Undo | null> {
  const template = await getRecurringTransaction(id);
  if (!template) return null;
  assertNextOccurrence(template, date);

  const db = await getDb();
  const [, inserted] = await db.batch([
    advanceSeriesStatement(template.id, template.last_confirmed_date, date),
    insertTransactionStatement(occurrenceTransaction(template, date)),
  ]);
  return undoing(
    undoSeriesStatements(
      template.id,
      template.last_confirmed_date,
      date,
      inserted.lastInsertId as number,
    ),
  );
}

// Decides against an occurrence without recording anything, moving the series
// past it just the same. Returns how to take it back.
export async function dismissRecurringOccurrence(
  id: number,
  date: string,
): Promise<Undo | null> {
  const template = await getRecurringTransaction(id);
  if (!template) return null;
  assertNextOccurrence(template, date);

  const db = await getDb();
  await db.batch([
    advanceSeriesStatement(template.id, template.last_confirmed_date, date),
  ]);
  return undoing(
    undoSeriesStatements(template.id, template.last_confirmed_date, date, null),
  );
}

// One step of "Registrar todas": what a single "Registrar" takes, tagged with
// the kind of commitment it moves on.
export type CommitmentStep =
  | { kind: "installment"; id: number; index: number; date: string; amount: number }
  | { kind: "loan"; id: number; index: number; date: string; amount: number }
  | { kind: "recurring"; id: number; date: string };

// Registers every step as one write: all of them, or — if any is refused or
// fails — none. Steps on the same plan are taken in the order given, each
// checked against where the one before left the plan, exactly as a run of
// single "Registrar" would be checked; that one-at-a-time run used to leave
// part of the list registered when a step failed halfway.
//
// Returns one undo for the lot. It too is one write with a compare-and-set per
// step, so if any step is no longer the last one taken on its plan, none of
// them is taken back.
export async function recordSteps(steps: CommitmentStep[]): Promise<Undo> {
  // Where each plan stands, read once and moved on as the steps are planned.
  const loans = new Map<number, Loan>();
  const plans = new Map<number, InstallmentPlan>();
  const series = new Map<number, RecurringTransaction>();

  const statements: BatchStatement[] = [];
  // For each step, where its transaction is inserted and how to take it back
  // once that transaction's id is known.
  const planned: {
    insertAt: number;
    undo: (transactionId: number) => BatchStatement[];
  }[] = [];

  for (const step of steps) {
    switch (step.kind) {
      case "loan": {
        const loan = loans.get(step.id) ?? (await getLoan(step.id));
        if (!loan) throw new Error(`Loan ${step.id} no longer exists`);
        assertNextInSchedule("loan", loan, step.index);
        loans.set(step.id, { ...loan, confirmed_count: loan.confirmed_count + 1 });

        statements.push(advanceScheduleStatement("loans", step.id, step.index));
        planned.push({
          insertAt: statements.length,
          undo: (transactionId) =>
            undoScheduleStatements("loans", step.id, step.index, transactionId),
        });
        statements.push(
          insertTransactionStatement(
            loanPaymentTransaction(loan, step.index, step.date, step.amount),
          ),
        );
        break;
      }
      case "installment": {
        const plan = plans.get(step.id) ?? (await getInstallmentPlan(step.id));
        if (!plan) throw new Error(`Installment plan ${step.id} no longer exists`);
        assertNextInSchedule("installment plan", plan, step.index);
        plans.set(step.id, { ...plan, confirmed_count: plan.confirmed_count + 1 });

        statements.push(
          advanceScheduleStatement("installment_plans", step.id, step.index),
        );
        planned.push({
          insertAt: statements.length,
          undo: (transactionId) =>
            undoScheduleStatements(
              "installment_plans",
              step.id,
              step.index,
              transactionId,
            ),
        });
        statements.push(
          insertTransactionStatement(
            installmentTransaction(plan, step.index, step.date, step.amount),
          ),
        );
        break;
      }
      case "recurring": {
        const template = series.get(step.id) ?? (await getRecurringTransaction(step.id));
        if (!template)
          throw new Error(`Recurring transaction ${step.id} no longer exists`);
        assertNextOccurrence(template, step.date);
        const from = template.last_confirmed_date;
        series.set(step.id, { ...template, last_confirmed_date: step.date });

        statements.push(advanceSeriesStatement(step.id, from, step.date));
        planned.push({
          insertAt: statements.length,
          undo: (transactionId) =>
            undoSeriesStatements(step.id, from, step.date, transactionId),
        });
        statements.push(
          insertTransactionStatement(occurrenceTransaction(template, step.date)),
        );
        break;
      }
    }
  }

  if (statements.length === 0) return async () => {};

  const db = await getDb();
  const results = await db.batch(statements);

  // Last step first: two steps on one plan have to come off in the reverse of
  // the order they went on. The tag sweep each one carries runs once, at the
  // end.
  const undoStatements = planned
    .map(({ insertAt, undo }) => undo(results[insertAt].lastInsertId as number))
    .reverse()
    .flat()
    .filter((statement) => statement !== DELETE_UNUSED_TAGS);
  return undoing([...undoStatements, DELETE_UNUSED_TAGS]);
}

// Soonest first: the list is a queue of what is coming, and the thing that is
// coming next is the one worth looking at.
export async function listExpectedMovements(): Promise<ExpectedMovementWithNames[]> {
  const db = await getDb();
  return db.select<ExpectedMovementWithNames[]>(
    `SELECT e.*,
            c.name AS category_name,
            c.icon AS category_icon,
            p.name AS payment_method_name
     FROM expected_movements e
     LEFT JOIN categories c ON c.id = e.category_id
     LEFT JOIN payment_methods p ON p.id = e.payment_method_id
     ORDER BY e.due_date, e.id`,
  );
}

export interface NewExpectedMovement {
  description: string;
  amount: number;
  type: CategoryType;
  currency: string;
  categoryId: number | null;
  // Optional on purpose: knowing a cost is coming does not mean having decided
  // which account it will come out of.
  paymentMethodId: number | null;
  dueDate: string;
}

export async function insertExpectedMovement(
  movement: NewExpectedMovement,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO expected_movements
       (description, amount, type, currency, category_id, payment_method_id,
        due_date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      movement.description,
      movement.amount,
      movement.type,
      movement.currency,
      movement.categoryId,
      movement.paymentMethodId,
      movement.dueDate,
      new Date().toISOString(),
    ],
  );
}

// Editing leaves `status` and `transaction_id` alone: they record what happened
// to the movement, which is not something the form is editing.
export async function updateExpectedMovement(
  id: number,
  movement: NewExpectedMovement,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE expected_movements
     SET description = $1,
         amount = $2,
         type = $3,
         currency = $4,
         category_id = $5,
         payment_method_id = $6,
         due_date = $7
     WHERE id = $8`,
    [
      movement.description,
      movement.amount,
      movement.type,
      movement.currency,
      movement.categoryId,
      movement.paymentMethodId,
      movement.dueDate,
      id,
    ],
  );
}

export async function deleteExpectedMovement(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM expected_movements WHERE id = $1", [id]);
}

// Records the movement as having happened: writes the real transaction and
// closes the movement with its id, as a single write. Only a pending movement
// can be closed, so confirming twice, or confirming one already dismissed,
// writes nothing.
//
// Dated the day it was due rather than today: the user is recording that the
// thing they foresaw happened, and moving it to whenever they got around to
// confirming would put it in the wrong month.
export async function confirmExpectedMovement(id: number): Promise<Undo | null> {
  const db = await getDb();
  const [movement] = await db.select<ExpectedMovement[]>(
    "SELECT * FROM expected_movements WHERE id = $1",
    [id],
  );
  if (!movement) return null;

  const [inserted] = await db.batch([
    insertTransactionStatement({
      amount: movement.amount,
      type: movement.type,
      currency: movement.currency,
      categoryId: movement.category_id,
      paymentMethodId: movement.payment_method_id,
      destinationPaymentMethodId: null,
      destinationAmount: null,
      description: movement.description,
      date: movement.due_date,
    }),
    {
      query: `UPDATE expected_movements
              SET status = 'confirmed', transaction_id = $1
              WHERE id = $2 AND status = 'pending'`,
      values: [insertedIdOf(0), id],
      expectChanges: 1,
    },
  ]);
  return reopenExpectedMovement(id, "confirmed", inserted.lastInsertId as number);
}

// Decides against it. Nothing is recorded, which is the whole difference from
// confirming — both stop it being proposed, only one of them says it happened.
export async function dismissExpectedMovement(id: number): Promise<Undo> {
  const db = await getDb();
  await db.batch([
    {
      query: `UPDATE expected_movements
              SET status = 'dismissed', transaction_id = NULL
              WHERE id = $1 AND status = 'pending'`,
      values: [id],
      expectChanges: 1,
    },
  ]);
  return reopenExpectedMovement(id, "dismissed", null);
}

// Sends a movement back to waiting and deletes the transaction confirming it
// created, if it created one. Only from the decision being undone: if the
// movement has moved on since — its transaction deleted, which already reopened
// it — nothing is written.
function reopenExpectedMovement(
  id: number,
  from: "confirmed" | "dismissed",
  transactionId: number | null,
): Undo {
  return async () => {
    const db = await getDb();
    await db.batch([
      {
        query: `UPDATE expected_movements
                SET status = 'pending', transaction_id = NULL
                WHERE id = $1 AND status = $2 AND transaction_id IS $3`,
        values: [id, from, transactionId],
        expectChanges: 1,
      },
      ...(transactionId === null
        ? []
        : deleteCreatedTransactionStatements(transactionId)),
    ]);
  };
}

export async function listBudgets(): Promise<BudgetWithCategory[]> {
  const db = await getDb();
  return db.select<BudgetWithCategory[]>(
    `SELECT b.*,
            c.name AS category_name,
            c.icon AS category_icon,
            c.color AS category_color
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     ORDER BY c.name, b.currency`,
  );
}

export interface NewBudget {
  categoryId: number;
  currency: string;
  amount: number;
  period: BudgetPeriod;
}

export async function insertBudget(budget: NewBudget): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO budgets (category_id, currency, amount, period)
     VALUES ($1, $2, $3, $4)`,
    [budget.categoryId, budget.currency, budget.amount, budget.period],
  );
}

export async function updateBudget(id: number, budget: NewBudget): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE budgets
     SET category_id = $1, currency = $2, amount = $3, period = $4
     WHERE id = $5`,
    [budget.categoryId, budget.currency, budget.amount, budget.period, id],
  );
}

export async function deleteBudget(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM budgets WHERE id = $1", [id]);
}

export async function listTags(): Promise<Tag[]> {
  const db = await getDb();
  return db.select<Tag[]>("SELECT * FROM tags ORDER BY name");
}

// A tag left on no transaction would keep being suggested forever, which turns
// a typo into a permanent entry in the vocabulary.
const DELETE_UNUSED_TAGS: BatchStatement = {
  query: "DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM transaction_tags)",
};

// The statements that replace the tags on a transaction with exactly this set.
//
// Names are matched case-insensitively, so "Viaje" and "viaje" resolve to the
// same tag rather than quietly creating a near-duplicate. The match is made
// here rather than left to the column's COLLATE NOCASE, which folds ASCII only
// and let "Ñandú" and "ñandú" through as two tags. The existing tags are read
// before the batch runs; a tag deleted in between makes the batch fail whole
// on its foreign key, rather than write a half-tagged transaction.
type TransactionRef = number | ReturnType<typeof insertedIdOf>;

const foldTagName = (name: string) => name.toLocaleLowerCase("es");

// Every tag there is, by folded name: its id once it exists, or the spelling
// it is about to be created with. Read once per write, however many
// transactions that write tags.
type TagRef = { id: number } | { name: string };
type KnownTags = Map<string, TagRef>;

async function knownTags(db: SqlConnection): Promise<KnownTags> {
  const tags = await db.select<Tag[]>("SELECT id, name FROM tags");
  return new Map(tags.map((tag) => [foldTagName(tag.name), { id: tag.id }]));
}

// The statements that put these tags on a transaction, creating the ones that
// do not exist yet. A tag created here is added to `known`, so a later row of
// the same write spelling it differently ("ñandú" after "Ñandú") reuses it.
function linkTagStatements(
  transactionId: TransactionRef,
  names: string[],
  known: KnownTags,
): BatchStatement[] {
  const wanted = Array.from(
    new Map(
      names
        .map((name) => name.trim())
        .filter((name) => name !== "")
        .map((name) => [foldTagName(name), name]),
    ).values(),
  );

  return wanted.flatMap((name): BatchStatement[] => {
    const tag = known.get(foldTagName(name));
    if (tag !== undefined && "id" in tag) {
      return [
        {
          query: `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
                  VALUES ($1, $2)`,
          values: [transactionId, tag.id],
        },
      ];
    }

    const spelling = tag?.name ?? name;
    known.set(foldTagName(name), { name: spelling });
    return [
      ...(tag === undefined
        ? [{ query: "INSERT OR IGNORE INTO tags (name) VALUES ($1)", values: [spelling] }]
        : []),
      {
        query: `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
                VALUES ($1, (SELECT id FROM tags WHERE name = $2))`,
        values: [transactionId, spelling],
      },
    ];
  });
}

async function tagStatements(
  db: SqlConnection,
  transactionId: TransactionRef,
  names: string[],
): Promise<BatchStatement[]> {
  return [
    {
      query: "DELETE FROM transaction_tags WHERE transaction_id = $1",
      values: [transactionId],
    },
    ...linkTagStatements(transactionId, names, await knownTags(db)),
    DELETE_UNUSED_TAGS,
  ];
}

// Replaces the tags on a transaction with exactly this set, as one write: a
// failure partway leaves the old set in place rather than half of the new one.
export async function setTransactionTags(
  transactionId: number,
  names: string[],
): Promise<void> {
  const db = await getDb();
  await db.batch(await tagStatements(db, transactionId, names));
}

export async function listCategoryRules(): Promise<CategoryRuleWithCategory[]> {
  const db = await getDb();
  return db.select<CategoryRuleWithCategory[]>(
    `SELECT r.*,
            c.name AS category_name,
            c.icon AS category_icon,
            c.type AS category_type
     FROM category_rules r
     JOIN categories c ON c.id = r.category_id
     ORDER BY LENGTH(r.pattern) DESC, r.id`,
  );
}

export interface NewCategoryRule {
  pattern: string;
  categoryId: number;
}

export async function insertCategoryRule(rule: NewCategoryRule): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO category_rules (pattern, category_id) VALUES ($1, $2)", [
    rule.pattern,
    rule.categoryId,
  ]);
}

export async function updateCategoryRule(
  id: number,
  rule: NewCategoryRule,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE category_rules SET pattern = $1, category_id = $2 WHERE id = $3",
    [rule.pattern, rule.categoryId, id],
  );
}

export async function deleteCategoryRule(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM category_rules WHERE id = $1", [id]);
}

// Inserts every row, each with its tags, as one write: a single round trip and
// a single transaction, with the existing tags read once. All or nothing — a
// file that fails partway leaves no half of itself behind to be told apart
// from the rest, and importing it again after the fix starts from clean.
export async function insertTransactions(
  entries: { transaction: NewTransaction; tags: string[] }[],
): Promise<void> {
  if (entries.length === 0) return;

  const db = await getDb();
  const known: KnownTags = entries.some((entry) => entry.tags.length > 0)
    ? await knownTags(db)
    : new Map<string, TagRef>();

  const statements: BatchStatement[] = [];
  for (const entry of entries) {
    const at = statements.length;
    statements.push(
      insertTransactionStatement(entry.transaction),
      ...linkTagStatements(insertedIdOf(at), entry.tags, known),
    );
  }
  await db.batch(statements);
}

// Keys the app stores about itself. Kept as constants so a typo cannot quietly
// read a setting that was never written.
export const LAST_BACKUP_AT = "last_backup_at";
export const EXCHANGE_RATE_TYPE = "exchange_rate_type";
export const NOTIFICATIONS_ENABLED = "notifications_enabled";
// The facts already announced, as a JSON array of notification ids.
export const NOTIFIED_IDS = "notified_ids";
// The last month whose close the user actually dealt with, so the notice on the
// statistics screen stops asking. Separate from NOTIFIED_IDS, which tracks a
// different channel with a different idea of "already said".
export const LAST_SEEN_CLOSE = "last_seen_close";
// Column mappings the user has already worked out, keyed by the header row of
// the file they came from, so the same bank's export does not have to be mapped
// again every month.
export const IMPORT_PROFILES = "import_profiles";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function listExchangeRates(rateType: string): Promise<ExchangeRate[]> {
  const db = await getDb();
  return db.select<ExchangeRate[]>(
    "SELECT * FROM exchange_rates WHERE rate_type = $1 ORDER BY date",
    [rateType],
  );
}

// Bound parameters per row, used to size the batches below.
const EXCHANGE_RATE_COLUMNS = 6;
// SQLite caps how many parameters a single statement may bind. Staying well
// under the limit keeps this working regardless of how the library was built.
const MAX_BOUND_PARAMETERS = 900;

// Writes the historical series in batches. One statement per row would mean a
// few thousand IPC round trips for a single import; batching turns it into a
// handful of statements. A manual correction for a given day is preserved,
// since only rows that came from the API are overwritten.
export async function upsertExchangeRates(rates: ExchangeRate[]): Promise<number> {
  if (rates.length === 0) return 0;

  const db = await getDb();
  const batchSize = Math.floor(MAX_BOUND_PARAMETERS / EXCHANGE_RATE_COLUMNS);
  let written = 0;

  for (let start = 0; start < rates.length; start += batchSize) {
    const batch = rates.slice(start, start + batchSize);

    const placeholders = batch
      .map((_, index) => {
        const base = index * EXCHANGE_RATE_COLUMNS;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
      })
      .join(", ");

    const values = batch.flatMap((rate) => [
      rate.date,
      rate.rate_type,
      rate.buy,
      rate.sell,
      rate.source,
      rate.fetched_at,
    ]);

    await db.execute(
      `INSERT INTO exchange_rates (date, rate_type, buy, sell, source, fetched_at)
       VALUES ${placeholders}
       ON CONFLICT(date, rate_type) DO UPDATE SET
         buy = excluded.buy,
         sell = excluded.sell,
         source = excluded.source,
         fetched_at = excluded.fetched_at
       WHERE exchange_rates.source <> 'manual'`,
      values,
    );

    written += batch.length;
  }

  return written;
}

// One row per day: re-fetching on the same day refreshes it in place rather
// than piling up duplicates, and a manual correction overwrites the fetched one.
// A manual correction is only ever replaced by another manual one. Without the
// guard, the download the app runs on every launch — keyed to the same day the
// correction was saved under — silently put the provider's figure back.
export async function upsertExchangeRate(rate: ExchangeRate): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO exchange_rates (date, rate_type, buy, sell, source, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(date, rate_type) DO UPDATE SET
       buy = excluded.buy,
       sell = excluded.sell,
       source = excluded.source,
       fetched_at = excluded.fetched_at
     WHERE exchange_rates.source <> 'manual' OR excluded.source = 'manual'`,
    [rate.date, rate.rate_type, rate.buy, rate.sell, rate.source, rate.fetched_at],
  );
}

export * from "./schema";
