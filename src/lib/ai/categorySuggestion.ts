import hints from "@/lib/ai/data/categoryHints.json";
import { predictCategory, type CategoryModel } from "@/lib/ai/categoryModel";
import { knownMerchant } from "@/lib/ai/merchants";
import { words } from "@/lib/ai/tokens";
import { matchCategoryRuleForType } from "@/lib/categoryRules";
import type { Category, CategoryRule, CategoryType } from "@/db/schema";

// Where a movement should go, and who says so. Every place that fills in a
// category asks here — the form, the inspector, the quick entry and both
// imports — so "the rule first, then what the history says" is decided once.
export type CategorySuggestion =
  | { source: "rule"; categoryId: number; rule: CategoryRule }
  | { source: "ai"; categoryId: number; reason: string };

export interface SuggestionContext {
  rules: CategoryRule[];
  categories: Category[];
  // Null with the local AI switched off, which leaves the rules alone, as
  // before it existed.
  model: CategoryModel | null;
}

type HintKey = keyof typeof hints;

function isHintKey(key: string): key is HintKey {
  return Object.hasOwn(hints, key);
}

// The user's category for a kind of place: the first of the hint's words that
// one of their category names contains, so "supermercado" finds "Super" before
// it settles for "Comida".
function categoryForHint(hint: HintKey, categories: Category[]): Category | null {
  for (const word of hints[hint].categories) {
    const match = categories.find((category) => words(category.name).includes(word));
    if (match !== undefined) return match;
  }
  return null;
}

function learnedReason(
  evidence: { word: string; inCategory: number; total: number },
  categoryName: string,
): string {
  const { word, inCategory, total } = evidence;
  if (total === 1) return `Tu único movimiento con «${word}» está en ${categoryName}.`;
  return inCategory === total
    ? `Tus ${total} movimientos con «${word}» están en ${categoryName}.`
    : `${inCategory} de tus ${total} movimientos con «${word}» están en ${categoryName}.`;
}

export function suggestCategory(
  movement: { description: string; type: CategoryType },
  context: SuggestionContext,
): CategorySuggestion | null {
  const rule = matchCategoryRuleForType(
    movement.description,
    context.rules,
    context.categories,
    movement.type,
  );
  if (rule !== null) return { source: "rule", categoryId: rule.category_id, rule };

  if (context.model === null) return null;

  const ofType = context.categories.filter((category) => category.type === movement.type);

  const prediction = predictCategory(context.model, movement);
  const predicted = ofType.find((category) => category.id === prediction?.categoryId);
  if (prediction !== null && predicted !== undefined) {
    return {
      source: "ai",
      categoryId: predicted.id,
      reason: learnedReason(prediction.evidence, predicted.name),
    };
  }

  // Nothing learned about it yet. A merchant everyone knows is still a kind of
  // place — and only ever a place money is spent at.
  if (movement.type !== "expense") return null;
  const merchant = knownMerchant(movement.description);
  if (merchant?.hint === undefined || !isHintKey(merchant.hint)) return null;
  const hinted = categoryForHint(merchant.hint, ofType);
  if (hinted === null) return null;

  return {
    source: "ai",
    categoryId: hinted.id,
    reason: `${merchant.name} es ${hints[merchant.hint].label}.`,
  };
}
