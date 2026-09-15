import {
  applyTransactionFilters,
  buildMonthlyTrend,
  calculateBudgetProgress,
  calculateSummary,
  getMonthKeysBetween,
  groupByCategory,
} from "@/lib/finance";
import { parseIsoDate } from "@/lib/format";
import type {
  BudgetProgress,
  CategoryBreakdownEntry,
  DateRange,
  FinancialSummary,
  MonthlyTrendEntry,
} from "@/lib/finance";
import type { BudgetWithCategory, Category, TransactionWithCategory } from "@/db/schema";

export interface ReportFilters {
  currency: string;
  categoryId: number | null;
  dateRange: DateRange;
}

export interface ReportSources {
  transactions: TransactionWithCategory[];
  categories: Category[];
  budgets: BudgetWithCategory[];
}

export interface Report {
  // Echoed back so the printed page can state what it is a report *of*. A
  // printout that does not say which period and currency it covers is a page
  // of numbers nobody can check later.
  filters: ReportFilters;
  categoryName: string | null;
  transactionCount: number;
  summary: FinancialSummary;
  byCategory: CategoryBreakdownEntry[];
  monthly: MonthlyTrendEntry[];
  budgets: BudgetProgress[];
  generatedAt: string;
}

// The month a report starts and ends in. With an open-ended range the months
// are taken from the data itself, because a report cannot invent a boundary the
// user never chose.
function monthKeysFor(
  transactions: TransactionWithCategory[],
  range: DateRange,
): string[] {
  const dates = transactions.map((transaction) => transaction.date).sort();
  const first = range.from ?? dates[0];
  const last = range.to ?? dates[dates.length - 1];

  if (first === undefined || last === undefined) return [];

  // Every month, uncapped. The cap exists to keep the on-screen chart readable;
  // a printed table has room for them all, and trimming it made the monthly
  // rows stop adding up to the totals printed above them.
  return getMonthKeysBetween(first.slice(0, 7), last.slice(0, 7), Infinity);
}

// Assembles everything the printed report shows, from the same filters the user
// already set on screen. Pure: what the report *says* can be tested without
// rendering anything.
export function buildReport(
  sources: ReportSources,
  filters: ReportFilters,
  generatedAt: Date = new Date(),
): Report {
  const filtered = applyTransactionFilters(sources.transactions, {
    currency: filters.currency,
    categoryId: filters.categoryId,
    dateFrom: filters.dateRange.from,
    dateTo: filters.dateRange.to,
  });

  // Budgets are measured against the period being reported on, not against
  // today: a report of March printed in August must show March's progress.
  const reference = filters.dateRange.to
    ? parseIsoDate(filters.dateRange.to)
    : generatedAt;

  const budgets = calculateBudgetProgress(
    sources.budgets.filter((budget) => budget.currency === filters.currency),
    sources.transactions,
    reference,
  );

  return {
    filters,
    categoryName:
      filters.categoryId === null
        ? null
        : (sources.categories.find((category) => category.id === filters.categoryId)
            ?.name ?? null),
    transactionCount: filtered.length,
    summary: calculateSummary(filtered),
    byCategory: groupByCategory(filtered, "expense"),
    monthly: buildMonthlyTrend(filtered, monthKeysFor(filtered, filters.dateRange)),
    budgets,
    generatedAt: generatedAt.toISOString(),
  };
}
