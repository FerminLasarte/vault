import { mad, median } from "@/lib/ai/stats";
import { monthCurves, monthTotals, typicalMonthKeys } from "@/lib/ai/typicalMonth";
import { roundToCents } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import type { Budget, BudgetPeriod, Category, Transaction } from "@/db/schema";

// What a budget could start at: what the user usually spends in the category,
// read from the last few complete months. Offered when one is being created,
// and proposed for categories with steady spending and no budget yet.

// How far a category's months may typically sit from their median, as a share
// of it, for a budget to be proposed unasked. Spending that comes and goes has
// no cap to suggest; the dialog still offers its median when asked.
export const MAX_BUDGET_SPREAD = 0.5;

export interface CategorySpending {
  // The complete months read, oldest first.
  months: string[];
  // Each month's total, by `<currency>:<category id>`, in the order of `months`.
  totals: Map<string, number[]>;
}

function groupKey(categoryId: number, currency: string): string {
  return `${currency}:${categoryId}`;
}

// Every categorised expense of the recent months, by category and currency, in
// one pass. Null with too few complete months to read.
export function categorySpending(
  transactions: readonly Transaction[],
  today: string,
): CategorySpending | null {
  const months = typicalMonthKeys(transactions, today);
  if (months === null) return null;

  const since = `${months[0]}-01`;
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (transaction.type !== "expense" || transaction.category_id === null) continue;
    if (transaction.date < since) continue;
    const key = groupKey(transaction.category_id, transaction.currency);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [transaction]);
    else group.push(transaction);
  }

  const totals = new Map<string, number[]>();
  for (const [key, movements] of groups) {
    totals.set(key, monthTotals(monthCurves(movements, months)));
  }
  return { months, totals };
}

// A cap a person would write: rounded up to two significant figures, so the
// median 47.320 becomes 48.000 and 85,40 becomes 86.
export function roundBudget(amount: number): number {
  if (amount <= 0) return 0;
  const step = 10 ** (Math.floor(Math.log10(amount)) - 1);
  return roundToCents(Math.ceil(roundToCents(amount / step)) * step);
}

export interface BudgetSuggestion {
  // `budget:<category id>:<currency>`.
  id: string;
  categoryId: number;
  currency: string;
  // The median month, as spent.
  monthly: number;
  // What the field is filled with, for the period asked.
  amount: number;
  reason: string;
}

function suggestion(
  totals: number[],
  months: number,
  category: Pick<Category, "id" | "name">,
  currency: string,
  period: BudgetPeriod,
): BudgetSuggestion | null {
  const monthly = roundToCents(median(totals) ?? 0);
  if (monthly <= 0) return null;
  const annual = period === "annual";
  return {
    id: `budget:${category.id}:${currency}`,
    categoryId: category.id,
    currency,
    monthly,
    amount: roundBudget(annual ? monthly * 12 : monthly),
    reason: `En los últimos ${months} meses gastaste en ${category.name} cerca de ${formatCurrency(monthly, currency)} por mes: la mitad de los meses más, la otra mitad menos.${annual ? " Por 12 y redondeado." : " Redondeado."}`,
  };
}

// What the dialog fills in for a category, currency and period. Null when the
// category had nothing in those months.
export function suggestBudget(
  spending: CategorySpending,
  category: Pick<Category, "id" | "name">,
  currency: string,
  period: BudgetPeriod,
): BudgetSuggestion | null {
  const totals = spending.totals.get(groupKey(category.id, currency));
  if (totals === undefined) return null;
  return suggestion(totals, spending.months.length, category, currency, period);
}

// Categories spent in every month read, about the same each time, and with no
// budget in that currency: monthly budgets to propose, by currency, the biggest
// first.
export function budgetProposals(
  spending: CategorySpending,
  budgets: readonly Pick<Budget, "category_id" | "currency">[],
  categories: readonly Category[],
  isDismissed: (id: string) => boolean,
): BudgetSuggestion[] {
  const budgeted = new Set(
    budgets.map((budget) => groupKey(budget.category_id, budget.currency)),
  );
  const byId = new Map(categories.map((category) => [category.id, category]));
  const proposals: BudgetSuggestion[] = [];

  for (const [key, totals] of spending.totals) {
    if (budgeted.has(key)) continue;
    const [currency, categoryId] = key.split(":");
    const category = byId.get(Number(categoryId));
    if (category === undefined || category.type !== "expense") continue;
    if (totals.some((total) => total <= 0)) continue;

    const typical = median(totals);
    const spread = mad(totals);
    if (typical === null || spread === null || spread / typical > MAX_BUDGET_SPREAD)
      continue;

    const proposal = suggestion(
      totals,
      spending.months.length,
      category,
      currency,
      "monthly",
    );
    if (proposal !== null && !isDismissed(proposal.id)) proposals.push(proposal);
  }

  return proposals.sort(
    (a, b) =>
      a.currency.localeCompare(b.currency) ||
      b.monthly - a.monthly ||
      a.categoryId - b.categoryId,
  );
}
