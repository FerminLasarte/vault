import { collectPendingExpected } from "@/lib/expected";
import { collectPendingInstallments } from "@/lib/pendingInstallments";
import type { PendingPlanInstallment } from "@/lib/pendingInstallments";
import { collectPendingLoanPayments } from "@/lib/pendingLoans";
import type { PendingLoanPayment } from "@/lib/pendingLoans";
import { collectPendingRecurrences } from "@/lib/pendingRecurring";
import type { PendingRecurrence } from "@/lib/pendingRecurring";
import type {
  ExpectedMovementWithNames,
  InstallmentPlanWithNames,
  LoanWithNames,
  RecurringTransactionWithNames,
} from "@/db/schema";

// Everything waiting for the user to register or dismiss it, as of one day.
export interface PendingCommitments {
  recurring: PendingRecurrence[];
  installments: PendingPlanInstallment[];
  loans: PendingLoanPayment[];
  expected: ExpectedMovementWithNames[];
}

export interface CommitmentSources {
  recurring: RecurringTransactionWithNames[];
  installmentPlans: InstallmentPlanWithNames[];
  loans: LoanWithNames[];
  expectedMovements: ExpectedMovementWithNames[];
}

// Worked out once, in the data provider, and read by the sidebar badge, the
// notice on Estadísticas, the notifications and each section. Computed in each
// of those, with a "today" read at different moments, they could disagree
// about what is waiting.
export function collectPendingCommitments(
  sources: CommitmentSources,
  today: string,
): PendingCommitments {
  return {
    recurring: collectPendingRecurrences(sources.recurring, today),
    installments: collectPendingInstallments(sources.installmentPlans, today),
    loans: collectPendingLoanPayments(sources.loans, today),
    expected: collectPendingExpected(sources.expectedMovements, today),
  };
}

export function countPending(pending: PendingCommitments): number {
  return (
    pending.recurring.length +
    pending.installments.length +
    pending.loans.length +
    pending.expected.length
  );
}
