import { merchantKey } from "@/lib/ai/merchants";
import {
  merchantEntryId,
  type MerchantEntry,
  type MerchantHistory,
} from "@/lib/ai/merchantHistory";
import { mad, median } from "@/lib/ai/stats";
import { roundToCents } from "@/lib/finance";
import { daysBetween } from "@/lib/format";
import type { RecurrenceFrequency } from "@/lib/recurring";
import type {
  CategoryType,
  InstallmentPlan,
  Loan,
  RecurringTransaction,
  Transaction,
} from "@/db/schema";

// What repeats on its own: the same merchant, kind of movement and currency
// coming back every week, month or year for about the same amount. Read by the
// notices about recurring movements nobody declared, prices that went up and
// income that is late, so all three agree on what a series is.
//
// Grouped as merchantHistory.ts groups, and not also by account: a card
// replaced halfway through a year of Netflix is still one Netflix.

// Fewer than three is a coincidence: two dates are always some distance apart.
export const MIN_OCCURRENCES = 3;

// How far apart two occurrences are in each frequency, and how far off that
// still counts. A month is anything from 24 to 36 days: months run from 28 to
// 31, and a charge or a salary moves a few days with weekends and holidays.
export const PERIODS: Record<RecurrenceFrequency, { days: number; tolerance: number }> = {
  weekly: { days: 7, tolerance: 2 },
  monthly: { days: 30, tolerance: 6 },
  yearly: { days: 365, tolerance: 20 },
};

const FREQUENCIES = Object.keys(PERIODS) as RecurrenceFrequency[];

// What the series costs now is read from its latest occurrences only: prices
// drift every month, and a year-old amount says little about the next one.
export const RECENT_OCCURRENCES = 6;

// How far its amounts may typically sit from their median, as a share of it.
// A fee is roughly the same every time; spending that merely happens often —
// the weekly shop — is not.
export const MAX_AMOUNT_SPREAD = 0.25;

// A series nothing has been heard of for a period and a half has stopped.
export const ACTIVE_PERIODS = 1.5;

// What the user already declared as repeating.
export interface Commitments {
  recurring: readonly RecurringTransaction[];
  installmentPlans: readonly InstallmentPlan[];
  loans: readonly Loan[];
}

export interface Series {
  // Stable across launches and new occurrences: `expense:ARS:netflix:monthly`.
  id: string;
  merchant: MerchantEntry;
  frequency: RecurrenceFrequency;
  // The occurrences that repeat, up to the latest, oldest first.
  movements: Transaction[];
  // The median of the recent occurrences.
  typicalAmount: number;
  lastDate: string;
  // The recurring movement the user declared for it, if any.
  recurring: RecurringTransaction | null;
}

function frequencyOf(days: number): RecurrenceFrequency | null {
  return (
    FREQUENCIES.find(
      (frequency) =>
        Math.abs(days - PERIODS[frequency].days) <= PERIODS[frequency].tolerance,
    ) ?? null
  );
}

// The movements at the end of the list that come at one steady frequency.
// Whatever came before the run — a one-off at the same place, a gap — is left
// behind rather than breaking it.
function trailingRun(
  movements: Transaction[],
): { frequency: RecurrenceFrequency; run: Transaction[] } | null {
  const intervalBefore = (index: number) =>
    daysBetween(movements[index - 1].date, movements[index].date);

  let start = movements.length - 1;
  if (start < 1) return null;
  const frequency = frequencyOf(intervalBefore(start));
  if (frequency === null) return null;

  while (start > 0 && frequencyOf(intervalBefore(start)) === frequency) start -= 1;
  return { frequency, run: movements.slice(start) };
}

function declaredKey(description: string, type: CategoryType, currency: string): string {
  return merchantEntryId(merchantKey(description), type, currency);
}

// The merchant whose movements an instalment plan accounts for: the one its
// description names, so a plan typed as "Fravega" is behind the statement's
// `FRAVEGA C.04/12`.
export function planMerchantId(
  plan: Pick<InstallmentPlan, "description" | "currency">,
): string {
  return declaredKey(plan.description, "expense", plan.currency);
}

export function detectSeries(
  history: MerchantHistory,
  commitments: Commitments,
  today: string,
): Series[] {
  // Keyed as the history is, so a template typed as "Netflix" is the series
  // behind `DLO*NETFLIX 4471`.
  const recurring = new Map<string, RecurringTransaction>();
  for (const template of commitments.recurring) {
    const key = declaredKey(template.description, template.type, template.currency);
    if (!recurring.has(key)) recurring.set(key, template);
  }
  // An instalment or a loan payment repeats by definition, and is already
  // scheduled where the user declared it.
  const scheduled = new Set([
    ...commitments.installmentPlans.map(planMerchantId),
    ...commitments.loans.map((loan) =>
      declaredKey(
        loan.description,
        loan.direction === "borrowed" ? "expense" : "income",
        loan.currency,
      ),
    ),
  ]);

  const found: Series[] = [];
  for (const merchant of history.values()) {
    if (merchant.movements.length < MIN_OCCURRENCES) continue;
    if (scheduled.has(merchant.id)) continue;

    const trailing = trailingRun(merchant.movements);
    if (trailing === null || trailing.run.length < MIN_OCCURRENCES) continue;
    const { frequency, run } = trailing;

    const lastDate = run[run.length - 1].date;
    if (daysBetween(lastDate, today) > ACTIVE_PERIODS * PERIODS[frequency].days) continue;

    const amounts = run.slice(-RECENT_OCCURRENCES).map((movement) => movement.amount);
    const typical = median(amounts);
    const spread = mad(amounts);
    if (typical === null || spread === null || typical <= 0) continue;
    if (spread / typical > MAX_AMOUNT_SPREAD) continue;

    found.push({
      id: `${merchant.id}:${frequency}`,
      merchant,
      frequency,
      movements: run,
      typicalAmount: roundToCents(typical),
      lastDate,
      recurring: recurring.get(merchant.id) ?? null,
    });
  }

  return found.sort(
    (a, b) => b.lastDate.localeCompare(a.lastDate) || a.id.localeCompare(b.id),
  );
}
