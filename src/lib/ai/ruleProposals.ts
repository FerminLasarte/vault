import { isUserCategorised, type CategoryModel } from "@/lib/ai/categoryModel";
import { evidenceReason } from "@/lib/ai/categorySuggestion";
import { merchantName } from "@/lib/ai/merchants";
import { ruleMatcher } from "@/lib/categoryRules";
import { normalizeForSearch } from "@/lib/text";
import type { Category, CategoryRule, CategoryType, Transaction } from "@/db/schema";

// Rules to create and rules to fix, from where the user put their movements.
//
// A rule is stronger than a suggestion: it fills the category in silently, on
// every movement, from then on. So a rule is only ever proposed, never made,
// and only when the history leaves little doubt.

// How many movements a proposal has to settle, and a note has to rest on.
// Fewer is an anecdote, not a pattern.
export const MIN_OCCURRENCES = 3;

// The share of the movements a proposed rule would decide that the user put in
// its category. Higher than the model's bar: a rule is not marked as the AI's
// once it exists, so a wrong one is wrong quietly.
export const MIN_PURITY = 0.9;

// Rules match anywhere in the text, so a short pattern catches far more than
// the word it came from: "bar" is also in "barbería".
export const MIN_PATTERN_LENGTH = 3;

// A rule is contradicted when more than this share of the movements it decides
// sit in one other category: the user keeps putting them somewhere else.
export const CONTRADICTION_SHARE = 0.5;

export interface RuleProposal {
  // Derived from what it proposes, so dismissing it survives a restart.
  id: string;
  pattern: string;
  categoryId: number;
  reason: string;
}

// Something to know about one of the user's rules. `message` is what the row
// says; `reason` is the data behind it.
export type RuleNote =
  | { kind: "unused" | "shadowed"; id: string; message: string; reason: string }
  | {
      kind: "contradicted";
      id: string;
      message: string;
      reason: string;
      // Where the user keeps putting what the rule decides.
      categoryId: number;
      categoryName: string;
    };

export interface RuleAdvice {
  // Most useful first.
  proposals: RuleProposal[];
  // By rule id.
  notes: Map<number, RuleNote>;
}

// A movement as rules see it.
interface Movement {
  // The description as rules read it.
  text: string;
  // The merchant's clean name, read the same way, or null when there is none.
  name: string | null;
  type: CategoryType;
  // The category the user decided on, or null while nobody has.
  categoryId: number | null;
  // The rule that decides it today.
  rule: CategoryRule | null;
}

// Every income and expense, read once: its text, its category if the user
// decided it, and which rule wins on it — among the rules of its own kind, as
// when a category is filled in.
function readHistory(
  transactions: readonly Transaction[],
  rules: CategoryRule[],
  typeOf: Map<number, CategoryType>,
): Movement[] {
  const winner = {
    income: ruleMatcher(
      rules.filter((rule) => typeOf.get(rule.category_id) === "income"),
    ),
    expense: ruleMatcher(
      rules.filter((rule) => typeOf.get(rule.category_id) === "expense"),
    ),
  };

  return transactions.flatMap((transaction) => {
    if (transaction.type !== "income" && transaction.type !== "expense") return [];
    return [
      {
        text: normalizeForSearch(transaction.description),
        name: nameOf(transaction.description),
        type: transaction.type,
        categoryId: isUserCategorised(transaction) ? transaction.category_id : null,
        rule: winner[transaction.type](transaction.description),
      },
    ];
  });
}

function nameOf(description: string): string | null {
  const name = merchantName(description);
  return name === null ? null : normalizeForSearch(name);
}

// The category most of these movements are in, other than `except`, and how
// many are.
function topCategory(
  movements: readonly Movement[],
  except: number | null = null,
): { categoryId: number; count: number } | null {
  const counts = new Map<number, number>();
  for (const { categoryId } of movements) {
    if (categoryId === null || categoryId === except) continue;
    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  }

  let top: { categoryId: number; count: number } | null = null;
  for (const [categoryId, count] of counts) {
    if (
      top === null ||
      count > top.count ||
      (count === top.count && categoryId < top.categoryId)
    ) {
      top = { categoryId, count };
    }
  }
  return top;
}

interface Candidate {
  pattern: string;
  categoryId: number;
  inCategory: number;
  total: number;
  // What the rule would change: movements of its category that no rule puts
  // there today.
  settles: Movement[];
  // Whether the pattern is the clean name of every movement it settles.
  namesMerchant: boolean;
}

