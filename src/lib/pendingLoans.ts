import type { LoanWithNames } from "@/db/schema";
import { pendingLoanPayments } from "@/lib/loans";
import type { LoanPayment } from "@/lib/loans";

export interface PendingLoanPayment extends LoanPayment {
  loan: LoanWithNames;
  // The number of the payment that has to be registered before this one, or
  // null when this is the next one due; see PendingPlanInstallment.
  waitingFor: number | null;
}

// Every loan payment awaiting confirmation across all loans, oldest first —
// the mirror of collectPendingInstallments, so the statistics view can add the
// two together into one "you have commitments due" notice.
export function collectPendingLoanPayments(
  loans: LoanWithNames[],
  today: string,
): PendingLoanPayment[] {
  const pending: PendingLoanPayment[] = [];

  for (const loan of loans) {
    for (const payment of pendingLoanPayments(loan, today)) {
      const isNext = payment.index === loan.confirmed_count;
      pending.push({
        loan,
        ...payment,
        waitingFor: isNext ? null : loan.confirmed_count + 1,
      });
    }
  }

  return pending.sort((a, b) => a.date.localeCompare(b.date));
}
