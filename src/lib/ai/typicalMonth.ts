import { median } from "@/lib/ai/stats";
import { getRecentMonthKeys, roundToCents } from "@/lib/finance";

// What a usual month looks like, day by day: how much had gone out (or come in)
// by the end of each day of each of the last few complete months. Read by the
// pace of the month, the suggested budgets and the end-of-month estimate, so the
// three mean the same thing by "usual".

// How many complete months "usual" is read from. Prices drift every month, so
// a year-old month says little about the next one.
export const TYPICAL_MONTHS = 6;

// Fewer complete months than this is too little to know what a usual one is.
export const MIN_TYPICAL_MONTHS = 3;

interface Dated {
  date: string;
}

interface Amount extends Dated {
  amount: number;
}

// The complete months before today's that "usual" is read from, oldest first:
// up to TYPICAL_MONTHS, and only those the history covers from their first day,
// so a month before the user started recording does not read as a month of
// nothing spent. Null below MIN_TYPICAL_MONTHS.
export function typicalMonthKeys(
  history: Iterable<Dated>,
  today: string,
): string[] | null {
  let earliest: string | null = null;
  for (const { date } of history) {
    if (earliest === null || date < earliest) earliest = date;
  }
  if (earliest === null) return null;

  const first = earliest;
  const keys = getRecentMonthKeys(TYPICAL_MONTHS + 1, today.slice(0, 7))
    .slice(0, -1)
    .filter((key) => `${key}-01` >= first);
  return keys.length < MIN_TYPICAL_MONTHS ? null : keys;
}

export function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

function dayOf(date: string): number {
  return Number(date.slice(8, 10));
}

// One curve per month: what had added up by the end of each day, from day 0
// (nothing yet) to the month's last. Movements outside those months are ignored.
export type MonthCurves = number[][];

export function monthCurves(
  movements: Iterable<Amount>,
  monthKeys: readonly string[],
): MonthCurves {
  const curves = monthKeys.map((key) => new Array<number>(daysInMonth(key) + 1).fill(0));
  const index = new Map(monthKeys.map((key, position) => [key, position]));

  for (const movement of movements) {
    const position = index.get(movement.date.slice(0, 7));
    if (position !== undefined) curves[position][dayOf(movement.date)] += movement.amount;
  }

  for (const curve of curves) {
    for (let day = 1; day < curve.length; day++) curve[day] += curve[day - 1];
  }
  return curves;
}

// A day past the end of a shorter month is its last day: the 31st of a month
// of 30 is everything that month had.
function upTo(curve: number[], day: number): number {
  return curve[Math.min(day, curve.length - 1)];
}

// What usually adds up from the end of `fromDay` to the end of `toDay`: the
// median of that stretch over the months, so one odd month does not move it.
export function typicalBetween(
  curves: MonthCurves,
  fromDay: number,
  toDay: number,
): number {
  return roundToCents(
    median(curves.map((curve) => upTo(curve, toDay) - upTo(curve, fromDay))) ?? 0,
  );
}

// A usual month, whole.
export function typicalTotal(curves: MonthCurves): number {
  return typicalBetween(curves, 0, 31);
}

// The month's total, one per month.
export function monthTotals(curves: MonthCurves): number[] {
  return curves.map((curve) => roundToCents(curve[curve.length - 1]));
}
