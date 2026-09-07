import type {
  ExpectedMovementWithNames,
  InstallmentPlanWithNames,
  LoanWithNames,
  RecurringTransactionWithNames,
} from "@/db/schema";
import { expectedInWindow } from "@/lib/expected";
import { installmentAmounts, installmentDueDate } from "@/lib/installments";
import { amortizationSchedule } from "@/lib/loans";
import { occurrencesBetween } from "@/lib/recurring";

// What is already owed in the months ahead.
//
// Deliberately *not* a forecast. Every figure here comes from something the
// user already signed up for — an instalment plan with a schedule, a loan with
// an amortisation table, a recurring movement they set up — so it is closer to
// reading a calendar than to predicting anything. Discretionary spending, the
// part that would actually need estimating, is left out entirely rather than
// blended in: a number that mixes "you owe this" with "you probably will spend
// that" is untrustworthy in both halves.
//
// The primitives that produce the schedules already existed; they were only
// ever asked what was overdue. This asks them what is coming.

export interface ProjectedMonth {
  monthKey: string;
  // Committed movements, split the way the rest of the app splits them: a
  // recurring salary and the repayments on money you lent out are income you
  // can count on, and they belong on the same page as the instalments.
  income: number;
  expenses: number;
}

function monthWindow(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${monthKey}-01`,
    to: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

function recurringInWindow(
  templates: RecurringTransactionWithNames[],
  currency: string,
  from: string,
  to: string,
): { income: number; expenses: number } {
  let income = 0;
  let expenses = 0;

  for (const template of templates) {
    // A paused template is not a commitment. Same rule the pending collector
    // applies, for the same reason.
    if (template.is_active !== 1) continue;
    if (template.currency !== currency) continue;

    for (const date of occurrencesBetween(
      template.start_date,
      template.frequency,
      from,
      to,
    )) {
      // Anything already confirmed is a real transaction by now and would be
      // counted twice.
      if (template.last_confirmed_date !== null && date <= template.last_confirmed_date) {
        continue;
      }

      if (template.type === "income") income += template.amount;
      else expenses += template.amount;
    }
  }

  return { income, expenses };
}

function installmentsInWindow(
  plans: InstallmentPlanWithNames[],
  currency: string,
  from: string,
  to: string,
): number {
  let total = 0;

  for (const plan of plans) {
    if (plan.currency !== currency) continue;

    const amounts = installmentAmounts(plan.total_amount, plan.installment_count);

    // Only what is still unconfirmed: the rest is already recorded.
    for (let index = plan.confirmed_count; index < plan.installment_count; index++) {
      const date = installmentDueDate(plan.first_due_date, index);
      if (date >= from && date <= to) total += amounts[index];
    }
  }

  return total;
}

function loansInWindow(
  loans: LoanWithNames[],
  currency: string,
  from: string,
  to: string,
): { income: number; expenses: number } {
  let income = 0;
  let expenses = 0;

  for (const loan of loans) {
    if (loan.currency !== currency) continue;

    for (const payment of amortizationSchedule(loan)) {
      if (payment.index < loan.confirmed_count) continue;
      if (payment.date < from || payment.date > to) continue;

      // Direction decides which way the money moves, which the pending-payment
      // collector has no reason to care about — confirming a payment is the
      // same gesture either way — but a projection of what you will owe very
      // much does.
      if (loan.direction === "lent") income += payment.amount;
      else expenses += payment.amount;
    }
  }

  return { income, expenses };
}

export function projectCommitments(
  sources: {
    recurring: RecurringTransactionWithNames[];
    installmentPlans: InstallmentPlanWithNames[];
    loans: LoanWithNames[];
  },
  monthKeys: string[],
  currency: string,
): ProjectedMonth[] {
  return monthKeys.map((monthKey) => {
    const { from, to } = monthWindow(monthKey);

    const recurring = recurringInWindow(sources.recurring, currency, from, to);
    const loans = loansInWindow(sources.loans, currency, from, to);
    const installments = installmentsInWindow(
      sources.installmentPlans,
      currency,
      from,
      to,
    );

    return {
      monthKey,
      income: recurring.income + loans.income,
      expenses: recurring.expenses + loans.expenses + installments,
    };
  });
}

// The same months, read from what the user says is coming rather than from what
// they signed.
//
// A separate function rather than a fourth source inside `projectCommitments`,
// which would have meant widening `ProjectedMonth` with two more fields and
// making the function above return things it spends its header explaining that
// it excludes. Kept apart, the two totals cannot be added together by accident
// somewhere downstream, and the screen decides how to present them.
export function projectExpected(
  movements: ExpectedMovementWithNames[],
  monthKeys: string[],
  currency: string,
): ProjectedMonth[] {
  return monthKeys.map((monthKey) => {
    const { from, to } = monthWindow(monthKey);
    const { income, expenses } = expectedInWindow(movements, currency, from, to);

    return { monthKey, income, expenses };
  });
}

// The projected months worth putting on a chart.
//
// Both projections answer for every month they are asked about, so a user with
// nothing committed gets a full row of zeroes rather than an empty list. Charted
// as-is those became months on the axis with no bars in them, under a caption
// explaining bars that were not there.
//
// Trimmed from the end rather than filtered throughout: a month with nothing due
// between two months that have something is a real gap, and closing it would sit
// the two next to each other and read as consecutive.
export function withoutEmptyTail(months: ProjectedMonth[]): ProjectedMonth[] {
  let end = months.length;
  while (end > 0) {
    const month = months[end - 1];
    if (month.income > 0 || month.expenses > 0) break;
    end -= 1;
  }

  return months.slice(0, end);
}
