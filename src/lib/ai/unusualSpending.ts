import {
  findMerchant,
  RECENT_MONTHS,
  type MerchantHistory,
} from "@/lib/ai/merchantHistory";
import type { Series } from "@/lib/ai/series";
import { mad, median } from "@/lib/ai/stats";
import { roundToCents } from "@/lib/finance";
import { daysBetween, formatCurrency, monthsBefore } from "@/lib/format";
import type { Category, Transaction } from "@/db/schema";

// An expense well above what is usually spent at the same place, or else in the
// same category: "Gastaste $ 45.000 en Farmacia; lo habitual es cerca de
// $ 8.000". Against the months just before it, in its own currency.

// How many earlier expenses "usual" needs: at the merchant, or else in the
// category, which mixes more kinds of purchase and so needs more of them.
export const MIN_MERCHANT_MOVEMENTS = 5;
export const MIN_CATEGORY_MOVEMENTS = 8;

// Unusual is both further from the median than this many typical distances
// from it, and at least this many times the median: a place where every charge
// is the same has no distance to speak of, and twice as much is news anywhere.
export const MAD_FACTOR = 3;
export const MIN_RATIO = 2;

// How recent an expense has to be for Atención to bring it up. Older ones are
// still told apart in the inspector.
export const RECENT_DAYS = 7;

export interface SpendingBaselines {
  history: MerchantHistory;
  // Every expense, by `<currency>:<category id>`, oldest first.
  byCategory: Map<string, Transaction[]>;
  categoryNames: Map<number, string>;
  // The movements of a series: a charge that went up is told by its own
  // notice (see priceRises.ts).
  inSeries: Set<number>;
}

function categoryKey(categoryId: number, currency: string): string {
  return `${currency}:${categoryId}`;
}

// Built once per change to the history, for Atención and the inspector to ask.
export function spendingBaselines(
  transactions: readonly Transaction[],
  categories: readonly Pick<Category, "id" | "name">[],
  history: MerchantHistory,
  series: readonly Series[],
): SpendingBaselines {
  const byCategory = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (transaction.type !== "expense" || transaction.category_id === null) continue;
    const key = categoryKey(transaction.category_id, transaction.currency);
    const group = byCategory.get(key);
    if (group === undefined) byCategory.set(key, [transaction]);
    else group.push(transaction);
  }
  for (const group of byCategory.values()) {
    group.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  }

  return {
    history,
    byCategory,
    categoryNames: new Map(categories.map((category) => [category.id, category.name])),
    inSeries: new Set(series.flatMap((entry) => entry.movements.map(({ id }) => id))),
  };
}

export interface UnusualSpending<T extends Transaction = Transaction> {
  // `unusual:<movement id>`.
  id: string;
  movement: T;
  // The merchant's name, or else the category's.
  name: string;
  // The median of the earlier expenses it is held against.
  typical: number;
  count: number;
  reason: string;
}

// The expenses of the months before this one, oldest first, from a group.
function before(group: readonly Transaction[], movement: Transaction): number[] {
  const since = monthsBefore(movement.date, RECENT_MONTHS);
  return group
    .filter((other) => other.date >= since && other.date < movement.date)
    .map((other) => other.amount);
}

// What an expense is held against: its merchant's earlier expenses when there
// are enough of them, else its category's. Only ever asked about an expense.
function baseline(
  movement: Transaction,
  baselines: SpendingBaselines,
): { name: string; amounts: number[] } | null {
  const merchant = findMerchant(baselines.history, {
    description: movement.description,
    type: "expense",
    currency: movement.currency,
  });
  if (merchant !== null) {
    const amounts = before(merchant.movements, movement);
    if (amounts.length >= MIN_MERCHANT_MOVEMENTS)
      return { name: merchant.label, amounts };
  }

  if (movement.category_id === null) return null;
  const name = baselines.categoryNames.get(movement.category_id);
  const group = baselines.byCategory.get(
    categoryKey(movement.category_id, movement.currency),
  );
  if (name === undefined || group === undefined) return null;
  const amounts = before(group, movement);
  return amounts.length >= MIN_CATEGORY_MOVEMENTS ? { name, amounts } : null;
}

// Whether an expense is well above the usual, and against what. Null for
// anything else, including what there is too little history to judge.
export function unusualSpending<T extends Transaction>(
  movement: T,
  baselines: SpendingBaselines,
): UnusualSpending<T> | null {
  if (movement.type !== "expense" || baselines.inSeries.has(movement.id)) return null;

  const held = baseline(movement, baselines);
  if (held === null) return null;
  const typical = median(held.amounts);
  const spread = mad(held.amounts);
  if (typical === null || spread === null || typical <= 0) return null;
  if (movement.amount <= typical + MAD_FACTOR * spread) return null;
  if (movement.amount < MIN_RATIO * typical) return null;

  const count = held.amounts.length;
  return {
    id: `unusual:${movement.id}`,
    movement,
    name: held.name,
    typical: roundToCents(typical),
    count,
    reason: `Comparado con tus ${count} gastos en ${held.name} de los ${RECENT_MONTHS} meses anteriores: la mitad fue de menos de ${formatCurrency(typical, movement.currency)}.`,
  };
}

// The unusual expenses of the last RECENT_DAYS, furthest above the usual first.
export function recentUnusualSpending<T extends Transaction>(
  transactions: readonly T[],
  baselines: SpendingBaselines,
  today: string,
  isDismissed: (id: string) => boolean,
): UnusualSpending<T>[] {
  const found: UnusualSpending<T>[] = [];
  for (const movement of transactions) {
    const age = daysBetween(movement.date, today);
    if (age < 0 || age >= RECENT_DAYS) continue;
    const unusual = unusualSpending(movement, baselines);
    if (unusual !== null && !isDismissed(unusual.id)) found.push(unusual);
  }
  return found.sort(
    (a, b) =>
      b.movement.amount / b.typical - a.movement.amount / a.typical ||
      a.movement.id - b.movement.id,
  );
}
