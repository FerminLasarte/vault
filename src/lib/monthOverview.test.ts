import { describe, expect, it } from "vitest";
import type { BudgetWithCategory, Transaction } from "@/db/schema";
import { buildMonthOverview } from "@/lib/monthOverview";
import type { SavingsProgress } from "@/lib/savings";

// Mid-month, so "this month" and "last month" are both unambiguous.
const REFERENCE = new Date(2026, 7, 15);

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: Math.random(),
    amount: 0,
    type: "expense",
    category_id: null,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "",
    date: "2026-08-10",
    currency: "ARS",
    category_suggested: 0,
    ...overrides,
  };
}

function makeBudget(overrides: Partial<BudgetWithCategory> = {}): BudgetWithCategory {
  return {
    id: Math.random(),
    category_id: 1,
    currency: "ARS",
    amount: 1000,
    period: "monthly",
    category_name: "Comida",
    category_icon: "🍔",
    category_color: "#000000",
    ...overrides,
  };
}

function makeSavings(
  overrides: Partial<SavingsProgress["goal"]> = {},
  current = 0,
): SavingsProgress {
  return {
    goal: {
      id: Math.random(),
      name: "Viaje",
      target_amount: 1000,
      currency: "ARS",
      tracking_mode: "contributions",
      payment_method_id: null,
      target_date: null,
      created_at: "2026-01-01T00:00:00Z",
      payment_method_name: null,
      ...overrides,
    },
    current,
    remaining: 0,
    ratio: 0,
    isReached: false,
    monthlyPace: 0,
    projectedDate: null,
    requiredMonthlyPace: null,
    isOnTrack: null,
  };
}

const EMPTY = { transactions: [], budgets: [], savings: [] };

describe("buildMonthOverview: expenses", () => {
  it("adds up only this month's expenses, in the selected currency", () => {
    const transactions = [
      makeTransaction({ amount: 100, date: "2026-08-01" }),
      makeTransaction({ amount: 50, date: "2026-08-31" }),
      // Income in the same month, an expense in another one, and an expense in
      // another currency: none of the three belong in the total.
      makeTransaction({ amount: 900, type: "income", date: "2026-08-05" }),
      makeTransaction({ amount: 400, date: "2026-09-01" }),
      makeTransaction({ amount: 700, currency: "USD" }),
    ];

    const { expenses, monthKey } = buildMonthOverview(
      { ...EMPTY, transactions },
      "ARS",
      REFERENCE,
    );

    expect(monthKey).toBe("2026-08");
    expect(expenses.total).toBe(150);
  });

  it("compares against the previous month", () => {
    const transactions = [
      makeTransaction({ amount: 110, date: "2026-08-10" }),
      makeTransaction({ amount: 100, date: "2026-07-10" }),
    ];

    const { expenses } = buildMonthOverview({ ...EMPTY, transactions }, "ARS", REFERENCE);

    expect(expenses.previousTotal).toBe(100);
    expect(expenses.changeRatio).toBeCloseTo(0.1);
  });

  it("crosses the year boundary to find the previous month", () => {
    const transactions = [makeTransaction({ amount: 80, date: "2025-12-20" })];

    const { expenses } = buildMonthOverview(
      { ...EMPTY, transactions },
      "ARS",
      new Date(2026, 0, 15),
    );

    expect(expenses.previousTotal).toBe(80);
    expect(expenses.previousMonthKey).toBe("2025-12");
  });

  it("reports no change when the previous month had no expenses", () => {
    const transactions = [makeTransaction({ amount: 110 })];

    const { expenses } = buildMonthOverview({ ...EMPTY, transactions }, "ARS", REFERENCE);

    expect(expenses.previousTotal).toBe(0);
    expect(expenses.changeRatio).toBeNull();
  });
});

describe("buildMonthOverview: budget", () => {
  it("sums the monthly caps and what is left of them", () => {
    const budgets = [
      makeBudget({ category_id: 1, amount: 1000 }),
      makeBudget({ category_id: 2, amount: 500 }),
    ];
    const transactions = [makeTransaction({ amount: 300, category_id: 1 })];

    const overview = buildMonthOverview(
      { ...EMPTY, budgets, transactions },
      "ARS",
      REFERENCE,
    );

    expect(overview.budget).toMatchObject({
      cap: 1500,
      spent: 300,
      remaining: 1200,
      count: 2,
    });
    expect(overview.budget?.ratio).toBeCloseTo(0.2);
  });

  it("reports a negative remainder once the caps are exceeded", () => {
    const budgets = [makeBudget({ amount: 1000 })];
    const transactions = [makeTransaction({ amount: 1200, category_id: 1 })];

    const overview = buildMonthOverview(
      { ...EMPTY, budgets, transactions },
      "ARS",
      REFERENCE,
    );

    expect(overview.budget?.remaining).toBe(-200);
  });

  it("leaves out annual budgets and other currencies", () => {
    const budgets = [
      makeBudget({ period: "annual", amount: 90000 }),
      makeBudget({ currency: "USD", amount: 300 }),
      makeBudget({ amount: 1000 }),
    ];

    const overview = buildMonthOverview({ ...EMPTY, budgets }, "ARS", REFERENCE);

    expect(overview.budget).toMatchObject({ cap: 1000, count: 1 });
  });

  it("is null when nothing is budgeted in this currency", () => {
    const budgets = [makeBudget({ currency: "USD" })];

    expect(buildMonthOverview({ ...EMPTY, budgets }, "ARS", REFERENCE).budget).toBeNull();
  });
});

describe("buildMonthOverview: savings", () => {
  it("adds up the goals set in this currency", () => {
    const savings = [
      makeSavings({ target_amount: 1000 }, 250),
      makeSavings({ target_amount: 3000 }, 500),
      makeSavings({ currency: "USD", target_amount: 5000 }, 5000),
    ];

    const overview = buildMonthOverview({ ...EMPTY, savings }, "ARS", REFERENCE);

    expect(overview.savings).toMatchObject({
      saved: 750,
      target: 4000,
      remaining: 3250,
      count: 2,
    });
    expect(overview.savings?.ratio).toBeCloseTo(0.1875);
  });

  it("never reports a negative remainder once the target is passed", () => {
    const savings = [makeSavings({ target_amount: 1000 }, 1400)];

    const overview = buildMonthOverview({ ...EMPTY, savings }, "ARS", REFERENCE);

    expect(overview.savings?.remaining).toBe(0);
    expect(overview.savings?.ratio).toBeCloseTo(1.4);
  });

  it("is null when no goal uses this currency", () => {
    const savings = [makeSavings({ currency: "USD" })];

    expect(
      buildMonthOverview({ ...EMPTY, savings }, "ARS", REFERENCE).savings,
    ).toBeNull();
  });
});
