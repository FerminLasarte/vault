import { RECENT_OCCURRENCES, type Series } from "@/lib/ai/series";
import { median } from "@/lib/ai/stats";

// Monthly income that has not come in yet when it usually would have: "Sueldo
// suele entrar alrededor del 4 y todavía no llegó". Neutral: it may simply be
// late, and nothing is owed.

// Fewer than four months is too little to know what "usually" is.
export const MIN_INCOME_OCCURRENCES = 4;

// How many days past the usual one it may come in before it counts as late.
export const LATE_TOLERANCE_DAYS = 3;

// How far apart the days it came in may be. Further apart there is no usual
// day to speak of — or it straddles the turn of the month, where a median of
// the 30th and the 1st is the 15th.
export const MAX_DAY_SPREAD = 7;

export interface LateIncome {
  // `late:<series id>:<YYYY-MM>`: dismissed for this month only.
  id: string;
  series: Series;
  usualDay: number;
  earliestDay: number;
  latestDay: number;
  // How many recent months the usual day was read from.
  months: number;
}

function dayOf(date: string): number {
  return Number(date.slice(8, 10));
}

export function lateIncome(
  series: readonly Series[],
  today: string,
  isDismissed: (id: string) => boolean,
): LateIncome[] {
  const monthStart = `${today.slice(0, 7)}-01`;
  const found: LateIncome[] = [];

  for (const entry of series) {
    if (entry.frequency !== "monthly" || entry.merchant.type !== "income") continue;
    // A declared one already waits in Compromisos once it is due.
    if (entry.recurring !== null) continue;
    if (entry.movements.length < MIN_INCOME_OCCURRENCES) continue;
    if (entry.lastDate >= monthStart) continue;

    const days = entry.movements
      .slice(-RECENT_OCCURRENCES)
      .map((movement) => dayOf(movement.date));
    const earliestDay = Math.min(...days);
    const latestDay = Math.max(...days);
    if (latestDay - earliestDay > MAX_DAY_SPREAD) continue;

    const usualDay = Math.round(median(days) ?? 0);
    if (dayOf(today) <= usualDay + LATE_TOLERANCE_DAYS) continue;

    const id = `late:${entry.id}:${today.slice(0, 7)}`;
    if (isDismissed(id)) continue;
    found.push({
      id,
      series: entry,
      usualDay,
      earliestDay,
      latestDay,
      months: days.length,
    });
  }

  return found;
}
