import { describe, expect, it } from "vitest";
import headers from "./data/csvHeaders.json";
import {
  applyGuess,
  guessColumns,
  guessReason,
  MIN_CONTENT_SHARE,
  MIN_HEADER_MATCHES,
  MIN_SIGN_PAIRS,
} from "./columnGuess";
import { words } from "./tokens";
import { ARGENTINE_STATEMENT, rowsOf } from "./testing/statements";
import { EMPTY_MAPPING } from "@/lib/importMapping";

// A statement as a list of rows, the header first.
function statement(header: string[], ...rows: string[][]): string[][] {
  return [header, ...rows];
}

describe("the bank header synonyms", () => {
  const synonyms = Object.values(headers).flat();

  it("name exactly the columns a mapping points at, and the balance", () => {
    expect(Object.keys(headers).sort()).toEqual(
      ["amount", "balance", "credit", "date", "debit", "description", "type"].sort(),
    );
  });

  // A synonym is compared against the words of a header cell, so one written
  // any other way — an accent, a capital, a dot — could never match.
  it("are written the way headers are read", () => {
    for (const synonym of synonyms) expect(words(synonym).join(" ")).toBe(synonym);
  });

  // The same name under two columns would make the guess depend on the order
  // of the file.
  it("give every name to one column only", () => {
    expect(new Set(synonyms).size).toBe(synonyms.length);
  });
});

