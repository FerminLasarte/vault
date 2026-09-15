import { describe, expect, it } from "vitest";
import type { TransactionWithCategory } from "@/db/schema";
import type { CategoryBreakdownEntry } from "@/lib/finance";
import {
  buildMonthlyClose,
  closedMonthKeys,
  compareByCategory,
  hasClose,
  lastClosedMonthKey,
} from "@/lib/monthlyClose";
import type { MonthlyClose } from "@/lib/monthlyClose";

let nextId = 1;

function tx(overrides: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: nextId++,
    amount: 100,
    type: "expense",
    category_id: 1,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Gasto",
    date: "2026-08-10",
    currency: "ARS",
    category_name: "Comida",
    category_color: "#f97316",
    category_icon: "🍽️",
    payment_method_name: null,
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  };
}

function entry(
  categoryId: number | null,
  name: string,
  total: number,
): CategoryBreakdownEntry {
  return { categoryId, name, color: "#000000", total };
}

describe("compareByCategory", () => {
  it("pairs a category with its own figure in the other period", () => {
    const [change] = compareByCategory(
      [entry(1, "Comida", 150)],
      [entry(1, "Comida", 100)],
      150,
    );

    expect(change).toMatchObject({ current: 150, previous: 100, delta: 50 });
    expect(change.changeRatio).toBeCloseTo(0.5);
  });

  it("keeps a category that only exists in the current month", () => {
    const [change] = compareByCategory([entry(2, "Salud", 80)], [], 80);

    expect(change).toMatchObject({ name: "Salud", current: 80, previous: 0, delta: 80 });
    // Every rise from nothing is infinite, which is true and useless.
    expect(change.changeRatio).toBeNull();
  });

  it("keeps a category that only existed in the other period", () => {
    // Something that stopped is a change, and dropping it would let the table
    // hide exactly what a comparison exists to show.
    const [change] = compareByCategory([], [entry(3, "Ocio", 60)], 0);

    expect(change).toMatchObject({
      name: "Ocio",
      current: 0,
      previous: 60,
      delta: -60,
      changeRatio: -1,
    });
  });

  it("orders by the size of the move, largest first", () => {
    const changes = compareByCategory(
      [entry(1, "Comida", 110), entry(2, "Alquiler", 500)],
      [entry(1, "Comida", 100), entry(2, "Alquiler", 300)],
      610,
    );

    expect(changes.map((change) => change.name)).toEqual(["Alquiler", "Comida"]);
  });

  it("ranks a big drop above a small rise", () => {
    const changes = compareByCategory(
      [entry(1, "Comida", 105), entry(2, "Ocio", 10)],
      [entry(1, "Comida", 100), entry(2, "Ocio", 200)],
      115,
    );

    expect(changes[0].name).toBe("Ocio");
  });

  it("computes each share of the month's own total", () => {
    const changes = compareByCategory(
      [entry(1, "Comida", 250), entry(2, "Ocio", 750)],
      [],
      1000,
    );

    expect(changes.map((change) => change.share)).toEqual([0.75, 0.25]);
  });

  it("gives every share as zero when the month spent nothing", () => {
    // Guards the division rather than producing Infinity or NaN in the table.
    const changes = compareByCategory([], [entry(1, "Comida", 100)], 0);
    expect(changes[0].share).toBe(0);
  });

  it("treats uncategorised movements as one line, not one per transaction", () => {
    const changes = compareByCategory(
      [entry(null, "Sin categoría", 40)],
      [entry(null, "Sin categoría", 25)],
      40,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].delta).toBe(15);
  });
});

// The month's block for one currency, which is where every per-currency figure
// now lives.
function blockFor(close: MonthlyClose, currency: string) {
  const block = close.currencies.find((entry) => entry.currency === currency);
  if (!block) throw new Error(`No block for ${currency}`);
  return block;
}

