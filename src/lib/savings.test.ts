import { describe, expect, it } from "vitest";
import type {
  PaymentMethod,
  SavingsContribution,
  SavingsGoalWithNames,
  Transaction,
} from "@/db/schema";
import { calculateSavingsProgress, monthsBetween, netAccountFlow } from "@/lib/savings";

const TODAY = "2026-08-22";

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 1,
    amount: 0,
    type: "expense",
    category_id: null,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "",
    date: TODAY,
    currency: "ARS",
    ...overrides,
  };
}

function makeGoal(overrides: Partial<SavingsGoalWithNames> = {}): SavingsGoalWithNames {
  return {
    id: 1,
    name: "Viaje",
    target_amount: 1000,
    currency: "ARS",
    tracking_mode: "contributions",
    payment_method_id: null,
    target_date: null,
    created_at: "2026-01-01T00:00:00Z",
    payment_method_name: null,
    ...overrides,
  };
}

function contribution(amount: number, date: string, goalId = 1): SavingsContribution {
  return { id: Math.random(), goal_id: goalId, amount, date, note: null };
}

const accounts: PaymentMethod[] = [
  { id: 1, name: "Ahorro", type: "bank", currency: "ARS", initial_balance: 0 },
];

describe("monthsBetween", () => {
  it("counts whole months forward", () => {
    expect(monthsBetween("2026-01-10", "2026-04-10")).toBe(3);
  });

  it("does not count a month that has not completed", () => {
    expect(monthsBetween("2026-01-20", "2026-04-10")).toBe(2);
  });

  it("is zero or negative for a date in the past", () => {
    expect(monthsBetween("2026-08-22", "2026-08-22")).toBe(0);
    expect(monthsBetween("2026-08-22", "2026-06-22")).toBe(-2);
  });
});

describe("netAccountFlow", () => {
  it("counts income up and expenses down", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "income",
        amount: 500,
        payment_method_id: 1,
        date: "2026-07-01",
      }),
      makeTransaction({
        id: 2,
        type: "expense",
        amount: 200,
        payment_method_id: 1,
        date: "2026-07-02",
      }),
    ];
    expect(netAccountFlow(transactions, 1, "2026-06-01", TODAY)).toBe(300);
  });

  it("counts an arriving transfer as money saved", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "transfer",
        amount: 100,
        payment_method_id: 2,
        destination_payment_method_id: 1,
        destination_amount: 100,
        date: "2026-07-01",
      }),
    ];
    expect(netAccountFlow(transactions, 1, "2026-06-01", TODAY)).toBe(100);
  });

  it("counts a departing transfer against it", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "transfer",
        amount: 100,
        payment_method_id: 1,
        destination_payment_method_id: 2,
        destination_amount: 100,
        date: "2026-07-01",
      }),
    ];
    expect(netAccountFlow(transactions, 1, "2026-06-01", TODAY)).toBe(-100);
  });

  it("ignores anything outside the window", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "income",
        amount: 500,
        payment_method_id: 1,
        date: "2025-01-01",
      }),
    ];
    expect(netAccountFlow(transactions, 1, "2026-06-01", TODAY)).toBe(0);
  });
});

