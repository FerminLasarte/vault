import { describe, expect, it } from "vitest";
import type { LoanWithNames } from "@/db/schema";
import { collectPendingLoanPayments } from "@/lib/pendingLoans";

function loan(overrides: Partial<LoanWithNames> = {}): LoanWithNames {
  return {
    id: 1,
    direction: "borrowed",
    counterparty: "Banco",
    description: "Préstamo personal",
    principal: 1200,
    currency: "ARS",
    annual_rate: 0,
    installment_count: 12,
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-07-10",
    confirmed_count: 0,
    created_at: "2026-07-01T00:00:00.000Z",
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

describe("collectPendingLoanPayments", () => {
  it("lets only the next payment of each loan be registered", () => {
    const pending = collectPendingLoanPayments(
      [loan({ confirmed_count: 1 })],
      "2026-10-10",
    );
    expect(pending.map((entry) => [entry.number, entry.waitingFor])).toEqual([
      [2, null],
      [3, 2],
      [4, 2],
    ]);
  });
});
