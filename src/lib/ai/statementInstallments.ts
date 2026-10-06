import { readInstallment, type InstallmentText } from "@/lib/ai/installmentText";
import { merchantEntryId } from "@/lib/ai/merchantHistory";
import { merchantKey, merchantName } from "@/lib/ai/merchants";
import { planMerchantId } from "@/lib/ai/series";
import { roundToCents } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { installmentAmounts, installmentDueDate } from "@/lib/installments";
import type { CommitmentStep, NewInstallmentPlan } from "@/db";
import type { InstallmentPlan, NewTransaction } from "@/db/schema";

// The instalments on a statement, against the plans the user already keeps, so
// a statement and a plan never both record the same instalment: one the plan
// is waiting for is registered in it, one it already has is left out, and one
// with no plan can start one.

// How far a row's amount may sit from the plan's instalment and still be it:
// a statement rounds, and a card can add a few cents of tax.
export const AMOUNT_TOLERANCE = 0.02;

// Which date a statement writes on an instalment's line: the day that
// instalment was charged, or the day of the purchase, repeated on every one.
// Banks do both, so it is asked once per statement format and remembered.
export type InstallmentDates = "charge" | "purchase";

export interface StatementInstallmentRow {
  line: number;
  // The date the statement wrote.
  writtenDate: string;
  installment: InstallmentText;
  // The row as it is imported on its own, its date already read under the
  // statement's convention (see installmentRowDate).
  transaction: NewTransaction;
}

export interface InstallmentPlanDraft {
  plan: NewInstallmentPlan;
  // The statement line it was worked out from.
  source: string;
  // The instalments before this one, paid before the app knew of the plan:
  // the plan starts with them counted, and this one is registered by the
  // import.
  paidCount: number;
}

type InstallmentStep = Extract<CommitmentStep, { kind: "installment" }>;

export type InstallmentLine = {
  line: number;
  description: string;
  number: number;
  count: number;
} & (
  | { kind: "registers"; plan: InstallmentPlan; step: InstallmentStep; reason: string }
  | { kind: "registered"; plan: InstallmentPlan; reason: string }
  | { kind: "separate"; plan: InstallmentPlan }
  | { kind: "outOfOrder"; plan: InstallmentPlan; expected: number; reason: string }
  | { kind: "unplanned"; draft: InstallmentPlanDraft }
);

// The date an instalment's row stands for: the statement's own when it is the
// charge's; a purchase date moved on to this instalment's month otherwise, so a
// fourth instalment does not land in the month of the purchase.
export function installmentRowDate(
  writtenDate: string,
  number: number,
  dates: InstallmentDates,
): string {
  return dates === "purchase" ? installmentDueDate(writtenDate, number - 1) : writtenDate;
}

function installmentAmountOf(plan: InstallmentPlan, number: number): number {
  return installmentAmounts(plan.total_amount, plan.installment_count)[number - 1];
}

// The plan a row belongs to: the one of the same merchant whose instalment
// it is; or, when no plan of that merchant fits, the only plan that does, since
// a plan is often named after what was bought rather than where.
function planFor(
  row: StatementInstallmentRow,
  plans: readonly InstallmentPlan[],
): { plan: InstallmentPlan; byMerchant: boolean } | null {
  const { amount, currency } = row.transaction;
  const { number, count } = row.installment;
  const fitting = plans.filter((plan) => {
    if (plan.currency !== currency || plan.installment_count !== count) return false;
    const expected = installmentAmountOf(plan, number);
    return Math.abs(amount - expected) <= AMOUNT_TOLERANCE * expected + 0.001;
  });

  const merchant = merchantEntryId(
    merchantKey(row.transaction.description),
    "expense",
    currency,
  );
  const byMerchant = fitting.filter((plan) => planMerchantId(plan) === merchant);
  if (byMerchant.length > 0) {
    return byMerchant.length === 1 ? { plan: byMerchant[0], byMerchant: true } : null;
  }
  return fitting.length === 1 ? { plan: fitting[0], byMerchant: false } : null;
}

