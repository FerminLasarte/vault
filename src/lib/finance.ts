import type {
  BudgetWithCategory,
  CategoryType,
  PaymentMethod,
  Transaction,
  TransactionType,
  TransactionWithCategory,
} from "@/db/schema";
import { normalizeForSearch, splitTagNames } from "@/lib/text";
import { toIsoDate, parseIsoDate } from "@/lib/format";

export interface FinancialSummary {
  balance: number;
  income: number;
  expenses: number;
}

// Rounds a total to the cent.
//
// Amounts are stored as REAL, so adding them up leaves floating-point residue:
// 0.1 + 0.2 is 0.30000000000000004. Formatting hides it, but a comparison at
// the boundary does not — a budget spent exactly to its cap read as exceeded.
// Applied wherever amounts are added up, rather than migrating the columns to
// integer cents, which would mean rebuilding tables other tables point at.
// The `+ 0` turns a -0 into 0, so a balance that nets out is not "-0".
export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

export function sumByType<T extends Transaction>(
  transactions: T[],
  type: TransactionType,
): number {
  return roundToCents(
    transactions
      .filter((transaction) => transaction.type === type)
      .reduce((total, transaction) => total + transaction.amount, 0),
  );
}

export function calculateSummary<T extends Transaction>(
  transactions: T[],
): FinancialSummary {
  const income = sumByType(transactions, "income");
  const expenses = sumByType(transactions, "expense");
  return { balance: roundToCents(income - expenses), income, expenses };
}

// "YYYY-MM" key for the given date (local time). Transaction dates are
// stored as "YYYY-MM-DD" strings, so a prefix match against this key is
// enough to tell whether a transaction falls in that month.
export function currentMonthKey(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function filterByMonth<T extends Transaction>(
  transactions: T[],
  monthKey: string = currentMonthKey(),
): T[] {
  return transactions.filter((transaction) => transaction.date.startsWith(monthKey));
}

export function filterByCurrency<T extends Transaction>(
  transactions: T[],
  currency: string,
): T[] {
  return transactions.filter((transaction) => transaction.currency === currency);
}

// Inclusive on both ends; a null bound means "unbounded on that side".
// Dates are "YYYY-MM-DD" strings, so lexicographic comparison is chronological.
export function filterByDateRange<T extends Transaction>(
  transactions: T[],
  from: string | null,
  to: string | null,
): T[] {
  return transactions.filter(
    (transaction) =>
      (from === null || transaction.date >= from) &&
      (to === null || transaction.date <= to),
  );
}

export function filterByCategory<T extends Transaction>(
  transactions: T[],
  categoryId: number,
): T[] {
  return transactions.filter((transaction) => transaction.category_id === categoryId);
}

export function filterByAmountRange<T extends Transaction>(
  transactions: T[],
  min: number | null,
  max: number | null,
): T[] {
  return transactions.filter(
    (transaction) =>
      (min === null || transaction.amount >= min) &&
      (max === null || transaction.amount <= max),
  );
}

// Matches against the description. An empty or whitespace-only query means
// "no constraint" rather than "match nothing".
export function filterBySearch<T extends Transaction>(
  transactions: T[],
  query: string,
): T[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === "") return transactions;

  return transactions.filter((transaction) =>
    normalizeForSearch(transaction.description).includes(needle),
  );
}

// Kept out of `applyTransactionFilters` because tags live on the joined
// listing type rather than on a bare transaction row, and widening that
// function's constraint would force every caller to carry the join.
export function filterByTag<T extends { tag_names: string | null }>(
  transactions: T[],
  tagName: string,
): T[] {
  const wanted = normalizeForSearch(tagName);
  if (wanted === "") return transactions;

  return transactions.filter((transaction) =>
    splitTagNames(transaction.tag_names).some(
      (name) => normalizeForSearch(name) === wanted,
    ),
  );
}

export interface TransactionFilters {
  currency?: string | null;
  search?: string | null;
  categoryId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
}

// Applies every provided filter in sequence. Omitted or null fields are
// treated as "no constraint", so the same function backs both the statistics
// filter bar and the transactions table's advanced panel.
export function applyTransactionFilters<T extends Transaction>(
  transactions: T[],
  filters: TransactionFilters,
): T[] {
  let result = transactions;

  if (filters.currency != null) {
    result = filterByCurrency(result, filters.currency);
  }
  if (filters.search != null) {
    result = filterBySearch(result, filters.search);
  }
  if (filters.categoryId != null) {
    result = filterByCategory(result, filters.categoryId);
  }
  if (filters.dateFrom != null || filters.dateTo != null) {
    result = filterByDateRange(result, filters.dateFrom ?? null, filters.dateTo ?? null);
  }
  if (filters.minAmount != null || filters.maxAmount != null) {
    result = filterByAmountRange(
      result,
      filters.minAmount ?? null,
      filters.maxAmount ?? null,
    );
  }

  return result;
}

