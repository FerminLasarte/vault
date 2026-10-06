import { describe, expect, it } from "vitest";
import {
  closeFacts,
  closeSignals,
  MIN_CATEGORY_CHANGE,
  MIN_CATEGORY_SHARE,
  MIN_RATE_CHANGE,
  NO_SIGNALS,
  type CloseFact,
  type CloseRise,
  type CloseUnusual,
} from "./closeFacts";
import { chargesOf, NOTHING_DECLARED } from "./testing/series";
import { buildMonthlyClose } from "@/lib/monthlyClose";
import type { TransactionWithCategory } from "@/db/schema";

let nextId = 1;

function tx(overrides: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: nextId++,
    amount: 100,
    type: "expense",
    category_id: 1,
    payment_method_id: 1,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Gasto",
    date: "2026-09-10",
    currency: "ARS",
    category_suggested: 0,
    category_name: "Comida",
    category_color: "#000",
    category_icon: "🍽️",
    payment_method_name: "Banco",
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  };
}

const CATEGORIES: Record<string, number> = {
  Comida: 1,
  Hogar: 2,
  Salidas: 3,
  Salud: 4,
};

// A month's income and its expenses by category, as movements.
function month(
  key: string,
  income: number,
  expenses: Record<string, number> = {},
): TransactionWithCategory[] {
  const rows: TransactionWithCategory[] = [];
  if (income > 0) {
    rows.push(
      tx({
        type: "income",
        amount: income,
        date: `${key}-01`,
        category_id: 9,
        category_name: "Sueldo",
      }),
    );
  }
  for (const [name, amount] of Object.entries(expenses)) {
    rows.push(
      tx({
        amount,
        date: `${key}-10`,
        category_id: CATEGORIES[name] ?? null,
        category_name: CATEGORIES[name] === undefined ? null : name,
      }),
    );
  }
  return rows;
}

function factsOf(
  transactions: TransactionWithCategory[],
  monthKey = "2026-09",
  signals = NO_SIGNALS,
): CloseFact[] {
  const [block] = buildMonthlyClose(transactions, monthKey).currencies;
  return closeFacts(block, signals);
}

function factOf<K extends CloseFact["kind"]>(facts: CloseFact[], kind: K) {
  return facts.find(
    (fact): fact is Extract<CloseFact, { kind: K }> => fact.kind === kind,
  );
}

describe("closeFacts: balance", () => {
  it.each([
    ["saved", 1000, { Comida: 600 }],
    ["overspent", 1000, { Comida: 1200 }],
    ["even", 1000, { Comida: 1000 }],
    ["onlyIncome", 1000, {}],
    ["onlyExpenses", 0, { Comida: 500 }],
  ] as const)("reads a %s month", (variant, income, expenses) => {
    expect(factOf(factsOf(month("2026-09", income, expenses)), "balance")?.variant).toBe(
      variant,
    );
  });
});

