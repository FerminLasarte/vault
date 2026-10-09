import { describe, expect, it } from "vitest";
import { MAX_HEADER_SEARCH } from "@/lib/importMapping";
import {
  combineSheets,
  firstSheetRows,
  rowLabel,
  sharedHeader,
  sheetTable,
  type StatementSheet,
} from "./statementSheets";

const HEADER = ["Fecha", "Concepto", "Monto"];

function sheet(name: string, ...rows: string[][]): StatementSheet {
  return { name, rows };
}

const AGOSTO = sheet("Agosto", ["Gastos de agosto", "", ""], HEADER, [
  "01/08/2026",
  "Sueldo",
  "1000",
]);
const SEPTIEMBRE = sheet("Septiembre", HEADER, ["01/09/2026", "Sueldo", "1000"]);
const OCTUBRE = sheet(
  "Octubre",
  ["Octubre", "", ""],
  ["", "", ""],
  HEADER,
  ["01/10/2026", "Sueldo", "1000"],
  ["02/10/2026", "Alquiler", "-500"],
);

describe("sharedHeader", () => {
  it("finds the first sheet's header in every sheet, wherever it sits", () => {
    expect(sharedHeader([AGOSTO, SEPTIEMBRE, OCTUBRE], 1)).toEqual([1, 0, 2]);
  });

  // The way it is compared to a remembered profile: a bank varies the casing
  // and the padding between exports, and a person between sheets.
  it("does not mind casing, padding or empty cells after the last column", () => {
    const loose = sheet("Septiembre", [" fecha", "CONCEPTO ", "Monto", "", ""]);

    expect(sharedHeader([SEPTIEMBRE, loose], 0)).toEqual([0, 0]);
  });

  it("is null when a sheet does not have it", () => {
    const other = sheet("Resumen", ["Mes", "Total"], ["Agosto", "1000"]);

    expect(sharedHeader([AGOSTO, other], 1)).toBeNull();
  });

  it(`looks for it in the first ${MAX_HEADER_SEARCH} rows only`, () => {
    const deep = sheet(
      "Septiembre",
      ...Array.from({ length: MAX_HEADER_SEARCH }, () => ["", "", ""]),
      HEADER,
    );

    expect(sharedHeader([SEPTIEMBRE, deep], 0)).toBeNull();
  });

  it("is null with one sheet, or with no header to share", () => {
    expect(sharedHeader([SEPTIEMBRE], 0)).toBeNull();
    expect(sharedHeader([OCTUBRE, OCTUBRE], 1)).toBeNull();
  });
});

describe("combineSheets", () => {
  const combined = combineSheets([AGOSTO, SEPTIEMBRE, OCTUBRE], [1, 0, 2]);

  // Whole, so the header row the mapping points at is still where it was.
  it("keeps the first sheet whole, then each other sheet below its header", () => {
    expect(combined.rows).toEqual([
      ["Gastos de agosto", "", ""],
      HEADER,
      ["01/08/2026", "Sueldo", "1000"],
      ["01/09/2026", "Sueldo", "1000"],
      ["01/10/2026", "Sueldo", "1000"],
      ["02/10/2026", "Alquiler", "-500"],
    ]);
  });

  it("knows which sheet and row each row came from", () => {
    expect(combined.origins).toEqual([
      { sheet: "Agosto", row: 1 },
      { sheet: "Agosto", row: 2 },
      { sheet: "Agosto", row: 3 },
      { sheet: "Septiembre", row: 2 },
      { sheet: "Octubre", row: 4 },
      { sheet: "Octubre", row: 5 },
    ]);
  });
});

describe("sheetTable", () => {
  const sheets = [AGOSTO, SEPTIEMBRE, OCTUBRE];

  it("is one sheet as it is", () => {
    expect(sheetTable(sheets, 1, [1, 0, 2])).toEqual({
      rows: SEPTIEMBRE.rows,
      origins: null,
    });
  });

  it("is every sheet together when they share a header", () => {
    expect(sheetTable(sheets, "all", [1, 0, 2])).toEqual(
      combineSheets(sheets, [1, 0, 2]),
    );
  });

  it("is the first sheet when asked for all of them without a shared header", () => {
    expect(sheetTable(sheets, "all", null)).toEqual({
      rows: AGOSTO.rows,
      origins: null,
    });
  });
});

// Where the header is looked for and shown: a row of another sheet below it
// would be numbered as if it were the first sheet's, and could be picked as
// the header.
describe("firstSheetRows", () => {
  it("is the first sheet of a combined table", () => {
    expect(
      firstSheetRows(combineSheets([AGOSTO, SEPTIEMBRE, OCTUBRE], [1, 0, 2])),
    ).toEqual(AGOSTO.rows);
  });

  it("is the whole table of a single sheet", () => {
    expect(firstSheetRows({ rows: OCTUBRE.rows, origins: null })).toEqual(OCTUBRE.rows);
  });
});

describe("rowLabel", () => {
  it("names the sheet of a row in a combined file", () => {
    const { origins } = combineSheets([AGOSTO, SEPTIEMBRE, OCTUBRE], [1, 0, 2]);

    expect(rowLabel(5, origins)).toBe("Octubre, fila 4");
  });

  it("is the row alone otherwise", () => {
    expect(rowLabel(5, null)).toBe("Fila 5");
  });
});
