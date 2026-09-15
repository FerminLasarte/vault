import { describe, expect, it } from "vitest";
import {
  buildMappedImportPlan,
  EMPTY_MAPPING,
  isMappingComplete,
  parseFlexibleAmount,
  parseFlexibleDate,
} from "./importMapping";
import type { ColumnMapping } from "./importMapping";
import { detectDelimiter, parseCsv } from "@/lib/csv";
import type { ImportContext } from "@/lib/csv";

const CONTEXT: ImportContext = {
  categories: [],
  categoryRules: [],
  accounts: [],
  existing: [],
  supportedCurrencies: ["ARS", "USD"],
};

describe("parseFlexibleDate", () => {
  it("reads the day-first forms banks actually use", () => {
    expect(parseFlexibleDate("05/08/2026")).toBe("2026-08-05");
    expect(parseFlexibleDate("5-8-2026")).toBe("2026-08-05");
    expect(parseFlexibleDate("05.08.2026")).toBe("2026-08-05");
  });

  it("reads a two-digit year as this century", () => {
    expect(parseFlexibleDate("05/08/26")).toBe("2026-08-05");
  });

  it("does not mangle a date that is already ISO", () => {
    // "2026-08-05" read day-first would be day 2026, which is nonsense.
    expect(parseFlexibleDate("2026-08-05")).toBe("2026-08-05");
  });

  it("rejects a day that does not exist", () => {
    // 31/02 passes a naive range check but is not a day, and letting it through
    // would file the movement in March.
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("32/01/2026")).toBeNull();
    expect(parseFlexibleDate("05/13/2026")).toBeNull();
  });

  it("rejects anything that is not a date", () => {
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate("Saldo anterior")).toBeNull();
    expect(parseFlexibleDate("—")).toBeNull();
  });
});

