import { describe, expect, it } from "vitest";
import {
  MIN_STANDOUT_CHANGE,
  MIN_STANDOUT_SHARE,
  monthStandout,
  standoutText,
} from "./monthStandout";
import {
  categoryPaceKey,
  type BudgetPace,
  type CategoryPace,
  type Pace,
} from "./monthPace";
import { TODAY } from "./testing/series";
import type { UnusualSpending } from "./unusualSpending";
import type { BudgetWithCategory } from "@/db/schema";

function pace(projected: number, typical: number): Pace {
  return {
    day: 6,
    lastDay: 31,
    spent: projected - typical / 2,
    rest: typical / 2,
    projected,
    typical,
    months: 6,
    curves: [],
  };
}

function paces(
  entries: [categoryId: number, projected: number, typical: number, currency?: string][],
): Map<string, CategoryPace> {
  return new Map(
    entries.map(([categoryId, projected, typical, currency = "ARS"]) => [
      categoryPaceKey(categoryId, currency),
      { categoryId, currency, pace: pace(projected, typical) },
    ]),
  );
}

const NAMES = new Map([
  [1, "Comida"],
  [3, "Salidas"],
]);

// A usual month spends 100.000 in all, so 5.000 above the usual is the least
// worth a line.
function standoutOf(
  categoryPaces: Map<string, CategoryPace>,
  overrides: Partial<Parameters<typeof monthStandout>[1]> = {},
) {
  return monthStandout(categoryPaces, {
    currency: "ARS",
    typicalSpending: 100000,
    budgetPaces: [],
    unusual: [],
    categoryNames: NAMES,
    isDismissed: () => false,
    today: TODAY,
    ...overrides,
  });
}

describe("monthStandout", () => {
  it(`names a category heading ${MIN_STANDOUT_CHANGE * 100}% above its usual month`, () => {
    expect(standoutOf(paces([[3, 26000, 20000]]))).toMatchObject({
      id: "standout:ARS:3:2026-10",
      name: "Salidas",
      change: expect.closeTo(0.3),
    });
  });

  it("stays quiet just under that", () => {
    expect(standoutOf(paces([[3, 25999, 20000]]))).toBeNull();
  });

  it(`needs it to be ${MIN_STANDOUT_SHARE * 100}% of a usual month's spending`, () => {
    expect(standoutOf(paces([[3, 10000, 5000]]))?.name).toBe("Salidas");
    expect(standoutOf(paces([[3, 9999, 5000]]))).toBeNull();
  });

  it("never names a category below its usual month", () => {
    expect(standoutOf(paces([[3, 5000, 20000]]))).toBeNull();
  });

  it("picks the one furthest above, in money", () => {
    const found = standoutOf(
      paces([
        [3, 20000, 10000],
        [1, 90000, 60000],
      ]),
    );

    expect(found?.name).toBe("Comida");
  });

  it("reads only the currency on screen", () => {
    expect(standoutOf(paces([[3, 26000, 20000, "USD"]]))).toBeNull();
  });

  it("leaves to Atención a category whose budget the month is heading past", () => {
    const passing = {
      budget: { category_id: 3, currency: "ARS", amount: 25000 } as BudgetWithCategory,
      pace: pace(26000, 20000),
    } as BudgetPace;
    const holding = {
      ...passing,
      budget: { ...passing.budget, amount: 30000 },
    };

    expect(standoutOf(paces([[3, 26000, 20000]]), { budgetPaces: [passing] })).toBeNull();
    expect(
      standoutOf(paces([[3, 26000, 20000]]), { budgetPaces: [holding] }),
    ).not.toBeNull();
  });

  it("leaves to Atención a category with an unusual expense it is raising", () => {
    const unusual = (category_id: number, currency = "ARS") =>
      ({ movement: { category_id, currency } }) as UnusualSpending;

    expect(standoutOf(paces([[3, 26000, 20000]]), { unusual: [unusual(3)] })).toBeNull();
    expect(
      standoutOf(paces([[3, 26000, 20000]]), { unusual: [unusual(3, "USD")] }),
    ).not.toBeNull();
  });

  it("stays away for the month once dismissed", () => {
    const found = standoutOf(paces([[3, 26000, 20000]]), {
      isDismissed: (id) => id === "standout:ARS:3:2026-10",
    });

    expect(found).toBeNull();
  });

  it("says where the month is heading, and why", () => {
    const found = standoutOf(paces([[3, 36000, 20000]]))!;
    const { title, reason } = standoutText(found, "ARS");

    expect(title).toBe("Este mes Salidas viene un 80% arriba de lo habitual");
    expect(reason.replace(/\u00a0/g, " ")).toBe(
      "Si el resto del mes va como siempre, llegás a $ 36.000,00. Hasta hoy gastaste $ 26.000,00 en Salidas. Del 7 a fin de mes solés gastar $ 10.000,00. Un mes habitual, $ 20.000,00 (la mediana de los últimos 6).",
    );
  });
});
