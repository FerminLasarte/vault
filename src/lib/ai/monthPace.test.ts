import { describe, expect, it } from "vitest";
import {
  MIN_PACE_CHANGE,
  budgetPaces,
  crossingDay,
  monthPace,
  paceChange,
  paceReason,
  spendingPace,
} from "./monthPace";
import { TODAY, chargesOf, movement } from "./testing/series";
import { merchantIdOf } from "./merchantHistory";
import type { BudgetWithCategory } from "@/db/schema";

const MONTHS = ["2026-07", "2026-08", "2026-09"];

// The same two expenses every month: one early, one late.
function usualMonths(early: number, late: number) {
  return MONTHS.flatMap((month) =>
    chargesOf("Gasto", [`${month}-01`, `${month}-20`], [early, late]),
  );
}

function budget(overrides: Partial<BudgetWithCategory> = {}): BudgetWithCategory {
  return {
    id: 1,
    category_id: 3,
    currency: "ARS",
    amount: 35000,
    period: "monthly",
    category_name: "Salidas",
    category_icon: "🍻",
    category_color: "#000",
    ...overrides,
  };
}

describe("monthPace", () => {
  it("adds what usually follows to what was spent, rather than multiplying it", () => {
    const rentEveryMonth = MONTHS.flatMap((month) =>
      chargesOf("Alquiler y super", [`${month}-01`, `${month}-20`], [100000, 1000]),
    );
    const pace = monthPace(
      [...rentEveryMonth, ...chargesOf("Alquiler", ["2026-10-01"], [100000])],
      MONTHS,
      TODAY,
    );

    expect(pace).toMatchObject({
      day: 6,
      lastDay: 31,
      spent: 100000,
      rest: 1000,
      projected: 101000,
      typical: 101000,
      months: 3,
    });
    expect(paceChange(pace!)).toBeNull();
  });

  it("leaves out of what is still to come a monthly charge that came early", () => {
    const usual = MONTHS.flatMap((month) => [
      ...chargesOf("Alquiler", [`${month}-20`], [100000]),
      ...chargesOf("Super", [`${month}-25`], [1000]),
    ]);
    const early = chargesOf("Alquiler", ["2026-10-02"], [100000]);
    const rent = merchantIdOf({
      description: "Alquiler",
      type: "expense",
      currency: "ARS",
    });

    expect(monthPace([...usual, ...early], MONTHS, TODAY)?.projected).toBe(201000);
    expect(
      monthPace([...usual, ...early], MONTHS, TODAY, new Set([rent!]))?.projected,
    ).toBe(101000);
  });

  it("is null when nothing usually goes out", () => {
    expect(
      monthPace(chargesOf("Gasto", ["2026-10-02"], [500]), MONTHS, TODAY),
    ).toBeNull();
  });

  it(`says how far off a usual month it heads, from ${MIN_PACE_CHANGE * 100}% on`, () => {
    const heading = (spent: number) =>
      paceChange(
        monthPace(
          [...usualMonths(10000, 10000), ...chargesOf("Gasto", ["2026-10-02"], [spent])],
          MONTHS,
          TODAY,
        )!,
      );

    // A usual month is 20.000, and 10.000 of it comes after the 6th.
    expect(heading(30000)).toBeCloseTo(1);
    expect(heading(13000)).toBeCloseTo(MIN_PACE_CHANGE);
    expect(heading(12999)).toBeNull();
    expect(heading(6000)).toBeCloseTo(-0.2);
  });
});

describe("crossingDay", () => {
  const pace = monthPace(
    [...usualMonths(10000, 10000), ...chargesOf("Gasto", ["2026-10-02"], [30000])],
    MONTHS,
    TODAY,
  )!;

  it("is the day what usually follows takes the month past the cap", () => {
    expect(crossingDay(pace, 35000)).toBe(20);
  });

  it("is null when the month stays under it, or is already over", () => {
    expect(crossingDay(pace, 40000)).toBeNull();
    expect(crossingDay(pace, 29999)).toBeNull();
  });
});

describe("paceReason", () => {
  it("says what was spent and what usually follows", () => {
    const pace = monthPace(
      [...usualMonths(10000, 10000), ...chargesOf("Gasto", ["2026-10-02"], [30000])],
      MONTHS,
      TODAY,
    )!;
    expect(paceReason(pace, "ARS", " en Salidas")).toBe(
      "Hasta hoy gastaste $ 30.000,00 en Salidas. Del 7 a fin de mes solés gastar $ 10.000,00. Un mes habitual, $ 20.000,00 (la mediana de los últimos 3).",
    );
  });
});

describe("spendingPace", () => {
  it("reads every expense of one currency", () => {
    const pace = spendingPace(
      [
        ...usualMonths(10000, 10000),
        movement("Sueldo", "2026-09-01", { type: "income", amount: 900000 }),
        movement("Spotify", "2026-09-15", { currency: "USD", amount: 9 }),
        ...chargesOf("Gasto", ["2026-10-02"], [15000]),
      ],
      "ARS",
      TODAY,
    );
    expect(pace).toMatchObject({ spent: 15000, typical: 20000 });
  });

  it("is null with too few complete months", () => {
    expect(
      spendingPace(chargesOf("Gasto", ["2026-08-02"], [1]), "ARS", TODAY),
    ).toBeNull();
  });
});

describe("budgetPaces", () => {
  const salidas = (dates: string[], amounts: number[]) =>
    chargesOf("Bar", dates, amounts, { category_id: 3 });
  const history = [
    ...MONTHS.flatMap((month) => salidas([`${month}-01`, `${month}-20`], [10000, 10000])),
    ...salidas(["2026-10-02"], [30000]),
    // Another category, and the same one in dollars: neither counts.
    ...chargesOf("Coto", ["2026-10-03"], [90000], { category_id: 4 }),
    ...chargesOf("Bar", ["2026-10-03"], [90], { category_id: 3, currency: "USD" }),
  ];

  it("reads each monthly budget's own category and currency", () => {
    const paces = budgetPaces([budget()], history, TODAY);
    expect(paces.get(1)).toMatchObject({
      id: "pace:1:2026-10",
      crossingDay: 20,
      pace: { spent: 30000, projected: 40000 },
    });
  });

  it("leaves annual budgets out", () => {
    expect(budgetPaces([budget({ period: "annual" })], history, TODAY).size).toBe(0);
  });
});
