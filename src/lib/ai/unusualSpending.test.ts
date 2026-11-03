import { describe, expect, it } from "vitest";
import {
  MAD_FACTOR,
  MIN_CATEGORY_MOVEMENTS,
  MIN_MERCHANT_MOVEMENTS,
  MIN_RATIO,
  RECENT_DAYS,
  recentUnusualSpending,
  spendingBaselines,
  unusualSpending,
} from "./unusualSpending";
import { learnMerchantHistory } from "./merchantHistory";
import { TODAY, chargesOf, datesEvery, detect, movement } from "./testing/series";
import type { TaggedTransaction } from "./merchantHistory";

const CATEGORIES = [{ id: 3, name: "Farmacia" }];

function baselinesOf(transactions: TaggedTransaction[]) {
  return spendingBaselines(
    transactions,
    CATEGORIES,
    learnMerchantHistory(transactions, TODAY),
    detect(transactions),
  );
}

// Earlier expenses 11 days apart — no week or month, so no series — the last
// on `last`.
function earlier(
  description: string,
  amounts: number[],
  last = "2026-10-01",
  overrides: Partial<TaggedTransaction> = {},
) {
  return chargesOf(description, datesEvery(11, amounts.length, last), amounts, {
    category_id: 3,
    ...overrides,
  });
}

function judge(history: TaggedTransaction[], latest: TaggedTransaction) {
  return unusualSpending(latest, baselinesOf([...history, latest]));
}

describe("unusualSpending", () => {
  it(`holds an expense against ${MIN_MERCHANT_MOVEMENTS} earlier ones at the same merchant`, () => {
    const latest = movement("FARMACITY 123", "2026-10-05", {
      amount: 45000,
      category_id: 3,
    });
    const unusual = judge(
      earlier("FARMACITY 99", [8000, 7000, 9000, 8000, 8500]),
      latest,
    );

    expect(unusual).toMatchObject({
      id: `unusual:${latest.id}`,
      name: "Farmacity",
      typical: 8000,
      count: 5,
      reason:
        "Comparado con tus 5 gastos en Farmacity de los 6 meses anteriores: la mitad fue de menos de $ 8.000,00.",
    });
  });

  it(`falls back on ${MIN_CATEGORY_MOVEMENTS} earlier ones in the category`, () => {
    const latest = movement("Farmacia del barrio", "2026-10-05", {
      amount: 45000,
      category_id: 3,
    });
    const few = earlier("FARMACITY", [8000, 8000, 8000, 8000]);
    expect(judge(few, latest)).toBeNull();

    const more = [
      ...few,
      ...earlier("DR AHORRO", [8000, 8000, 8000, 8000], "2026-09-26"),
    ];
    expect(judge(more, latest)).toMatchObject({ name: "Farmacia", count: 8 });
  });

  it(`in a category, also needs ${MIN_RATIO} times its upper quartile`, () => {
    // A monthly fee among court bookings: far above the median of the
    // category, which the bookings set, but not above what its dearer quarter
    // costs.
    const history = [
      ...earlier("Turno", [6000, 6000, 6000, 6000, 6000, 6000]),
      ...earlier("Cuota club", [90000, 90000, 90000], "2026-09-28"),
    ];
    const fee = (amount: number) =>
      movement("Cuota gimnasio", "2026-10-05", { amount, category_id: 3 });

    expect(judge(history, fee(95000))).toBeNull();
    expect(judge(history, fee(180000))).toMatchObject({
      name: "Farmacia",
      typical: 6000,
    });
  });

  it("holds a typed fee against the earlier ones with its tags", () => {
    const history = [
      ...earlier("Mensual", [110000, 110000, 110000, 110000, 110000], "2026-10-01", {
        tag_names: "Tenis",
      }),
      ...earlier("Mensual", Array<number>(8).fill(10000), "2026-09-30", {
        tag_names: "Gimnasio",
      }),
    ];
    const fee = (amount: number, tag: string) =>
      movement("Mensual (octubre)", "2026-10-05", {
        amount,
        category_id: 3,
        tag_names: tag,
      });

    expect(judge(history, fee(130000, "Tenis"))).toBeNull();
    expect(judge(history, fee(30000, "Gimnasio"))).toMatchObject({
      name: "Mensual Gimnasio",
      typical: 10000,
    });
  });

  it(`takes ${MIN_RATIO} times the usual and not less`, () => {
    const history = earlier("FARMACITY", [8000, 8000, 8000, 8000, 8000]);
    expect(
      judge(history, movement("FARMACITY", "2026-10-05", { amount: 16000 })),
    ).not.toBeNull();
    expect(
      judge(history, movement("FARMACITY", "2026-10-05", { amount: 15999 })),
    ).toBeNull();
  });

  it(`needs more than ${MAD_FACTOR} typical distances above the usual`, () => {
    // Median 10.000, typical distance 5.000: unusual above 25.000.
    const history = earlier("FARMACITY", [5000, 5000, 10000, 15000, 15000]);
    expect(
      judge(history, movement("FARMACITY", "2026-10-05", { amount: 25000 })),
    ).toBeNull();
    expect(
      judge(history, movement("FARMACITY", "2026-10-05", { amount: 25001 })),
    ).not.toBeNull();
  });

  it("only reads the months before it", () => {
    const old = chargesOf(
      "FARMACITY",
      ["2026-01-02", "2026-01-12", "2026-02-02", "2026-02-12", "2026-03-02"],
      [8000, 8000, 8000, 8000, 8000],
    );
    expect(judge(old, movement("FARMACITY", "2026-10-05", { amount: 45000 }))).toBeNull();
  });

  it("leaves a series' charges to its own notice, and incomes alone", () => {
    const netflix = chargesOf(
      "NETFLIX",
      ["2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10"],
      [5000, 5000, 5000, 5000, 5000],
    );
    const doubled = movement("NETFLIX", "2026-10-05", { amount: 10000 });
    expect(judge(netflix, doubled)).toBeNull();

    const bonus = movement("FARMACITY", "2026-10-05", { type: "income", amount: 45000 });
    expect(judge(earlier("FARMACITY", [8000, 8000, 8000, 8000, 8000]), bonus)).toBeNull();
  });
});

describe("recentUnusualSpending", () => {
  const history = earlier("FARMACITY", [8000, 8000, 8000, 8000, 8000]);

  it(`brings up the last ${RECENT_DAYS} days, furthest above the usual first`, () => {
    const big = movement("FARMACITY", "2026-09-30", { amount: 80000 });
    const bigger = movement("FARMACITY", "2026-10-06", { amount: 90000 });
    const tooOld = movement("FARMACITY", "2026-09-29", { amount: 99000 });
    const all = [...history, big, bigger, tooOld];

    expect(
      recentUnusualSpending(all, baselinesOf(all), TODAY, () => false).map(
        (entry) => entry.movement.id,
      ),
    ).toEqual([bigger.id, big.id]);
  });

  it("keeps a dismissed one away", () => {
    const big = movement("FARMACITY", "2026-10-06", { amount: 80000 });
    const all = [...history, big];
    expect(
      recentUnusualSpending(
        all,
        baselinesOf(all),
        TODAY,
        (id) => id === `unusual:${big.id}`,
      ),
    ).toEqual([]);
  });
});
