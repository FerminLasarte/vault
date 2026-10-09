import headers from "@/lib/ai/data/csvHeaders.json";
import { words } from "@/lib/ai/tokens";
import {
  columnLabel,
  MAX_HEADER_SEARCH,
  movementType,
  parseFlexibleAmount,
  parseFlexibleDate,
  type AmountLayout,
  type ColumnMapping,
} from "@/lib/importMapping";

// The columns of a statement never seen before, worked out from what its
// header calls them and what they hold, so the first import of a new bank
// arrives already mapped. Only what the evidence settles is guessed; the rest
// is left for the user, as it was before.

// A title line that happens to start with "Fecha" is not the header: the
// header names at least two of the columns.
export const MIN_HEADER_MATCHES = 2;

// How much of a column has to read as what it is said to be. Statements end
// with totals and notes, so not all of it.
export const MIN_CONTENT_SHARE = 0.8;

// The sign of a single amount column is only guessed when this many rows in a
// row move the balance the same way, and none moves it the other.
export const MIN_SIGN_PAIRS = 3;

// The fields a guess can fill.
export type GuessedField =
  | "headerRow"
  | "date"
  | "description"
  | "amountLayout"
  | "amount"
  | "debit"
  | "credit"
  | "type"
  | "negativeIsExpense";

export interface ColumnGuess {
  fields: { [F in GuessedField]?: { value: ColumnMapping[F]; reason: string } };
}

type HeaderField = keyof typeof headers;

// Longest first, so "importe debito" is a debit before "importe" makes it an
// amount.
const SYNONYMS = Object.entries(headers)
  .flatMap(([field, names]) =>
    names.map((name) => ({ field: field as HeaderField, name })),
  )
  .sort((a, b) => b.name.length - a.name.length);

// What a header cell calls its column. A header leads with the noun — "Fecha de
// operación", "Importe en pesos" — so a name has to open the cell.
function headerField(cell: string): HeaderField | null {
  const text = words(cell).join(" ");
  if (text === "") return null;
  return (
    SYNONYMS.find(({ name }) => text === name || text.startsWith(`${name} `))?.field ??
    null
  );
}

type CellKind = "date" | "amount" | "text" | "other";

// Currency marks a bank writes next to an amount, which are letters but do not
// make it text.
const CURRENCY_MARKS = /u\$s|us\$|usd|ars/gi;

function cellKind(cell: string): CellKind | null {
  const value = cell.trim();
  if (value === "") return null;
  if (parseFlexibleDate(value) !== null) return "date";
  const letters = /\p{L}/u;
  if (
    !letters.test(value.replace(CURRENCY_MARKS, "")) &&
    parseFlexibleAmount(value) !== null
  )
    return "amount";
  return letters.test(value) ? "text" : "other";
}

interface Column {
  index: number;
  label: string;
  named: HeaderField | null;
  // Non-empty cells, and how many of them read as each kind.
  filled: number;
  kinds: Record<CellKind, number>;
  textLength: number;
}

function readColumns(header: readonly string[], data: readonly string[][]): Column[] {
  const width = Math.max(header.length, ...data.map((row) => row.length));
  return Array.from({ length: width }, (_, index) => {
    const column: Column = {
      index,
      label: columnLabel(header[index] ?? "", index),
      named: headerField(header[index] ?? ""),
      filled: 0,
      kinds: { date: 0, amount: 0, text: 0, other: 0 },
      textLength: 0,
    };
    for (const row of data) {
      const kind = cellKind(row[index] ?? "");
      if (kind === null) continue;
      column.filled += 1;
      column.kinds[kind] += 1;
      if (kind === "text") column.textLength += row[index].trim().length;
    }
    return column;
  });
}

const KIND_NOUNS: Record<"date" | "amount" | "text", string> = {
  date: "fechas",
  amount: "importes",
  text: "texto",
};

function fits(column: Column, kind: "date" | "amount" | "text"): boolean {
  return column.filled > 0 && column.kinds[kind] / column.filled >= MIN_CONTENT_SHARE;
}

// Filled in on most rows: the column of a movement's date or amount, not one
// used now and then.
function dense(column: Column, rows: number): boolean {
  return rows > 0 && column.filled / rows >= MIN_CONTENT_SHARE;
}

function namedReason(column: Column, kind: "date" | "amount" | "text"): string {
  return `La columna se llama «${column.label}» y ${column.kinds[kind]} de sus ${column.filled} valores son ${KIND_NOUNS[kind]}.`;
}

