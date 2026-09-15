import { describe, expect, it } from "vitest";
import { collectPendingCommitments, countPending } from "./pendingCommitments";
import type {
  ExpectedMovementWithNames,
  InstallmentPlanWithNames,
  LoanWithNames,
  RecurringTransactionWithNames,
} from "@/db/schema";

const TODAY = "2026-08-23";

function aPlan(): InstallmentPlanWithNames {
  return {
    id: 1,
    description: "Notebook",
    total_amount: 120000,
    installment_count: 12,
    currency: "ARS",
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-07-10",
    confirmed_count: 0,
    created_at: "2026-07-01T00:00:00Z",
    cash_price: null,
    category_name: null,
    category_icon: null,
    payment_method_name: null,
  };
}

function aLoan(): LoanWithNames {
  return {
    id: 1,
    direction: "borrowed",
    counterparty: "Banco",
    description: "Préstamo",
    principal: 1_000_000,
    currency: "ARS",
    annual_rate: 0,
    installment_count: 12,
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-08-10",
    confirmed_count: 0,
    created_at: "2026-08-01T00:00:00Z",
    category_name: null,
    category_icon: null,
    payment_method_name: null,
  };
}

function aRecurring(): RecurringTransactionWithNames {
  return {
    id: 1,
    description: "Alquiler",
    amount: 500000,
    type: "expense",
    category_id: null,
    payment_method_id: null,
    currency: "ARS",
    frequency: "monthly",
    start_date: "2026-08-01",
    last_confirmed_date: null,
    is_active: 1,
    category_name: null,
    category_icon: null,
    payment_method_name: null,
  };
}

function anExpected(): ExpectedMovementWithNames {
  return {
    id: 1,
    description: "Casamiento",
    amount: 50_000,
    type: "expense",
    currency: "ARS",
    category_id: null,
    payment_method_id: null,
    due_date: "2026-08-20",
    status: "pending",
    transaction_id: null,
    created_at: "2026-08-01T00:00:00.000Z",
    category_name: null,
    category_icon: null,
    payment_method_name: null,
  };
}

const everyKind = {
  recurring: [aRecurring()],
  installmentPlans: [aPlan()],
  loans: [aLoan()],
  expectedMovements: [anExpected()],
};

describe("collectPendingCommitments", () => {
  // Worked out once, for the sidebar badge, the notice on Estadísticas, the
  // notifications and each section alike: computed apart, with a "today" read
  // at different moments, they could disagree about what is waiting.
  it("collects every kind of commitment as of the same day", () => {
    const pending = collectPendingCommitments(everyKind, TODAY);

    expect(pending.recurring.map((entry) => entry.date)).toEqual(["2026-08-01"]);
    expect(pending.installments.map((entry) => entry.index)).toEqual([0, 1]);
    expect(pending.loans.map((entry) => entry.index)).toEqual([0]);
    expect(pending.expected.map((movement) => movement.id)).toEqual([1]);
    expect(countPending(pending)).toBe(5);
  });

  it("finds nothing before anything falls due", () => {
    expect(countPending(collectPendingCommitments(everyKind, "2026-06-30"))).toBe(0);
  });
});
