import { describe, expect, it } from "vitest";
import { endOfMonthBreakdown, endOfMonthEstimate } from "./endOfMonth";
import { declaredMerchantIds } from "./series";
import {
  NOTHING_DECLARED,
  TODAY,
  chargesOf,
  movement,
  recurringTemplate,
} from "./testing/series";

const MONTHS = ["2026-07", "2026-08", "2026-09"];
const NOTHING = { monthKey: "2026-10", income: 0, expenses: 0 };

// The same thing on the same day of each complete month.
function everyMonth(description: string, day: string, amount: number, type = "expense") {
  return MONTHS.map((month) =>
    movement(description, `${month}-${day}`, {
      amount,
      type: type as "income" | "expense",
    }),
  );
}

const HISTORY = [
  ...everyMonth("Super", "01", 1000),
  ...everyMonth("Sueldo", "10", 500000, "income"),
  ...everyMonth("Super", "20", 40000),
  ...everyMonth("Netflix", "15", 5000),
  // Moves money between two accounts: the total stays.
  ...MONTHS.map((month) =>
    movement("A la caja de ahorro", `${month}-25`, { type: "transfer", amount: 99999 }),
  ),
  // The other currency is another pocket.
  ...chargesOf("Spotify", ["2026-09-21"], [9], { currency: "USD" }),
];

describe("endOfMonthEstimate", () => {
  it("adds to today's balance what usually comes and goes until the month ends", () => {
    const estimate = endOfMonthEstimate(
      {
        balance: 100000,
        committed: NOTHING,
        expected: NOTHING,
        transactions: HISTORY,
        known: declaredMerchantIds(NOTHING_DECLARED),
      },
      "ARS",
      TODAY,
    );

    expect(estimate).toEqual({
      date: "2026-10-31",
      balance: 100000,
      committed: { income: 0, expenses: 0 },
      expected: { income: 0, expenses: 0 },
      usual: { income: 500000, expenses: 45000 },
      estimate: 555000,
      months: 3,
    });
  });

  it("reads declared movements from their declarations, not twice", () => {
    const estimate = endOfMonthEstimate(
      {
        balance: 100000,
        committed: { monthKey: "2026-10", income: 0, expenses: 5500 },
        expected: { monthKey: "2026-10", income: 20000, expenses: 3000 },
        transactions: HISTORY,
        known: declaredMerchantIds({
          ...NOTHING_DECLARED,
          recurring: [recurringTemplate({ description: "Netflix", amount: 5500 })],
        }),
      },
      "ARS",
      TODAY,
    );

    expect(estimate?.usual).toEqual({ income: 500000, expenses: 40000 });
    expect(estimate?.estimate).toBe(100000 - 5500 + 20000 - 3000 + 500000 - 40000);
  });

  it("does not count again a monthly income that already came", () => {
    const estimate = endOfMonthEstimate(
      {
        balance: 600000,
        committed: NOTHING,
        expected: NOTHING,
        transactions: [
          ...HISTORY,
          movement("Sueldo", "2026-10-03", { type: "income", amount: 500000 }),
        ],
        known: new Set(["income:ARS:sueldo"]),
      },
      "ARS",
      TODAY,
    );

    expect(estimate?.usual).toEqual({ income: 0, expenses: 45000 });
  });

  it("is null with too few complete months", () => {
    expect(
      endOfMonthEstimate(
        {
          balance: 1,
          committed: NOTHING,
          expected: NOTHING,
          transactions: [movement("Super", "2026-09-02")],
          known: new Set(),
        },
        "ARS",
        TODAY,
      ),
    ).toBeNull();
  });
});

describe("endOfMonthBreakdown", () => {
  it("lists what the figure is made of, leaving out empty parts", () => {
    expect(
      endOfMonthBreakdown(
        {
          date: "2026-10-31",
          balance: 100000,
          committed: { income: 0, expenses: 5500 },
          expected: { income: 0, expenses: 0 },
          usual: { income: 500000, expenses: 40000 },
          estimate: 554500,
          months: 3,
        },
        "ARS",
      ),
    ).toEqual([
      "Hoy: $ 100.000,00",
      "Compromisos que faltan: −$ 5.500,00",
      "Lo que suele entrar hasta fin de mes: +$ 500.000,00",
      "Lo que solés gastar hasta fin de mes: −$ 40.000,00",
      "Lo habitual es la mediana de los últimos 3 meses, sin lo que ya está en compromisos.",
    ]);
  });
});
