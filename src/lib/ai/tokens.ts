import { normalizeForSearch } from "@/lib/text";

// The words of a piece of text, the way every part of the local AI reads them.
//
// One reading for all of it, so "the same merchant" or "the same word" never
// means one thing to the dictionary and another to whatever learns from the
// history later. Built on the search normalisation, so it agrees with search
// and with the category rules about accents and case.
export function words(text: string): string[] {
  return normalizeForSearch(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
}