describe("parseFlexibleAmount", () => {
  it("reads the Argentine convention", () => {
    expect(parseFlexibleAmount("1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseFlexibleAmount("1.234.567,89")).toBeCloseTo(1234567.89, 2);
  });

  it("reads the English convention", () => {
    // The same digits mean the same number; only the separators differ.
    expect(parseFlexibleAmount("1,234.56")).toBeCloseTo(1234.56, 2);
  });

  it("handles a lone separator either way", () => {
    expect(parseFlexibleAmount("1234,56")).toBeCloseTo(1234.56, 2);
    expect(parseFlexibleAmount("1234.56")).toBeCloseTo(1234.56, 2);
    // Three digits after a lone separator is a thousands group, not cents.
    expect(parseFlexibleAmount("1.234")).toBe(1234);
    expect(parseFlexibleAmount("1,234")).toBe(1234);
  });

  it("keeps the sign", () => {
    expect(parseFlexibleAmount("-1.234,56")).toBeCloseTo(-1234.56, 2);
  });

  it("reads parentheses as negative", () => {
    // Accounting notation, which several banks still use.
    expect(parseFlexibleAmount("(1.234,56)")).toBeCloseTo(-1234.56, 2);
  });

  it("ignores the currency symbol", () => {
    expect(parseFlexibleAmount("$ 1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseFlexibleAmount("ARS 1.234,56")).toBeCloseTo(1234.56, 2);
  });

  it("rejects what is not a number", () => {
    expect(parseFlexibleAmount("")).toBeNull();
    expect(parseFlexibleAmount("   ")).toBeNull();
    expect(parseFlexibleAmount("-")).toBeNull();
  });
});

describe("isMappingComplete", () => {
  it("needs a date and a description whatever the layout", () => {
    expect(isMappingComplete({ ...EMPTY_MAPPING, amount: 2 })).toBe(false);
  });

  it("needs the amount column when there is one", () => {
    const base = { ...EMPTY_MAPPING, date: 0, description: 1 };
    expect(isMappingComplete(base)).toBe(false);
    expect(isMappingComplete({ ...base, amount: 2 })).toBe(true);
  });

  it("accepts either side of a debit/credit pair", () => {
    // A statement that only ever debits still has usable rows.
    const base: ColumnMapping = {
      ...EMPTY_MAPPING,
      date: 0,
      description: 1,
      amountLayout: "debit-credit",
    };
    expect(isMappingComplete(base)).toBe(false);
    expect(isMappingComplete({ ...base, debit: 2 })).toBe(true);
    expect(isMappingComplete({ ...base, credit: 3 })).toBe(true);
  });
});

describe("buildMappedImportPlan", () => {
  const SIGNED: ColumnMapping = {
    ...EMPTY_MAPPING,
    date: 0,
    description: 1,
    amount: 2,
    currency: "ARS",
  };

  it("imports a signed-amount statement", () => {
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "Supermercado", "-12.345,67"],
        ["06/08/2026", "Sueldo", "500.000,00"],
      ],
      SIGNED,
      CONTEXT,
    );

    expect(plan.ready).toHaveLength(2);
    expect(plan.ready[0].transaction).toMatchObject({
      date: "2026-08-05",
      type: "expense",
      description: "Supermercado",
    });
    expect(plan.ready[0].transaction.amount).toBeCloseTo(12345.67, 2);
    expect(plan.ready[1].transaction.type).toBe("income");
  });

  it("stores the amount unsigned, with the direction in the type", () => {
    // The app stores magnitude plus a type; a negative amount would be
    // subtracted twice.
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "Supermercado", "-1.000,00"],
      ],
      SIGNED,
      CONTEXT,
    );

    expect(plan.ready[0].transaction.amount).toBe(1000);
  });

  it("can be told the sign means the opposite", () => {
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "Supermercado", "-1.000,00"],
      ],
      { ...SIGNED, negativeIsExpense: false },
      CONTEXT,
    );

    expect(plan.ready[0].transaction.type).toBe("income");
  });

  it("imports a debit/credit statement", () => {
    const mapping: ColumnMapping = {
      ...EMPTY_MAPPING,
      date: 0,
      description: 1,
      amountLayout: "debit-credit",
      debit: 2,
      credit: 3,
    };

    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Débito", "Crédito"],
        ["05/08/2026", "Supermercado", "12.345,67", ""],
        ["06/08/2026", "Sueldo", "", "500.000,00"],
      ],
      mapping,
      CONTEXT,
    );

    expect(plan.ready[0].transaction.type).toBe("expense");
    expect(plan.ready[1].transaction.type).toBe("income");
    expect(plan.ready[1].transaction.amount).toBe(500000);
  });

  it("treats an explicit zero as the column that does not apply", () => {
    // Plenty of banks write 0,00 instead of leaving the cell empty.
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Débito", "Crédito"],
        ["05/08/2026", "Sueldo", "0,00", "500.000,00"],
      ],
      {
        ...EMPTY_MAPPING,
        date: 0,
        description: 1,
        amountLayout: "debit-credit",
        debit: 2,
        credit: 3,
      },
      CONTEXT,
    );

    expect(plan.ready[0].transaction.type).toBe("income");
  });

  it("skips the preamble above the table", () => {
    // Statements open with a title and an account summary before the columns.
    const plan = buildMappedImportPlan(
      [
        ["Resumen de cuenta", "", ""],
        ["Cuenta 123-456", "", ""],
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "Supermercado", "-1.000,00"],
      ],
      { ...SIGNED, headerRow: 2 },
      CONTEXT,
    );

    expect(plan.ready).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it("ignores blank spacer rows without calling them errors", () => {
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["", "", ""],
        ["05/08/2026", "Supermercado", "-1.000,00"],
        ["", "", ""],
      ],
      SIGNED,
      CONTEXT,
    );

    expect(plan.ready).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it("reports why a row was dropped, with its line number", () => {
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["Saldo anterior", "", ""],
        ["05/08/2026", "", "-1.000,00"],
        ["06/08/2026", "Algo", ""],
      ],
      SIGNED,
      CONTEXT,
    );

    expect(plan.ready).toHaveLength(0);
    expect(plan.skipped.map((entry) => entry.line)).toEqual([2, 3, 4]);
    expect(plan.skipped[0].reason).toContain("Fecha");
    expect(plan.skipped[1].reason).toContain("descripción");
    expect(plan.skipped[2].reason).toContain("importe");
  });

  it("does not import a movement the app already has", () => {
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "Supermercado", "-1.000,00"],
      ],
      SIGNED,
      {
        ...CONTEXT,
        existing: [
          {
            id: 1,
            amount: 1000,
            type: "expense",
            category_id: null,
            payment_method_id: null,
            destination_payment_method_id: null,
            destination_amount: null,
            description: "Supermercado",
            date: "2026-08-05",
            currency: "ARS",
          },
        ],
      },
    );

    expect(plan.ready).toHaveLength(0);
    expect(plan.duplicates).toBe(1);
  });

  it("keeps a movement the statement genuinely repeats", () => {
    // Two identical fares on the same day are two fares. Dropping one, and
    // saying it "ya existía", was wrong on both counts.
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "SUBE", "-1.000,00"],
        ["05/08/2026", "SUBE", "-1.000,00"],
      ],
      SIGNED,
      CONTEXT,
    );

    expect(plan.ready).toHaveLength(2);
    expect(plan.duplicates).toBe(0);
  });

  it("skips only as many repeats as the app already has", () => {
    // Re-downloading an overlapping period is the normal way this happens: one
    // fare was imported last time, the new file carries both.
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "SUBE", "-1.000,00"],
        ["05/08/2026", "SUBE", "-1.000,00"],
      ],
      SIGNED,
      {
        ...CONTEXT,
        existing: [
          {
            id: 1,
            amount: 1000,
            type: "expense",
            category_id: null,
            payment_method_id: null,
            destination_payment_method_id: null,
            destination_amount: null,
            description: "SUBE",
            date: "2026-08-05",
            currency: "ARS",
          },
        ],
      },
    );

    expect(plan.ready).toHaveLength(1);
    expect(plan.duplicates).toBe(1);
  });

  it("applies the category rules to what it imports", () => {
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "COTO DIGITAL", "-1.000,00"],
      ],
      SIGNED,
      {
        ...CONTEXT,
        categories: [
          { id: 7, name: "Supermercado", type: "expense", color: "#f97316", icon: "🛒" },
        ],
        categoryRules: [{ id: 1, pattern: "coto", category_id: 7 }],
      },
    );

    // A statement should land classified the same way a hand-made file would.
    expect(plan.ready[0].transaction.categoryId).toBe(7);
  });

  it("does not file money coming in under an expense rule", () => {
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "Transferencia recibida Mercado Pago", "5.000,00"],
        ["06/08/2026", "Pago Mercado Pago", "-1.000,00"],
      ],
      SIGNED,
      {
        ...CONTEXT,
        categories: [
          { id: 7, name: "Compras", type: "expense", color: "#f97316", icon: "🛍️" },
        ],
        categoryRules: [{ id: 1, pattern: "mercado pago", category_id: 7 }],
      },
    );

    // An income filed under Compras would show up in the income breakdown and
    // in the monthly close as if Compras were a source of money.
    expect(plan.ready[0].transaction.type).toBe("income");
    expect(plan.ready[0].transaction.categoryId).toBeNull();
    expect(plan.ready[1].transaction.categoryId).toBe(7);
  });

  it("assigns the account chosen for the file", () => {
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "Supermercado", "-1.000,00"],
      ],
      { ...SIGNED, paymentMethodId: 3, currency: "USD" },
      CONTEXT,
    );

    expect(plan.ready[0].transaction.paymentMethodId).toBe(3);
    expect(plan.ready[0].transaction.currency).toBe("USD");
  });
});

