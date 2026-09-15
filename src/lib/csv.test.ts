import { describe, expect, it } from "vitest";
import type {
  Category,
  PaymentMethod,
  Transaction,
  TransactionWithCategory,
} from "@/db/schema";
import {
  buildImportPlan,
  detectDelimiter,
  parseCsv,
  transactionsToCsv,
  CSV_HEADERS,
  TAGS_HEADER,
} from "@/lib/csv";

function makeRow(overrides: Partial<TransactionWithCategory>): TransactionWithCategory {
  return {
    id: 1,
    amount: 100,
    type: "expense",
    category_id: null,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Compra",
    date: "2026-08-01",
    currency: "ARS",
    category_name: null,
    category_color: null,
    category_icon: null,
    payment_method_name: null,
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  };
}

const categories: Category[] = [
  { id: 7, name: "Comida", type: "expense", color: "#f97316", icon: "🍽️" },
  { id: 8, name: "Salario", type: "income", color: "#10b981", icon: "💰" },
];

const accounts: PaymentMethod[] = [
  { id: 1, name: "Efectivo ARS", type: "cash", currency: "ARS", initial_balance: 0 },
  {
    id: 5,
    name: "Cuenta Bancaria USD",
    type: "bank",
    currency: "USD",
    initial_balance: 0,
  },
];

const context = {
  categories,
  accounts,
  existing: [] as Transaction[],
  supportedCurrencies: ["ARS", "USD"],
};

