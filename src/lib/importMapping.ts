import { matchCategoryIdForType } from "@/lib/categoryRules";
import { normalizeForSearch as normalize } from "@/lib/text";
import type { ImportContext, ImportPlan, ImportSkip } from "@/lib/csv";
import type { NewTransaction } from "@/db/schema";

// How the amount is laid out in the file.
//
// Bank statements do it both ways, and neither is a variation of the other: one
// column with a sign, or two columns where the one that is filled in decides
// whether money came in or went out.
export type AmountLayout = "single" | "debit-credit";

export interface ColumnMapping {
  // Index of the header row, and where the data starts. Statements often carry
  // a title and an account summary above the actual table.
  headerRow: number;
  date: number;
  description: number;
  amountLayout: AmountLayout;
  // Used when the layout is "single".
  amount: number | null;
  // Used when the layout is "debit-credit".
  debit: number | null;
  credit: number | null;
  // Statements are almost always in one currency, so it is chosen rather than
  // read from a column.
  currency: string;
  paymentMethodId: number | null;
  // With one signed column: whether a negative number means an expense. Some
  // banks sign it the other way round, listing what left the account as
  // positive.
  negativeIsExpense: boolean;
}

export const EMPTY_MAPPING: ColumnMapping = {
  headerRow: 0,
  date: -1,
  description: -1,
  amountLayout: "single",
  amount: null,
  debit: null,
  credit: null,
  currency: "ARS",
  paymentMethodId: null,
  negativeIsExpense: true,
};

// Reads a date the way a statement writes one.
//
// Day-first is assumed for the slash and dash forms, because that is what every
// Argentine bank produces. The ISO form is recognised by its shape — a
// four-digit year can only be leading — so a file that already uses it is not
// mangled into an impossible date.
export function parseFlexibleDate(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(value);
  if (dayFirst) {
    const year = Number(dayFirst[3]);
    // A two-digit year is this century: statements are not from the 1900s.
    return toIso(
      year < 100 ? 2000 + year : year,
      Number(dayFirst[2]),
      Number(dayFirst[1]),
    );
  }

  return null;
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Round-tripping through Date catches the 31st of February, which passes the
  // range check above but is not a day.
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Reads an amount the way a statement writes one.
//
// The hard part is that "1.234,56" and "1,234.56" are the same number written
// by different conventions, and which is which cannot be decided per-character:
// it depends on which separator appears last.
export function parseFlexibleAmount(raw: string): number | null {
  let value = raw.trim();
  if (value === "") return null;

  // Accounting notation: (1.234,56) means negative.
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }

  value = value.replace(/[^\d,.+-]/g, "");
  if (value.startsWith("-")) negative = true;
  value = value.replace(/[+-]/g, "");
  if (value === "") return null;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: whichever comes last is the decimal separator.
    const decimalAt = Math.max(lastComma, lastDot);
    const whole = value.slice(0, decimalAt).replace(/[.,]/g, "");
    value = `${whole}.${value.slice(decimalAt + 1)}`;
  } else if (lastComma !== -1) {
    // A lone comma is a decimal separator unless it groups thousands, which is
    // only plausible when exactly three digits follow it.
    const after = value.length - lastComma - 1;
    value = after === 3 ? value.replace(/,/g, "") : value.replace(",", ".");
  } else if (lastDot !== -1) {
    const after = value.length - lastDot - 1;
    if (after === 3 && value.split(".").length > 2) value = value.replace(/\./g, "");
    else if (after === 3 && /^\d{1,3}\.\d{3}$/.test(value))
      value = value.replace(".", "");
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return negative ? -parsed : parsed;
}

