import { describe, expect, it } from "vitest";
import { trainCategoryModel } from "@/lib/ai/categoryModel";
import {
  buildMappedImportPlan,
  EMPTY_MAPPING,
  isMappingComplete,
  movementType,
  parseFlexibleAmount,
  parseFlexibleDate,
  withFittingAccount,
} from "./importMapping";
import type { ColumnMapping, StatementChoices } from "./importMapping";
import { detectDelimiter, parseCsv } from "@/lib/csv";
import type { ImportContext } from "@/lib/csv";
import type { PaymentMethod, TransactionWithCategory } from "@/db/schema";
import { ARGENTINE_STATEMENT } from "@/lib/ai/testing/statements";
import { installmentPlan } from "@/lib/ai/testing/series";
import { BANK, LEDGER, WALLET, held } from "@/lib/ai/testing/ledger";
import headers from "@/lib/ai/data/csvHeaders.json";

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

describe("movementType", () => {
  // A personal sheet says «Gasto» where a bank's header says «Débito»: one
  // vocabulary for both.
  it("reads every word that names a debit column as an expense", () => {
    for (const word of headers.debit) expect(movementType(word)).toBe("expense");
  });

  it("reads every word that names a credit column as income", () => {
    for (const word of headers.credit) expect(movementType(word)).toBe("income");
  });

  it("does not mind accents, capitals or spaces", () => {
    expect(movementType("  GASTO ")).toBe("expense");
    expect(movementType("Débito")).toBe("expense");
    expect(movementType("Crédito")).toBe("income");
  });

  // Equal, not starting with: a bank's «Débito automático» or a «Gasto fijo»
  // is a description, not a direction.
  it("reads nothing else", () => {
    expect(movementType("Transferencia")).toBeNull();
    expect(movementType("")).toBeNull();
    expect(movementType("Gasto fijo")).toBeNull();
    expect(movementType("Débito automático")).toBeNull();
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

  it("needs both the amount and the type column for an amount and its type", () => {
    const base: ColumnMapping = {
      ...EMPTY_MAPPING,
      date: 0,
      description: 1,
      amountLayout: "amount-type",
    };
    expect(isMappingComplete({ ...base, amount: 2 })).toBe(false);
    expect(isMappingComplete({ ...base, type: 3 })).toBe(false);
    expect(isMappingComplete({ ...base, amount: 2, type: 3 })).toBe(true);
  });
});

describe("withFittingAccount", () => {
  const ACCOUNTS: PaymentMethod[] = [
    { id: 1, name: "Efectivo", type: "cash", currency: "ARS", initial_balance: 0 },
    { id: 2, name: "Banco ARS", type: "bank", currency: "ARS", initial_balance: 0 },
    { id: 3, name: "Banco USD", type: "bank", currency: "USD", initial_balance: 0 },
  ];

  // The account list only offers accounts in the chosen currency, so switching
  // it hid the account while the mapping went on holding it: a statement in
  // dollars was imported against a peso account.
  it("drops an account in another currency", () => {
    const mapping = { ...EMPTY_MAPPING, currency: "ARS", paymentMethodId: 2 };

    expect(withFittingAccount({ ...mapping, currency: "USD" }, ACCOUNTS)).toEqual({
      ...mapping,
      currency: "USD",
      paymentMethodId: null,
    });
  });

  it("keeps an account that holds the new currency", () => {
    const mapping = { ...EMPTY_MAPPING, currency: "USD", paymentMethodId: 2 };

    expect(
      withFittingAccount({ ...mapping, currency: "ARS" }, ACCOUNTS).paymentMethodId,
    ).toBe(2);
  });

  it("leaves an empty account empty", () => {
    // "Sin cuenta" is a real answer, so nothing may be chosen on the user's
    // behalf, not even the only account in the new currency.
    const mapping = { ...EMPTY_MAPPING, currency: "ARS", paymentMethodId: null };

    expect(
      withFittingAccount({ ...mapping, currency: "USD" }, ACCOUNTS).paymentMethodId,
    ).toBeNull();
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

  describe("an amount and its type", () => {
    const AMOUNT_TYPE: ColumnMapping = {
      ...EMPTY_MAPPING,
      date: 0,
      description: 1,
      amountLayout: "amount-type",
      amount: 2,
      type: 3,
    };

    it("takes the direction from the type, whatever the sign", () => {
      const plan = buildMappedImportPlan(
        [
          ["Fecha", "Concepto", "Monto", "Tipo"],
          ["05/08/2026", "Supermercado", "12.345,67", "Gasto"],
          ["06/08/2026", "Sueldo", "500.000,00", "Ingreso"],
          ["07/08/2026", "Farmacia", "-1.000,00", "gasto"],
        ],
        AMOUNT_TYPE,
        CONTEXT,
      );

      expect(
        plan.ready.map(({ transaction }) => [transaction.type, transaction.amount]),
      ).toEqual([
        ["expense", 12345.67],
        ["income", 500000],
        ["expense", 1000],
      ]);
    });

    it("says which rows have no type, or one it cannot read", () => {
      const plan = buildMappedImportPlan(
        [
          ["Fecha", "Concepto", "Monto", "Tipo"],
          ["05/08/2026", "Supermercado", "12.345,67", ""],
          ["06/08/2026", "Banco", "500,00", "Transferencia"],
        ],
        AMOUNT_TYPE,
        CONTEXT,
      );

      expect(plan.ready).toHaveLength(0);
      expect(plan.skipped).toEqual([
        { line: 2, reason: "Sin tipo" },
        { line: 3, reason: "Tipo ilegible: «Transferencia»" },
      ]);
    });

    it("still needs an amount", () => {
      const plan = buildMappedImportPlan(
        [
          ["Fecha", "Concepto", "Monto", "Tipo"],
          ["05/08/2026", "Supermercado", "", "Gasto"],
        ],
        AMOUNT_TYPE,
        CONTEXT,
      );

      expect(plan.skipped).toEqual([{ line: 2, reason: "Sin importe" }]);
    });
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
            category_suggested: 0,
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
            category_suggested: 0,
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

  // Where no rule says anything, the local AI does — and its choice arrives
  // flagged, to be reviewed, while a rule's is the user's own.
  it("lets the local AI place what no rule does, flagged as suggested", () => {
    const categories = [
      { id: 3, name: "Comida", type: "expense" as const, color: "", icon: "" },
      { id: 7, name: "Supermercado", type: "expense" as const, color: "", icon: "" },
    ];
    const plan = buildMappedImportPlan(
      [
        ["Fecha", "Concepto", "Importe"],
        ["05/08/2026", "MERPAGO*RAPPI 4471", "-1.000,00"],
        ["06/08/2026", "COTO DIGITAL", "-2.000,00"],
        ["07/08/2026", "VERDULERIA LOS HERMANOS", "-500,00"],
      ],
      SIGNED,
      {
        ...CONTEXT,
        categories,
        categoryRules: [{ id: 1, pattern: "coto", category_id: 7 }],
        categoryModel: trainCategoryModel([]),
      },
    );

    expect(plan.ready.map(({ transaction }) => transaction.categoryId)).toEqual([
      3,
      7,
      null,
    ]);
    expect(plan.ready.map(({ transaction }) => transaction.categorySuggested)).toEqual([
      true,
      false,
      false,
    ]);
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
  const FILE = ARGENTINE_STATEMENT;

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
        category_suggested: 0,
      })),
    });

    // Re-downloading an overlapping period is how anyone actually uses this.
    expect(second.ready).toHaveLength(0);
    expect(second.duplicates).toBe(4);
  });
});

describe("instalments on a statement", () => {
  const MAPPING: ColumnMapping = {
    ...EMPTY_MAPPING,
    date: 0,
    description: 1,
    amount: 2,
    currency: "ARS",
    paymentMethodId: 2,
  };
  const FRAVEGA = installmentPlan({
    id: 1,
    description: "Fravega",
    total_amount: 120000,
    installment_count: 12,
    first_due_date: "2026-06-10",
    confirmed_count: 3,
  });
  const WITH_PLANS: ImportContext = { ...CONTEXT, installmentPlans: [FRAVEGA] };

  function plan(
    lines: string[][],
    mapping: Partial<ColumnMapping> = { installmentDates: "charge" },
    context: ImportContext = WITH_PLANS,
    separate?: ReadonlySet<number>,
  ) {
    return buildMappedImportPlan(
      [["Fecha", "Concepto", "Importe"], ...lines],
      { ...MAPPING, ...mapping },
      context,
      { separate },
    );
  }

  it("registers the instalment a plan is waiting for, instead of importing it", () => {
    const result = plan([
      ["10/09/2026", "FRAVEGA C.04/12", "-10.000,00"],
      ["11/09/2026", "COTO", "-5.000,00"],
    ]);

    expect(result.ready.map((entry) => entry.transaction.description)).toEqual(["COTO"]);
    expect(result.steps).toEqual([
      { kind: "installment", id: 1, index: 3, date: "2026-09-10", amount: 10000 },
    ]);
    expect(result.installments.map((line) => line.kind)).toEqual(["registers"]);
  });

  it("leaves out an instalment the plan already has, as already there", () => {
    const result = plan([["10/08/2026", "FRAVEGA C.03/12", "-10.000,00"]]);

    expect(result.ready).toEqual([]);
    expect(result.duplicates).toBe(1);
  });

  it("imports an instalment with no plan, offering one", () => {
    const result = plan([["10/09/2026", "TIENDA LUNA C.04/12", "-2.500,00"]]);

    expect(result.ready).toHaveLength(1);
    expect(result.installments[0].kind).toBe("unplanned");
  });

  it("imports it on its own when the user says so", () => {
    const result = plan(
      [["10/09/2026", "FRAVEGA C.04/12", "-10.000,00"]],
      { installmentDates: "charge" },
      WITH_PLANS,
      new Set([2]),
    );

    expect(result.ready).toHaveLength(1);
    expect(result.steps).toEqual([]);
  });

  it("dates an instalment by its month when the statement writes the purchase", () => {
    const result = plan([["02/06/2026", "TIENDA LUNA C.04/12", "-2.500,00"]], {
      installmentDates: "purchase",
    });

    expect(result.ready[0].transaction.date).toBe("2026-09-02");
  });

  describe("asks which date an instalment carries", () => {
    it("when there is one past the first and nobody said yet", () => {
      const result = plan([["10/09/2026", "TIENDA LUNA C.02/12", "-2.500,00"]], {
        installmentDates: null,
      });

      expect(result.needsInstallmentDates).toBe(true);
    });

    it("not when every instalment is a first one, where both dates are one", () => {
      const result = plan([["10/09/2026", "TIENDA LUNA C.01/12", "-2.500,00"]], {
        installmentDates: null,
      });

      expect(result.needsInstallmentDates).toBe(false);
    });

    it("not once it was answered", () => {
      expect(
        plan([["10/09/2026", "TIENDA LUNA C.02/12", "-2.500,00"]]).needsInstallmentDates,
      ).toBe(false);
    });
  });

  it("reads none of it with the AI off", () => {
    const result = plan(
      [["10/09/2026", "FRAVEGA C.04/12", "-10.000,00"]],
      { installmentDates: null },
      CONTEXT,
    );

    expect(result.ready).toHaveLength(1);
    expect(result.steps).toEqual([]);
    expect(result.installments).toEqual([]);
    expect(result.needsInstallmentDates).toBe(false);
  });
});

describe("a statement against the history", () => {
  const MAPPING: ColumnMapping = {
    ...EMPTY_MAPPING,
    date: 0,
    description: 1,
    amount: 2,
    currency: "ARS",
    paymentMethodId: BANK,
  };

  function plan(
    lines: string[][],
    existing: TransactionWithCategory[],
    choices: Partial<StatementChoices> = {},
    ledger: ImportContext["ledger"] = LEDGER,
  ) {
    return buildMappedImportPlan(
      [["Fecha", "Concepto", "Importe"], ...lines],
      MAPPING,
      { ...CONTEXT, existing, ledger },
      choices,
    );
  }

  describe("a movement typed before the statement arrived", () => {
    const typed = held({ description: "rappi", amount: 10250, date: "2026-10-01" });
    const LINES = [
      ["02/10/2026", "MERPAGO*RAPPI 4471", "-10.250,00"],
      ["02/10/2026", "COTO", "-5.000,00"],
    ];

    it("is left out, and shown as a possible duplicate", () => {
      const result = plan(LINES, [typed]);

      expect(result.ready.map((entry) => entry.transaction.description)).toEqual([
        "COTO",
      ]);
      expect(result.nearDuplicates).toMatchObject([
        { line: 2, description: "MERPAGO*RAPPI 4471", other: typed, imported: false },
      ]);
      expect(result.dismissals).toEqual([]);
    });

    // Said once, in the preview: Atención does not ask about it again.
    it("goes in anyway when the user says so, and is not asked about again", () => {
      const result = plan(LINES, [typed], { anyway: new Set([2]) });

      expect(result.ready).toHaveLength(2);
      expect(result.nearDuplicates[0].imported).toBe(true);
      expect(result.dismissals).toEqual([result.nearDuplicates[0].id]);
    });

    it("answers for one row only", () => {
      const result = plan([LINES[0], LINES[0]], [typed]);

      expect(result.ready).toHaveLength(1);
      expect(result.nearDuplicates).toHaveLength(1);
    });
  });

  describe("the other half of a transfer already held", () => {
    const into = held({
      type: "income",
      description: "Transferencia recibida",
      payment_method_id: WALLET,
      date: "2026-10-01",
    });
    const LINES = [["01/10/2026", "TRANSF A MP", "-50.000,00"]];

    it("joins the row to it instead of importing it", () => {
      const result = plan(LINES, [into]);

      expect(result.ready).toEqual([]);
      expect(result.joins).toEqual([
        {
          kept: into,
          transfer: {
            amount: 50000,
            type: "transfer",
            categoryId: null,
            paymentMethodId: BANK,
            destinationPaymentMethodId: WALLET,
            destinationAmount: 50000,
            description: "Transferencia recibida",
            date: "2026-10-01",
            currency: "ARS",
          },
        },
      ]);
      expect(result.transfers).toMatchObject([{ line: 2, other: into, joined: true }]);
    });

    it("imports the row on its own when the user says it is not a transfer", () => {
      const result = plan(LINES, [into], { apart: new Set([2]) });

      expect(result.ready).toHaveLength(1);
      expect(result.joins).toEqual([]);
      expect(result.dismissals).toEqual([result.transfers[0].id]);
    });

    it("leaves alone a movement confirmed from an expected one", () => {
      const result = plan(
        LINES,
        [into],
        {},
        { ...LEDGER, fromExpected: new Set([into.id]) },
      );

      expect(result.ready).toHaveLength(1);
      expect(result.transfers).toEqual([]);
    });
  });

  it("checks nothing against the history with the AI off", () => {
    const typed = held({ description: "rappi", amount: 10250, date: "2026-10-01" });
    const result = plan([["02/10/2026", "RAPPI", "-10.250,00"]], [typed], {}, null);

    expect(result.ready).toHaveLength(1);
    expect(result.nearDuplicates).toEqual([]);
    expect(result.transfers).toEqual([]);
  });
});
