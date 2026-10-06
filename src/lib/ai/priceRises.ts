import type { Series } from "@/lib/ai/series";
import { median } from "@/lib/ai/stats";
import type { RecurringTransaction } from "@/db/schema";

// Monthly charges that just went up: "Netflix pasó de $ 5.000 a $ 5.900
// (+18%)".

// What the latest charge is held against: the median of this many before it,
// so one odd month does not make the next ordinary one look like a jump.
export const RISE_BASELINE = 3;

// Prices drift a few points every month; only a jump this big is news.
export const MIN_RISE = 0.1;

export interface PriceRise {
  // `rise:<series id>:<new amount>`: dismissed, this rise stays out of sight
  // while the price stays where it went, and the next one is news again.
  id: string;
  series: Series;
  previous: number;
  latest: number;
  // 0.18 for +18%.
  rise: number;
  // The declared recurring movement still at an older amount, for the notice
  // to offer the new one. Null for a series nobody declared.
  recurring: RecurringTransaction | null;
}

// Whether a series' latest charge went up, against the ones before it. Shared
// by Atención and the monthly close, so both mean the same thing by "went up".
export function riseOf(
  series: Series,
): { previous: number; latest: number; rise: number } | null {
  if (series.frequency !== "monthly" || series.merchant.type !== "expense") return null;
  const { movements } = series;
  if (movements.length <= RISE_BASELINE) return null;

  const latest = movements[movements.length - 1].amount;
  const previous = median(
    movements.slice(-RISE_BASELINE - 1, -1).map((movement) => movement.amount),
  );
  if (previous === null || previous <= 0) return null;
  const rise = latest / previous - 1;
  return rise < MIN_RISE ? null : { previous, latest, rise };
}

export function priceRises(
  series: readonly Series[],
  isDismissed: (id: string) => boolean,
): PriceRise[] {
  const rises: PriceRise[] = [];

  for (const entry of series) {
    const found = riseOf(entry);
    if (found === null) continue;
    const { previous, latest, rise } = found;

    // A recurring movement already at the new amount has been dealt with.
    if (entry.recurring !== null && entry.recurring.amount >= latest) continue;

    const id = `rise:${entry.id}:${latest}`;
    if (isDismissed(id)) continue;
    rises.push({ id, series: entry, previous, latest, rise, recurring: entry.recurring });
  }

  // The biggest jump first.
  return rises.sort((a, b) => b.rise - a.rise || a.id.localeCompare(b.id));
}