// The words the model has seen land in one category often enough, as rules.
//
// A rule decides every movement whose text contains its pattern, except those
// an existing rule at least as specific already decides. Among those, the user
// must have put almost all in one category, and at least `MIN_OCCURRENCES` of
// them must not already be put there by a rule — otherwise there is nothing for
// it to do.
//
// Overlapping candidates settle the same movements ("birra", "bar" and "birra
// bar"): the one settling more goes first, then the merchant's own name, which
// reads as what the rule is about ("uber", not "trip help" from
// `UBER *TRIP HELP.UBER.COM`), then the longer, which is the more specific and
// the less likely to catch something else later ("bar" is also in "barbería"),
// and a candidate left with too little of its own is dropped.
// Dismissed proposals still take their movements, so saying no to "birra bar"
// does not bring up "birra" in its place.
function proposeRules(
  model: CategoryModel,
  history: readonly Movement[],
  names: Map<number, string>,
  needleLength: Map<number, number>,
): RuleProposal[] {
  const candidates: Candidate[] = [];

  for (const type of ["income", "expense"] as const) {
    const decided = history.filter(
      (movement) => movement.type === type && movement.categoryId !== null,
    );

    for (const [word, perCategory] of model[type]) {
      if (word.length < MIN_PATTERN_LENGTH) continue;
      if (Math.max(...perCategory.values()) < MIN_OCCURRENCES) continue;

      const wouldDecide = decided.filter(
        (movement) =>
          movement.text.includes(word) &&
          (movement.rule === null ||
            (needleLength.get(movement.rule.id) ?? 0) < word.length),
      );
      const top = topCategory(wouldDecide);
      if (top === null || !names.has(top.categoryId)) continue;
      if (top.count / wouldDecide.length < MIN_PURITY) continue;

      const settles = wouldDecide.filter(
        (movement) =>
          movement.categoryId === top.categoryId &&
          movement.rule?.category_id !== top.categoryId,
      );
      if (settles.length < MIN_OCCURRENCES) continue;

      candidates.push({
        pattern: word,
        categoryId: top.categoryId,
        inCategory: top.count,
        total: wouldDecide.length,
        settles,
        namesMerchant: settles.every((movement) => movement.name === word),
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.settles.length - a.settles.length ||
      Number(b.namesMerchant) - Number(a.namesMerchant) ||
      b.pattern.length - a.pattern.length ||
      (a.pattern < b.pattern ? -1 : 1),
  );

  const taken = new Set<Movement>();
  const proposals: RuleProposal[] = [];
  for (const candidate of candidates) {
    const own = candidate.settles.filter((movement) => !taken.has(movement));
    if (own.length < MIN_OCCURRENCES) continue;
    for (const movement of own) taken.add(movement);

    proposals.push({
      id: `rule:${candidate.pattern}:${candidate.categoryId}`,
      pattern: candidate.pattern,
      categoryId: candidate.categoryId,
      reason: evidenceReason(
        {
          word: candidate.pattern,
          inCategory: candidate.inCategory,
          total: candidate.total,
        },
        names.get(candidate.categoryId)!,
      ),
    });
  }
  return proposals;
}

// What is worth knowing about a rule, if anything. A rule is one of three
// things at most: never matched, matched but always beaten by a more specific
// one, or deciding movements the user keeps putting elsewhere.
//
// The ids carry the pattern and the category, so editing the rule makes it a
// different rule, looked at afresh.
function reviewRule(
  rule: CategoryRule,
  history: readonly Movement[],
  typeOf: Map<number, CategoryType>,
  names: Map<number, string>,
): RuleNote | null {
  const type = typeOf.get(rule.category_id);
  const needle = normalizeForSearch(rule.pattern);
  if (type === undefined || needle === "") return null;
  const key = `${rule.id}:${needle}:${rule.category_id}`;

  const matches = history.filter(
    (movement) => movement.type === type && movement.text.includes(needle),
  );
  if (matches.length === 0) {
    return {
      kind: "unused",
      id: `rule-unused:${key}`,
      message: "No coincide con ningún movimiento.",
      reason: `Ninguno de tus movimientos contiene «${rule.pattern}».`,
    };
  }

  const decides = matches.filter((movement) => movement.rule?.id === rule.id);
  if (decides.length === 0) {
    if (matches.length < MIN_OCCURRENCES) return null;
    const winners = new Set(matches.map((movement) => movement.rule!.pattern));
    const [first] = winners;
    return {
      kind: "shadowed",
      id: `rule-shadowed:${key}`,
      message: "Nunca decide: siempre gana una regla más específica.",
      reason:
        winners.size === 1
          ? `En tus ${matches.length} movimientos con «${rule.pattern}» decide «${first}».`
          : `En tus ${matches.length} movimientos con «${rule.pattern}» deciden reglas más específicas, como «${first}».`,
    };
  }

  const categorised = decides.filter((movement) => movement.categoryId !== null);
  const elsewhere = topCategory(categorised, rule.category_id);
  if (
    elsewhere === null ||
    elsewhere.count < MIN_OCCURRENCES ||
    elsewhere.count / categorised.length <= CONTRADICTION_SHARE
  ) {
    return null;
  }
  const categoryName = names.get(elsewhere.categoryId);
  if (categoryName === undefined) return null;

  return {
    kind: "contradicted",
    id: `rule-contradicted:${key}:${elsewhere.categoryId}`,
    message: `La mayoría de lo que decide está en ${categoryName}.`,
    reason: evidenceReason(
      { word: rule.pattern, inCategory: elsewhere.count, total: categorised.length },
      categoryName,
    ),
    categoryId: elsewhere.categoryId,
    categoryName,
  };
}

export function adviseRules(context: {
  model: CategoryModel;
  transactions: readonly Transaction[];
  rules: CategoryRule[];
  categories: Category[];
}): RuleAdvice {
  const { model, transactions, rules, categories } = context;
  const typeOf = new Map(categories.map((category) => [category.id, category.type]));
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const needleLength = new Map(
    rules.map((rule) => [rule.id, normalizeForSearch(rule.pattern).length]),
  );
  const history = readHistory(transactions, rules, typeOf);

  const notes = new Map<number, RuleNote>();
  for (const rule of rules) {
    const note = reviewRule(rule, history, typeOf, names);
    if (note !== null) notes.set(rule.id, note);
  }

  return { proposals: proposeRules(model, history, names, needleLength), notes };
}
