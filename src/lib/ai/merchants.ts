import dictionary from "@/lib/ai/data/merchants.json";
import { words } from "@/lib/ai/tokens";
import { normalizeForSearch } from "@/lib/text";

// The name of the merchant behind a bank's description, or null when there is
// nothing better to show than the description itself.
//
// Banks write `MERPAGO*RAPPI 4471 CABA AR`; a person says "Rappi". The
// description is never changed — it is what the bank wrote, and it is what an
// export, a search or a later correction works from. This is only the name the
// screen shows, derived each time, so an improvement to the dictionary renames
// old movements too.
//
// Only text that reads like a bank's is touched: capitals, or a word followed
// by a processor's asterisk. Someone who typed "nafta ypf" said more than
// "YPF", and keeps exactly what they typed.

const PROCESSORS = new Set(dictionary.processorPrefixes);
const LEGAL_FORMS = new Set(dictionary.legalSuffixes);
const PLACES = new Set(dictionary.locationSuffixes);
// Lower case inside a name, as Spanish writes them: "Casa de las Empanadas".
const CONNECTORS = new Set(["de", "del", "la", "las", "el", "los", "y", "e"]);

// Longest first, so the first pattern found is the most specific one: "uber
// eats" before "uber". Equal lengths keep the file's order, which keeps the
// outcome independent of anything but the dictionary.
const PATTERNS = dictionary.merchants
  .flatMap((merchant) =>
    merchant.patterns.map((pattern) => ({ pattern: ` ${pattern} `, merchant })),
  )
  .sort((a, b) => b.pattern.length - a.pattern.length);

// A merchant the dictionary knows, and what kind of place it is when that is
// known: the key into categoryHints.json.
export interface KnownMerchant {
  name: string;
  hint?: string;
}

const PROCESSOR_PREFIX = /^\s*([\p{L}\d]+)\s*\*/u;

function readsLikeABank(description: string): boolean {
  const hasLetters = /\p{L}/u.test(description);
  const hasLowercase = /\p{Ll}/u.test(description);
  return (hasLetters && !hasLowercase) || /[\p{L}\d]\s?\*/u.test(description);
}

// What is left once a payment processor's prefix is taken off. A merchant's
// own prefix ("Rappi*Restaurante") stays: it is the merchant.
function withoutProcessor(description: string): string {
  const prefix = PROCESSOR_PREFIX.exec(description);
  if (prefix && PROCESSORS.has(normalizeForSearch(prefix[1]))) {
    return description.slice(prefix[0].length);
  }
  return description;
}

function findMerchant(text: string): KnownMerchant | null {
  const haystack = ` ${words(text).join(" ")} `;
  return PATTERNS.find(({ pattern }) => haystack.includes(pattern))?.merchant ?? null;
}

// The dictionary's merchant behind any description, typed or not. Unlike
// `merchantName`, this changes nothing on screen: it only says what the text
// mentions, which is fair to read in "nafta ypf" too.
export function knownMerchant(description: string): KnownMerchant | null {
  return findMerchant(withoutProcessor(description));
}

function asNameWord(word: string, index: number): string {
  const lower = word.toLocaleLowerCase("es");
  if (index > 0 && CONNECTORS.has(normalizeForSearch(word))) return lower;
  // An acronym written as a word would be a misspelling: "Ypf", "Tkt".
  if (word.length <= 4 && !/[aeiouáéíóú]/i.test(word))
    return word.toLocaleUpperCase("es");
  return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
}

// An unknown merchant, from what the statement line says about it: no codes,
// no legal form, no place at the end, written like a name.
function cleanedName(text: string): string | null {
  const kept = text
    .split(/[\s*._\-/#]+/)
    .filter((word) => word !== "" && !/\d/.test(word))
    .filter((word) => !LEGAL_FORMS.has(normalizeForSearch(word)));

  // Only from the end, where statements put it: "Argentina" or "BA" can be
  // part of the name itself.
  while (kept.length > 0 && PLACES.has(normalizeForSearch(kept[kept.length - 1]))) {
    kept.pop();
  }

  return kept.length > 0 ? kept.map(asNameWord).join(" ") : null;
}

function computeMerchantName(description: string): string | null {
  if (!readsLikeABank(description)) return null;

  const text = withoutProcessor(description);
  const name = findMerchant(text)?.name ?? cleanedName(text);
  return name !== null && name !== description.trim() ? name : null;
}

// Descriptions repeat — the same merchant every month — and the lists ask for
// every row on every render, so each distinct description is worked out once.
const cache = new Map<string, string | null>();

export function merchantName(description: string): string | null {
  let name = cache.get(description);
  if (name === undefined) {
    name = computeMerchantName(description);
    cache.set(description, name);
  }
  return name;
}