describe("calculateSavingsProgress", () => {
  const empty = { accounts, transactions: [], contributions: [] };

  it("adds up contributions for a contribution-tracked goal", () => {
    const [progress] = calculateSavingsProgress(
      [makeGoal()],
      {
        ...empty,
        contributions: [contribution(300, "2026-07-01"), contribution(200, "2026-08-01")],
      },
      TODAY,
    );
    expect(progress.current).toBe(500);
    expect(progress.remaining).toBe(500);
    expect(progress.ratio).toBe(0.5);
    expect(progress.isReached).toBe(false);
  });

  it("reads the account balance for an account-tracked goal", () => {
    const [progress] = calculateSavingsProgress(
      [makeGoal({ tracking_mode: "account", payment_method_id: 1 })],
      {
        accounts,
        transactions: [
          makeTransaction({
            id: 1,
            type: "income",
            amount: 750,
            payment_method_id: 1,
            date: "2026-07-01",
          }),
        ],
        contributions: [],
      },
      TODAY,
    );
    expect(progress.current).toBe(750);
  });

  it("ignores contributions belonging to another goal", () => {
    const [progress] = calculateSavingsProgress(
      [makeGoal()],
      { ...empty, contributions: [contribution(300, "2026-07-01", 99)] },
      TODAY,
    );
    expect(progress.current).toBe(0);
  });

  it("marks a goal reached once the target is met", () => {
    const [progress] = calculateSavingsProgress(
      [makeGoal()],
      { ...empty, contributions: [contribution(1000, "2026-07-01")] },
      TODAY,
    );
    expect(progress.isReached).toBe(true);
    expect(progress.projectedDate).toBeNull();
    expect(progress.isOnTrack).toBe(true);
  });

  it("projects a finish date from the recent pace", () => {
    // 600 over the three-month window is 200 a month; 400 left is two months.
    const [progress] = calculateSavingsProgress(
      [makeGoal()],
      {
        ...empty,
        contributions: [contribution(300, "2026-07-01"), contribution(300, "2026-08-01")],
      },
      TODAY,
    );
    expect(progress.monthlyPace).toBe(200);
    expect(progress.projectedDate).toBe("2026-10-22");
  });

  it("refuses to project when nothing is being saved", () => {
    const [progress] = calculateSavingsProgress([makeGoal()], empty, TODAY);
    expect(progress.monthlyPace).toBe(0);
    expect(progress.projectedDate).toBeNull();
  });

  it("reports a pace of zero rather than a negative one", () => {
    const [progress] = calculateSavingsProgress(
      [makeGoal({ tracking_mode: "account", payment_method_id: 1 })],
      {
        accounts,
        transactions: [
          makeTransaction({
            id: 1,
            type: "expense",
            amount: 900,
            payment_method_id: 1,
            date: "2026-07-01",
          }),
        ],
        contributions: [],
      },
      TODAY,
    );
    expect(progress.monthlyPace).toBe(0);
    expect(progress.projectedDate).toBeNull();
  });

  it("says you are on track when the pace beats the deadline", () => {
    const [progress] = calculateSavingsProgress(
      [makeGoal({ target_date: "2026-12-22" })],
      {
        ...empty,
        contributions: [contribution(300, "2026-07-01"), contribution(300, "2026-08-01")],
      },
      TODAY,
    );
    // 400 left over four months needs 100 a month; the pace is 200.
    expect(progress.requiredMonthlyPace).toBe(100);
    expect(progress.isOnTrack).toBe(true);
  });

  it("says you are not when it does not", () => {
    const [progress] = calculateSavingsProgress(
      [makeGoal({ target_date: "2026-09-22" })],
      { ...empty, contributions: [contribution(100, "2026-08-01")] },
      TODAY,
    );
    expect(progress.isOnTrack).toBe(false);
  });

  it("does not call a deadline less than a month away impossible", () => {
    // 30 days left, but not a whole month: $1 to go at $5000 a month.
    const [progress] = calculateSavingsProgress(
      [makeGoal({ target_amount: 20_000, target_date: "2026-09-21" })],
      {
        ...empty,
        contributions: [
          contribution(4_999, "2026-01-10"),
          contribution(15_000, "2026-08-01"),
        ],
      },
      TODAY,
    );
    expect(progress.remaining).toBe(1);
    expect(progress.monthlyPace).toBe(5_000);
    expect(progress.isOnTrack).toBe(true);
    expect(progress.requiredMonthlyPace).toBeCloseTo(1);
  });

  it("measures a deadline less than a month away by the days left", () => {
    // 15 days left at $300 a month covers $150, not the $200 still missing.
    const [progress] = calculateSavingsProgress(
      [makeGoal({ target_amount: 1_100, target_date: "2026-09-06" })],
      { ...empty, contributions: [contribution(900, "2026-08-01")] },
      TODAY,
    );
    expect(progress.isOnTrack).toBe(false);
    expect(progress.requiredMonthlyPace).toBeCloseTo(400);
  });

  it("treats a deadline already past as impossible rather than dividing by zero", () => {
    const [progress] = calculateSavingsProgress(
      [makeGoal({ target_date: "2026-01-01" })],
      { ...empty, contributions: [contribution(100, "2026-08-01")] },
      TODAY,
    );
    expect(progress.requiredMonthlyPace).toBe(Infinity);
    expect(progress.isOnTrack).toBe(false);
  });

  it("handles an account-tracked goal with no account attached", () => {
    const [progress] = calculateSavingsProgress(
      [makeGoal({ tracking_mode: "account", payment_method_id: null })],
      empty,
      TODAY,
    );
    expect(progress.current).toBe(0);
    expect(progress.projectedDate).toBeNull();
  });
});