describe("buildMonthlyClose", () => {
  const history = [
    // August 2026, the month being closed.
    tx({ date: "2026-08-10", amount: 300, type: "expense" }),
    tx({
      date: "2026-08-20",
      amount: 1000,
      type: "income",
      category_id: 9,
      category_name: "Salario",
    }),
    // July 2026.
    tx({ date: "2026-07-10", amount: 200, type: "expense" }),
    // August 2025.
    tx({ date: "2025-08-10", amount: 150, type: "expense" }),
  ];

  it("summarises the month itself", () => {
    const close = buildMonthlyClose(history, "2026-08");

    expect(blockFor(close, "ARS").summary).toEqual({
      income: 1000,
      expenses: 300,
      balance: 700,
    });
    expect(close.transactionCount).toBe(2);
  });

  it("splits the month into income and expense categories", () => {
    const block = blockFor(buildMonthlyClose(history, "2026-08"), "ARS");

    expect(block.expensesByCategory.map((e) => e.name)).toEqual(["Comida"]);
    expect(block.incomeByCategory.map((e) => e.name)).toEqual(["Salario"]);
  });

  it("compares against the previous month", () => {
    const block = blockFor(buildMonthlyClose(history, "2026-08"), "ARS");

    expect(block.previousMonth?.monthKey).toBe("2026-07");
    expect(block.previousMonth?.expenses[0]).toMatchObject({
      current: 300,
      previous: 200,
      delta: 100,
    });
  });

  it("compares against the same month a year earlier", () => {
    const block = blockFor(buildMonthlyClose(history, "2026-08"), "ARS");

    expect(block.lastYear?.monthKey).toBe("2025-08");
    expect(block.lastYear?.expenses[0]).toMatchObject({ current: 300, previous: 150 });
  });

  it("omits a comparison against a month with nothing on record", () => {
    // Rather than comparing against zero, which would read as "all of this is
    // new" when the truth is that there is nothing to say.
    const block = blockFor(
      buildMonthlyClose([tx({ date: "2026-08-10" })], "2026-08"),
      "ARS",
    );

    expect(block.previousMonth).toBeNull();
    expect(block.lastYear).toBeNull();
  });

  it("crosses the year boundary going backwards", () => {
    const january = [
      tx({ date: "2026-01-10", amount: 300 }),
      tx({ date: "2025-12-10", amount: 200 }),
      tx({ date: "2025-01-10", amount: 100 }),
    ];
    const block = blockFor(buildMonthlyClose(january, "2026-01"), "ARS");

    expect(block.previousMonth?.monthKey).toBe("2025-12");
    expect(block.lastYear?.monthKey).toBe("2025-01");
  });

  it("covers every currency the month moved, in one close", () => {
    // The whole point: reading the peso block must not mean missing the dollars.
    const mixed = [
      tx({ date: "2026-08-10", amount: 300, currency: "ARS" }),
      tx({ date: "2026-08-11", amount: 50, currency: "USD" }),
    ];
    const close = buildMonthlyClose(mixed, "2026-08");

    expect(close.currencies.map((entry) => entry.currency)).toEqual(["ARS", "USD"]);
    expect(close.transactionCount).toBe(2);
  });

  it("never lets one currency's figures leak into another's", () => {
    const mixed = [
      tx({ date: "2026-08-10", amount: 300, currency: "ARS" }),
      tx({ date: "2026-08-11", amount: 50, currency: "USD" }),
      tx({ date: "2026-07-10", amount: 200, currency: "ARS" }),
      tx({ date: "2026-07-11", amount: 90, currency: "USD" }),
    ];
    const close = buildMonthlyClose(mixed, "2026-08");

    expect(blockFor(close, "ARS").summary.expenses).toBe(300);
    expect(blockFor(close, "ARS").previousMonth?.summary.expenses).toBe(200);
    expect(blockFor(close, "USD").summary.expenses).toBe(50);
    expect(blockFor(close, "USD").previousMonth?.summary.expenses).toBe(90);
  });

  it("leaves out a currency that did not move that month", () => {
    // A block of zeroes would say nothing except that nothing happened.
    const close = buildMonthlyClose([tx({ date: "2026-08-10" })], "2026-08");
    expect(close.currencies.map((entry) => entry.currency)).toEqual(["ARS"]);
  });

  it("compares a currency against its own history, not the month's", () => {
    // USD moved in August but never before it: its comparison is empty even
    // though the peso side has plenty to compare against.
    const mixed = [
      tx({ date: "2026-08-11", amount: 50, currency: "USD" }),
      tx({ date: "2026-08-10", amount: 300, currency: "ARS" }),
      tx({ date: "2026-07-10", amount: 200, currency: "ARS" }),
    ];
    const close = buildMonthlyClose(mixed, "2026-08");

    expect(blockFor(close, "ARS").previousMonth).not.toBeNull();
    expect(blockFor(close, "USD").previousMonth).toBeNull();
  });

  it("reports an empty month as having no currencies at all", () => {
    const close = buildMonthlyClose(history, "2026-03");

    expect(close.currencies).toEqual([]);
    expect(close.transactionCount).toBe(0);
  });
});