export interface CategoryBreakdownEntry {
  categoryId: number | null;
  name: string;
  color: string;
  total: number;
}

const UNCATEGORIZED_COLOR = "#94a3b8";
const UNCATEGORIZED_LABEL = "Sin categoría";

// Sums the transactions of one kind per category, using each category's own
// stored color so the chart legend stays consistent with the rest of the app.
//
// Takes the kind rather than assuming expenses: the monthly close reports both
// sides of the month, and a second copy of this differing by one comparison
// would be two places to fix the next time "what counts" changes.
export function groupByCategory(
  transactions: TransactionWithCategory[],
  type: CategoryType,
): CategoryBreakdownEntry[] {
  const totals = new Map<string, CategoryBreakdownEntry>();

  for (const transaction of transactions) {
    if (transaction.type !== type) continue;

    const key =
      transaction.category_id != null ? String(transaction.category_id) : "none";
    const existing = totals.get(key);
    if (existing) {
      existing.total += transaction.amount;
      continue;
    }

    totals.set(key, {
      categoryId: transaction.category_id,
      name: transaction.category_name ?? UNCATEGORIZED_LABEL,
      color: transaction.category_color ?? UNCATEGORIZED_COLOR,
      total: transaction.amount,
    });
  }

  return Array.from(totals.values(), (entry) => ({
    ...entry,
    total: roundToCents(entry.total),
  })).sort((a, b) => b.total - a.total);
}

// Ascending "YYYY-MM" keys for the `count` months up to and including
// `referenceMonthKey`.
export function getRecentMonthKeys(
  count: number,
  referenceMonthKey: string = currentMonthKey(),
): string[] {
  const [year, month] = referenceMonthKey.split("-").map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(currentMonthKey(new Date(year, month - 1 - i, 1)));
  }
  return keys;
}

// Ascending "YYYY-MM" keys for the `count` months *after* `referenceMonthKey`.
//
// The mirror of `getRecentMonthKeys`. The reference month itself is left out on
// purpose: it is already half spent and the screen reports it separately, so
// including it would mix "what is left of this month" into a row of whole
// months ahead.
export function getNextMonthKeys(
  count: number,
  referenceMonthKey: string = currentMonthKey(),
): string[] {
  const keys: string[] = [];
  const [year, month] = referenceMonthKey.split("-").map(Number);
  for (let i = 1; i <= count; i++) {
    keys.push(currentMonthKey(new Date(year, month - 1 + i, 1)));
  }
  return keys;
}

// Ascending month keys from `fromMonthKey` to `toMonthKey` inclusive, capped
// at `maxMonths` (keeping the most recent ones) so an extreme range can never
// produce an unreadable chart.
export function getMonthKeysBetween(
  fromMonthKey: string,
  toMonthKey: string,
  maxMonths = 12,
): string[] {
  const [fromYear, fromMonth] = fromMonthKey.split("-").map(Number);
  const [toYear, toMonth] = toMonthKey.split("-").map(Number);

  const span = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  if (span < 0) return [];

  const keys: string[] = [];
  for (let i = 0; i <= span; i++) {
    keys.push(currentMonthKey(new Date(fromYear, fromMonth - 1 + i, 1)));
  }
  return keys.slice(-maxMonths);
}

export interface MonthlyTrendEntry {
  monthKey: string;
  income: number;
  expenses: number;
}

export function buildMonthlyTrend(
  transactions: Transaction[],
  monthKeys: string[],
): MonthlyTrendEntry[] {
  return monthKeys.map((monthKey) => {
    const { income, expenses } = calculateSummary(filterByMonth(transactions, monthKey));
    return { monthKey, income, expenses };
  });
}

