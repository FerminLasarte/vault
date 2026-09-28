import { describe, expect, it } from "vitest";
import { consolidateNetWorth, netWorthAdjustments } from "./netWorth";
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

describe("consolidateNetWorth", () => {
  const none = { debt: new Map<string, number>(), receivable: new Map<string, number>() };

  it("is what the user holds when nothing is owed either way", () => {
    const worth = consolidateNetWorth(new Map([["ARS", 500000]]), none, "ARS", 0);

    expect(worth).toEqual({ gross: 500000, debt: 0, receivable: 0, net: 500000 });
  });

  it("takes the debt off and adds back what the user is owed", () => {
    const worth = consolidateNetWorth(
      new Map([["ARS", 500000]]),
      { debt: new Map([["ARS", 120000]]), receivable: new Map([["ARS", 30000]]) },
      "ARS",
      0,
    );

    expect(worth).toEqual({
      gross: 500000,
      debt: 120000,
      receivable: 30000,
      net: 410000,
    });
  });

  it("converts every currency into the one asked for, at the rate given", () => {
    const holdings = new Map([
      ["ARS", 100000],
      ["USD", 100],
    ]);
    const adjustments = { debt: new Map([["USD", 20]]), receivable: new Map() };

    expect(consolidateNetWorth(holdings, adjustments, "ARS", 1000)).toEqual({
      gross: 200000,
      debt: 20000,
      receivable: 0,
      net: 180000,
    });
    expect(consolidateNetWorth(holdings, adjustments, "USD", 1000)).toEqual({
      gross: 200,
      debt: 20,
      receivable: 0,
      net: 180,
    });
  });

  // A total that quietly left the dollars out would look right and be wrong.
  it("has no net worth without a rate when two currencies are involved", () => {
    const worth = consolidateNetWorth(
      new Map([
        ["ARS", 100000],
        ["USD", 100],
      ]),
      none,
      "ARS",
      0,
    );

    expect(worth.gross).toBeNull();
    expect(worth.net).toBeNull();
  });

  it("has no net worth when only the debt needs a rate it does not have", () => {
    const worth = consolidateNetWorth(
      new Map([["ARS", 100000]]),
      { debt: new Map([["USD", 50]]), receivable: new Map() },
      "ARS",
      0,
    );

    expect(worth.gross).toBe(100000);
    expect(worth.debt).toBeNull();
    expect(worth.net).toBeNull();
  });
});
