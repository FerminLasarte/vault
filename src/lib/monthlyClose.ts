import type { Transaction, TransactionWithCategory } from "@/db/schema";
import {
  calculateSummary,
  currentMonthKey,
  filterByCurrency,
  filterByMonth,
  getRecentMonthKeys,
  groupByCategory,
} from "@/lib/finance";
import type { CategoryBreakdownEntry, FinancialSummary } from "@/lib/finance";
import { CURRENCY_CODES } from "@/lib/currency";
import { formatMonthLabel } from "@/lib/format";

// How a month ended, against the two periods worth comparing it to.
//
// Both comparisons answer different questions and neither replaces the other:
// last month says whether something changed recently, the same month a year ago
// says whether this is simply what August looks like. A December that is 40%
// above November is not news; a December 40% above last December is.
//
// Everything here is derived from the same transaction list the rest of the app
// reads, through the same helpers, so a figure in the close can never disagree
// with the same figure on screen.

// One category, in this month and in the one being compared against.
export interface CategoryChange {
  categoryId: number | null;
  name: string;
  current: number;
  previous: number;
  // Signed, in currency. The figure that answers "how much more".
  delta: number;
  // Null when the other period was zero: every rise from nothing is an infinite
  // one, which is true and useless. Same rule `monthOverview` applies.
  changeRatio: number | null;
  // What this category is worth inside the month's own total, which is the
  // "percentage of what I spent" half of the question.
  share: number;
}

export interface MonthComparison {
  // Which month this compares against, so the screen can name it rather than
  // saying "el mes pasado" and leaving the reader to work it out.
  monthKey: string;
  summary: FinancialSummary;
  expenses: CategoryChange[];
  income: CategoryChange[];
}

// One month, in one currency. Everything below the month itself is per
// currency, because pesos and dollars cannot be added into a figure that means
// anything — the rule the whole app is built on.
export interface CurrencyClose {
  currency: string;
  transactionCount: number;
  summary: FinancialSummary;
  expensesByCategory: CategoryBreakdownEntry[];
  incomeByCategory: CategoryBreakdownEntry[];
  // Null when that period has no movements on record at all. A month with
  // nothing to compare against says so by omission rather than by showing a
  // column of dashes.
  previousMonth: MonthComparison | null;
  lastYear: MonthComparison | null;
}

export interface MonthlyClose {
  monthKey: string;
  // Across every currency: what the month held in total, however it was
  // denominated.
  transactionCount: number;
  // One block per currency that actually moved that month, in the app's own
  // currency order so the same one always leads.
  //
  // Not adding them together and not splitting them into separate documents:
  // the close is of a month, and a month is one thing however many currencies
  // passed through it. Keeping them apart is about never summing them, which
  // two blocks on one page respect just as well as two pages would — and a
  // second document is one the reader has to remember to go and fetch.
  currencies: CurrencyClose[];
}