function quoted(labels: string[]): string {
  const marked = labels.map((label) => `«${label}»`);
  return marked.length === 1
    ? marked[0]
    : `${marked.slice(0, -1).join(", ")} y ${marked[marked.length - 1]}`;
}

// The header row: the one naming the most columns, or else the row above the
// first that reads like a movement.
function findHeaderRow(
  rows: readonly (readonly string[])[],
): { value: number; reason: string } | null {
  const limit = Math.min(rows.length, MAX_HEADER_SEARCH);

  let best: { index: number; named: string[] } | null = null;
  for (let index = 0; index < limit; index++) {
    const named = rows[index].filter((cell) => headerField(cell) !== null);
    if (named.length >= MIN_HEADER_MATCHES && named.length > (best?.named.length ?? 0)) {
      best = { index, named };
    }
  }
  if (best !== null) {
    return {
      value: best.index,
      reason: `La fila ${best.index + 1} nombra las columnas: ${quoted(best.named.map((cell) => cell.trim()))}.`,
    };
  }

  for (let index = 1; index < limit; index++) {
    const kinds = rows[index].map(cellKind);
    if (kinds.includes("date") && kinds.includes("amount")) {
      return {
        value: index - 1,
        reason: `Los movimientos empiezan en la fila ${index + 1}.`,
      };
    }
  }
  return null;
}

// Whether a positive amount raises the balance, read from consecutive rows:
// in a statement listed oldest first each balance is the one before plus the
// amount, and newest first the other way round.
function signFromBalance(
  data: readonly string[][],
  date: number,
  amount: number,
  balance: number,
): { value: boolean; reason: string } | null {
  const lines = data
    .map((row) => ({
      date: parseFlexibleDate(row[date] ?? ""),
      amount: parseFlexibleAmount(row[amount] ?? ""),
      balance: parseFlexibleAmount(row[balance] ?? ""),
    }))
    .filter(
      (line): line is { date: string; amount: number; balance: number } =>
        line.date !== null && line.amount !== null && line.balance !== null,
    );
  if (lines.length < 2) return null;

  const first = lines[0].date;
  const last = lines[lines.length - 1].date;
  if (first === last) return null;
  const oldestFirst = first < last;

  let raises = 0;
  let lowers = 0;
  for (let index = 1; index < lines.length; index++) {
    const change = lines[index].balance - lines[index - 1].balance;
    const amountMoved = oldestFirst ? lines[index].amount : -lines[index - 1].amount;
    if (Math.abs(change - amountMoved) < 0.005) raises += 1;
    else if (Math.abs(change + amountMoved) < 0.005) lowers += 1;
  }

  const agreeing = Math.max(raises, lowers);
  if (agreeing < MIN_SIGN_PAIRS || Math.min(raises, lowers) > 0) return null;
  return {
    value: raises > 0,
    reason: `En ${agreeing} de ${lines.length - 1} filas seguidas, el saldo ${raises > 0 ? "sube" : "baja"} con los importes positivos.`,
  };
}

