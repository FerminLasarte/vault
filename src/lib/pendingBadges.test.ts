import { describe, expect, it } from "vitest";
import { pendingBadges } from "./pendingBadges";
import type { NotificationSources } from "./notifications";
import { collectPendingCommitments } from "./pendingCommitments";
import type { CommitmentSources } from "./pendingCommitments";
import type {
  BudgetWithCategory,
  ExpectedMovementWithNames,
  InstallmentPlanWithNames,
  LoanWithNames,
  RecurringTransactionWithNames,
  Transaction,
} from "@/db/schema";

const TODAY = "2026-08-23";

type RawSources = CommitmentSources & Omit<NotificationSources, "pending">;

// Takes the stored lists, as the provider holds them, and works out what is
// pending as of TODAY the way the provider does.
function sources(overrides: Partial<RawSources> = {}): NotificationSources {
  const raw: RawSources = {
    installmentPlans: [],
    loans: [],
    recurring: [],
    expectedMovements: [],
    budgets: [],
    transactions: [],
    ...overrides,
  };
  return {
    pending: collectPendingCommitments(raw, TODAY),
    budgets: raw.budgets,
    transactions: raw.transactions,
  };
}

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

function aBudget(): BudgetWithCategory {
  return {
    id: 1,
    category_id: 7,
    currency: "ARS",
    amount: 100000,
    period: "monthly",
    category_name: "Salida",
    category_icon: "🍺",
    category_color: "#f00",
  };
}

function anExpense(amount: number): Transaction {
  return {
    id: 1,
    amount,
    type: "expense",
    category_id: 7,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Gasto",
    date: "2026-08-05",
    currency: "ARS",
  };
}

function anExpected(
  overrides: Partial<ExpectedMovementWithNames> = {},
): ExpectedMovementWithNames {
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
    ...overrides,
  };
}

describe("pendingBadges", () => {
  it("shows nothing when nothing is pending", () => {
    // An app with no commitments must not wear a permanent mark; a badge that
    // is always there stops meaning anything.
    expect(pendingBadges(sources(), TODAY)).toEqual({});
  });

  it("counts everything waiting to be confirmed in one badge", () => {
    // Recurring movements, instalments and loans all live in Compromisos, so
    // separate badges there would be one number split three ways for no reason.
    const badges = pendingBadges(
      sources({
        installmentPlans: [aPlan()],
        loans: [aLoan()],
        recurring: [aRecurring()],
      }),
      TODAY,
    );

    // July and August for the plan, August for the loan, one recurrence.
    expect(badges.commitments).toBe(4);
  });

  it("counts pending recurring movements", () => {
    expect(pendingBadges(sources({ recurring: [aRecurring()] }), TODAY).commitments).toBe(
      1,
    );
  });

  it("counts an expected movement whose date has arrived", () => {
    // It shares the badge with the other three because it shares the section
    // and the gesture: something is waiting for a decision.
    expect(
      pendingBadges(sources({ expectedMovements: [anExpected()] }), TODAY).commitments,
    ).toBe(1);
  });

  it("ignores expected movements already dealt with or still ahead", () => {
    const settled = [
      anExpected({ id: 1, status: "confirmed" }),
      anExpected({ id: 2, status: "dismissed" }),
      anExpected({ id: 3, due_date: "2026-12-01" }),
    ];

    expect(pendingBadges(sources({ expectedMovements: settled }), TODAY)).toEqual({});
  });

  it("counts budgets at or over the limit", () => {
    const badges = pendingBadges(
      sources({ budgets: [aBudget()], transactions: [anExpense(85_000)] }),
      TODAY,
    );

    // Budgets are capped categories, so the count rides on that section.
    expect(badges.categories).toBe(1);
  });

  it("stays quiet about a budget that is merely being spent", () => {
    const badges = pendingBadges(
      sources({ budgets: [aBudget()], transactions: [anExpense(50_000)] }),
      TODAY,
    );

    expect(badges.categories).toBeUndefined();
  });

  it("marks only the sections that can be acted on", () => {
    const badges = pendingBadges(
      sources({ installmentPlans: [aPlan()], recurring: [aRecurring()] }),
      TODAY,
    );

    // Estadísticas is a summary; sending the user there would be a dead end.
    expect(Object.keys(badges)).toEqual(["commitments"]);
  });

  it("says nothing about something not due yet", () => {
    const badges = pendingBadges(
      sources({
        installmentPlans: [{ ...aPlan(), first_due_date: "2026-12-10" }],
      }),
      TODAY,
    );

    expect(badges.commitments).toBeUndefined();
  });
});
