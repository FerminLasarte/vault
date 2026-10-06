import { occurrenceAt } from "@/lib/recurring";

// The most instalments a plan can have.
export const MAX_INSTALLMENT_COUNT = 120;

// Splits a total into `count` instalments.
//
// Dividing evenly almost never lands on whole cents, and paying the rounded
// figure every month would leave the plan owing (or over-paying) a few cents
// that never resolve. The remainder is pushed into the final instalment, so the
// instalments always add up to exactly the total.
export function installmentAmounts(total: number, count: number): number[] {
  if (count <= 0) return [];

  const round = (value: number) => Math.round(value * 100) / 100;
  const base = round(total / count);

  const amounts = Array.from({ length: count - 1 }, () => base);
  amounts.push(round(total - base * (count - 1)));

  return amounts;
}

// Instalments fall on the same day of successive months, anchored on the first
// due date — the same rule the recurring templates use, so a plan due on the
// 31st behaves consistently in February.
export function installmentDueDate(firstDueDate: string, index: number): string {
  return occurrenceAt(firstDueDate, "monthly", index);
}

export interface PendingInstallment {
  // Zero-based position in the plan.
  index: number;
  // Human-facing position, i.e. "3 de 12".
  number: number;
  date: string;
  amount: number;
}

// Instalments that have come due and not been confirmed yet, oldest first.
export function pendingInstallments(
  plan: {
    total_amount: number;
    installment_count: number;
    first_due_date: string;
    confirmed_count: number;
  },
  today: string,
): PendingInstallment[] {
  const amounts = installmentAmounts(plan.total_amount, plan.installment_count);
  const pending: PendingInstallment[] = [];

  for (let index = plan.confirmed_count; index < plan.installment_count; index++) {
    const date = installmentDueDate(plan.first_due_date, index);
    // Dates are "YYYY-MM-DD", so string comparison is chronological.
    if (date > today) break;

    pending.push({ index, number: index + 1, date, amount: amounts[index] });
  }

  return pending;
}

// What is still owed on a plan: the instalments not yet confirmed.
export function outstandingAmount(plan: {
  total_amount: number;
  installment_count: number;
  confirmed_count: number;
}): number {
  const amounts = installmentAmounts(plan.total_amount, plan.installment_count);
  return amounts.slice(plan.confirmed_count).reduce((total, amount) => total + amount, 0);
}

// Outstanding debt per currency, so it can sit alongside the per-currency
// account totals without mixing units.
export function outstandingByCurrency(
  plans: {
    currency: string;
    total_amount: number;
    installment_count: number;
    confirmed_count: number;
  }[],
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const plan of plans) {
    const outstanding = outstandingAmount(plan);
    if (outstanding <= 0) continue;
    totals.set(plan.currency, (totals.get(plan.currency) ?? 0) + outstanding);
  }

  return totals;
}

export interface FinancingCost {
  // What the instalments add on top of paying outright.
  surcharge: number;
  // That surcharge as a share of the cash price, i.e. 0.275 for 27,5%.
  ratio: number;
}

// What financing the purchase actually cost, measured against the cash price.
//
// Deliberately not expressed as an interest rate: a shop quotes two prices, not
// a rate, and turning one into the other would invent a compounding convention
// the user never agreed to. The difference in pesos is the honest figure.
//
// Returns null when there is nothing to compare against, and when the cash
// price is not a usable figure — dividing by zero would report Infinity as a
// percentage.
export function financingCost(plan: {
  total_amount: number;
  cash_price: number | null;
}): FinancingCost | null {
  const cash = plan.cash_price;
  if (cash === null || !Number.isFinite(cash) || cash <= 0) return null;

  const surcharge = Math.round((plan.total_amount - cash) * 100) / 100;
  return { surcharge, ratio: surcharge / cash };
}