export function guessColumns(rows: readonly (readonly string[])[]): ColumnGuess | null {
  const headerRow = findHeaderRow(rows);
  if (headerRow === null) return null;

  const data = rows
    .slice(headerRow.value + 1)
    .filter((row) => row.some((cell) => cell.trim() !== "")) as string[][];
  const columns = readColumns(rows[headerRow.value], data);
  const taken = new Set<number>();
  const fields: ColumnGuess["fields"] = { headerRow };

  // The leftmost free column the header names for this field, as long as its
  // contents agree.
  function pick(
    field: HeaderField,
    kind: "date" | "amount" | "text",
    needsDensity: boolean,
  ): Column | null {
    const candidates = columns.filter(
      (column) =>
        !taken.has(column.index) &&
        fits(column, kind) &&
        (!needsDensity || dense(column, data.length)),
    );
    return candidates.find((column) => column.named === field) ?? null;
  }

  const date =
    pick("date", "date", true) ??
    columns.find(
      (column) =>
        column.named === null && fits(column, "date") && dense(column, data.length),
    ) ??
    null;
  if (date !== null) {
    taken.add(date.index);
    fields.date = {
      value: date.index,
      reason:
        date.named === null
          ? `${date.kinds.date} de los ${date.filled} valores de «${date.label}» son fechas.`
          : namedReason(date, "date"),
    };
  }

  // Never mistaken for the amount, whatever it holds.
  const balance = columns.find((column) => column.named === "balance") ?? null;
  if (balance !== null) taken.add(balance.index);

  // The column that says «Gasto» or «Ingreso» on every row: the one named for
  // it, or else an unnamed one. Taken whatever the layout turns out to be, so
  // it never passes for the description.
  const typeColumns = columns
    .filter(
      (column) =>
        !taken.has(column.index) &&
        (column.named === "type" || column.named === null) &&
        dense(column, data.length),
    )
    .map((column) => ({
      column,
      read: data.filter((row) => movementType(row[column.index] ?? "") !== null).length,
    }))
    .filter(({ column, read }) => read / column.filled >= MIN_CONTENT_SHARE);
  const type =
    typeColumns.find(({ column }) => column.named === "type") ?? typeColumns[0] ?? null;
  if (type !== null) taken.add(type.column.index);

  const debit = pick("debit", "amount", false);
  const credit = pick("credit", "amount", false);
  const namedAmount =
    debit !== null && credit !== null ? null : pick("amount", "amount", true);
  if (debit !== null && credit !== null) {
    taken.add(debit.index).add(credit.index);
    fields.amountLayout = {
      value: "debit-credit" as AmountLayout,
      reason: `Hay una columna de débitos («${debit.label}») y otra de créditos («${credit.label}»).`,
    };
    fields.debit = { value: debit.index, reason: namedReason(debit, "amount") };
    fields.credit = { value: credit.index, reason: namedReason(credit, "amount") };
  } else {
    const unnamed = columns.filter(
      (column) =>
        !taken.has(column.index) &&
        column.named === null &&
        fits(column, "amount") &&
        dense(column, data.length),
    );
    const amount = namedAmount ?? (unnamed.length === 1 ? unnamed[0] : null);
    if (amount !== null) {
      taken.add(amount.index);
      fields.amountLayout =
        type === null
          ? {
              value: "single" as AmountLayout,
              reason: `Hay una sola columna de importes («${amount.label}»).`,
            }
          : {
              value: "amount-type" as AmountLayout,
              reason: `«${type.column.label}» dice si cada fila es gasto o ingreso.`,
            };
      fields.amount = {
        value: amount.index,
        reason:
          amount === namedAmount
            ? namedReason(amount, "amount")
            : `«${amount.label}» es la única columna con importes: ${amount.kinds.amount} de sus ${amount.filled} valores.`,
      };
      if (type !== null) {
        const { column, read } = type;
        fields.type = {
          value: column.index,
          reason:
            column.named === null
              ? `${read} de los ${column.filled} valores de «${column.label}» dicen gasto o ingreso.`
              : `La columna se llama «${column.label}» y ${read} de sus ${column.filled} valores dicen gasto o ingreso.`,
        };
      } else if (date !== null && balance !== null) {
        const sign = signFromBalance(data, date.index, amount.index, balance.index);
        if (sign !== null) fields.negativeIsExpense = sign;
      }
    }
  }

  // The description is the text: the column named for it, or else the one
  // with the most to say.
  const description =
    pick("description", "text", true) ??
    columns
      .filter(
        (column) =>
          !taken.has(column.index) &&
          column.named === null &&
          fits(column, "text") &&
          dense(column, data.length),
      )
      .sort((a, b) => b.textLength / b.filled - a.textLength / a.filled)[0] ??
    null;
  if (description !== null) {
    fields.description = {
      value: description.index,
      reason:
        description.named === null
          ? `«${description.label}» es la columna con el texto más largo.`
          : namedReason(description, "text"),
    };
  }

  // A header row alone, with no column worked out under it, is no guess.
  return Object.keys(fields).length > 1 ? { fields } : null;
}

// The mapping with every guessed field filled in.
export function applyGuess(
  mapping: ColumnMapping,
  guess: ColumnGuess | null,
): ColumnMapping {
  if (guess === null) return mapping;
  const values = Object.fromEntries(
    Object.entries(guess.fields).map(([field, { value }]) => [field, value]),
  );
  return { ...mapping, ...values };
}

// Why a field holds what it holds, while it still holds what was guessed: the
// mark goes away as soon as the user picks something else.
export function guessReason(
  guess: ColumnGuess | null,
  mapping: ColumnMapping,
  field: GuessedField,
): string | null {
  const guessed = guess?.fields[field];
  return guessed !== undefined && mapping[field] === guessed.value
    ? guessed.reason
    : null;
}
