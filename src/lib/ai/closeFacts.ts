import { learnMerchantHistory } from "@/lib/ai/merchantHistory";
import { riseOf } from "@/lib/ai/priceRises";
import { detectSeries, type Commitments } from "@/lib/ai/series";
import { daysInMonth } from "@/lib/ai/typicalMonth";
import { spendingBaselines, unusualSpending } from "@/lib/ai/unusualSpending";
import type { CurrencyClose, MonthComparison } from "@/lib/monthlyClose";
import type { Category, Transaction } from "@/db/schema";

// What a month's close has to say, as typed facts: the balance, the saving rate
// against last month and last year, the category that moved most, charges that
// went up and spending far above the usual. The narrative only words them
// (see closeNarrative.ts), so every figure in a sentence comes from here.

// How far apart two saving rates have to be to read as more or less, rather
// than about the same: five points of what came in.
export const MIN_RATE_CHANGE = 0.05;

// How far a category has to move against last month to be worth a sentence,
// and how much of the month it has to weigh: a category that doubled from
// almost nothing is not what happened.
export const MIN_CATEGORY_CHANGE = 0.2;
export const MIN_CATEGORY_SHARE = 0.05;

// Charges that went up, named one by one up to this many.
export const MAX_LISTED_RISES = 3;

export interface CloseRise {
  name: string;
  previous: number;
  latest: number;
  // 0.18 for +18%.
  rise: number;
}

export interface CloseUnusual {
  name: string;
  amount: number;
  typical: number;
  date: string;
}

// What the month's movements say beyond its figures, in one currency.
export interface CloseSignals {
  // The biggest jump first.
  rises: CloseRise[];
  // Furthest above the usual first.
  unusual: CloseUnusual[];
}

export const NO_SIGNALS: CloseSignals = { rises: [], unusual: [] };

export type CloseFact =
  | {
      kind: "balance";
      variant: "saved" | "even" | "overspent" | "onlyIncome" | "onlyExpenses";
      income: number;
      expenses: number;
      balance: number;
    }
  | {
      kind: "savingRate";
      variant: "more" | "less" | "steady" | "recovered";
      rate: number;
      previousRate: number;
      monthKey: string;
    }
  | {
      kind: "savingRateLastYear";
      variant: "more" | "less" | "steady";
      rate: number;
      previousRate: number;
      monthKey: string;
    }
  | {
      kind: "categoryRise";
      variant: "up";
      category: string;
      current: number;
      previous: number;
      change: number;
      monthKey: string;
    }
  | {
      kind: "categoryFall";
      variant: "lower" | "stopped";
      category: string;
      current: number;
      previous: number;
      change: number;
      monthKey: string;
    }
  | {
      kind: "newCategory";
      variant: "new";
      category: string;
      current: number;
      monthKey: string;
    }
  | {
      kind: "rise";
      variant: "one" | "several" | "many";
      rises: CloseRise[];
    }
  | {
      kind: "unusual";
      variant: "one" | "two" | "several";
      top: CloseUnusual;
      others: number;
    };

export type CloseFactKind = CloseFact["kind"];

// Every variant of every kind, for the phrase file's test to hold it to.
export const FACT_VARIANTS: {
  [K in CloseFactKind]: Extract<CloseFact, { kind: K }>["variant"][];
} = {
  balance: ["saved", "even", "overspent", "onlyIncome", "onlyExpenses"],
  savingRate: ["more", "less", "steady", "recovered"],
  savingRateLastYear: ["more", "less", "steady"],
  categoryRise: ["up"],
  categoryFall: ["lower", "stopped"],
  newCategory: ["new"],
  rise: ["one", "several", "many"],
  unusual: ["one", "two", "several"],
};

// Compared as they are shown, to a tenth of a point (see formatPercent): a rate
// that reads 23,4% twice is the same rate, whatever floating point says.
function perMille(ratio: number): number {
  return Math.round(ratio * 1000);
}

function atLeast(ratio: number, threshold: number): boolean {
  return perMille(ratio) >= perMille(threshold);
}

function balanceFact(block: CurrencyClose): CloseFact {
  const { income, expenses, balance } = block.summary;
  const variant =
    income === 0
      ? "onlyExpenses"
      : expenses === 0
        ? "onlyIncome"
        : balance > 0
          ? "saved"
          : balance < 0
            ? "overspent"
            : "even";
  return { kind: "balance", variant, income, expenses, balance };
}

// What was kept of what came in. Null when nothing came in.
function savingRate(summary: { income: number; balance: number }): number | null {
  return summary.income > 0 ? summary.balance / summary.income : null;
}

function rateVariant(rate: number, previousRate: number): "more" | "less" | "steady" {
  const gap = perMille(rate) - perMille(previousRate);
  if (gap >= perMille(MIN_RATE_CHANGE)) return "more";
  if (-gap >= perMille(MIN_RATE_CHANGE)) return "less";
  return "steady";
}

// Only for a month that kept something: a negative rate is not a rate anyone
// says out loud, and the balance already said the month spent more than it got.
function savingRateFacts(block: CurrencyClose): CloseFact[] {
  const rate = savingRate(block.summary);
  if (rate === null || rate <= 0) return [];
  const facts: CloseFact[] = [];

  const previousRate = block.previousMonth && savingRate(block.previousMonth.summary);
  if (block.previousMonth && previousRate !== null) {
    facts.push({
      kind: "savingRate",
      variant: previousRate <= 0 ? "recovered" : rateVariant(rate, previousRate),
      rate,
      previousRate,
      monthKey: block.previousMonth.monthKey,
    });
  }

  const lastYearRate = block.lastYear && savingRate(block.lastYear.summary);
  if (block.lastYear && lastYearRate !== null && lastYearRate > 0) {
    facts.push({
      kind: "savingRateLastYear",
      variant: rateVariant(rate, lastYearRate),
      rate,
      previousRate: lastYearRate,
      monthKey: block.lastYear.monthKey,
    });
  }
  return facts;
}