function draftFor(
  row: StatementInstallmentRow,
  dates: InstallmentDates,
): InstallmentPlanDraft {
  const { transaction, installment, writtenDate } = row;
  return {
    source: transaction.description,
    paidCount: installment.number - 1,
    plan: {
      description: merchantName(transaction.description) ?? installment.text,
      totalAmount: roundToCents(transaction.amount * installment.count),
      installmentCount: installment.count,
      currency: transaction.currency,
      categoryId: transaction.categoryId,
      paymentMethodId: transaction.paymentMethodId,
      // So that this instalment falls due on the date it stands for.
      firstDueDate:
        dates === "purchase"
          ? writtenDate
          : installmentDueDate(writtenDate, -(installment.number - 1)),
      cashPrice: null,
    },
  };
}

// One line per row, in the file's order. Rows of one plan are taken in the
// order of their instalments, each checked against where the one before left
// the plan, as registering them one by one would be.
export function matchInstallments(
  rows: readonly StatementInstallmentRow[],
  plans: readonly InstallmentPlan[],
  dates: InstallmentDates,
  // Rows the user said are not their plan's: imported on their own.
  separate: ReadonlySet<number>,
): InstallmentLine[] {
  const next = new Map(plans.map((plan) => [plan.id, plan.confirmed_count]));
  const lines = new Map<number, InstallmentLine>();

  const byInstalment = [...rows].sort(
    (a, b) => a.installment.number - b.installment.number || a.line - b.line,
  );
  for (const row of byInstalment) {
    const { number, count } = row.installment;
    const base = {
      line: row.line,
      description: row.transaction.description,
      number,
      count,
    };
    const unplanned = {
      ...base,
      kind: "unplanned" as const,
      draft: draftFor(row, dates),
    };

    const found = planFor(row, plans);
    if (found === null) {
      lines.set(row.line, unplanned);
      continue;
    }
    const { plan, byMerchant } = found;
    const expected = next.get(plan.id)! + 1;

    if (number <= plan.confirmed_count) {
      // Leaving a row out loses a movement, so only on the merchant's word.
      lines.set(
        row.line,
        byMerchant
          ? {
              ...base,
              kind: "registered",
              plan,
              reason: `«${plan.description}» ya tiene registrada la cuota ${number} de ${count}.`,
            }
          : unplanned,
      );
    } else if (number !== expected) {
      lines.set(
        row.line,
        byMerchant
          ? {
              ...base,
              kind: "outOfOrder",
              plan,
              expected,
              reason: `«${plan.description}» todavía espera la cuota ${expected}; esta se importa como un movimiento suelto.`,
            }
          : unplanned,
      );
    } else if (separate.has(row.line)) {
      lines.set(row.line, { ...base, kind: "separate", plan });
    } else {
      next.set(plan.id, expected);
      const installment = formatCurrency(
        installmentAmountOf(plan, number),
        plan.currency,
      );
      lines.set(row.line, {
        ...base,
        kind: "registers",
        plan,
        step: {
          kind: "installment",
          id: plan.id,
          index: number - 1,
          date:
            dates === "purchase"
              ? installmentDueDate(plan.first_due_date, number - 1)
              : row.writtenDate,
          amount: row.transaction.amount,
        },
        reason: byMerchant
          ? `Mismo comercio que «${plan.description}», ${count} cuotas de ${installment} y le toca la ${number}.`
          : `Es la única compra en ${count} cuotas de ${installment} a la que le toca la ${number}.`,
      });
    }
  }

  return rows.map((row) => lines.get(row.line)!);
}

// The instalment a statement line is for, when it is an expense that says so.
export function statementInstallment(
  transaction: NewTransaction,
): InstallmentText | null {
  return transaction.type === "expense" ? readInstallment(transaction.description) : null;
}