describe("parseCsv", () => {
  it("splits plain rows", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('a,b\n"uno, dos",3\n')).toEqual([
      ["a", "b"],
      ["uno, dos", "3"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\n"dijo ""hola"""\n')).toEqual([["a"], ['dijo "hola"']]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('a,b\n"dos\nlineas",x\n')).toEqual([
      ["a", "b"],
      ["dos\nlineas", "x"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles a file with no trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM from the first header", () => {
    expect(parseCsv("﻿fecha,tipo\n2026-01-01,Gasto\n")[0][0]).toBe("fecha");
  });
});

describe("transactionsToCsv", () => {
  it("writes the required columns plus the optional tag column", () => {
    expect(transactionsToCsv([]).trim()).toBe([...CSV_HEADERS, TAGS_HEADER].join(","));
  });

  it("quotes a description containing a comma", () => {
    const csv = transactionsToCsv([makeRow({ description: "Pan, leche y café" })]);
    expect(csv).toContain('"Pan, leche y café"');
  });

  it("round trips through the parser", () => {
    const csv = transactionsToCsv([
      makeRow({
        description: 'Cena "del año"',
        category_name: "Comida",
        payment_method_name: "Efectivo ARS",
      }),
    ]);
    const rows = parseCsv(csv);
    expect(rows[1][CSV_HEADERS.indexOf("descripcion")]).toBe('Cena "del año"');
    expect(rows[1][CSV_HEADERS.indexOf("categoria")]).toBe("Comida");
  });

  it("writes transfers with both legs", () => {
    const csv = transactionsToCsv([
      makeRow({
        type: "transfer",
        amount: 145000,
        destination_amount: 100,
        payment_method_name: "Efectivo ARS",
        destination_payment_method_name: "Cuenta Bancaria USD",
        description: "Compra de dólares",
      }),
    ]);
    const row = parseCsv(csv)[1];
    expect(row[CSV_HEADERS.indexOf("tipo")]).toBe("Transferencia");
    expect(row[CSV_HEADERS.indexOf("monto")]).toBe("145000");
    expect(row[CSV_HEADERS.indexOf("monto_destino")]).toBe("100");
  });
});

function planFor(body: string) {
  return buildImportPlan(parseCsv(`${CSV_HEADERS.join(",")}\n${body}`), context);
}

describe("buildImportPlan", () => {
  it("imports a valid expense", () => {
    const plan = planFor("2026-08-01,Gasto,250.5,ARS,Comida,Efectivo ARS,,,Almuerzo\n");
    expect(plan.skipped).toEqual([]);
    expect(plan.ready).toHaveLength(1);
    expect(plan.ready[0].transaction).toMatchObject({
      amount: 250.5,
      type: "expense",
      currency: "ARS",
      categoryId: 7,
      paymentMethodId: 1,
      description: "Almuerzo",
      date: "2026-08-01",
    });
  });

  it("accepts the raw stored type as well as the Spanish label", () => {
    const plan = planFor("2026-08-01,income,100,ARS,Salario,Efectivo ARS,,,Sueldo\n");
    expect(plan.ready[0].transaction.type).toBe("income");
  });

  it("resolves names ignoring case and accents", () => {
    const plan = planFor("2026-08-01,gasto,10,ARS,comida,efectivo ars,,,Café\n");
    expect(plan.ready[0].transaction.categoryId).toBe(7);
    expect(plan.ready[0].transaction.paymentMethodId).toBe(1);
  });

  it("imports a cross-currency transfer", () => {
    const plan = planFor(
      "2026-08-01,Transferencia,145000,ARS,,Efectivo ARS,Cuenta Bancaria USD,100,Dólares\n",
    );
    expect(plan.skipped).toEqual([]);
    expect(plan.ready[0].transaction).toMatchObject({
      type: "transfer",
      amount: 145000,
      destinationPaymentMethodId: 5,
      destinationAmount: 100,
      categoryId: null,
    });
  });

  it("defaults a transfer's destination amount to the sent amount", () => {
    const plan = planFor(
      "2026-08-01,Transferencia,500,ARS,,Efectivo ARS,Efectivo ARS,,Movimiento\n",
    );
    expect(plan.ready[0].transaction.destinationAmount).toBe(500);
  });

  it("allows an empty account and leaves it unattached", () => {
    const plan = planFor("2026-08-01,Gasto,10,ARS,Comida,,,,Suelto\n");
    expect(plan.ready[0].transaction.paymentMethodId).toBeNull();
  });

  it("reports the line number of every rejected row", () => {
    const plan = planFor(
      [
        "2026-13-99,Gasto,10,ARS,Comida,Efectivo ARS,,,Fecha mala",
        "2026-08-01,Chiste,10,ARS,Comida,Efectivo ARS,,,Tipo malo",
        "2026-08-01,Gasto,-5,ARS,Comida,Efectivo ARS,,,Monto malo",
        "2026-08-01,Gasto,10,EUR,Comida,Efectivo ARS,,,Moneda mala",
        "2026-08-01,Gasto,10,ARS,Inexistente,Efectivo ARS,,,Categoria mala",
        "2026-08-01,Gasto,10,ARS,Comida,Banco Fantasma,,,Cuenta mala",
        "2026-08-01,Gasto,10,ARS,Comida,Efectivo ARS,,,",
      ].join("\n") + "\n",
    );
    expect(plan.ready).toEqual([]);
    expect(plan.skipped.map((entry) => entry.line)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it("rejects a date that has the right shape but does not exist", () => {
    const plan = planFor("2026-02-30,Gasto,10,ARS,Comida,Efectivo ARS,,,Inexistente\n");
    expect(plan.ready).toEqual([]);
    expect(plan.skipped[0].reason).toContain("Fecha inválida");
  });

  it("skips rows that already exist in the database", () => {
    const existing: Transaction[] = [
      {
        id: 1,
        amount: 250.5,
        type: "expense",
        category_id: 7,
        payment_method_id: 1,
        destination_payment_method_id: null,
        destination_amount: null,
        description: "Almuerzo",
        date: "2026-08-01",
        currency: "ARS",
      },
    ];
    const plan = buildImportPlan(
      parseCsv(
        `${CSV_HEADERS.join(",")}\n2026-08-01,Gasto,250.5,ARS,Comida,Efectivo ARS,,,Almuerzo\n`,
      ),
      { ...context, existing },
    );
    expect(plan.ready).toEqual([]);
    expect(plan.duplicates).toBe(1);
  });

  it("keeps a movement the file genuinely repeats", () => {
    // Two identical fares on one day are two fares, not one imported twice.
    const line = "2026-08-01,Gasto,10,ARS,Comida,Efectivo ARS,,,SUBE\n";
    const plan = planFor(line + line);
    expect(plan.ready).toHaveLength(2);
    expect(plan.duplicates).toBe(0);
  });

  it("skips only as many repeats as the database already holds", () => {
    const existing: Transaction[] = [
      {
        id: 1,
        amount: 10,
        type: "expense",
        category_id: 7,
        payment_method_id: 1,
        destination_payment_method_id: null,
        destination_amount: null,
        description: "SUBE",
        date: "2026-08-01",
        currency: "ARS",
      },
    ];
    const line = "2026-08-01,Gasto,10,ARS,Comida,Efectivo ARS,,,SUBE\n";
    const plan = buildImportPlan(parseCsv(`${CSV_HEADERS.join(",")}\n${line}${line}`), {
      ...context,
      existing,
    });
    expect(plan.ready).toHaveLength(1);
    expect(plan.duplicates).toBe(1);
  });

  it("rejects the whole file when a column is missing", () => {
    const plan = buildImportPlan(parseCsv("fecha,tipo\n2026-08-01,Gasto\n"), context);
    expect(plan.ready).toEqual([]);
    expect(plan.skipped[0].reason).toContain("Faltan columnas");
  });

  it("returns an empty plan for an empty file", () => {
    expect(buildImportPlan([], context)).toEqual({
      ready: [],
      skipped: [],
      duplicates: 0,
    });
  });
});

describe("a file the app exported, after a round trip through Excel (es-AR)", () => {
  // Opened and saved again by Excel with Argentine settings: semicolons,
  // decimal commas, and dates in Excel's own short format. It used to fail as
  // a whole with "Faltan columnas obligatorias".
  const text = [
    `${[...CSV_HEADERS, TAGS_HEADER].join(";")}`,
    "1/8/2026;Gasto;1234,56;ARS;Comida;Efectivo ARS;;;Almuerzo;viaje",
    "15/8/2026;Transferencia;100;USD;;Cuenta Bancaria USD;Efectivo ARS;120000,5;Cambio;",
  ].join("\r\n");

  it("reads it back", () => {
    const plan = buildImportPlan(parseCsv(text, detectDelimiter(text)), context);

    expect(plan.skipped).toEqual([]);
    expect(
      plan.ready.map((row) => [row.transaction.date, row.transaction.amount]),
    ).toEqual([
      ["2026-08-01", 1234.56],
      ["2026-08-15", 100],
    ]);
    expect(plan.ready[0].tags).toEqual(["viaje"]);
    expect(plan.ready[1].transaction.destinationAmount).toBe(120000.5);
  });

  it("still reads the app's own file as exported", () => {
    const exported = transactionsToCsv([makeRow({ amount: 1234.56 })]);
    const plan = buildImportPlan(parseCsv(exported, detectDelimiter(exported)), context);
    expect(plan.ready[0].transaction.amount).toBe(1234.56);
    expect(plan.ready[0].transaction.date).toBe("2026-08-01");
  });
});

describe("buildImportPlan with categorisation rules", () => {
  const withRules = {
    ...context,
    categoryRules: [{ id: 1, pattern: "netflix", category_id: 7 }],
  };

  function planWithRules(body: string) {
    return buildImportPlan(parseCsv(`${CSV_HEADERS.join(",")}\n${body}`), withRules);
  }

  it("fills in a missing category from a matching rule", () => {
    const plan = planWithRules(
      "2026-08-01,Gasto,10,ARS,,Efectivo ARS,,,Netflix mensual\n",
    );
    expect(plan.skipped).toEqual([]);
    expect(plan.ready[0].transaction.categoryId).toBe(7);
  });

  it("leaves the category empty when no rule matches", () => {
    const plan = planWithRules("2026-08-01,Gasto,10,ARS,,Efectivo ARS,,,Peluquería\n");
    expect(plan.ready[0].transaction.categoryId).toBeNull();
  });

  it("never overrides a category the file states explicitly", () => {
    const plan = planWithRules(
      "2026-08-01,Ingreso,10,ARS,Salario,Efectivo ARS,,,Netflix mensual\n",
    );
    expect(plan.ready[0].transaction.categoryId).toBe(8);
  });

  it("does not apply an expense rule to an income row", () => {
    // The rule points at Comida, which is an expense category.
    const plan = planWithRules("2026-08-01,Ingreso,10,ARS,,Efectivo ARS,,,Netflix\n");
    expect(plan.ready[0].transaction.categoryId).toBeNull();
  });

  it("does not categorise transfers", () => {
    const plan = planWithRules(
      "2026-08-01,Transferencia,10,ARS,,Efectivo ARS,Cuenta Bancaria USD,5,Netflix\n",
    );
    expect(plan.ready[0].transaction.categoryId).toBeNull();
  });

  it("works when no rules are supplied at all", () => {
    const plan = planFor("2026-08-01,Gasto,10,ARS,,Efectivo ARS,,,Netflix mensual\n");
    expect(plan.ready[0].transaction.categoryId).toBeNull();
  });
});

describe("tags through CSV", () => {
  it("writes an etiquetas column on export", () => {
    const csv = transactionsToCsv([makeRow({ tag_names: "viaje,comida" })]);
    const header = parseCsv(csv)[0];
    expect(header.at(-1)).toBe("etiquetas");
    expect(parseCsv(csv)[1].at(-1)).toBe("comida,viaje");
  });

  it("reads tags back on import", () => {
    const csv = `${[...CSV_HEADERS, "etiquetas"].join(",")}\n2026-08-01,Gasto,10,ARS,Comida,Efectivo ARS,,,Almuerzo,"viaje,bariloche"\n`;
    const plan = buildImportPlan(parseCsv(csv), context);
    expect(plan.ready[0].tags).toEqual(["bariloche", "viaje"]);
  });

  it("still accepts a file that predates the etiquetas column", () => {
    const plan = planFor("2026-08-01,Gasto,10,ARS,Comida,Efectivo ARS,,,Almuerzo\n");
    expect(plan.skipped).toEqual([]);
    expect(plan.ready[0].tags).toEqual([]);
  });

  it("round trips tags through export and import", () => {
    const csv = transactionsToCsv([
      makeRow({
        description: "Cena",
        category_name: "Comida",
        payment_method_name: "Efectivo ARS",
        tag_names: "viaje,bariloche",
      }),
    ]);
    const plan = buildImportPlan(parseCsv(csv), context);
    expect(plan.skipped).toEqual([]);
    expect(plan.ready[0].tags).toEqual(["bariloche", "viaje"]);
  });
});

describe("categories that exist under both kinds", () => {
  // "Trabajo" is money earned in one row and money spent in another; both are
  // legitimate and the importer has to tell them apart by the row's type.
  const bothKinds = {
    ...context,
    categories: [
      { id: 20, name: "Trabajo", type: "income", color: "#10b981", icon: "💼" },
      { id: 21, name: "Trabajo", type: "expense", color: "#f97316", icon: "🧰" },
    ] as Category[],
  };

  function planFor(body: string) {
    return buildImportPlan(parseCsv(`${CSV_HEADERS.join(",")}\n${body}`), bothKinds);
  }

  it("picks the income one for an income row", () => {
    const plan = planFor("2026-08-01,Ingreso,100,ARS,Trabajo,Efectivo ARS,,,Sueldo\n");
    expect(plan.ready[0].transaction.categoryId).toBe(20);
  });

  it("picks the expense one for an expense row", () => {
    const plan = planFor("2026-08-01,Gasto,100,ARS,Trabajo,Efectivo ARS,,,Insumos\n");
    expect(plan.ready[0].transaction.categoryId).toBe(21);
  });

  it("reports which kind was missing when only one exists", () => {
    const onlyIncome = {
      ...context,
      categories: [
        { id: 20, name: "Trabajo", type: "income", color: "#10b981", icon: "💼" },
      ] as Category[],
    };
    const plan = buildImportPlan(
      parseCsv(
        `${CSV_HEADERS.join(",")}\n2026-08-01,Gasto,100,ARS,Trabajo,Efectivo ARS,,,Insumos\n`,
      ),
      onlyIncome,
    );
    expect(plan.ready).toEqual([]);
    expect(plan.skipped[0].reason).toContain("gastos");
  });
});
