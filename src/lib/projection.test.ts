import { describe, expect, it } from "vitest";
import type {
  ExpectedMovementWithNames,
  InstallmentPlanWithNames,
  LoanWithNames,
  RecurringTransactionWithNames,
} from "@/db/schema";
import { projectCommitments, projectExpected, withoutEmptyTail } from "@/lib/projection";

const EMPTY = { recurring: [], installmentPlans: [], loans: [] };

function makeRecurring(
  overrides: Partial<RecurringTransactionWithNames> = {},
): RecurringTransactionWithNames {
  return {
    id: Math.random(),
    description: "Alquiler",
    amount: 100,
    type: "expense",
    category_id: null,
    payment_method_id: null,
    currency: "ARS",
    frequency: "monthly",
    start_date: "2026-01-10",
    last_confirmed_date: null,
    is_active: 1,
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

function makePlan(
  overrides: Partial<InstallmentPlanWithNames> = {},
): InstallmentPlanWithNames {
  return {
    id: Math.random(),
    description: "Heladera",
    total_amount: 1200,
    installment_count: 12,
    currency: "ARS",
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-01-05",
    confirmed_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    cash_price: null,
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

function makeLoan(overrides: Partial<LoanWithNames> = {}): LoanWithNames {
  return {
    id: Math.random(),
    direction: "borrowed",
    counterparty: "Banco",
    description: "",
    principal: 1200,
    currency: "ARS",
    annual_rate: 0,
    installment_count: 12,
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-01-15",
    confirmed_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

describe("projectCommitments", () => {
  it("has nothing to say when nothing is committed", () => {
    expect(projectCommitments(EMPTY, ["2026-09"], "ARS")).toEqual([
      { monthKey: "2026-09", income: 0, expenses: 0 },
    ]);
  });

  it("carries a recurring expense into every month ahead", () => {
    const months = projectCommitments(
      { ...EMPTY, recurring: [makeRecurring({ amount: 250 })] },
      ["2026-09", "2026-10"],
      "ARS",
    );

    expect(months.map((month) => month.expenses)).toEqual([250, 250]);
  });

  it("counts a recurring income as income", () => {
    const [month] = projectCommitments(
      { ...EMPTY, recurring: [makeRecurring({ type: "income", amount: 900 })] },
      ["2026-09"],
      "ARS",
    );

    expect(month).toMatchObject({ income: 900, expenses: 0 });
  });

  it("adds up several occurrences of a weekly series in the same month", () => {
    const [month] = projectCommitments(
      {
        ...EMPTY,
        recurring: [
          makeRecurring({ frequency: "weekly", start_date: "2026-08-07", amount: 10 }),
        ],
      },
      ["2026-09"],
      "ARS",
    );

    // 4, 11, 18 and 25 September.
    expect(month.expenses).toBe(40);
  });

  it("leaves out paused templates and other currencies", () => {
    const [month] = projectCommitments(
      {
        ...EMPTY,
        recurring: [
          makeRecurring({ is_active: 0 }),
          makeRecurring({ currency: "USD" }),
          makeRecurring({ amount: 70 }),
        ],
      },
      ["2026-09"],
      "ARS",
    );

    expect(month.expenses).toBe(70);
  });

  it("skips occurrences already confirmed, which are real transactions by now", () => {
    const [month] = projectCommitments(
      {
        ...EMPTY,
        recurring: [makeRecurring({ last_confirmed_date: "2026-09-10", amount: 100 })],
      },
      ["2026-09"],
      "ARS",
    );

    expect(month.expenses).toBe(0);
  });

  it("schedules the instalments still to be confirmed", () => {
    const [september, october] = projectCommitments(
      { ...EMPTY, installmentPlans: [makePlan({ confirmed_count: 3 })] },
      ["2026-09", "2026-10"],
      "ARS",
    );

    // 1200 over 12 instalments, and the eighth and ninth fall in those months.
    expect(september.expenses).toBe(100);
    expect(october.expenses).toBe(100);
  });

  it("ignores instalments the user already confirmed", () => {
    const [month] = projectCommitments(
      // Every instalment through October already recorded.
      { ...EMPTY, installmentPlans: [makePlan({ confirmed_count: 10 })] },
      ["2026-09"],
      "ARS",
    );

    expect(month.expenses).toBe(0);
  });

  it("treats money borrowed as an expense and money lent as income", () => {
    const [borrowed] = projectCommitments(
      { ...EMPTY, loans: [makeLoan({ direction: "borrowed" })] },
      ["2026-09"],
      "ARS",
    );
    const [lent] = projectCommitments(
      { ...EMPTY, loans: [makeLoan({ direction: "lent" })] },
      ["2026-09"],
      "ARS",
    );

    expect(borrowed.expenses).toBe(100);
    expect(borrowed.income).toBe(0);
    expect(lent.income).toBe(100);
    expect(lent.expenses).toBe(0);
  });

  it("adds the three sources together in the same month", () => {
    const [month] = projectCommitments(
      {
        recurring: [makeRecurring({ amount: 250 })],
        installmentPlans: [makePlan()],
        loans: [makeLoan()],
      },
      ["2026-09"],
      "ARS",
    );

    expect(month.expenses).toBe(450);
  });
});

describe("projectExpected", () => {
  function makeExpected(
    overrides: Partial<ExpectedMovementWithNames> = {},
  ): ExpectedMovementWithNames {
    return {
      id: Math.random(),
      description: "Casamiento",
      amount: 100,
      type: "expense",
      currency: "ARS",
      category_id: null,
      payment_method_id: null,
      due_date: "2026-09-15",
      status: "pending",
      transaction_id: null,
      created_at: "2026-08-01T00:00:00.000Z",
      category_name: null,
      category_icon: null,
      payment_method_name: null,
      ...overrides,
    };
  }

  it("puts each movement in the month it falls due", () => {
    const months = projectExpected(
      [
        makeExpected({ amount: 100, due_date: "2026-09-15" }),
        makeExpected({ amount: 300, due_date: "2026-10-02" }),
      ],
      ["2026-09", "2026-10"],
      "ARS",
    );

    expect(months.map((month) => month.expenses)).toEqual([100, 300]);
  });

  it("reaches the last day of a month, whatever its length", () => {
    const [february] = projectExpected(
      [makeExpected({ due_date: "2026-02-28" })],
      ["2026-02"],
      "ARS",
    );

    expect(february.expenses).toBe(100);
  });

  // The point of keeping this apart from projectCommitments: the two totals are
  // never summed for the caller, so nothing downstream can present an intention
  // as a debt.
  it("counts nothing that projectCommitments already counts", () => {
    const [month] = projectExpected([], ["2026-09"], "ARS");
    expect(month).toEqual({ monthKey: "2026-09", income: 0, expenses: 0 });
  });
});

describe("withoutEmptyTail", () => {
  const month = (monthKey: string, expenses = 0, income = 0) => ({
    monthKey,
    income,
    expenses,
  });

  // The case that put three empty months on the chart's axis, under a caption
  // explaining bars that were not there.
  it("returns nothing when no month has anything in it", () => {
    expect(
      withoutEmptyTail([month("2026-10"), month("2026-11"), month("2026-12")]),
    ).toEqual([]);
  });

  it("drops the empty months after the last one with a figure", () => {
    const months = withoutEmptyTail([
      month("2026-10", 500),
      month("2026-11"),
      month("2026-12"),
    ]);

    expect(months.map((entry) => entry.monthKey)).toEqual(["2026-10"]);
  });

  // Closing the gap would sit October next to December and read as consecutive.
  it("keeps an empty month that sits between two that are not", () => {
    const months = withoutEmptyTail([
      month("2026-10", 500),
      month("2026-11"),
      month("2026-12", 300),
    ]);

    expect(months.map((entry) => entry.monthKey)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });

  // Income alone is a commitment too: a loan being repaid to the user.
  it("counts a month that only brings money in", () => {
    const months = withoutEmptyTail([month("2026-10", 0, 800), month("2026-11")]);

    expect(months.map((entry) => entry.monthKey)).toEqual(["2026-10"]);
  });

  it("leaves an empty projection empty", () => {
    expect(withoutEmptyTail([])).toEqual([]);
  });
});
