import type { InstallmentPlanWithNames } from "@/db/schema";
import { pendingInstallments } from "@/lib/installments";

export interface PendingPlanInstallment {
  plan: InstallmentPlanWithNames;
  index: number;
  number: number;
  date: string;
  amount: number;
  // The number of the instalment that has to be registered before this one, or
  // null when this is the next one due. Only the next one can be registered:
  // the plan stores how many are paid, so skipping ahead would count the
  // skipped ones as paid.
  waitingFor: number | null;
}

// Every instalment awaiting confirmation across all plans, oldest first.
export function collectPendingInstallments(
  plans: InstallmentPlanWithNames[],
  today: string,
): PendingPlanInstallment[] {
  const pending: PendingPlanInstallment[] = [];

  for (const plan of plans) {
    for (const entry of pendingInstallments(plan, today)) {
      const isNext = entry.index === plan.confirmed_count;
      pending.push({
        plan,
        ...entry,
        waitingFor: isNext ? null : plan.confirmed_count + 1,
      });
    }
  }

  return pending.sort((a, b) => a.date.localeCompare(b.date));
}
