import path from "node:path";
import readXlsxFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import type { ImportContext } from "@/lib/csv";
import { spreadsheetSheets } from "@/lib/files";
import { buildMappedImportPlan, isMappingComplete } from "@/lib/importMapping";
import { startingMapping } from "@/lib/importProfiles";
import {
  rowLabel,
  sharedHeader,
  sheetTable,
  type SheetChoice,
} from "@/lib/statementSheets";

// The spreadsheets people keep by hand, read the way the app reads them and
// imported with nothing but the starting mapping: no profile, no clicks.

const CONTEXT: ImportContext = {
  categories: [],
  categoryRules: [],
  accounts: [],
  existing: [],
  supportedCurrencies: ["ARS", "USD"],
};

async function readSpreadsheet(fileName: string) {
  const file = path.join(import.meta.dirname, "testing", "spreadsheets", fileName);
  const sheets = spreadsheetSheets(await readXlsxFile(file));
  const first = startingMapping({}, sheets[0].rows, [], true);
  return { sheets, shared: sharedHeader(sheets, first.mapping.headerRow) };
}

async function importSpreadsheet(fileName: string, sheet: SheetChoice = 0) {
  const { sheets, shared } = await readSpreadsheet(fileName);
  const { rows, origins } = sheetTable(sheets, sheet, shared);
  const { mapping } = startingMapping({}, rows, [], true);
  expect(isMappingComplete(mapping)).toBe(true);

  const plan = buildMappedImportPlan(rows, mapping, CONTEXT);
  return {
    skipped: plan.skipped.map(({ line, reason }) => ({
      row: rowLabel(line, origins),
      reason,
    })),
    movements: plan.ready.map(({ transaction }) => ({
      date: transaction.date,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
    })),
  };
}

describe("a personal spreadsheet", () => {
  it("with a title above a signed amount typed as text", async () => {
    expect(await importSpreadsheet("title-and-signed-amount.xlsx")).toEqual({
      skipped: [],
      movements: [
        { date: "2026-10-01", type: "income", amount: 1250000, description: "Sueldo" },
        { date: "2026-10-02", type: "expense", amount: 420000, description: "Alquiler" },
        {
          date: "2026-10-03",
          type: "expense",
          amount: 58340.5,
          description: "Supermercado Coto",
        },
        { date: "2026-10-05", type: "expense", amount: 9999, description: "Netflix" },
        { date: "2026-10-08", type: "expense", amount: 23450, description: "Farmacia" },
      ],
    });
  });

  it("with an income column and an expense column", async () => {
    expect(await importSpreadsheet("income-expense-columns.xlsx")).toEqual({
      skipped: [],
      movements: [
        { date: "2026-10-01", type: "income", amount: 1250000, description: "Sueldo" },
        { date: "2026-10-02", type: "expense", amount: 420000, description: "Alquiler" },
        {
          date: "2026-10-03",
          type: "expense",
          amount: 58340.5,
          description: "Supermercado Coto",
        },
        { date: "2026-10-05", type: "expense", amount: 9999, description: "Netflix" },
        {
          date: "2026-10-07",
          type: "income",
          amount: 300000,
          description: "Freelance web",
        },
        { date: "2026-10-08", type: "expense", amount: 23450, description: "Farmacia" },
      ],
    });
  });

  // Every amount positive; the Tipo column says which way it went, and the
  // totals row at the bottom has no date.
  it("with a positive amount and a type column", async () => {
    expect(await importSpreadsheet("amount-and-type.xlsx")).toEqual({
      skipped: [{ row: "Fila 9", reason: "Fecha ilegible: «»" }],
      movements: [
        { date: "2026-10-01", type: "income", amount: 1250000, description: "Sueldo" },
        { date: "2026-10-02", type: "expense", amount: 420000, description: "Alquiler" },
        {
          date: "2026-10-03",
          type: "expense",
          amount: 58340.5,
          description: "Supermercado Coto",
        },
        { date: "2026-10-05", type: "expense", amount: 9999, description: "Netflix" },
        { date: "2026-10-06", type: "expense", amount: 15000, description: "SUBE" },
        {
          date: "2026-10-07",
          type: "income",
          amount: 300000,
          description: "Freelance web",
        },
        { date: "2026-10-08", type: "expense", amount: 23450, description: "Farmacia" },
      ],
    });
  });

  describe("with a sheet per month", () => {
    function month(number: string) {
      return [
        {
          date: `2026-${number}-01`,
          type: "income",
          amount: 1250000,
          description: "Sueldo",
        },
        {
          date: `2026-${number}-02`,
          type: "expense",
          amount: 420000,
          description: "Alquiler",
        },
        {
          date: `2026-${number}-04`,
          type: "expense",
          amount: 61000,
          description: "Supermercado",
        },
      ];
    }

    it("shares one header across the sheets", async () => {
      const { sheets, shared } = await readSpreadsheet("sheet-per-month.xlsx");

      expect(sheets.map((sheet) => sheet.name)).toEqual([
        "Agosto",
        "Septiembre",
        "Octubre",
      ]);
      expect(shared).toEqual([0, 0, 0]);
    });

    it("imports the whole year at once", async () => {
      expect(await importSpreadsheet("sheet-per-month.xlsx", "all")).toEqual({
        skipped: [],
        movements: [...month("08"), ...month("09"), ...month("10")],
      });
    });

    it("imports a single month", async () => {
      expect(await importSpreadsheet("sheet-per-month.xlsx", 1)).toEqual({
        skipped: [],
        movements: month("09"),
      });
    });
  });
});