describe("a real Argentine bank statement", () => {
  // Semicolon separated because the comma is already the decimal separator,
  // day-first dates, a preamble above the table, separate Débito and Crédito
  // columns, a blank spacer row and a totals line at the end. Every one of
  // those is normal, and every one breaks a naive parser.
  const FILE = [
    "Resumen de cuenta;;;",
    "Cuenta 123-456/7;;;",
    ";;;",
    "Fecha;Concepto;Débito;Crédito",
    "05/08/2026;COMPRA COTO DIGITAL;12.345,67;0,00",
    "06/08/2026;TRANSFERENCIA RECIBIDA;0,00;500.000,00",
    ";;;",
    "07/08/2026;DEBITO AUTOMATICO EDESUR;8.900,50;",
    "08/08/2026;PAGO TARJETA;150.000,00;0,00",
    "Saldo final;;;",
  ].join("\n");

  const MAPPING: ColumnMapping = {
    ...EMPTY_MAPPING,
    headerRow: 3,
    date: 0,
    description: 1,
    amountLayout: "debit-credit",
    debit: 2,
    credit: 3,
    currency: "ARS",
    paymentMethodId: 5,
  };

  it("detects the semicolon", () => {
    expect(detectDelimiter(FILE)).toBe(";");
  });

  it("imports every real movement and nothing else", () => {
    const plan = buildMappedImportPlan(
      parseCsv(FILE, detectDelimiter(FILE)),
      MAPPING,
      CONTEXT,
    );

    expect(plan.ready).toHaveLength(4);
    // Only the totals line is unusable; the blank spacer is not an error.
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].line).toBe(10);
  });

  it("gets the figures, dates and directions right", () => {
    const plan = buildMappedImportPlan(
      parseCsv(FILE, detectDelimiter(FILE)),
      MAPPING,
      CONTEXT,
    );

    expect(plan.ready.map((entry) => entry.transaction)).toMatchObject([
      { date: "2026-08-05", type: "expense", description: "COMPRA COTO DIGITAL" },
      { date: "2026-08-06", type: "income", description: "TRANSFERENCIA RECIBIDA" },
      { date: "2026-08-07", type: "expense", description: "DEBITO AUTOMATICO EDESUR" },
      { date: "2026-08-08", type: "expense", description: "PAGO TARJETA" },
    ]);

    expect(plan.ready[0].transaction.amount).toBeCloseTo(12345.67, 2);
    expect(plan.ready[1].transaction.amount).toBe(500000);
    expect(plan.ready[2].transaction.amount).toBeCloseTo(8900.5, 2);
    expect(plan.ready.every((entry) => entry.transaction.paymentMethodId === 5)).toBe(
      true,
    );
  });

  it("finds nothing new the second time the same file is imported", () => {
    const first = buildMappedImportPlan(
      parseCsv(FILE, detectDelimiter(FILE)),
      MAPPING,
      CONTEXT,
    );

    const second = buildMappedImportPlan(parseCsv(FILE, detectDelimiter(FILE)), MAPPING, {
      ...CONTEXT,
      existing: first.ready.map((entry, index) => ({
        id: index,
        ...entry.transaction,
        category_id: entry.transaction.categoryId,
        payment_method_id: entry.transaction.paymentMethodId,
        destination_payment_method_id: null,
        destination_amount: null,
      })),
    });

    // Re-downloading an overlapping period is how anyone actually uses this.
    expect(second.ready).toHaveLength(0);
    expect(second.duplicates).toBe(4);
  });
});
