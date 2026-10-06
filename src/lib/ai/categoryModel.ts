import dictionary from "@/lib/ai/data/merchants.json";
import stopwords from "@/lib/ai/data/stopwords.json";
import { words } from "@/lib/ai/tokens";
import type { CategoryType, Transaction } from "@/db/schema";

// Which category the user would put a movement in, learned from where they put
// the movements before it.
//
// What decides is the most telling word of the description — or pair of
// words, "mercado libre" against "mercado pago" — over the user's own history:
// the one that most consistently landed in a single category. Not a weighing of
// every word together, because the user has to be told why, and "14 de tus 15
// movimientos con «rappi» están en Comida" is a reason someone can check; and
// not a model with category priors, where a category holding hundreds of
// movements drowns a word that has only ever meant one small one.

// When a word is telling enough to go by. Below this the model says nothing:
// wrong is worse than quiet when the subject is money.
//
// A word that has only ever meant one category is trusted from its first
// movement: most merchants turn up once in a while, and waiting for a second
// one left half of them unplaced (measured on a real history: 46% placed with
// two required, 68% with this, no mistakes either way). A word that has been in
// more than one category needs a clear majority instead: its share, counting
// one extra "it could be something else" against it, so that 2 of 3 is not
// enough and 4 of 5 is.
export const MIN_CONFIDENCE = 0.65;

function isTelling(reading: { inCategory: number; total: number; confidence: number }) {
  return reading.inCategory === reading.total || reading.confidence >= MIN_CONFIDENCE;
}

const IGNORED = new Set([
  ...stopwords,
  ...dictionary.processorPrefixes,
  ...dictionary.legalSuffixes,
  ...dictionary.locationSuffixes,
]);

// The words of a description that can say what it was, then the pairs they
// form, each once. Numbers and codes say nothing about a movement, and neither
// do card networks, processors or filler words.
export function tokenize(description: string): string[] {
  const kept = words(description).filter(
    (word) => word.length > 1 && !/\d/.test(word) && !IGNORED.has(word),
  );
  const pairs = kept.slice(1).map((word, index) => `${kept[index]} ${word}`);
  return [...new Set([...kept, ...pairs])];
}

// Per kind of movement, per word: how many movements with that word went to
// each category.
type WordCounts = Map<string, Map<number, number>>;

export interface CategoryModel {
  income: WordCounts;
  expense: WordCounts;
}

export interface CategoryPrediction {
  categoryId: number;
  confidence: number;
  // The word the prediction rests on, and its record: `inCategory` of the
  // user's `total` movements with it landed in the category.
  evidence: { word: string; inCategory: number; total: number };
}

// Only what the user decided teaches it: their own categories, a rule's (the
// rule is theirs), and suggestions they confirmed. A suggestion still waiting
// would otherwise confirm itself on every import.
export function trainCategoryModel(transactions: readonly Transaction[]): CategoryModel {
  const model: CategoryModel = { income: new Map(), expense: new Map() };

  for (const transaction of transactions) {
    // Transfers have no category; only spending and income are learned.
    if (transaction.type !== "income" && transaction.type !== "expense") continue;
    if (transaction.category_id === null || transaction.category_suggested === 1)
      continue;

    const counts = model[transaction.type];
    for (const token of tokenize(transaction.description)) {
      let perCategory = counts.get(token);
      if (perCategory === undefined) {
        perCategory = new Map();
        counts.set(token, perCategory);
      }
      perCategory.set(
        transaction.category_id,
        (perCategory.get(transaction.category_id) ?? 0) + 1,
      );
    }
  }

  return model;
}

interface Reading {
  word: string;
  categoryId: number;
  inCategory: number;
  total: number;
  confidence: number;
}

function read(word: string, perCategory: Map<number, number>): Reading {
  let categoryId = -1;
  let inCategory = 0;
  let total = 0;
  for (const [id, count] of perCategory) {
    total += count;
    if (count > inCategory || (count === inCategory && id < categoryId)) {
      categoryId = id;
      inCategory = count;
    }
  }
  return { word, categoryId, inCategory, total, confidence: inCategory / (total + 1) };
}

// The more telling of two readings: the surer one, then the one with more
// movements behind it, then a pair over a single word, since it is the more
// specific. Ties end on the word itself so the outcome never depends on order.
function moreTelling(a: Reading, b: Reading): boolean {
  if (a.confidence !== b.confidence) return a.confidence > b.confidence;
  if (a.total !== b.total) return a.total > b.total;
  const aWords = a.word.split(" ").length;
  const bWords = b.word.split(" ").length;
  if (aWords !== bWords) return aWords > bWords;
  return a.word < b.word;
}

export function predictCategory(
  model: CategoryModel,
  movement: { description: string; type: CategoryType },
): CategoryPrediction | null {
  const counts = model[movement.type];
  const readings = tokenize(movement.description).flatMap((word) => {
    const perCategory = counts.get(word);
    return perCategory === undefined ? [] : [read(word, perCategory)];
  });

  let best: Reading | null = null;
  for (const reading of readings) {
    if (best === null || moreTelling(reading, best)) best = reading;
  }
  if (best === null || !isTelling(best)) return null;

  // Two words that each clearly mean a different category: "rappi farmacia"
  // is not something to guess about.
  const contradicted = readings.some(
    (reading) => reading.categoryId !== best.categoryId && isTelling(reading),
  );
  if (contradicted) return null;

  return {
    categoryId: best.categoryId,
    confidence: best.confidence,
    evidence: { word: best.word, inCategory: best.inCategory, total: best.total },
  };
}
