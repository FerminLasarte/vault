import type { BudgetWithCategory, Transaction } from "@/db/schema";
import {
  calculateBudgetProgress,
  currentMonthKey,
  filterByCurrency,
  filterByMonth,
  getRecentMonthKeys,
  sumByType,
} from "@/lib/finance";
import type { SavingsProgress } from "@/lib/savings";

// The month at a glance, for the three cards on the overview's general tab.
//
// Everything here is deliberately about the month the user is living in, not
// about whatever slice the filters happen to select: "gasté demasiado este mes"
// is a question the screen should answer without first being configured. The
// one filter that does apply is the currency, because pesos and dollars cannot
// be added together into a number that means anything.

export interface MonthExpenses {
  total: number;
  previousTotal: number;
  // Carried through so the card can name the month it is comparing against
  // rather than saying "el mes pasado" and leaving the user to work it out.
  previousMonthKey: string;
  // How much the total moved against last month, as a ratio (0.12 is 12% more).
  // Null when last month had no expenses at all: every increase from zero is an
  // infinite one, which is true and useless.
  changeRatio: number | null;
}

export interface BudgetOverview {
  // Sum of the monthly caps in this currency, and what has been spent against
  // them so far this month.
  cap: number;
  spent: number;
  // Can be negative, which is the whole point: overspending has to be visible.
  remaining: number;
  ratio: number;
  // How many budgets fed these totals, so the card can say what it is summing.
  count: number;
}

export interface SavingsOverview {
  saved: number;
  target: number;
  remaining: number;
  ratio: number;
  count: number;
}

export interface MonthOverview {
  monthKey: string;
  expenses: MonthExpenses;
  // Null rather than zeroes when the user has nothing set up yet: an empty
  // state that invites them to create one reads better than "$0 de $0".
  budget: BudgetOverview | null;
  savings: SavingsOverview | null;
}

function monthExpenses(
  transactions: Transaction[],
  currency: string,
  monthKey: string,
): MonthExpenses {
  const inCurrency = filterByCurrency(transactions, currency);
  const [previousKey] = getRecentMonthKeys(2, monthKey);

  const total = sumByType(filterByMonth(inCurrency, monthKey), "expense");
  const previousTotal = sumByType(filterByMonth(inCurrency, previousKey), "expense");

  return {
    total,
    previousTotal,
    previousMonthKey: previousKey,
    changeRatio: previousTotal > 0 ? (total - previousTotal) / previousTotal : null,
  };
}

// Annual budgets are left out on purpose: this card answers "how is this month
// going", and a yearly cap compared against a single month would read as
// comfortably under budget every month until it suddenly is not.
function budgetOverview(
  budgets: BudgetWithCategory[],
  transactions: Transaction[],
  currency: string,
  reference: Date,
): BudgetOverview | null {
  const monthly = budgets.filter(
    (budget) => budget.period === "monthly" && budget.currency === currency,
  );
  if (monthly.length === 0) return null;

  // Reuses the per-budget calculation rather than re-deriving "what counts as
  // spent", which has rules of its own (expenses only, matching currency).
  const progress = calculateBudgetProgress(monthly, transactions, reference);

  const cap = progress.reduce((total, entry) => total + entry.budget.amount, 0);
  const spent = progress.reduce((total, entry) => total + entry.spent, 0);

  return {
    cap,
    spent,
    remaining: cap - spent,
    ratio: cap > 0 ? spent / cap : 1,
    count: monthly.length,
  };
}

// Reads whatever the user set up under Ahorros, so the card and that screen can
// never disagree: same progress figures, only added up.
function savingsOverview(
  progress: SavingsProgress[],
  currency: string,
): SavingsOverview | null {
  const inCurrency = progress.filter((entry) => entry.goal.currency === currency);
  if (inCurrency.length === 0) return null;

  const saved = inCurrency.reduce((total, entry) => total + entry.current, 0);
  const target = inCurrency.reduce((total, entry) => total + entry.goal.target_amount, 0);

  return {
    saved,
    target,
    // Never below zero: having saved past the target leaves nothing outstanding,
    // whereas a negative "remaining" would read as a debt.
    remaining: Math.max(target - saved, 0),
    ratio: target > 0 ? saved / target : 1,
    count: inCurrency.length,
  };
}

export function buildMonthOverview(
  sources: {
    transactions: Transaction[];
    budgets: BudgetWithCategory[];
    savings: SavingsProgress[];
  },
  currency: string,
  reference: Date = new Date(),
): MonthOverview {
  const monthKey = currentMonthKey(reference);

  return {
    monthKey,
    expenses: monthExpenses(sources.transactions, currency, monthKey),
    budget: budgetOverview(sources.budgets, sources.transactions, currency, reference),
    savings: savingsOverview(sources.savings, currency),
  };
}
