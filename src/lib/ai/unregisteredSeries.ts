import type { Series } from "@/lib/ai/series";
import { occurrenceAt } from "@/lib/recurring";
import type { NewRecurringTransaction } from "@/db";

// Series nobody declared, each with the recurring movement it would be: "Parece
// que pagás Spotify todos los meses", and one click from adding it.

export interface UnregisteredSeries {
  // Dismissing it says "this is not a recurring movement": `series:<series id>`.
  id: string;
  series: Series;
  // What the recurring movement dialog opens with.
  draft: NewRecurringTransaction;
}

// The recurring movement a series would be, as it stands now: its latest
// amount, the category it was last given and the account it usually goes
// through. It starts at the next occurrence, since the ones already recorded
// would otherwise come back as due.
function draftFor(series: Series): NewRecurringTransaction {
  const { merchant, movements, frequency } = series;
  const latest = movements[movements.length - 1];
  const categorised = [...movements]
    .reverse()
    .find((movement) => movement.category_id !== null);

  return {
    description: merchant.label,
    amount: latest.amount,
    type: merchant.type,
    currency: merchant.currency,
    categoryId: categorised?.category_id ?? null,
    paymentMethodId: merchant.account?.paymentMethodId ?? latest.payment_method_id,
    frequency,
    startDate: occurrenceAt(latest.date, frequency, 1),
    isActive: true,
  };
}

// The ones seen the most times first: the surer they are, the sooner they show.
export function unregisteredSeries(
  series: readonly Series[],
  isDismissed: (id: string) => boolean,
): UnregisteredSeries[] {
  return series
    .filter((entry) => entry.recurring === null)
    .map((entry) => ({ id: `series:${entry.id}`, series: entry, draft: draftFor(entry) }))
    .filter((offer) => !isDismissed(offer.id))
    .sort(
      (a, b) =>
        b.series.movements.length - a.series.movements.length || a.id.localeCompare(b.id),
    );
}
