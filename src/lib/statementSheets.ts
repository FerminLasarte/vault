import { MAX_HEADER_SEARCH } from "@/lib/importMapping";
import { statementSignature } from "@/lib/importProfiles";

// The sheets of a spreadsheet, and the table one import reads out of them: one
// sheet, or all of them together when they share a header — a year kept as a
// sheet per month.

export interface StatementSheet {
  name: string;
  rows: string[][];
}

// One sheet by its position, or all of them together.
export type SheetChoice = number | "all";

// Where a row of a combined table came from, its row numbered as in Excel.
export interface RowOrigin {
  sheet: string;
  row: number;
}

export interface SheetTable {
  rows: string[][];
  // Null for a single sheet, whose rows are where they are in it.
  origins: RowOrigin[] | null;
}

// A row as statementSignature reads it, with the empty cells after the last
// column dropped: a sheet with a note further right is read wider than the
// others, and its header is still the same.
function signature(row: readonly string[]): string {
  let end = row.length;
  while (end > 0 && row[end - 1].trim() === "") end--;
  return statementSignature(row.slice(0, end));
}

// Where each sheet has the header the first one has at `headerRow`, looked for
// in its first rows as a remembered profile is; null when any sheet lacks it,
// or there is only one sheet and nothing to combine.
export function sharedHeader(
  sheets: readonly StatementSheet[],
  headerRow: number,
): number[] | null {
  if (sheets.length < 2) return null;
  const header = sheets[0].rows[headerRow];
  if (header === undefined || header.every((cell) => cell.trim() === "")) return null;

  const wanted = signature(header);
  const positions = [headerRow];
  for (const sheet of sheets.slice(1)) {
    const position = sheet.rows
      .slice(0, MAX_HEADER_SEARCH)
      .findIndex((row) => signature(row) === wanted);
    if (position === -1) return null;
    positions.push(position);
  }
  return positions;
}

// Every sheet as one table: the first whole, so the header row a mapping points
// at stays where it is, then each other sheet's rows below its own header.
export function combineSheets(
  sheets: readonly StatementSheet[],
  headers: readonly number[],
): SheetTable {
  const rows: string[][] = [];
  const origins: RowOrigin[] = [];
  sheets.forEach((sheet, index) => {
    const start = index === 0 ? 0 : headers[index] + 1;
    sheet.rows.slice(start).forEach((row, offset) => {
      rows.push(row);
      origins.push({ sheet: sheet.name, row: start + offset + 1 });
    });
  });
  return { rows, origins };
}

// The table an import reads for the sheet chosen; all of them only when they
// share a header, else the first.
export function sheetTable(
  sheets: readonly StatementSheet[],
  choice: SheetChoice,
  shared: readonly number[] | null,
): SheetTable {
  if (choice === "all") {
    return shared === null
      ? { rows: sheets[0].rows, origins: null }
      : combineSheets(sheets, shared);
  }
  return { rows: sheets[choice].rows, origins: null };
}

// The rows of the table's first sheet, where its header is: the rows the
// header can be picked from and the preview shows, numbered as in that sheet.
export function firstSheetRows(table: SheetTable): string[][] {
  if (table.origins === null) return table.rows;
  const first = table.origins[0]?.sheet;
  const end = table.origins.findIndex((origin) => origin.sheet !== first);
  return end === -1 ? table.rows : table.rows.slice(0, end);
}

// How a row is named to the user, so a row left out can be found in the file:
// «Octubre, fila 5» in a combined table, «Fila 5» in a single sheet. `line` is
// the row's 1-based place in the table.
export function rowLabel(line: number, origins: readonly RowOrigin[] | null): string {
  const origin = origins?.[line - 1];
  return origin === undefined ? `Fila ${line}` : `${origin.sheet}, fila ${origin.row}`;
}
