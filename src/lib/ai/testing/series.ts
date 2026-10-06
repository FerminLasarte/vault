import type { InstallmentPlan, RecurringTransaction, Transaction } from "@/db/schema";
import { learnMerchantHistory } from "@/lib/ai/merchantHistory";
import { detectSeries, type Commitments } from "@/lib/ai/series";

// Movements and series for the tests of everything that reads series: the
// detection itself and the notices built on it, so each test spells out only
// the dates and amounts it is about.

export const TODAY = "2026-10-06";

export const MONTHLY = ["2026-07-10", "2026-08-10", "2026-09-10"];

export const NOTHING_DECLARED: Commitments = {
  recurring: [],
  installmentPlans: [],
  loans: [],
};

let nextId = 1;

export function movement(
  description: string,
  date: string,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id: nextId++,
    amount: 5000,
    type: "expense",
    category_id: null,
    payment_method_id: 1,
    destination_payment_method_id: null,
    destination_amount: null,
    description,
    date,
    currency: "ARS",
    category_suggested: 0,
    ...overrides,
  };
}

// One movement per date.
export function charges(
  description: string,
  dates: string[],
  overrides: Partial<Transaction> = {},
): Transaction[] {
  return dates.map((date) => movement(description, date, overrides));
}

// One movement per date, each with its own amount.
export function chargesOf(
  description: string,
  dates: string[],
  amounts: number[],
  overrides: Partial<Transaction> = {},
): Transaction[] {
  return dates.map((date, index) =>
    movement(description, date, { ...overrides, amount: amounts[index] }),
  );
}

// `count` dates `step` days apart, the last one on `last`.
export function datesEvery(step: number, count: number, last: string): string[] {
  const end = new Date(`${last}T12:00:00Z`).getTime();
  return Array.from({ length: count }, (_, index) =>
    new Date(end - (count - 1 - index) * step * 86_400_000).toISOString().slice(0, 10),
  );
}

export function recurringTemplate(
  overrides: Partial<RecurringTransaction> = {},
): RecurringTransaction {
  return {
    id: 7,
    description: "Netflix",
    amount: 5000,
    type: "expense",
    category_id: null,
    payment_method_id: 1,
    currency: "ARS",
    frequency: "monthly",
    start_date: "2026-01-10",
    last_confirmed_date: "2026-09-10",
    is_active: 1,
    ...overrides,
  };
}

export function installmentPlan(
  overrides: Partial<InstallmentPlan> = {},
): InstallmentPlan {
  return {
    id: 1,
    description: "Heladera",
    total_amount: 60000,
    installment_count: 12,
    currency: "ARS",
    category_id: null,
    payment_method_id: 1,
    first_due_date: "2026-01-10",
    confirmed_count: 9,
    created_at: "2026-01-01",
    cash_price: null,
    ...overrides,
  };
}

export function detect(
  transactions: Transaction[],
  commitments: Commitments = NOTHING_DECLARED,
  today: string = TODAY,
) {
  return detectSeries(learnMerchantHistory(transactions, today), commitments, today);
}