// Reads the amount out of a row, honouring the layout, and reports which
// direction the money moved.
function readAmount(
  row: string[],
  mapping: ColumnMapping,
): { amount: number; type: "income" | "expense" } | null {
  if (mapping.amountLayout === "debit-credit") {
    const debit =
      mapping.debit === null ? null : parseFlexibleAmount(row[mapping.debit] ?? "");
    const credit =
      mapping.credit === null ? null : parseFlexibleAmount(row[mapping.credit] ?? "");

    // Statements put a zero in the column that does not apply as often as they
    // leave it blank, so an explicit zero counts as "not this one".
    if (credit !== null && credit !== 0) {
      return { amount: Math.abs(credit), type: "income" };
    }
    if (debit !== null && debit !== 0) {
      return { amount: Math.abs(debit), type: "expense" };
    }
    return null;
  }

  if (mapping.amount === null) return null;
  const value = parseFlexibleAmount(row[mapping.amount] ?? "");
  if (value === null || value === 0) return null;

  const isExpense = mapping.negativeIsExpense ? value < 0 : value > 0;
  return { amount: Math.abs(value), type: isExpense ? "expense" : "income" };
}

// Same identity the fixed-format importer uses, so a statement row and a row
// exported by the app collide when they describe the same movement.
function duplicateKey(transaction: NewTransaction): string {
  return [
    transaction.date,
    transaction.type,
    transaction.amount,
    transaction.currency,
    normalize(transaction.description),
  ].join("|");
}

export function isMappingComplete(mapping: ColumnMapping): boolean {
  if (mapping.date < 0 || mapping.description < 0) return false;
  if (mapping.amountLayout === "single") return mapping.amount !== null;
  return mapping.debit !== null || mapping.credit !== null;
}

// Turns the rows of a bank statement into transactions, using the columns the
// user pointed at.
//
// Reuses the category rules and the duplicate detection that the app's own CSV
// import already relies on, so a statement lands classified the same way a
// hand-made file would.
export function buildMappedImportPlan(
  rows: string[][],
  mapping: ColumnMapping,
  context: ImportContext,
): ImportPlan {
  const ready: ImportPlan["ready"] = [];
  const skipped: ImportSkip[] = [];
  let duplicates = 0;

  // How many of each movement the app already holds. A row is skipped only
  // while the file has not yet brought more of it than that: re-importing an
  // overlapping statement skips what came in last time, but two identical
  // fares on the same day are two fares.
  const alreadyHeld = new Map<string, number>();
  for (const transaction of context.existing) {
    const key = [
      transaction.date,
      transaction.type,
      transaction.amount,
      transaction.currency,
      normalize(transaction.description),
    ].join("|");
    alreadyHeld.set(key, (alreadyHeld.get(key) ?? 0) + 1);
  }

  for (let index = mapping.headerRow + 1; index < rows.length; index++) {
    const row = rows[index];
    // Statements are full of blank spacer rows and totals lines; a row with
    // nothing in it is not an error worth reporting.
    if (row.every((cell) => cell.trim() === "")) continue;

    const line = index + 1;

    const date = parseFlexibleDate(row[mapping.date] ?? "");
    if (date === null) {
      skipped.push({ line, reason: `Fecha ilegible: «${row[mapping.date] ?? ""}»` });
      continue;
    }

    const description = (row[mapping.description] ?? "").trim();
    if (description === "") {
      skipped.push({ line, reason: "Sin descripción" });
      continue;
    }

    const money = readAmount(row, mapping);
    if (money === null) {
      skipped.push({ line, reason: "Sin importe" });
      continue;
    }

    const transaction: NewTransaction = {
      amount: money.amount,
      type: money.type,
      currency: mapping.currency,
      categoryId: matchCategoryIdForType(
        description,
        context.categoryRules ?? [],
        context.categories,
        money.type,
      ),
      paymentMethodId: mapping.paymentMethodId,
      destinationPaymentMethodId: null,
      destinationAmount: null,
      description,
      date,
    };

    const key = duplicateKey(transaction);
    const held = alreadyHeld.get(key) ?? 0;
    if (held > 0) {
      alreadyHeld.set(key, held - 1);
      duplicates++;
      continue;
    }

    ready.push({ transaction, tags: [] });
  }

  return { ready, skipped, duplicates };
}
