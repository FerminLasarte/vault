import {
  daysInMonth,
  monthCurves,
  typicalBetween,
  typicalMonthKeys,
  typicalTotal,
  type MonthCurves,
} from "@/lib/ai/typicalMonth";
import { isFrom } from "@/lib/ai/merchantHistory";
import { roundToCents } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import type { BudgetWithCategory, Transaction } from "@/db/schema";

// Where the month is heading: what has gone out so far, plus what usually goes
// out from tomorrow to the end of the month. "If the rest of the month goes as
// usual", not "at this pace": a rent paid on the 1st is not multiplied by the
// days left, so the start of a month never reads as a disaster.

// How far the projected month has to sit from a usual one to be worth saying.
// Spending moves a few points every month.
export const MIN_PACE_CHANGE = 0.15;

export interface Pace {
  // Today's day of the month, and the month's last.
  day: number;
  lastDay: number;
  // Gone out this month up to today.
  spent: number;
  // What usually goes out from tomorrow to the end of the month.
  rest: number;
  // spent + rest.
  projected: number;
  // A usual month, whole.
  typical: number;
  // How many complete months "usual" was read from.
  months: number;
  // What is still to come, day by day: the usual months without what this
  // month already settled.
  curves: MonthCurves;
}

// The pace of one group of movements — a category in a currency, or every
// expense in one — given the complete months "usual" is read from, and the
// merchants whose monthly charge this month already settled (see
// settledThisMonth), which are not still to come. Null when nothing usually
// goes out: with no usual month there is no pace to speak of.
export function monthPace(
  movements: readonly Transaction[],
  monthKeys: readonly string[],
  today: string,
  settled: ReadonlySet<string> = new Set(),
): Pace | null {
  const monthStart = `${today.slice(0, 7)}-01`;
  const typical = typicalTotal(monthCurves(movements, monthKeys));
  if (typical <= 0) return null;
  const curves = monthCurves(
    movements.filter((movement) => !isFrom(movement, settled)),
    monthKeys,
  );

  const day = Number(today.slice(8, 10));
  const spent = roundToCents(
    movements
      .filter((movement) => movement.date >= monthStart && movement.date <= today)
      .reduce((total, movement) => total + movement.amount, 0),
  );
  const rest = typicalBetween(curves, day, 31);

  return {
    day,
    lastDay: daysInMonth(today.slice(0, 7)),
    spent,
    rest,
    projected: roundToCents(spent + rest),
    typical,
    months: curves.length,
    curves,
  };
}

// How far the projection sits from a usual month (0.35 for 35% more), when it
// is far enough to say; null otherwise.
export function paceChange(pace: Pace): number | null {
  // Compared in cents, so 15% is not lost to floating point.
  const gap = Math.abs(pace.projected - pace.typical);
  if (gap < roundToCents(pace.typical * MIN_PACE_CHANGE)) return null;
  return pace.projected / pace.typical - 1;
}

// The day the projection goes past `cap`, if it does this month and has not
// already: the first day by whose end what was spent plus what usually follows
// is over it.
export function crossingDay(pace: Pace, cap: number): number | null {
  if (pace.spent > cap) return null;
  for (let day = pace.day + 1; day <= pace.lastDay; day++) {
    if (pace.spent + typicalBetween(pace.curves, pace.day, day) > cap) return day;
  }
  return null;
}

// Why: what was spent so far and what usually follows, in the words the screen
// uses for both.
export function paceReason(pace: Pace, currency: string, subject: string): string {
  const spent = formatCurrency(pace.spent, currency);
  const rest = formatCurrency(pace.rest, currency);
  const typical = formatCurrency(pace.typical, currency);
  const after =
    pace.day >= pace.lastDay
      ? ""
      : ` Del ${pace.day + 1} a fin de mes solés gastar ${rest}.`;
  return `Hasta hoy gastaste ${spent}${subject}.${after} Un mes habitual, ${typical} (la mediana de los últimos ${pace.months}).`;
}

function expensesSince(
  transactions: readonly Transaction[],
  since: string,
  currency: string,
): Transaction[] {
  return transactions.filter(
    (transaction) =>
      transaction.type === "expense" &&
      transaction.currency === currency &&
      transaction.date >= since,
  );
}

// Every expense in one currency: what the month card says.
export function spendingPace(
  transactions: readonly Transaction[],
  currency: string,
  today: string,
  settled: ReadonlySet<string> = new Set(),
): Pace | null {
  const keys = typicalMonthKeys(transactions, today);
  if (keys === null) return null;
  return monthPace(
    expensesSince(transactions, `${keys[0]}-01`, currency),
    keys,
    today,
    settled,
  );
}

export interface BudgetPace {
  // `pace:<budget id>:<YYYY-MM>`: dismissed for this month only.
  id: string;
  budget: BudgetWithCategory;
  pace: Pace;
  // The day the budget would be passed, or null if it would not this month.
  crossingDay: number | null;
}

// The pace of every monthly budget, by budget id. An annual cap against a month
// has no pace to read.
export function budgetPaces(
  budgets: readonly BudgetWithCategory[],
  transactions: readonly Transaction[],
  today: string,
  settled: ReadonlySet<string> = new Set(),
): Map<number, BudgetPace> {
  const paces = new Map<number, BudgetPace>();
  const monthly = budgets.filter((budget) => budget.period === "monthly");
  if (monthly.length === 0) return paces;
  const keys = typicalMonthKeys(transactions, today);
  if (keys === null) return paces;

  // One pass to sort the recent expenses into the budgets' groups.
  const groupKey = (categoryId: number | null, currency: string) =>
    `${currency}:${categoryId}`;
  const groups = new Map(
    monthly.map((budget) => [
      groupKey(budget.category_id, budget.currency),
      [] as Transaction[],
    ]),
  );
  const since = `${keys[0]}-01`;
  for (const transaction of transactions) {
    if (transaction.type !== "expense" || transaction.date < since) continue;
    groups
      .get(groupKey(transaction.category_id, transaction.currency))
      ?.push(transaction);
  }

  for (const budget of monthly) {
    const movements = groups.get(groupKey(budget.category_id, budget.currency)) ?? [];
    const pace = monthPace(movements, keys, today, settled);
    if (pace === null) continue;
    paces.set(budget.id, {
      id: `pace:${budget.id}:${today.slice(0, 7)}`,
      budget,
      pace,
      crossingDay: crossingDay(pace, budget.amount),
    });
  }
  return paces;
}