describe("closeFacts: saving rate", () => {
  it(`calls a rate ${MIN_RATE_CHANGE * 100} points above last month's higher`, () => {
    const facts = factsOf([
      ...month("2026-08", 1000, { Comida: 800 }),
      ...month("2026-09", 1000, { Comida: 750 }),
    ]);

    expect(factOf(facts, "savingRate")).toMatchObject({
      variant: "more",
      rate: 0.25,
      previousRate: 0.2,
      monthKey: "2026-08",
    });
  });

  it("calls a rate just under that gap about the same", () => {
    const facts = factsOf([
      ...month("2026-08", 1000, { Comida: 800 }),
      ...month("2026-09", 1000, { Comida: 751 }),
    ]);

    expect(factOf(facts, "savingRate")?.variant).toBe("steady");
  });

  it("calls it lower the other way", () => {
    const facts = factsOf([
      ...month("2026-08", 1000, { Comida: 700 }),
      ...month("2026-09", 1000, { Comida: 750 }),
    ]);

    expect(factOf(facts, "savingRate")?.variant).toBe("less");
  });

  it("tells a month that kept something after one that spent more than it got", () => {
    const facts = factsOf([
      ...month("2026-08", 1000, { Comida: 1100 }),
      ...month("2026-09", 1000, { Comida: 750 }),
    ]);

    expect(factOf(facts, "savingRate")?.variant).toBe("recovered");
  });

  it("says nothing of a rate when the month kept nothing", () => {
    const facts = factsOf([
      ...month("2026-08", 1000, { Comida: 800 }),
      ...month("2026-09", 1000, { Comida: 1000 }),
    ]);

    expect(factOf(facts, "savingRate")).toBeUndefined();
  });

  it("says nothing when last month had no income to compare against", () => {
    const facts = factsOf([
      ...month("2026-08", 0, { Comida: 800 }),
      ...month("2026-09", 1000, { Comida: 750 }),
    ]);

    expect(factOf(facts, "savingRate")).toBeUndefined();
  });

  it("compares with the same month a year ago, when that one kept something", () => {
    const kept = factsOf([
      ...month("2025-09", 1000, { Comida: 900 }),
      ...month("2026-09", 1000, { Comida: 750 }),
    ]);
    const spentMore = factsOf([
      ...month("2025-09", 1000, { Comida: 1100 }),
      ...month("2026-09", 1000, { Comida: 750 }),
    ]);

    expect(factOf(kept, "savingRateLastYear")).toMatchObject({
      variant: "more",
      previousRate: 0.1,
      monthKey: "2025-09",
    });
    expect(factOf(spentMore, "savingRateLastYear")).toBeUndefined();
  });
});

describe("closeFacts: categories", () => {
  it(`names a category up by ${MIN_CATEGORY_CHANGE * 100}% on last month`, () => {
    const facts = factsOf([
      ...month("2026-08", 0, { Comida: 1000, Hogar: 9000 }),
      ...month("2026-09", 0, { Comida: 1200, Hogar: 9000 }),
    ]);

    expect(factOf(facts, "categoryRise")).toMatchObject({
      category: "Comida",
      current: 1200,
      previous: 1000,
      change: 0.2,
      monthKey: "2026-08",
    });
  });

  it("leaves out a rise just under that", () => {
    const facts = factsOf([
      ...month("2026-08", 0, { Comida: 1000, Hogar: 9000 }),
      ...month("2026-09", 0, { Comida: 1199, Hogar: 9000 }),
    ]);

    expect(factOf(facts, "categoryRise")).toBeUndefined();
  });

  it(`needs the category to weigh ${MIN_CATEGORY_SHARE * 100}% of the month`, () => {
    const weighs = factsOf([
      ...month("2026-08", 0, { Comida: 400, Hogar: 9500 }),
      ...month("2026-09", 0, { Comida: 500, Hogar: 9500 }),
    ]);
    const tooSmall = factsOf([
      ...month("2026-08", 0, { Comida: 400, Hogar: 9800 }),
      ...month("2026-09", 0, { Comida: 500, Hogar: 9800 }),
    ]);

    expect(factOf(weighs, "categoryRise")?.category).toBe("Comida");
    expect(factOf(tooSmall, "categoryRise")).toBeUndefined();
  });

  it("never names the uncategorised", () => {
    const facts = factsOf([
      ...month("2026-08", 0, { "Sin categoría": 1000, Hogar: 9000 }),
      ...month("2026-09", 0, { "Sin categoría": 5000, Hogar: 9000 }),
    ]);

    expect(factOf(facts, "categoryRise")).toBeUndefined();
  });

  it("names the biggest fall, and a category that stopped", () => {
    const lower = factsOf([
      ...month("2026-08", 0, { Salidas: 2000, Hogar: 8000 }),
      ...month("2026-09", 0, { Salidas: 1000, Hogar: 8000 }),
    ]);
    const stopped = factsOf([
      ...month("2026-08", 0, { Salidas: 2000, Hogar: 8000 }),
      ...month("2026-09", 0, { Hogar: 8000 }),
    ]);

    expect(factOf(lower, "categoryFall")).toMatchObject({
      variant: "lower",
      category: "Salidas",
      change: 0.5,
    });
    expect(factOf(stopped, "categoryFall")).toMatchObject({
      variant: "stopped",
      previous: 2000,
    });
  });

  it("names a category that was not there last month", () => {
    const facts = factsOf([
      ...month("2026-08", 0, { Hogar: 9000 }),
      ...month("2026-09", 0, { Hogar: 9000, Salud: 1000 }),
    ]);

    expect(factOf(facts, "newCategory")).toMatchObject({
      category: "Salud",
      current: 1000,
    });
  });

  it("compares nothing in a month with nothing before it", () => {
    const facts = factsOf(month("2026-09", 1000, { Comida: 500 }));

    expect(facts.map((fact) => fact.kind)).toEqual(["balance"]);
  });
});