// Current balance of every account, keyed by account id: its opening balance
// plus each movement that touched it. Built in a single pass over the
// transactions so the cost stays linear regardless of how many accounts exist.
export function calculateAccountBalances(
  accounts: PaymentMethod[],
  transactions: Transaction[],
): Map<number, number> {
  const balances = new Map(
    accounts.map((account) => [account.id, account.initial_balance]),
  );

  // A movement can point at an account that no longer exists: it stays in the
  // history, but must not conjure a balance for a deleted account.
  const applyDelta = (accountId: number | null, delta: number) => {
    if (accountId === null) return;
    const current = balances.get(accountId);
    if (current === undefined) return;
    balances.set(accountId, current + delta);
  };

  for (const transaction of transactions) {
    if (transaction.type === "income") {
      applyDelta(transaction.payment_method_id, transaction.amount);
    } else if (transaction.type === "expense") {
      applyDelta(transaction.payment_method_id, -transaction.amount);
    } else {
      // A transfer leaves one account and lands in another. The two legs are
      // recorded separately, so a cross-currency transfer moves the real figure
      // on each side without needing an exchange rate.
      applyDelta(transaction.payment_method_id, -transaction.amount);
      applyDelta(
        transaction.destination_payment_method_id,
        transaction.destination_amount ?? transaction.amount,
      );
    }
  }

  for (const [accountId, balance] of balances) {
    balances.set(accountId, roundToCents(balance));
  }
  return balances;
}

// Totals the account balances per currency, so the Accounts view can show what
// the user holds in each currency without mixing units.
export function totalBalanceByCurrency(
  accounts: PaymentMethod[],
  balances: Map<number, number>,
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    totals.set(
      account.currency,
      roundToCents((totals.get(account.currency) ?? 0) + balance),
    );
  }

  return totals;
}

// Converts between the two supported currencies. `rate` is how many ARS one
// USD is worth — the MEP sell figure, i.e. what buying a dollar costs. The
// same number is used in both directions so a round trip returns the original
// amount instead of quietly losing the spread.
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rate: number,
): number | null {
  if (from === to) return amount;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (from === "ARS" && to === "USD") return amount / rate;
  if (from === "USD" && to === "ARS") return amount * rate;
  return null;
}

// Collapses per-currency totals into a single figure. Returns null when any
// currency cannot be converted, rather than skipping it and reporting a net
// worth that is quietly too low — a wrong number is worse than no number.
export function consolidateByCurrency(
  totals: Map<string, number>,
  targetCurrency: string,
  rate: number,
): number | null {
  let consolidated = 0;

  for (const [currency, amount] of totals) {
    const converted = convertAmount(amount, currency, targetCurrency, rate);
    if (converted === null) return null;
    consolidated += converted;
  }

  return consolidated;
}

export interface BudgetProgress {
  budget: BudgetWithCategory;
  spent: number;
  remaining: number;
  // Share of the cap already used. Can exceed 1; the UI clamps the bar, but the
  // number itself must stay truthful so "180%" is reportable.
  ratio: number;
  isExceeded: boolean;
}

// The key a budget's period compares against: "YYYY-MM" for a monthly cap,
// "YYYY" for an annual one. Transaction dates are "YYYY-MM-DD" strings, so a
// prefix match answers "does this fall inside the current period?".
export function budgetPeriodKey(
  period: BudgetWithCategory["period"],
  reference: Date = new Date(),
): string {
  const year = String(reference.getFullYear());
  return period === "annual" ? year : currentMonthKey(reference);
}

// How much of each budget has been used in the period that contains
// `reference`. Only expenses count: an income filed under the same category
// would otherwise refund the budget, which is not what a spending cap means.
export function calculateBudgetProgress(
  budgets: BudgetWithCategory[],
  transactions: Transaction[],
  reference: Date = new Date(),
): BudgetProgress[] {
  return budgets.map((budget) => {
    const key = budgetPeriodKey(budget.period, reference);

    const spent = roundToCents(
      transactions
        .filter(
          (transaction) =>
            transaction.type === "expense" &&
            transaction.category_id === budget.category_id &&
            transaction.currency === budget.currency &&
            transaction.date.startsWith(key),
        )
        .reduce((total, transaction) => total + transaction.amount, 0),
    );

    // A zero or negative cap has no meaningful ratio; treat it as fully used
    // rather than dividing by zero and producing Infinity in the UI.
    const ratio = budget.amount > 0 ? spent / budget.amount : 1;

    return {
      budget,
      spent,
      remaining: roundToCents(budget.amount - spent),
      ratio,
      isExceeded: spent > budget.amount,
    };
  });
}

export function exceededBudgets(progress: BudgetProgress[]): BudgetProgress[] {
  return progress.filter((entry) => entry.isExceeded);
}

// A lookup from date to the rate in force that day, built once and reused.
export type RateLookup = (date: string) => number | null;