describe("guessColumns", () => {
  it("maps a real Argentine statement, preamble, debit and credit included", () => {
    const guess = guessColumns(rowsOf(ARGENTINE_STATEMENT));

    expect(applyGuess(EMPTY_MAPPING, guess)).toEqual({
      ...EMPTY_MAPPING,
      headerRow: 3,
      date: 0,
      description: 1,
      amountLayout: "debit-credit",
      debit: 2,
      credit: 3,
    });
    expect(guess?.fields.headerRow?.reason).toBe(
      "La fila 4 nombra las columnas: «Fecha», «Concepto», «Débito» y «Crédito».",
    );
    expect(guess?.fields.date?.reason).toBe(
      "La columna se llama «Fecha» y 4 de sus 5 valores son fechas.",
    );
    expect(guess?.fields.amountLayout?.reason).toBe(
      "Hay una columna de débitos («Débito») y otra de créditos («Crédito»).",
    );
  });

  it("maps a single signed column, and leaves the balance out of it", () => {
    const guess = guessColumns(
      statement(
        ["Fecha", "Nro. comprobante", "Descripción", "Importe", "Saldo"],
        ["01/09/2026", "000123", "COTO", "-1.000,00", "9.000,00"],
        ["02/09/2026", "000124", "SUELDO", "50.000,00", "59.000,00"],
      ),
    );

    expect(applyGuess(EMPTY_MAPPING, guess)).toMatchObject({
      headerRow: 0,
      date: 0,
      description: 2,
      amountLayout: "single",
      amount: 3,
    });
  });

  // The layout of a spreadsheet kept by hand, which names what leaves «Gasto».
  it("maps an income column and an expense column", () => {
    const guess = guessColumns(
      statement(
        ["Fecha", "Descripción", "Categoría", "Ingreso", "Gasto"],
        ["2026-10-01", "Sueldo", "Sueldo", "1250000", ""],
        ["2026-10-02", "Alquiler", "Vivienda", "", "420000"],
      ),
    );

    expect(applyGuess(EMPTY_MAPPING, guess)).toMatchObject({
      headerRow: 0,
      date: 0,
      description: 1,
      amountLayout: "debit-credit",
      debit: 4,
      credit: 3,
    });
  });

  describe("an amount and a type column", () => {
    it("maps the layout of a sheet that writes «Gasto» or «Ingreso» on every row", () => {
      const guess = guessColumns(
        statement(
          ["Fecha", "Concepto", "Categoría", "Monto", "Tipo"],
          ["2026-10-01", "Sueldo", "Sueldo", "1250000", "Ingreso"],
          ["2026-10-02", "Alquiler", "Vivienda", "420000", "Gasto"],
          ["2026-10-03", "Supermercado", "Comida", "58340.5", "Gasto"],
          ["2026-10-07", "Freelance", "Extra", "300000", "Ingreso"],
          ["", "Total gastos", "", "478340.5", ""],
        ),
      );

      expect(applyGuess(EMPTY_MAPPING, guess)).toMatchObject({
        headerRow: 0,
        date: 0,
        description: 1,
        amountLayout: "amount-type",
        amount: 3,
        type: 4,
      });
      expect(guess?.fields.amountLayout?.reason).toBe(
        "«Tipo» dice si cada fila es gasto o ingreso.",
      );
      expect(guess?.fields.type?.reason).toBe(
        "La columna se llama «Tipo» y 4 de sus 4 valores dicen gasto o ingreso.",
      );
    });

    // Shorter than «Ingreso», the description would lose to it as the column
    // with the most to say.
    it("finds an unnamed one, and never takes it for the description", () => {
      const guess = guessColumns(
        statement(
          ["A", "B", "C", "D"],
          ["01/09/2026", "Coto", "1.000,00", "Gasto"],
          ["02/09/2026", "Sube", "500,00", "Gasto"],
          ["03/09/2026", "Pago", "50.000,00", "Ingreso"],
        ),
      );

      expect(applyGuess(EMPTY_MAPPING, guess)).toMatchObject({
        description: 1,
        amountLayout: "amount-type",
        amount: 2,
        type: 3,
      });
      expect(guess?.fields.type?.reason).toBe(
        "3 de los 3 valores de «D» dicen gasto o ingreso.",
      );
    });

    it("is not a column called «Tipo» whose cells say something else", () => {
      const guess = guessColumns(
        statement(
          ["Fecha", "Concepto", "Importe", "Tipo"],
          ["01/09/2026", "COTO", "-1.000,00", "Débito automático"],
          ["02/09/2026", "SUELDO", "50.000,00", "Transferencia"],
        ),
      );

      expect(guess?.fields.amountLayout?.value).toBe("single");
      expect(guess?.fields.type).toBeUndefined();
    });
  });

  it("prefers the leftmost of two columns that both name a date", () => {
    const guess = guessColumns(
      statement(
        ["Fecha", "Fecha valor", "Concepto", "Importe"],
        ["01/09/2026", "02/09/2026", "COTO", "-1.000,00"],
      ),
    );

    expect(guess?.fields.date?.value).toBe(0);
  });

  describe("the header row", () => {
    // A title line that happens to start with "Fecha" is not the header.
    it(`needs ${MIN_HEADER_MATCHES} recognised names`, () => {
      const rows = [
        ["Fecha de emisión", "", ""],
        ["Fecha", "Concepto", "Importe"],
        ["01/09/2026", "COTO", "-1.000,00"],
      ];

      expect(guessColumns(rows)?.fields.headerRow?.value).toBe(1);
    });

    it("is the row above the first movement when no header is recognised", () => {
      const guess = guessColumns([
        ["Movimientos del período", "", ""],
        ["Día", "Qué", "Cuánto"],
        ["01/09/2026", "COTO DIGITAL", "-1.000,00"],
        ["02/09/2026", "FARMACITY", "-2.500,00"],
      ]);

      expect(guess?.fields.headerRow).toEqual({
        value: 1,
        reason: "Los movimientos empiezan en la fila 3.",
      });
    });
  });

  describe("from the contents alone", () => {
    const UNNAMED = statement(
      ["A", "B", "C"],
      ["01/09/2026", "COMPRA COTO DIGITAL", "-1.000,00"],
      ["02/09/2026", "FARMACITY", "-2.500,00"],
      ["03/09/2026", "TRANSFERENCIA RECIBIDA", "50.000,00"],
    );

    it("finds the date, the longest text and the only amount", () => {
      expect(applyGuess(EMPTY_MAPPING, guessColumns(UNNAMED))).toMatchObject({
        date: 0,
        description: 1,
        amountLayout: "single",
        amount: 2,
      });
    });

    it("says which column held what", () => {
      const guess = guessColumns(UNNAMED);

      expect(guess?.fields.description?.reason).toBe(
        "«B» es la columna con el texto más largo.",
      );
      expect(guess?.fields.amount?.reason).toBe(
        "«C» es la única columna con importes: 3 de sus 3 valores.",
      );
    });

    it("leaves the amount alone when two unnamed columns hold numbers", () => {
      const guess = guessColumns(
        statement(
          ["A", "B", "C", "D"],
          ["01/09/2026", "COTO", "-1.000,00", "9.000,00"],
          ["02/09/2026", "FARMACITY", "-2.500,00", "6.500,00"],
        ),
      );

      expect(guess?.fields.amount).toBeUndefined();
      expect(guess?.fields.amountLayout).toBeUndefined();
    });
  });

  // Statements end with totals and notes, so a column only has to read mostly
  // as what it is called.
  describe(`needs ${MIN_CONTENT_SHARE * 100}% of a column to read as what it is`, () => {
    function withDates(dates: string[]) {
      return statement(
        ["Fecha", "Concepto", "Importe"],
        ...dates.map((date, index) => [date, `COMPRA ${index}`, "-1.000,00"]),
      );
    }

    it("takes a column at exactly that share", () => {
      const rows = withDates([
        "01/09/2026",
        "02/09/2026",
        "03/09/2026",
        "04/09/2026",
        "x",
      ]);

      expect(guessColumns(rows)?.fields.date?.value).toBe(0);
    });

    it("leaves one just below it", () => {
      const rows = withDates(["01/09/2026", "02/09/2026", "03/09/2026", "x"]);

      expect(guessColumns(rows)?.fields.date).toBeUndefined();
    });
  });

  describe("the sign convention", () => {
    const HEADER = ["Fecha", "Concepto", "Importe", "Saldo"];

    function rows(...lines: [string, string, string][]) {
      return statement(
        HEADER,
        ...lines.map(([date, amount, balance]) => [date, "MOVIMIENTO", amount, balance]),
      );
    }

    it("reads a negative number as an expense when the balance falls with it", () => {
      const guess = guessColumns(
        rows(
          ["01/09/2026", "-1.000,00", "9.000,00"],
          ["02/09/2026", "-500,00", "8.500,00"],
          ["03/09/2026", "2.000,00", "10.500,00"],
          ["04/09/2026", "-250,00", "10.250,00"],
        ),
      );

      expect(guess?.fields.negativeIsExpense).toEqual({
        value: true,
        reason: "En 3 de 3 filas seguidas, el saldo sube con los importes positivos.",
      });
    });

    it("reads it the other way when a bank lists what left as positive", () => {
      const guess = guessColumns(
        rows(
          ["01/09/2026", "1.000,00", "9.000,00"],
          ["02/09/2026", "500,00", "8.500,00"],
          ["03/09/2026", "-2.000,00", "10.500,00"],
          ["04/09/2026", "250,00", "10.250,00"],
        ),
      );

      expect(guess?.fields.negativeIsExpense?.value).toBe(false);
    });

    it("reads a statement listed newest first", () => {
      const guess = guessColumns(
        rows(
          ["04/09/2026", "-250,00", "10.250,00"],
          ["03/09/2026", "2.000,00", "10.500,00"],
          ["02/09/2026", "-500,00", "8.500,00"],
          ["01/09/2026", "-1.000,00", "9.000,00"],
        ),
      );

      expect(guess?.fields.negativeIsExpense?.value).toBe(true);
    });

    it(`needs ${MIN_SIGN_PAIRS} rows in a row that agree`, () => {
      const guess = guessColumns(
        rows(
          ["01/09/2026", "-1.000,00", "9.000,00"],
          ["02/09/2026", "-500,00", "8.500,00"],
          ["03/09/2026", "2.000,00", "10.500,00"],
        ),
      );

      expect(guess?.fields.negativeIsExpense).toBeUndefined();
    });

    it("says nothing when the rows disagree", () => {
      const guess = guessColumns(
        rows(
          ["01/09/2026", "-1.000,00", "9.000,00"],
          ["02/09/2026", "-500,00", "8.500,00"],
          ["03/09/2026", "2.000,00", "10.500,00"],
          ["04/09/2026", "-250,00", "10.250,00"],
          ["05/09/2026", "100,00", "10.150,00"],
        ),
      );

      expect(guess?.fields.negativeIsExpense).toBeUndefined();
    });

    it("is not guessed without a balance to check it against", () => {
      const guess = guessColumns(
        statement(["Fecha", "Concepto", "Importe"], ["01/09/2026", "COTO", "-1.000,00"]),
      );

      expect(guess?.fields.negativeIsExpense).toBeUndefined();
    });
  });

  it("guesses nothing in a file with no movements in it", () => {
    expect(
      guessColumns([
        ["Hola", "mundo"],
        ["sin", "datos"],
      ]),
    ).toBeNull();
    expect(guessColumns([])).toBeNull();
  });
});

describe("guessReason", () => {
  const guess = guessColumns(rowsOf(ARGENTINE_STATEMENT));
  const mapping = applyGuess(EMPTY_MAPPING, guess);

  it("gives the reason while the field still holds the guess", () => {
    expect(guessReason(guess, mapping, "date")).toBe(guess?.fields.date?.reason);
  });

  it("has nothing to say once the user picked something else", () => {
    expect(guessReason(guess, { ...mapping, date: 1 }, "date")).toBeNull();
  });

  it("has nothing to say about a field that was not guessed", () => {
    expect(guessReason(guess, mapping, "negativeIsExpense")).toBeNull();
    expect(guessReason(null, mapping, "date")).toBeNull();
  });
});
