import type { LoanDirection } from "@/db";
import { consolidateByCurrency } from "@/lib/finance";
import { outstandingByCurrency } from "@/lib/installments";
import { outstandingByDirection, type LoanTerms } from "@/lib/loans";

// What separates the gross net worth from the net one, per currency.
export interface NetWorthAdjustments {
  // Instalments not yet registered, plus the capital still owed on loans taken.
  debt: Map<string, number>;
  // The capital still owed to the user on loans given.
  receivable: Map<string, number>;
}

function addInto(target: Map<string, number>, source: Map<string, number> | undefined) {
  for (const [currency, amount] of source ?? []) {
    target.set(currency, (target.get(currency) ?? 0) + amount);
  }
}

// Loans count by their outstanding capital only (see outstandingPrincipal): the
// interest of payments not yet due has not been incurred, and settling the loan
// today would not cost it. Kept per currency so the caller consolidates once.
export function netWorthAdjustments(
  installmentPlans: Parameters<typeof outstandingByCurrency>[0],
  loans: (LoanTerms & { currency: string; direction: LoanDirection })[],
): NetWorthAdjustments {
  const byDirection = outstandingByDirection(loans);

  const debt = new Map(outstandingByCurrency(installmentPlans));
  addInto(debt, byDirection.get("borrowed"));

  const receivable = new Map<string, number>();
  addInto(receivable, byDirection.get("lent"));

  return { debt, receivable };
}

// The net worth in one currency, with the parts it is made of.
export interface NetWorth {
  // What the user holds across every account.
  gross: number | null;
  debt: number | null;
  receivable: number | null;
  // Gross, less the debt, plus what the user is owed.
  net: number | null;
}

// Every part is consolidated into `currency` at `rate`, and is null when it
// holds a currency that cannot be converted without a rate. The net is null
// whenever any part is: a net worth missing its dollar half is not a smaller
// net worth, it is a wrong one.
//
// Shared by the accounts screen and the overview, so the one figure both show
// can only ever be worked out one way.
export function consolidateNetWorth(
  holdings: Map<string, number>,
  adjustments: NetWorthAdjustments,
  currency: string,
  rate: number,
): NetWorth {
  const gross = consolidateByCurrency(holdings, currency, rate);
  const debt = consolidateByCurrency(adjustments.debt, currency, rate);
  const receivable = consolidateByCurrency(adjustments.receivable, currency, rate);

  return {
    gross,
    debt,
    receivable,
    net:
      gross === null || debt === null || receivable === null
        ? null
        : gross - debt + receivable,
  };
}