// Builds the lookup from the cached series.
//
// Markets do not quote on weekends or holidays, so a movement dated on one of
// those days has no rate of its own. The most recent earlier quote is used —
// the price that was actually in force. Movements older than the whole series
// fall back to its first quote, which is the closest thing to the truth
// available and beats refusing to value them at all.
export function buildRateLookup(rates: { date: string; sell: number }[]): RateLookup {
  if (rates.length === 0) return () => null;

  // Ascending, so a scan backwards finds the latest quote at or before a date.
  const sorted = [...rates].sort((a, b) => a.date.localeCompare(b.date));
  const cache = new Map<string, number>();

  return (date: string) => {
    const cached = cache.get(date);
    if (cached !== undefined) return cached;

    let candidate = sorted[0].sell;
    for (const rate of sorted) {
      if (rate.date > date) break;
      candidate = rate.sell;
    }

    cache.set(date, candidate);
    return candidate;
  };
}

// Converts a movement using the rate of its own date rather than today's.
//
// This is the difference between "what did this cost me at the time" and "what
// would it cost me now": restating a 2023 purchase at today's dollar makes the
// past look far cheaper than it was.
export function convertAtDate(
  amount: number,
  from: string,
  to: string,
  date: string,
  rateAt: RateLookup,
): number | null {
  if (from === to) return amount;

  const rate = rateAt(date);
  if (rate === null) return null;

  return convertAmount(amount, from, to, rate);
}

// Income, expenses and balance expressed in one currency, with every movement
// valued at its own date. Returns null when no rate history exists at all.
export function summaryInCurrency<T extends Transaction>(
  transactions: T[],
  targetCurrency: string,
  rateAt: RateLookup,
): FinancialSummary | null {
  let income = 0;
  let expenses = 0;

  for (const transaction of transactions) {
    if (transaction.type === "transfer") continue;

    const converted = convertAtDate(
      transaction.amount,
      transaction.currency,
      targetCurrency,
      transaction.date,
      rateAt,
    );
    if (converted === null) return null;

    if (transaction.type === "income") income += converted;
    else expenses += converted;
  }

  return { balance: income - expenses, income, expenses };
}

export interface DateRange {
  from: string | null;
  to: string | null;
}

// Both ends open, i.e. no date filter at all. A shared constant rather than a
// literal per call site, so an unfiltered range is referentially stable and
// does not retrigger the memos that depend on it.
export const EMPTY_DATE_RANGE: DateRange = { from: null, to: null };

// How many months of history the analysis opens on.
//
// A whole year, so any month can be compared against the same month a year
// earlier, and so the window never looks thin in January the way a
// year-to-date one does.
export const RECENT_MONTHS = 12;

// The last `months` months up to and including today, as an inclusive range
// starting on the first day of the earliest one.
//
// This exists because income and expenses are flows: a flow with no period is
// not a large number, it is a meaningless one. A balance can be accumulated
// since the beginning of time and still mean something — "what I have" — but
// "what I earned", summed over every year at once, answers no question anyone
// asks. So the analysis always has a period, and this is the one it starts on.
export function recentMonthsRange(
  months: number = RECENT_MONTHS,
  reference: Date = new Date(),
): DateRange {
  const first = new Date(reference.getFullYear(), reference.getMonth() - (months - 1), 1);

  return { from: toIsoDate(first), to: toIsoDate(reference) };
}

// The period the analysis shows. "Últimos 12 meses" is held as that rather
// than as the dates it stood for when picked, so it keeps running up to today
// with the app left open overnight.
export type StatisticsPeriod = { kind: "recent" } | { kind: "range"; range: DateRange };

export function periodRange(period: StatisticsPeriod, today: string): DateRange {
  return period.kind === "recent"
    ? recentMonthsRange(RECENT_MONTHS, parseIsoDate(today))
    : period.range;
}

// The full calendar year as a date range.
export function yearRange(year: number): DateRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

// Which year a range represents, or null when it is not exactly one whole year.
//
// The year selector reads this rather than keeping its own state: with two
// sources of truth, picking a custom range would leave the year dropdown
// claiming something the charts no longer show.
export function yearFromRange(range: DateRange): number | null {
  if (range.from === null || range.to === null) return null;

  const year = Number(range.from.slice(0, 4));
  if (!Number.isFinite(year)) return null;

  const full = yearRange(year);
  return range.from === full.from && range.to === full.to ? year : null;
}

// Years that actually have movements, most recent first, so the selector never
// offers a year that would come back empty.
export function availableYears(transactions: Transaction[]): number[] {
  const years = new Set<number>();

  for (const transaction of transactions) {
    const year = Number(transaction.date.slice(0, 4));
    if (Number.isFinite(year)) years.add(year);
  }

  return Array.from(years).sort((a, b) => b - a);
}
