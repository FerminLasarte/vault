import { describe, expect, it } from "vitest";
import {
  MAX_BUDGET_SPREAD,
  budgetProposals,
  categorySpending,
  roundBudget,
  suggestBudget,
} from "./budgetSuggestions";
import { TODAY, chargesOf, movement } from "./testing/series";
import type { Category, Transaction } from "@/db/schema";

const MONTHS = ["2026-07-01", "2026-08-01", "2026-09-01"];

function category(
  id: number,
  name: string,
  type: Category["type"] = "expense",
): Category {
  return { id, name, type, color: "#000", icon: "•" };
}

const COMIDA = category(3, "Comida");
const SALIDAS = category(4, "Salidas");
const SUELDO = category(5, "Sueldo", "income");
const CATEGORIES = [COMIDA, SALIDAS, SUELDO];

// One expense per month in a category, with these amounts.
function monthly(categoryId: number, amounts: number[], currency = "ARS"): Transaction[] {
  return chargesOf("Gasto", MONTHS, amounts, { category_id: categoryId, currency });
}

const nothingDismissed = () => false;

describe("roundBudget", () => {
  it("rounds up to two significant figures", () => {
    expect(roundBudget(47320)).toBe(48000);
    expect(roundBudget(48000)).toBe(48000);
    expect(roundBudget(85.4)).toBe(86);
    expect(roundBudget(1234567)).toBe(1300000);
    expect(roundBudget(7.31)).toBe(7.4);
    expect(roundBudget(0)).toBe(0);
  });
});

describe("suggestBudget", () => {
  const spending = categorySpending(monthly(3, [40000, 47320, 52000]), TODAY)!;

  it("starts a monthly budget at the median month, rounded up", () => {
    expect(suggestBudget(spending, COMIDA, "ARS", "monthly")).toEqual({
      id: "budget:3:ARS",
      categoryId: 3,
      currency: "ARS",
      monthly: 47320,
      amount: 48000,
      reason:
        "En los últimos 3 meses gastaste en Comida cerca de $ 47.320,00 por mes: la mitad de los meses más, la otra mitad menos. Redondeado.",
    });
  });

  it("starts an annual one at twelve of them", () => {
    expect(suggestBudget(spending, COMIDA, "ARS", "annual")).toMatchObject({
      amount: 570000,
    });
  });

  it("has nothing for a category or currency with nothing spent", () => {
    expect(suggestBudget(spending, SALIDAS, "ARS", "monthly")).toBeNull();
    expect(suggestBudget(spending, COMIDA, "USD", "monthly")).toBeNull();
  });

  it("needs enough complete months", () => {
    expect(categorySpending(chargesOf("Gasto", ["2026-08-10"], [1]), TODAY)).toBeNull();
  });
});

describe("budgetProposals", () => {
  const propose = (
    transactions: Transaction[],
    budgets: { category_id: number; currency: string }[] = [],
  ) =>
    budgetProposals(
      categorySpending(transactions, TODAY)!,
      budgets,
      CATEGORIES,
      nothingDismissed,
    );

  it("proposes steady categories with no budget, by currency and biggest first", () => {
    const proposals = propose([
      ...monthly(4, [10000, 11000, 12000]),
      ...monthly(3, [40000, 45000, 50000]),
      ...monthly(3, [100, 100, 100], "USD"),
    ]);
    expect(proposals.map((proposal) => proposal.id)).toEqual([
      "budget:3:ARS",
      "budget:4:ARS",
      "budget:3:USD",
    ]);
  });

  it("leaves out what already has a budget in that currency", () => {
    expect(
      propose(monthly(3, [40000, 45000, 50000]), [{ category_id: 3, currency: "ARS" }]),
    ).toEqual([]);
  });

  it("needs spending in every month read", () => {
    const history = [
      ...monthly(4, [1000, 1000, 1000]),
      ...chargesOf("Gasto", ["2026-07-10", "2026-09-10"], [5000, 5000], {
        category_id: 3,
      }),
    ];
    expect(propose(history).map((proposal) => proposal.categoryId)).toEqual([4]);
  });

  it(`takes a spread of ${MAX_BUDGET_SPREAD * 100}% and not more`, () => {
    // Median 10.000, typical distance 5.000.
    expect(propose(monthly(3, [5000, 10000, 15000]))).toHaveLength(1);
    expect(propose(monthly(3, [4999, 10000, 15001]))).toEqual([]);
  });

  it("is only about expense categories, and keeps a dismissed one away", () => {
    const history = [
      ...monthly(3, [1000, 1000, 1000]),
      ...chargesOf("Sueldo", MONTHS, [9, 9, 9], { category_id: 5 }),
      movement("Sueldo", "2026-08-01", { type: "income", category_id: 5 }),
    ];
    expect(
      budgetProposals(
        categorySpending(history, TODAY)!,
        [],
        CATEGORIES,
        (id) => id === "budget:3:ARS",
      ),
    ).toEqual([]);
  });
});
