import phrases from "@/lib/ai/data/closePhrases.json";
import {
  closeFacts,
  closeSignals,
  MAX_LISTED_RISES,
  NO_SIGNALS,
  type CloseFact,
  type CloseFactKind,
  type CloseRise,
} from "@/lib/ai/closeFacts";
import type { Commitments } from "@/lib/ai/series";
import {
  formatCurrency,
  formatDate,
  formatList,
  formatMonthLabel,
  formatPercent,
} from "@/lib/format";
import type { MonthlyClose } from "@/lib/monthlyClose";
import type { Category, Transaction } from "@/db/schema";

// A month's close in a few sentences: the facts that matter most, each worded
// from closePhrases.json. The wording is picked by hashing the month and the
// fact, never at random, so the same close always reads the same; and every
// figure comes from the fact, never from the template, so a sentence cannot get
// a number wrong.

// The balance and at most this many more things worth saying.
export const MAX_SENTENCES = 5;

interface PhraseSet {
  priority: number;
  variants: Record<string, string[]>;
}

export const PHRASES = phrases as Record<CloseFactKind, PhraseSet>;

// A small string hash (FNV-1a): stable across launches and machines, which is
// all a choice of wording needs.
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

// Months are written in lower case inside a sentence: "más que en agosto de 2026".
function month(monthKey: string): string {
  return formatMonthLabel(monthKey).toLowerCase();
}

function riseChange(rise: CloseRise): string {
  return `+${formatPercent(rise.rise)}`;
}

// What each placeholder of a fact's templates reads, formatted through
// format.ts.
export function factValues(fact: CloseFact, currency: string): Record<string, string> {
  const amount = (value: number) => formatCurrency(value, currency);

  switch (fact.kind) {
    case "balance":
      return {
        income: amount(fact.income),
        expenses: amount(fact.expenses),
        balance: amount(fact.balance),
        shortfall: amount(-fact.balance),
      };
    case "savingRate":
    case "savingRateLastYear":
      return {
        rate: formatPercent(fact.rate),
        previousRate: formatPercent(fact.previousRate),
        month: month(fact.monthKey),
      };
    case "categoryRise":
    case "categoryFall":
      return {
        category: fact.category,
        current: amount(fact.current),
        previous: amount(fact.previous),
        change: formatPercent(fact.change),
        month: month(fact.monthKey),
      };
    case "newCategory":
      return {
        category: fact.category,
        current: amount(fact.current),
        month: month(fact.monthKey),
      };
    case "rise": {
      const [top] = fact.rises;
      return {
        merchant: top.name,
        previous: amount(top.previous),
        latest: amount(top.latest),
        change: riseChange(top),
        count: String(fact.rises.length),
        list: formatList(
          fact.rises
            .slice(0, MAX_LISTED_RISES)
            .map((rise) => `${rise.name} (${riseChange(rise)})`),
        ),
      };
    }
    case "unusual":
      return {
        merchant: fact.top.name,
        amount: amount(fact.top.amount),
        typical: amount(fact.top.typical),
        date: formatDate(fact.top.date),
        count: String(fact.others + 1),
        others: String(fact.others),
      };
  }
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{(\w+)\}/g,
    (placeholder, key: string) => values[key] ?? placeholder,
  );
}

// One currency's sentences, most important first.
export function narrate(
  facts: CloseFact[],
  monthKey: string,
  currency: string,
): string[] {
  return [...facts]
    .sort((a, b) => PHRASES[a.kind].priority - PHRASES[b.kind].priority)
    .slice(0, MAX_SENTENCES)
    .map((fact) => {
      const wordings = PHRASES[fact.kind].variants[fact.variant];
      const wording =
        wordings[
          hash(`${monthKey}:${currency}:${fact.kind}:${fact.variant}`) % wordings.length
        ];
      return fillTemplate(wording, factValues(fact, currency));
    });
}

// The sentences of every currency the close covers, by currency, in the close's
// own order.
export function narrateMonth(
  close: MonthlyClose,
  sources: {
    transactions: readonly Transaction[];
    categories: readonly Pick<Category, "id" | "name">[];
    commitments: Commitments;
  },
): Map<string, string[]> {
  const signals = closeSignals(
    sources.transactions,
    sources.categories,
    sources.commitments,
    close.monthKey,
  );
  return new Map(
    close.currencies.map((block) => [
      block.currency,
      narrate(
        closeFacts(block, signals.get(block.currency) ?? NO_SIGNALS),
        close.monthKey,
        block.currency,
      ),
    ]),
  );
}
