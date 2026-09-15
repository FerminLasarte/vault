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

// The surface of the connection this module actually uses. Naming it means the
// query functions below can run against anything that honours it — in practice
// the plugin in the app, and an in-memory database with the same schema under
// test (see ./testing/database).
export interface SqlConnection {
  select<T>(query: string, values?: unknown[]): Promise<T>;
  execute(query: string, values?: unknown[]): Promise<QueryResult>;
}

let dbPromise: Promise<SqlConnection> | null = null;

// Returns a cached connection, opening it (once) on first call. Opening the
// connection is what triggers the Rust-side migrations (see src-tauri/src/lib.rs),
// which create the schema and seed the default data — so by the time
// this promise resolves, the database is fully ready.
function getDb(): Promise<SqlConnection> {
  if (!dbPromise) {
    dbPromise = Database.load(DATABASE_URL);
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
  await db.execute("UPDATE transactions SET category_id = NULL WHERE category_id = $1", [
    id,
  ]);
  await db.execute("DELETE FROM categories WHERE id = $1", [id]);
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

// Transactions reference payment methods with a nullable FK, so deleting an
// account detaches it from its history rather than destroying the records.
export async function deletePaymentMethod(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE transactions SET payment_method_id = NULL WHERE payment_method_id = $1",
    [id],
  );
  await db.execute(
    `UPDATE transactions SET destination_payment_method_id = NULL
     WHERE destination_payment_method_id = $1`,
    [id],
  );
  await db.execute("DELETE FROM payment_methods WHERE id = $1", [id]);
}

export async function countTransactionsForPaymentMethod(id: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM transactions WHERE payment_method_id = $1",
    [id],
  );
  return rows[0]?.total ?? 0;
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

// Returns the new row's id so the caller can attach tags to it.
export async function insertTransaction(transaction: NewTransaction): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO transactions
       (amount, type, category_id, payment_method_id, destination_payment_method_id,
        destination_amount, description, date, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
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
  );

  return result.lastInsertId as number;
}

