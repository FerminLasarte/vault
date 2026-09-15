import type { LoanDirection } from "@/db";
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