// The categories that moved against last month: the biggest rise, the biggest
// fall and the biggest one that was not there. Expenses only, and only named
// categories: "Sin categoría subió" says nothing about the month.
function categoryFacts(block: CurrencyClose, comparison: MonthComparison): CloseFact[] {
  const monthTotal = block.summary.expenses;
  const previousTotal = comparison.summary.expenses;
  const weighs = (amount: number, total: number) =>
    total > 0 && atLeast(amount / total, MIN_CATEGORY_SHARE);
  const named = comparison.expenses.filter((change) => change.categoryId !== null);
  const { monthKey } = comparison;
  const facts: CloseFact[] = [];

  // Already ordered by the size of the move, largest first.
  const rise = named.find(
    (change) =>
      change.previous > 0 &&
      change.delta > 0 &&
      change.changeRatio !== null &&
      atLeast(change.changeRatio, MIN_CATEGORY_CHANGE) &&
      weighs(change.current, monthTotal),
  );
  if (rise) {
    facts.push({
      kind: "categoryRise",
      variant: "up",
      category: rise.name,
      current: rise.current,
      previous: rise.previous,
      change: rise.changeRatio ?? 0,
      monthKey,
    });
  }

  const fall = named.find(
    (change) =>
      change.previous > 0 &&
      change.delta < 0 &&
      change.changeRatio !== null &&
      atLeast(-change.changeRatio, MIN_CATEGORY_CHANGE) &&
      weighs(change.previous, previousTotal),
  );
  if (fall) {
    facts.push({
      kind: "categoryFall",
      variant: fall.current === 0 ? "stopped" : "lower",
      category: fall.name,
      current: fall.current,
      previous: fall.previous,
      change: -(fall.changeRatio ?? 0),
      monthKey,
    });
  }

  const fresh = named.find(
    (change) =>
      change.previous === 0 && change.current > 0 && weighs(change.current, monthTotal),
  );
  if (fresh) {
    facts.push({
      kind: "newCategory",
      variant: "new",
      category: fresh.name,
      current: fresh.current,
      monthKey,
    });
  }
  return facts;
}

function riseFact(rises: CloseRise[]): CloseFact | null {
  if (rises.length === 0) return null;
  const variant =
    rises.length === 1 ? "one" : rises.length <= MAX_LISTED_RISES ? "several" : "many";
  return { kind: "rise", variant, rises };
}

function unusualFact(unusual: CloseUnusual[]): CloseFact | null {
  const [top, ...rest] = unusual;
  if (top === undefined) return null;
  const variant = rest.length === 0 ? "one" : rest.length === 1 ? "two" : "several";
  return { kind: "unusual", variant, top, others: rest.length };
}

// Every fact one currency's close holds, in no particular order: which ones are
// told, and in what order, is the narrative's business.
export function closeFacts(block: CurrencyClose, signals: CloseSignals): CloseFact[] {
  return [
    balanceFact(block),
    ...savingRateFacts(block),
    ...(block.previousMonth ? categoryFacts(block, block.previousMonth) : []),
    riseFact(signals.rises),
    unusualFact(signals.unusual),
  ].filter((fact): fact is CloseFact => fact !== null);
}

// What the month's movements say, read as they stood when it ended: the history
// up to its last day, and the series active then. A close rebuilt months later
// reads the same, whatever came after it.
export function closeSignals(
  transactions: readonly Transaction[],
  categories: readonly Pick<Category, "id" | "name">[],
  commitments: Commitments,
  monthKey: string,
): Map<string, CloseSignals> {
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, "0")}`;
  const upToEnd = transactions.filter((transaction) => transaction.date <= monthEnd);
  const history = learnMerchantHistory(upToEnd, monthEnd);
  const series = detectSeries(history, commitments, monthEnd);
  const baselines = spendingBaselines(upToEnd, categories, history, series);

  const signals = new Map<string, CloseSignals>();
  const of = (currency: string) => {
    let entry = signals.get(currency);
    if (entry === undefined) {
      entry = { rises: [], unusual: [] };
      signals.set(currency, entry);
    }
    return entry;
  };

  for (const entry of series) {
    if (entry.lastDate < monthStart) continue;
    const rise = riseOf(entry);
    if (rise !== null)
      of(entry.merchant.currency).rises.push({ name: entry.merchant.label, ...rise });
  }

  for (const movement of upToEnd) {
    if (movement.date < monthStart) continue;
    const unusual = unusualSpending(movement, baselines);
    if (unusual === null) continue;
    of(movement.currency).unusual.push({
      name: unusual.name,
      amount: movement.amount,
      typical: unusual.typical,
      date: movement.date,
    });
  }

  for (const entry of signals.values()) {
    entry.rises.sort((a, b) => b.rise - a.rise || a.name.localeCompare(b.name));
    entry.unusual.sort(
      (a, b) =>
        b.amount / b.typical - a.amount / a.typical ||
        a.date.localeCompare(b.date) ||
        a.name.localeCompare(b.name),
    );
  }
  return signals;
}
