import { describe, expect, it } from "vitest";
import type { InstallmentPlanWithNames } from "@/db/schema";
import { collectPendingInstallments } from "@/lib/pendingInstallments";

function plan(
  overrides: Partial<InstallmentPlanWithNames> = {},
): InstallmentPlanWithNames {
  return {
    id: 1,
    description: "Heladera",
    total_amount: 1200,
    installment_count: 12,
    currency: "ARS",
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-07-10",
    confirmed_count: 0,
    created_at: "2026-07-01T00:00:00.000Z",
    cash_price: null,
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

describe("collectPendingInstallments", () => {
  it("lets only the next instalment of each plan be registered", () => {
    const pending = collectPendingInstallments(
      [
        plan({ id: 1 }),
        plan({ id: 2, first_due_date: "2026-08-05", confirmed_count: 0 }),
      ],
      "2026-09-10",
    );
    expect(
      pending.map((entry) => [entry.plan.id, entry.number, entry.waitingFor]),
    ).toEqual([
      [1, 1, null],
      [2, 1, null],
      [1, 2, 1],
      [2, 2, 1],
      [1, 3, 1],
    ]);
  });

  it("counts from what is already paid", () => {
    const pending = collectPendingInstallments(
      [plan({ confirmed_count: 1 })],
      "2026-09-10",
    );
    expect(pending.map((entry) => [entry.number, entry.waitingFor])).toEqual([
      [2, null],
      [3, 2],
    ]);
  });
});
