import { suggestCategory, type SuggestionContext } from "@/lib/ai/categorySuggestion";
import type { Transaction } from "@/db/schema";

// Movements nobody categorised, gathered by where they seem to belong, so that
// "23 movimientos sin categoría parecen Supermercado" is reviewed and applied
// once instead of one movement at a time.

// A single movement is better looked at on its own, where the inspector already
// offers the AI's category for it. Together means at least two.
export const MIN_GROUP_SIZE = 2;

export interface UncategorisedRow<T extends Transaction> {
  transaction: T;
  // Why this one seems to belong here, from the rule or the history behind it.
  reason: string;
  // Dismissing it says "not this movement in this category": a different
  // category for it later is a different suggestion.
  dismissalId: string;
}

export interface UncategorisedGroup<T extends Transaction> {
  id: string;
  categoryId: number;
  categoryName: string;
  // Newest first, like every list of movements.
  rows: UncategorisedRow<T>[];
}

// Biggest group first. Only income and expenses: a transfer has no category to
// be missing. Movements the user waved away for a category stay out of it.
export function groupUncategorised<T extends Transaction>(
  transactions: readonly T[],
  context: SuggestionContext,
  isDismissed: (id: string) => boolean,
): UncategorisedGroup<T>[] {
  const names = new Map(
    context.categories.map((category) => [category.id, category.name]),
  );
  const byCategory = new Map<number, UncategorisedRow<T>[]>();

  for (const transaction of transactions) {
    if (transaction.type !== "income" && transaction.type !== "expense") continue;
    if (transaction.category_id !== null) continue;

    const suggestion = suggestCategory(
      { description: transaction.description, type: transaction.type },
      context,
    );
    if (suggestion === null) continue;

    const dismissalId = `categorise:${transaction.id}:${suggestion.categoryId}`;
    if (isDismissed(dismissalId)) continue;

    const rows = byCategory.get(suggestion.categoryId) ?? [];
    rows.push({
      transaction,
      reason:
        suggestion.source === "rule"
          ? `Coincide con tu regla «${suggestion.rule.pattern}».`
          : suggestion.reason,
      dismissalId,
    });
    byCategory.set(suggestion.categoryId, rows);
  }

  const groups: UncategorisedGroup<T>[] = [];
  for (const [categoryId, rows] of byCategory) {
    const categoryName = names.get(categoryId);
    if (categoryName === undefined || rows.length < MIN_GROUP_SIZE) continue;
    rows.sort(
      (a, b) =>
        b.transaction.date.localeCompare(a.transaction.date) ||
        b.transaction.id - a.transaction.id,
    );
    groups.push({ id: `uncategorised:${categoryId}`, categoryId, categoryName, rows });
  }

  return groups.sort(
    (a, b) =>
      b.rows.length - a.rows.length || a.categoryName.localeCompare(b.categoryName, "es"),
  );
}
