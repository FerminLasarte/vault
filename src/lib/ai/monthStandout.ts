import { paceReason, type BudgetPace, type CategoryPace } from "@/lib/ai/monthPace";
import type { UnusualSpending } from "@/lib/ai/unusualSpending";
import { roundToCents } from "@/lib/finance";
import { formatCurrency, formatPercent } from "@/lib/format";

// The one line at the top of Resumen: the category whose month is heading
// furthest above a usual one, when one is — "Este mes Salidas viene un 80%
// arriba de lo habitual". The month card already says it for the whole month,
// and Atención for a budget; this is the category nobody set a cap on.
//
// Only above the usual. A category below it early in the month is, as often as
// not, a charge that has not come yet.

// How far above its usual month a category has to be heading.
export const MIN_STANDOUT_CHANGE = 0.3;

// And by how much, against a usual month's whole spending in the currency: a
// small category that doubled moves nothing worth a line.
export const MIN_STANDOUT_SHARE = 0.05;

export interface Standout {
  // `standout:<currency>:<category id>:<YYYY-MM>`: dismissed for the month.
  id: string;
  categoryId: number;
  name: string;
  pace: CategoryPace["pace"];
  // 0.8 for 80% above the usual.
  change: number;
}

export function monthStandout(
  paces: ReadonlyMap<string, CategoryPace>,
  context: {
    currency: string;
    // A usual month's whole spending in the currency.
    typicalSpending: number;
    // A category whose budget the month passed or is heading past, or with an
    // unusual expense Atención is raising, is Atención's to say.
    budgetPaces: Iterable<BudgetPace>;
    unusual: Iterable<UnusualSpending>;
    categoryNames: ReadonlyMap<number, string>;
    isDismissed: (id: string) => boolean;
    today: string;
  },
): Standout | null {
  const { currency, typicalSpending, today } = context;
  const spokenFor = new Set<number>();
  for (const { budget, pace } of context.budgetPaces) {
    if (budget.currency === currency && pace.projected > budget.amount) {
      spokenFor.add(budget.category_id);
    }
  }
  for (const { movement } of context.unusual) {
    if (movement.currency === currency && movement.category_id !== null) {
      spokenFor.add(movement.category_id);
    }
  }
  const minExcess = roundToCents(typicalSpending * MIN_STANDOUT_SHARE);

  let best: Standout | null = null;
  let bestExcess = 0;
  for (const { categoryId, currency: paceCurrency, pace } of paces.values()) {
    if (paceCurrency !== currency || spokenFor.has(categoryId)) continue;
    const name = context.categoryNames.get(categoryId);
    if (name === undefined) continue;

    // Compared in cents, so the boundaries are not lost to floating point.
    const excess = roundToCents(pace.projected - pace.typical);
    if (excess < minExcess || excess < roundToCents(pace.typical * MIN_STANDOUT_CHANGE)) {
      continue;
    }
    const id = `standout:${currency}:${categoryId}:${today.slice(0, 7)}`;
    if (context.isDismissed(id)) continue;
    const ahead =
      best === null ||
      excess > bestExcess ||
      (excess === bestExcess && categoryId < best.categoryId);
    if (ahead) {
      best = { id, categoryId, name, pace, change: pace.projected / pace.typical - 1 };
      bestExcess = excess;
    }
  }
  return best;
}

// What the line says, and why.
export function standoutText(
  standout: Standout,
  currency: string,
): { title: string; reason: string } {
  const { name, pace, change } = standout;
  return {
    title: `Este mes ${name} viene un ${formatPercent(change)} arriba de lo habitual`,
    reason: `Si el resto del mes va como siempre, llegás a ${formatCurrency(pace.projected, currency)}. ${paceReason(pace, currency, ` en ${name}`)}`,
  };
}