function ratio(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

// Lines up two breakdowns by category.
//
// The union, not the intersection: a category that appears in one month and not
// the other is usually the most interesting line on the page — "this month
// there was Salud and last month there was none" is exactly what a comparison
// is for, and dropping it would let the table hide the change it exists to
// show. The missing side reads as zero, which is what it was.
//
// Ordered by the size of the move, largest first, so the lines that explain the
// month come before the ones that merely happened.
export function compareByCategory(
  current: CategoryBreakdownEntry[],
  previous: CategoryBreakdownEntry[],
  currentTotal: number,
): CategoryChange[] {
  const keyOf = (entry: CategoryBreakdownEntry) =>
    entry.categoryId === null ? "none" : String(entry.categoryId);

  const previousByKey = new Map(previous.map((entry) => [keyOf(entry), entry]));
  const changes: CategoryChange[] = [];

  for (const entry of current) {
    const before = previousByKey.get(keyOf(entry))?.total ?? 0;
    changes.push({
      categoryId: entry.categoryId,
      name: entry.name,
      current: entry.total,
      previous: before,
      delta: entry.total - before,
      changeRatio: ratio(entry.total, before),
      share: currentTotal > 0 ? entry.total / currentTotal : 0,
    });
    previousByKey.delete(keyOf(entry));
  }

  // Whatever is left existed only in the period being compared against: it
  // stopped, and stopping is a change.
  for (const entry of previousByKey.values()) {
    changes.push({
      categoryId: entry.categoryId,
      name: entry.name,
      current: 0,
      previous: entry.total,
      delta: -entry.total,
      changeRatio: -1,
      share: 0,
    });
  }

  return changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// The month's own figures, in one currency. Kept apart from the comparison so
// the shape is computed once and reused for every period.
function breakdownFor(
  transactions: TransactionWithCategory[],
  monthKey: string,
): {
  summary: FinancialSummary;
  expenses: CategoryBreakdownEntry[];
  income: CategoryBreakdownEntry[];
  count: number;
  hasIncomeOrExpense: boolean;
} {
  const rows = filterByMonth(transactions, monthKey);

  return {
    summary: calculateSummary(rows),
    expenses: groupByCategory(rows, "expense"),
    income: groupByCategory(rows, "income"),
    count: rows.length,
    hasIncomeOrExpense: rows.some(isIncomeOrExpense),
  };
}

// What makes a month worth a close. A transfer only moves money between two of
// the user's own accounts — nothing is earned or spent — so a month holding
// nothing but transfers has no income, no expenses and nothing to compare. Every
// question of "does this month have a close" goes through here, so the list,
// the document and the notification cannot disagree about it.
function isIncomeOrExpense(transaction: Pick<Transaction, "type">): boolean {
  return transaction.type === "income" || transaction.type === "expense";
}

function closeForCurrency(
  transactions: TransactionWithCategory[],
  monthKey: string,
  currency: string,
): CurrencyClose | null {
  // Filtered once, up front: every window below reads from the same list, and
  // filtering per period would walk the whole history three times.
  const inCurrency = filterByCurrency(transactions, currency);
  const month = breakdownFor(inCurrency, monthKey);

  // A currency that did not move this month gets no block at all, rather than a
  // page of zeroes explaining that nothing happened in it.
  if (!month.hasIncomeOrExpense) return null;

  // `getRecentMonthKeys` returns ascending keys ending at the reference, so the
  // first of two is last month and the first of thirteen is this month a year
  // ago. No date arithmetic of its own, and the month-length and year-boundary
  // cases are already covered by that helper's tests.
  const [previousKey] = getRecentMonthKeys(2, monthKey);
  const [lastYearKey] = getRecentMonthKeys(13, monthKey);

  const comparisonWith = (againstKey: string): MonthComparison | null => {
    const against = breakdownFor(inCurrency, againstKey);
    // Nothing on record for that month: there is no comparison to draw, and
    // one against zero would read as "everything is new".
    if (!against.hasIncomeOrExpense) return null;

    return {
      monthKey: againstKey,
      summary: against.summary,
      expenses: compareByCategory(
        month.expenses,
        against.expenses,
        month.summary.expenses,
      ),
      income: compareByCategory(month.income, against.income, month.summary.income),
    };
  };

  return {
    currency,
    transactionCount: month.count,
    summary: month.summary,
    expensesByCategory: month.expenses,
    incomeByCategory: month.income,
    previousMonth: comparisonWith(previousKey),
    lastYear: comparisonWith(lastYearKey),
  };
}

export function buildMonthlyClose(
  transactions: TransactionWithCategory[],
  monthKey: string,
): MonthlyClose {
  const currencies = CURRENCY_CODES.map((currency) =>
    closeForCurrency(transactions, monthKey, currency),
  ).filter((entry): entry is CurrencyClose => entry !== null);

  return {
    monthKey,
    transactionCount: currencies.reduce(
      (total, entry) => total + entry.transactionCount,
      0,
    ),
    currencies,
  };
}

// The most recent month that has finished, whatever the calendar says about
// today. A close is only ever drawn for a month that cannot change any more.
// The close's title for the print dialog, which suggests it as the PDF's file
// name: "Vault - Cierre de agosto de 2026". The month is lowercase because it
// reads as part of a sentence there, not as a heading.
export function closeDocumentTitle(monthKey: string): string {
  return `Vault - Cierre de ${formatMonthLabel(monthKey).toLowerCase()}`;
}

export function lastClosedMonthKey(today: Date = new Date()): string {
  return getRecentMonthKeys(2, currentMonthKey(today))[0];
}

// Every month that has finished and has something in it, newest first.
//
// The month being lived in is left out for the same reason `lastClosedMonthKey`
// stops short of it: a close that changes under the reader is not a close. So
// is any month with nothing in it — there is no report to offer.
export function closedMonthKeys(
  transactions: Transaction[],
  today: Date = new Date(),
): string[] {
  const current = currentMonthKey(today);
  const months = new Set<string>();

  for (const transaction of transactions) {
    const monthKey = transaction.date.slice(0, 7);
    if (monthKey < current && isIncomeOrExpense(transaction)) months.add(monthKey);
  }

  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

// Whether a month is worth announcing: it has to have finished, and it has to
// have something in it. Announcing an empty month would be telling the user
// their report on nothing is ready.
export function hasClose(transactions: Transaction[], monthKey: string): boolean {
  return filterByMonth(transactions, monthKey).some(isIncomeOrExpense);
}
