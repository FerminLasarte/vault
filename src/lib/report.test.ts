import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import type { ReportSources } from "./report";
import type { BudgetWithCategory, Category, TransactionWithCategory } from "@/db/schema";

const GENERATED_AT = new Date("2026-08-23T12:00:00Z");

const CATEGORIES: Category[] = [
  { id: 1, name: "Salida", type: "expense", color: "#f00", icon: "🍺" },
  { id: 2, name: "Sueldo", type: "income", color: "#0f0", icon: "💼" },
];

function aTransaction(
  overrides: Partial<TransactionWithCategory> = {},
): TransactionWithCategory {
  return {
    id: Math.random(),
    amount: 1000,
    type: "expense",
    category_id: 1,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Gasto",
    date: "2026-08-05",
    currency: "ARS",
    category_name: "Salida",
    category_color: "#f00",
    category_icon: "🍺",
    payment_method_name: null,
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  };
}

function sources(overrides: Partial<ReportSources> = {}): ReportSources {
  return { transactions: [], categories: CATEGORIES, budgets: [], ...overrides };
}

const NO_RANGE = { from: null, to: null };

describe("buildReport", () => {
  it("survives a period with nothing in it", () => {
    // Printing an empty month must produce an empty report, not a crash: a
    // report is most likely to be run on a period the user has not filled in.
    const report = buildReport(
      sources(),
      { currency: "ARS", categoryId: null, dateRange: NO_RANGE },
      GENERATED_AT,
    );

    expect(report.transactionCount).toBe(0);
    expect(report.summary).toEqual({ balance: 0, income: 0, expenses: 0 });
    expect(report.byCategory).toEqual([]);
    expect(report.monthly).toEqual([]);
  });

  it("respects the date range", () => {
    const report = buildReport(
      sources({
        transactions: [
          aTransaction({ date: "2026-07-15", amount: 500 }),
          aTransaction({ date: "2026-08-05", amount: 1000 }),
          aTransaction({ date: "2026-09-01", amount: 9999 }),
        ],
      }),
      {
        currency: "ARS",
        categoryId: null,
        dateRange: { from: "2026-08-01", to: "2026-08-31" },
      },
      GENERATED_AT,
    );

    expect(report.transactionCount).toBe(1);
    expect(report.summary.expenses).toBe(1000);
  });

  it("lists every month of a range longer than a year", () => {
    const report = buildReport(
      sources({
        transactions: [
          aTransaction({ date: "2025-01-10", amount: 100 }),
          aTransaction({ date: "2026-09-10", amount: 200 }),
        ],
      }),
      {
        currency: "ARS",
        categoryId: null,
        dateRange: { from: "2025-01-01", to: "2026-09-14" },
      },
      GENERATED_AT,
    );

    // The monthly table has to add up to the totals printed above it.
    expect(report.monthly).toHaveLength(21);
    expect(report.monthly[0].monthKey).toBe("2025-01");
    expect(report.monthly.reduce((total, month) => total + month.expenses, 0)).toBe(
      report.summary.expenses,
    );
  });

  it("never mixes currencies", () => {
    // Adding pesos to dollars would produce a total that means nothing.
    const report = buildReport(
      sources({
        transactions: [
          aTransaction({ amount: 1000, currency: "ARS" }),
          aTransaction({ amount: 50, currency: "USD" }),
        ],
      }),
      { currency: "ARS", categoryId: null, dateRange: NO_RANGE },
      GENERATED_AT,
    );

    expect(report.summary.expenses).toBe(1000);
  });

  it("names the category it was filtered to", () => {
    const report = buildReport(
      sources({ transactions: [aTransaction()] }),
      { currency: "ARS", categoryId: 1, dateRange: NO_RANGE },
      GENERATED_AT,
    );

    // The printed page has to say what it is a report of, or the numbers on it
    // cannot be checked against anything later.
    expect(report.categoryName).toBe("Salida");
  });

  it("leaves the category unnamed when none was chosen", () => {
    const report = buildReport(
      sources({ transactions: [aTransaction()] }),
      { currency: "ARS", categoryId: null, dateRange: NO_RANGE },
      GENERATED_AT,
    );

    expect(report.categoryName).toBeNull();
  });

  it("covers every month between the two ends of the range", () => {
    const report = buildReport(
      sources({
        transactions: [
          aTransaction({ date: "2026-06-10" }),
          aTransaction({ date: "2026-08-10" }),
        ],
      }),
      {
        currency: "ARS",
        categoryId: null,
        dateRange: { from: "2026-06-01", to: "2026-08-31" },
      },
      GENERATED_AT,
    );

    // July has no movements but must still appear, or the trend silently skips
    // a month and reads as if June were followed by August.
    expect(report.monthly.map((entry) => entry.monthKey)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("ranks the categories by how much was spent", () => {
    const report = buildReport(
      sources({
        transactions: [
          aTransaction({ amount: 100, category_id: 1, category_name: "Salida" }),
          aTransaction({ amount: 900, category_id: 3, category_name: "Alquiler" }),
        ],
      }),
      { currency: "ARS", categoryId: null, dateRange: NO_RANGE },
      GENERATED_AT,
    );

    expect(report.byCategory.map((entry) => entry.name)).toEqual(["Alquiler", "Salida"]);
  });

  it("measures budgets against the period reported, not against today", () => {
    const budget: BudgetWithCategory = {
      id: 1,
      category_id: 1,
      currency: "ARS",
      amount: 1000,
      period: "monthly",
      category_name: "Salida",
      category_icon: "🍺",
      category_color: "#f00",
    };

    const report = buildReport(
      sources({
        budgets: [budget],
        transactions: [aTransaction({ date: "2026-03-10", amount: 800 })],
      }),
      {
        currency: "ARS",
        categoryId: null,
        dateRange: { from: "2026-03-01", to: "2026-03-31" },
      },
      GENERATED_AT,
    );

    // A report of March printed in August has to show March's progress.
    expect(report.budgets[0].spent).toBe(800);
  });

  it("leaves out budgets kept in another currency", () => {
    const report = buildReport(
      sources({
        budgets: [
          {
            id: 1,
            category_id: 1,
            currency: "USD",
            amount: 100,
            period: "monthly",
            category_name: "Salida",
            category_icon: "🍺",
            category_color: "#f00",
          },
        ],
      }),
      { currency: "ARS", categoryId: null, dateRange: NO_RANGE },
      GENERATED_AT,
    );

    expect(report.budgets).toEqual([]);
  });
});
