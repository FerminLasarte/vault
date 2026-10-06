import type { Category, CategoryRule, CategoryType } from "@/db/schema";
import { normalizeForSearch } from "@/lib/text";

// Returns the rule that best describes this text, or null when none applies.
//
// When several patterns match, the longest one wins: "mercado libre" is more
// specific than "mercado", and the more specific rule is the one the user meant.
// Ties break on the lower id so the outcome never depends on row ordering.
export function matchCategoryRule(
  description: string,
  rules: CategoryRule[],
): CategoryRule | null {
  return ruleMatcher(rules)(description);
}

// The same decision, for matching many descriptions against the same rules:
// each pattern is read once rather than once per description.
export function ruleMatcher(
  rules: CategoryRule[],
): (description: string) => CategoryRule | null {
  // A blank pattern would match everything; treat it as disabled rather than
  // letting it swallow every transaction.
  const needles = rules
    .map((rule) => ({ rule, needle: normalizeForSearch(rule.pattern) }))
    .filter(({ needle }) => needle !== "");

  return (description) => {
    const haystack = normalizeForSearch(description);
    if (haystack === "") return null;

    let best: CategoryRule | null = null;
    let bestLength = 0;

    for (const { rule, needle } of needles) {
      if (!haystack.includes(needle)) continue;

      if (
        needle.length > bestLength ||
        (needle.length === bestLength && best !== null && rule.id < best.id)
      ) {
        best = rule;
        bestLength = needle.length;
      }
    }

    return best;
  };
}

// The rule that decides where a movement of this kind should land, or null.
//
// A rule names one category, and a category holds either income or expenses.
// Only rules of the movement's own kind are considered, so "mercado pago" →
// Compras never files an incoming transfer under Compras, where it would show
// up in the income breakdown and in the monthly close. Among those rules the
// usual one wins, so a shorter rule of the right kind beats a longer one of the
// wrong kind.
export function matchCategoryRuleForType(
  description: string,
  rules: CategoryRule[],
  categories: Category[],
  type: CategoryType,
): CategoryRule | null {
  const ofType = new Set(
    categories
      .filter((category) => category.type === type)
      .map((category) => category.id),
  );
  return matchCategoryRule(
    description,
    rules.filter((rule) => ofType.has(rule.category_id)),
  );
}
