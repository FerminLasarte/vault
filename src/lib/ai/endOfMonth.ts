import { isFrom } from "@/lib/ai/merchantHistory";
import {
  daysInMonth,
  monthCurves,
  typicalBetween,
  typicalMonthKeys,
} from "@/lib/ai/typicalMonth";
import { roundToCents } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import type { ProjectedMonth } from "@/lib/projection";
import type { Transaction } from "@/db/schema";

// What the accounts in one currency will hold when the month ends: what they
// hold today, plus what is already owed and what the user said is coming this
// month, plus what usually comes in and goes out from tomorrow to the end of
// the month and was never declared — a salary nobody set up as recurring, the
// shopping, the outings.
//
// Declared movements are read from their declarations (see projection.ts), and
// a monthly one that already came this month has come; their merchants are
// left out of "usual", so nothing is counted twice.

export interface Flow {
  income: number;
  expenses: number;
}

export interface EndOfMonth {
  // The month's last day, "YYYY-MM-DD".
  date: string;
  balance: number;
  committed: Flow;
  expected: Flow;
  usual: Flow;
  estimate: number;
  // How many complete months "usual" was read from.
  months: number;
}

export function endOfMonthEstimate(
  sources: {
    // What the accounts in this currency hold today.
    balance: number;
    // This month's commitments and expected movements still to happen, as
    // projection.ts reads them.
    committed: ProjectedMonth;
    expected: ProjectedMonth;
    transactions: readonly Transaction[];
    // Merchant entry ids whose rest of the month is already known: declared
    // (see declaredMerchantIds), or settled (see settledThisMonth).
    known: ReadonlySet<string>;
  },
  currency: string,
  today: string,
): EndOfMonth | null {
  const keys = typicalMonthKeys(sources.transactions, today);
  if (keys === null) return null;

  const since = `${keys[0]}-01`;
  const income: Transaction[] = [];
  const expenses: Transaction[] = [];
  for (const transaction of sources.transactions) {
    if (transaction.currency !== currency || transaction.date < since) continue;
    // A transfer moves money between the user's own accounts: the total stays.
    if (transaction.type === "transfer" || isFrom(transaction, sources.known)) continue;
    (transaction.type === "income" ? income : expenses).push(transaction);
  }

  const day = Number(today.slice(8, 10));
  const usual = {
    income: typicalBetween(monthCurves(income, keys), day, 31),
    expenses: typicalBetween(monthCurves(expenses, keys), day, 31),
  };
  const committed = {
    income: sources.committed.income,
    expenses: sources.committed.expenses,
  };
  const expected = {
    income: sources.expected.income,
    expenses: sources.expected.expenses,
  };
  const monthKey = today.slice(0, 7);

  return {
    date: `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, "0")}`,
    balance: sources.balance,
    committed,
    expected,
    usual,
    estimate: roundToCents(
      sources.balance +
        committed.income -
        committed.expenses +
        expected.income -
        expected.expenses +
        usual.income -
        usual.expenses,
    ),
    months: keys.length,
  };
}

function signed(amount: number, currency: string): string {
  const rounded = roundToCents(amount);
  return `${rounded < 0 ? "−" : "+"}${formatCurrency(Math.abs(rounded), currency)}`;
}

// What the figure is made of, a line per part, for its hover. Parts with
// nothing in them are left out.
export function endOfMonthBreakdown(estimate: EndOfMonth, currency: string): string[] {
  const { committed, expected, usual, months } = estimate;
  const parts: [string, number][] = [
    ["Compromisos que faltan", committed.income - committed.expenses],
    ["Previstos", expected.income - expected.expenses],
    [`Lo que suele entrar hasta fin de mes`, usual.income],
    [`Lo que solés gastar hasta fin de mes`, -usual.expenses],
  ];
  return [
    `Hoy: ${formatCurrency(estimate.balance, currency)}`,
    ...parts
      .filter(([, amount]) => roundToCents(amount) !== 0)
      .map(([label, amount]) => `${label}: ${signed(amount, currency)}`),
    `Lo habitual es la mediana de los últimos ${months} meses, sin lo que ya está en compromisos.`,
  ];
}
