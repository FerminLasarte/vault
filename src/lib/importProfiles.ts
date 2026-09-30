import { EMPTY_MAPPING, withFittingAccount } from "@/lib/importMapping";
import { CURRENCY_CODES } from "@/lib/currency";
import type { ColumnMapping } from "@/lib/importMapping";
import type { PaymentMethod } from "@/db/schema";

// A bank's export has the same header row every month, so the header itself
// identifies the format well enough to recognise it again — no naming, no
// choosing from a list, nothing for the user to maintain.
export function statementSignature(headerRow: readonly string[]): string {
  return headerRow
    .map((cell) => cell.trim().toLowerCase())
    .join("|")
    .slice(0, 300);
}

export type ImportProfiles = Record<string, ColumnMapping>;

// Stored as JSON in one setting. A malformed or hand-edited value is treated as
// "no profiles" rather than as an error: the cost is re-doing a mapping, which
// is not worth failing an import over.
export function parseProfiles(stored: string | null): ImportProfiles {
  if (stored === null) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ImportProfiles;
  } catch {
    return {};
  }
}

// Keeps the store from growing without bound on someone who imports from many
// sources. The most recent are the ones worth remembering.
const MAX_PROFILES = 20;

export function rememberProfile(
  profiles: ImportProfiles,
  signature: string,
  mapping: ColumnMapping,
): ImportProfiles {
  const entries = Object.entries(profiles).filter(([key]) => key !== signature);
  const kept = entries.slice(-(MAX_PROFILES - 1));
  return Object.fromEntries([...kept, [signature, mapping]]);
}

// How far down to look for a header row that has been seen before. Statements
// put a title and an account summary above the table, never more than a few
// lines of it.
const MAX_HEADER_SEARCH = 10;

export interface FoundProfile {
  mapping: ColumnMapping;
  headerRow: number;
}

// Finds a remembered mapping for this file.
//
// Which row holds the headers is exactly what the mapping records, so it cannot
// be known before the profile is found — the first rows have to be tried in
// turn. Getting this wrong is silent: the mapping simply never matches and the
// user re-does work they already did.
export function findProfile(
  profiles: ImportProfiles,
  rows: readonly (readonly string[])[],
): FoundProfile | null {
  const limit = Math.min(rows.length, MAX_HEADER_SEARCH);

  for (let index = 0; index < limit; index++) {
    const mapping = profiles[statementSignature(rows[index])];
    // The stored headerRow is authoritative: the same header text could in
    // principle appear at a different offset in a later export.
    if (mapping !== undefined) return { mapping, headerRow: index };
  }

  return null;
}

// The mapping a statement opens with: one worked out before for this bank's
// format, so the second import of the same export is one click, or an empty
// one to fill in.
//
// A remembered account is checked against the accounts as they are now; one
// deleted or moved to another currency since would otherwise be written to.
export function startingMapping(
  profiles: ImportProfiles,
  rows: readonly (readonly string[])[],
  accounts: readonly PaymentMethod[],
): ColumnMapping {
  const found = findProfile(profiles, rows);
  if (found === null) return { ...EMPTY_MAPPING, currency: CURRENCY_CODES[0] };
  return withFittingAccount({ ...found.mapping, headerRow: found.headerRow }, accounts);
}
