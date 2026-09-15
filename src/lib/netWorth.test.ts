import { describe, expect, it } from "vitest";
import { netWorthAdjustments } from "./netWorth";
import { outstandingPrincipal } from "./loans";
import type { LoanDirection } from "@/db";

function aPlan(
  overrides: Partial<Parameters<typeof netWorthAdjustments>[0][number]> = {},
) {
  return {
    currency: "ARS",
    total_amount: 60000,
    installment_count: 6,
    confirmed_count: 0,
    ...overrides,
  };
}

function aLoan(
  overrides: Partial<Parameters<typeof netWorthAdjustments>[1][number]> & {
    direction?: LoanDirection;
  } = {},
) {
  return {
    direction: "borrowed" as LoanDirection,
    currency: "ARS",
    principal: 120000,
    // A real rate, so any interest that leaked into the figures would show.
    annual_rate: 60,
    installment_count: 12,
    first_due_date: "2026-01-10",
    confirmed_count: 0,
    ...overrides,
  };
}

describe("netWorthAdjustments", () => {
  it("counts a loan taken as debt, by its capital and not its future interest", () => {
    const { debt, receivable } = netWorthAdjustments([], [aLoan()]);

    expect(debt.get("ARS")).toBe(120000);
    expect(receivable.size).toBe(0);
  });

  it("counts only the capital still owed once some payments are confirmed", () => {
    const loan = aLoan({ confirmed_count: 3 });

    const { debt } = netWorthAdjustments([], [loan]);

    expect(debt.get("ARS")).toBe(outstandingPrincipal(loan));
    expect(debt.get("ARS")).toBeLessThan(120000);
  });

  it("counts a loan given as money owed to the user, not as debt", () => {
    const { debt, receivable } = netWorthAdjustments(
      [],
      [aLoan({ direction: "lent", principal: 30000, annual_rate: 0 })],
    );

    expect(debt.size).toBe(0);
    expect(receivable.get("ARS")).toBe(30000);
  });

  it("adds instalments and loans taken in the same currency into one debt", () => {
    const { debt } = netWorthAdjustments(
      [aPlan({ confirmed_count: 2 })],
      [aLoan({ annual_rate: 0 })],
    );

    // Four instalments of 10.000 left, plus the whole loan.
    expect(debt.get("ARS")).toBe(40000 + 120000);
  });

  it("keeps every currency apart", () => {
    const { debt, receivable } = netWorthAdjustments(
      [aPlan({ currency: "USD", total_amount: 600 })],
      [
        aLoan({ annual_rate: 0 }),
        aLoan({ direction: "lent", currency: "USD", principal: 500, annual_rate: 0 }),
      ],
    );

    expect(debt.get("ARS")).toBe(120000);
    expect(debt.get("USD")).toBe(600);
    expect(receivable.get("USD")).toBe(500);
    expect(receivable.has("ARS")).toBe(false);
  });

  it("leaves out a loan that is fully paid", () => {
    const { debt, receivable } = netWorthAdjustments(
      [],
      [
        aLoan({ confirmed_count: 12 }),
        aLoan({ direction: "lent", installment_count: 1, confirmed_count: 1 }),
      ],
    );

    expect(debt.size).toBe(0);
    expect(receivable.size).toBe(0);
  });
});