describe("lastClosedMonthKey", () => {
  it("is the month before the one being lived in", () => {
    expect(lastClosedMonthKey(new Date(2026, 7, 22))).toBe("2026-07");
  });

  it("crosses the year boundary", () => {
    expect(lastClosedMonthKey(new Date(2026, 0, 3))).toBe("2025-12");
  });

  it("does not change on the last day of the month", () => {
    // The month being lived in is never closed, however little of it is left.
    expect(lastClosedMonthKey(new Date(2026, 7, 31))).toBe("2026-07");
  });
});

describe("buildMonthlyClose with transfers", () => {
  const transfer = (overrides: Partial<TransactionWithCategory>) =>
    tx({
      type: "transfer",
      category_id: null,
      destination_payment_method_id: 2,
      ...overrides,
    });

  it("gives no block to a currency that only moved between accounts", () => {
    const close = buildMonthlyClose(
      [tx({ date: "2026-08-10" }), transfer({ date: "2026-08-12", currency: "USD" })],
      "2026-08",
    );

    expect(close.currencies.map((block) => block.currency)).toEqual(["ARS"]);
  });

  it("draws no comparison against a month that only moved between accounts", () => {
    const close = buildMonthlyClose(
      [tx({ date: "2026-08-10" }), transfer({ date: "2026-07-12" })],
      "2026-08",
    );

    expect(blockFor(close, "ARS").previousMonth).toBeNull();
  });
});

describe("hasClose", () => {
  it("is true for a month with movements", () => {
    expect(hasClose([tx({ date: "2026-07-10" })], "2026-07")).toBe(true);
  });

  it("is false for a month with nothing", () => {
    // Announcing it would be telling the user their report on nothing is ready.
    expect(hasClose([tx({ date: "2026-07-10" })], "2026-06")).toBe(false);
  });

  it("counts a movement in any currency", () => {
    // The close covers all of them, so any one of them makes it worth offering.
    expect(hasClose([tx({ date: "2026-07-10", currency: "USD" })], "2026-07")).toBe(true);
  });

  it("is false for a month with only transfers", () => {
    // Moving money between two accounts earns nothing and spends nothing, so a
    // close of that month would be a report of zeroes.
    const history = [tx({ date: "2026-07-10", type: "transfer", category_id: null })];
    expect(hasClose(history, "2026-07")).toBe(false);
  });
});

describe("closedMonthKeys", () => {
  const TODAY = new Date(2026, 7, 22);

  it("lists the months that have movements, newest first", () => {
    const history = [
      tx({ date: "2026-05-04" }),
      tx({ date: "2026-07-10" }),
      tx({ date: "2026-06-30" }),
    ];

    expect(closedMonthKeys(history, TODAY)).toEqual(["2026-07", "2026-06", "2026-05"]);
  });

  it("leaves out the month being lived in", () => {
    // A close that can still change under the reader is not a close.
    const history = [tx({ date: "2026-08-02" }), tx({ date: "2026-07-10" })];
    expect(closedMonthKeys(history, TODAY)).toEqual(["2026-07"]);
  });

  it("leaves out months with nothing in them", () => {
    // June is skipped entirely rather than listed with a report of nothing.
    const history = [tx({ date: "2026-07-10" }), tx({ date: "2026-05-10" })];
    expect(closedMonthKeys(history, TODAY)).toEqual(["2026-07", "2026-05"]);
  });

  it("counts each month once, however many movements it holds", () => {
    const history = [
      tx({ date: "2026-07-01" }),
      tx({ date: "2026-07-15" }),
      tx({ date: "2026-07-31" }),
    ];

    expect(closedMonthKeys(history, TODAY)).toEqual(["2026-07"]);
  });

  it("lists a month that only moved in a foreign currency", () => {
    // It still has a close to offer, and leaving it out would hide a month.
    const history = [tx({ date: "2026-06-10", currency: "USD" })];
    expect(closedMonthKeys(history, TODAY)).toEqual(["2026-06"]);
  });

  it("orders across a year boundary by date, not by month number", () => {
    const history = [tx({ date: "2025-12-10" }), tx({ date: "2026-01-10" })];
    expect(closedMonthKeys(history, TODAY)).toEqual(["2026-01", "2025-12"]);
  });

  it("is empty when nothing has closed yet", () => {
    expect(closedMonthKeys([tx({ date: "2026-08-02" })], TODAY)).toEqual([]);
  });

  it("leaves out a month with only transfers", () => {
    // Listed, it had no income or expense to show and Cierres crashed on it.
    const history = [
      tx({ date: "2026-07-10" }),
      tx({ date: "2026-06-10", type: "transfer", category_id: null }),
    ];
    expect(closedMonthKeys(history, TODAY)).toEqual(["2026-07"]);
  });
});