describe("closeFacts: what the movements say", () => {
  const rise = (name: string, value: number): CloseRise => ({
    name,
    previous: 1000,
    latest: 1000 * (1 + value),
    rise: value,
  });
  const unusual: CloseUnusual = {
    name: "Farmacity",
    amount: 45000,
    typical: 7000,
    date: "2026-09-04",
  };

  it.each([
    [1, "one"],
    [3, "several"],
    [4, "many"],
  ] as const)("words %i charges that went up as %s", (count, variant) => {
    const rises = Array.from({ length: count }, (_, index) => rise(`M${index}`, 0.2));
    const facts = factsOf(month("2026-09", 1000, { Comida: 500 }), "2026-09", {
      rises,
      unusual: [],
    });

    expect(factOf(facts, "rise")).toMatchObject({ variant, rises });
  });

  it.each([
    [1, "one", 0],
    [2, "two", 1],
    [3, "several", 2],
  ] as const)("words %i unusual expenses as %s", (count, variant, others) => {
    const facts = factsOf(month("2026-09", 1000, { Comida: 500 }), "2026-09", {
      rises: [],
      unusual: Array.from({ length: count }, () => unusual),
    });

    expect(factOf(facts, "unusual")).toMatchObject({ variant, top: unusual, others });
  });
});

describe("closeSignals", () => {
  // A monthly charge that went up in September, and one more after it.
  const netflix = chargesOf(
    "Netflix",
    ["2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10"],
    [5000, 5000, 5000, 5000, 5900, 7000],
  );
  // Never at a steady interval, so never a series: a place, not a charge.
  const pharmacy = chargesOf(
    "Farmacity",
    ["2026-04-03", "2026-05-20", "2026-06-02", "2026-07-28", "2026-08-05", "2026-09-04"],
    [7000, 6500, 7200, 7000, 6800, 45000],
  );

  it("finds the month's charges that went up and its unusual spending", () => {
    const signals = closeSignals(
      [...netflix, ...pharmacy],
      [],
      NOTHING_DECLARED,
      "2026-09",
    ).get("ARS");

    expect(signals?.rises).toEqual([
      { name: "Netflix", previous: 5000, latest: 5900, rise: expect.closeTo(0.18) },
    ]);
    expect(signals?.unusual).toEqual([
      { name: "Farmacity", amount: 45000, typical: 7000, date: "2026-09-04" },
    ]);
  });

  it("reads the month as it stood when it ended, whatever came after", () => {
    const before = closeSignals(netflix.slice(0, -1), [], NOTHING_DECLARED, "2026-09");
    const after = closeSignals(netflix, [], NOTHING_DECLARED, "2026-09");

    expect(after).toEqual(before);
  });

  it("does not hold a series' charge against the usual: it went up, it was not odd", () => {
    const signals = closeSignals(netflix, [], NOTHING_DECLARED, "2026-09").get("ARS");

    expect(signals?.unusual).toEqual([]);
  });

  it("leaves out a rise from an earlier month", () => {
    const signals = closeSignals(netflix, [], NOTHING_DECLARED, "2026-10").get("ARS");

    expect(signals?.rises.map((entry) => entry.latest)).toEqual([7000]);
  });
});