export async function updateTransaction(
  id: number,
  transaction: NewTransaction,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE transactions
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
    [
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
  );
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM transactions WHERE id = $1", [id]);
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

// Instalments are confirmed strictly in order, so the count is all that needs
// storing. Guarded against going past the end of the plan.
export async function advanceInstallmentPlan(
  id: number,
  confirmedCount: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE installment_plans
     SET confirmed_count = MIN($1, installment_count)
     WHERE id = $2`,
    [confirmedCount, id],
  );
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

// Payments are confirmed strictly in order, so the count is all that needs
// storing. Guarded against running past the end of the schedule.
export async function advanceLoan(id: number, confirmedCount: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE loans
     SET confirmed_count = $1
     WHERE id = $2 AND $1 <= installment_count AND $1 >= 0`,
    [confirmedCount, id],
  );
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

// Records how far a series has been dealt with. Called both when an occurrence
// is accepted into the ledger and when it is dismissed, since either way the
// user has decided about it and it must stop being proposed.
export async function markRecurringConfirmed(id: number, date: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE recurring_transactions SET last_confirmed_date = $1 WHERE id = $2",
    [date, id],
  );
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

// Records the payment as a real movement and advances the loan by one, in
// that order, so a failure never leaves a loan claiming a payment that was
// never written.
export async function recordLoanPayment(
  id: number,
  index: number,
  date: string,
  amount: number,
): Promise<void> {
  const loan = await getLoan(id);
  if (!loan) return;
  assertNextInSchedule("loan", loan, index);

  // A payment on money I owe leaves my pocket; a payment on money owed to me
  // arrives in it. Recording both as expenses would make being repaid look
  // like a cost.
  await insertTransaction({
    amount,
    type: loan.direction === "borrowed" ? "expense" : "income",
    currency: loan.currency,
    categoryId: loan.category_id,
    paymentMethodId: loan.payment_method_id,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    description: `${loan.description} (${index + 1}/${loan.installment_count})`,
    date,
  });
  await advanceLoan(id, index + 1);
}

// Records one instalment as paid: writes the movement and advances the plan.
export async function recordInstallment(
  id: number,
  index: number,
  date: string,
  amount: number,
): Promise<void> {
  const plan = await getInstallmentPlan(id);
  if (!plan) return;
  assertNextInSchedule("installment plan", plan, index);

  await insertTransaction({
    amount,
    type: "expense",
    currency: plan.currency,
    categoryId: plan.category_id,
    paymentMethodId: plan.payment_method_id,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    description: `${plan.description} (${index + 1}/${plan.installment_count})`,
    date,
  });
  await advanceInstallmentPlan(id, index + 1);
}

// Turns one proposed occurrence into a real transaction and moves the series
// past it, so it is never proposed twice.
export async function recordRecurringOccurrence(id: number, date: string): Promise<void> {
  const template = await getRecurringTransaction(id);
  if (!template) return;
  assertNextOccurrence(template, date);

  await insertTransaction({
    amount: template.amount,
    type: template.type,
    currency: template.currency,
    categoryId: template.category_id,
    paymentMethodId: template.payment_method_id,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    description: template.description,
    date,
  });
  await markRecurringConfirmed(id, date);
}

// Decides against an occurrence without recording anything, moving the series
// past it just the same.
export async function dismissRecurringOccurrence(
  id: number,
  date: string,
): Promise<void> {
  const template = await getRecurringTransaction(id);
  if (!template) return;
  assertNextOccurrence(template, date);

  await markRecurringConfirmed(id, date);
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

// Closes a movement out. Confirming carries the transaction it became; deciding
// against it carries nothing, which is the whole difference between the two —
// both stop it being proposed, only one of them says it happened.
export async function closeExpectedMovement(
  id: number,
  status: "confirmed" | "dismissed",
  transactionId: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE expected_movements SET status = $1, transaction_id = $2 WHERE id = $3",
    [status, transactionId, id],
  );
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

// Replaces the tags on a transaction with exactly this set. Names are matched
// case-insensitively (the column is COLLATE NOCASE), so "Viaje" and "viaje"
// resolve to the same tag rather than quietly creating a near-duplicate.
export async function setTransactionTags(
  transactionId: number,
  names: string[],
): Promise<void> {
  const db = await getDb();

  const wanted = Array.from(
    new Map(
      names
        .map((name) => name.trim())
        .filter((name) => name !== "")
        .map((name) => [name.toLocaleLowerCase("es"), name]),
    ).values(),
  );

  await db.execute("DELETE FROM transaction_tags WHERE transaction_id = $1", [
    transactionId,
  ]);

  for (const name of wanted) {
    await db.execute("INSERT OR IGNORE INTO tags (name) VALUES ($1)", [name]);
    await db.execute(
      `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
       VALUES ($1, (SELECT id FROM tags WHERE name = $2))`,
      [transactionId, name],
    );
  }

  // A tag left on no transaction would keep being suggested forever, which
  // turns a typo into a permanent entry in the vocabulary.
  await db.execute(
    `DELETE FROM tags
     WHERE id NOT IN (SELECT tag_id FROM transaction_tags)`,
  );
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

// Inserts many rows in sequence. Every row has already been validated by the
// import planner, so a mid-way failure is not expected; if one does happen the
// rows before it stay written, which is preferable to silently discarding a
// long import that was almost entirely fine.
export async function insertTransactions(
  entries: { transaction: NewTransaction; tags: string[] }[],
): Promise<void> {
  for (const entry of entries) {
    const id = await insertTransaction(entry.transaction);
    if (entry.tags.length > 0) {
      await setTransactionTags(id, entry.tags);
    }
  }
}

// Returns the most recent cached quote, or null when none has ever been
// stored — which is only the case before the first successful fetch.
export async function getLatestExchangeRate(
  rateType: string,
): Promise<ExchangeRate | null> {
  const db = await getDb();
  const rows = await db.select<ExchangeRate[]>(
    `SELECT * FROM exchange_rates
     WHERE rate_type = $1
     ORDER BY date DESC LIMIT 1`,
    [rateType],
  );
  return rows[0] ?? null;
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
export async function upsertExchangeRate(rate: ExchangeRate): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO exchange_rates (date, rate_type, buy, sell, source, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(date, rate_type) DO UPDATE SET
       buy = excluded.buy,
       sell = excluded.sell,
       source = excluded.source,
       fetched_at = excluded.fetched_at`,
    [rate.date, rate.rate_type, rate.buy, rate.sell, rate.source, rate.fetched_at],
  );
}

export * from "./schema";
