import type { Category, PaymentMethod, Tag, TransactionType } from "@/db/schema";
import { CURRENCY_SHORT_LABELS } from "@/lib/currency";
import type { TransactionFilters } from "@/lib/finance";
import {
  formatCurrency,
  formatDate,
  formatMonthLabel,
  parseIsoDate,
  toIsoDate,
} from "@/lib/format";
import { normalizeForSearch } from "@/lib/text";
import { readAccount, readAmount, readCurrency, readDate } from "@/lib/typedText";

// A search typed the way it would be said — "comida en agosto más de 5000" —
// read into the filters it means. It filters; it never answers.
//
// Each part understood becomes a chip the screen shows and the user can take
// away. Whatever is not understood stays as text to search for, so a query
// with nothing recognisable in it searches exactly as it always did. Only
// what is distinctive is read: kinds in the plural ("gastos", not the
// "transferencia" a bank writes in a description), a category by its whole
// name, an account only after "con", "en" or "desde", and an amount only
// after a comparison, since a bare number is as likely part of a description.

export interface SearchContext {
  today: string;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  tags: Tag[];
  // The currency on screen: it tells apart two accounts whose names start the
  // same, and writes the amounts on the chips unless the query names another.
  currency: string;
}

export interface SearchFilters extends Pick<
  TransactionFilters,
  | "type"
  | "categoryId"
  | "paymentMethodId"
  | "currency"
  | "dateFrom"
  | "dateTo"
  | "minAmount"
  | "maxAmount"
> {
  tag: string | null;
}

export interface SearchChip {
  label: string;
  // The positions, among the query's words, of the ones it was read from:
  // what taking it away removes.
  tokens: number[];
  // Whether it says which currency to show: "en dólares", or "us$" written
  // with an amount. Choosing a currency on screen takes these away.
  setsCurrency: boolean;
}

export interface ParsedSearch {
  filters: SearchFilters;
  // What is left to search the text for.
  rest: string;
  chips: SearchChip[];
}

const KINDS: Record<string, TransactionType> = {
  gastos: "expense",
  egresos: "expense",
  ingresos: "income",
  transferencias: "transfer",
};

const KIND_LABELS: Record<TransactionType, string> = {
  expense: "Gastos",
  income: "Ingresos",
  transfer: "Transferencias",
};

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

// Normalised the way the typed words will be: "año" reads as "ano".
const RELATIVE_PERIODS: { words: string[]; months: number | null; years: number }[] = [
  { words: ["el", "mes", "pasado"], months: -1, years: 0 },
  { words: ["mes", "pasado"], months: -1, years: 0 },
  { words: ["este", "mes"], months: 0, years: 0 },
  { words: ["el", "ano", "pasado"], months: null, years: -1 },
  { words: ["ano", "pasado"], months: null, years: -1 },
  { words: ["este", "ano"], months: null, years: 0 },
];

const AT_LEAST = [
  ["mas", "de"],
  ["mayor", "a"],
  ["mayor", "que"],
  ["arriba", "de"],
  ["desde"],
];
const AT_MOST = [
  ["menos", "de"],
  ["menor", "a"],
  ["menor", "que"],
  ["debajo", "de"],
  ["hasta"],
];

// What introduces an account: "con mp", "en efectivo", "desde el banco".
const ACCOUNT_CONNECTORS = new Set(["con", "en", "desde"]);

// Words that only join the parts of a query. Next to something understood they
// go with it, so "en agosto" is one chip and leaves no stray "en" to search
// for; between two words that are searched for, they stay, since "pago de
// luz" is not "pago luz".
const FILLERS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "desde",
  "el",
  "en",
  "la",
  "las",
  "lo",
  "los",
  "mi",
  "mis",
  "para",
  "por",
  "que",
  "y",
]);

// How every reader sees a word: no accents or case, and no punctuation
// around it, so "agosto," is still August.
function normalise(token: string): string {
  return normalizeForSearch(token).replace(/^[¿¡("']+|[?!,.;:)"']+$/g, "");
}

function splitQuery(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");
}

function monthBounds(year: number, month: number): { from: string; to: string } {
  return {
    from: toIsoDate(new Date(year, month - 1, 1)),
    to: toIsoDate(new Date(year, month, 0)),
  };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

type Reading =
  | { kind: "tag"; name: string }
  | { kind: "amount"; min: number | null; max: number | null; currency: string | null }
  | { kind: "type"; type: TransactionType }
  | { kind: "currency"; currency: string }
  | { kind: "period"; from: string; to: string; label: string }
  | { kind: "category"; category: Category }
  | { kind: "account"; account: PaymentMethod };

export function parseSearchQuery(text: string, context: SearchContext): ParsedSearch {
  const tokens = splitQuery(text);
  const words = tokens.map(normalise);
  // Which reading claimed each word.
  const claimedBy: (number | undefined)[] = tokens.map(() => undefined);
  const readings: { reading: Reading; tokens: number[] }[] = [];

  const isFree = (index: number) =>
    index >= 0 && index < tokens.length && claimedBy[index] === undefined;

  // Whether `sequence` is at `start`, every word of it still unclaimed.
  function matchesAt(start: number, sequence: string[]): boolean {
    return sequence.every(
      (word, offset) => isFree(start + offset) && words[start + offset] === word,
    );
  }

  function claim(reading: Reading, start: number, length: number) {
    const indices = Array.from({ length }, (_, offset) => start + offset);
    for (const index of indices) claimedBy[index] = readings.length;
    readings.push({ reading, tokens: indices });
  }

  const has = (kind: Reading["kind"]) =>
    readings.some((entry) => entry.reading.kind === kind);

  // Tags, written the way the app shows them: "#viaje". Only one that exists,
  // so a stray "#" is just text.
  for (let index = 0; index < tokens.length; index++) {
    if (!isFree(index) || !words[index].startsWith("#") || has("tag")) continue;
    const tag = context.tags.find(
      (candidate) => normalizeForSearch(candidate.name) === words[index].slice(1),
    );
    if (tag !== undefined) claim({ kind: "tag", name: tag.name }, index, 1);
  }

  // Amounts, after a comparison: "más de 5000", "menos de 2k", "entre 1000 y
  // 5000", ">5000".
  for (let index = 0; index < tokens.length; index++) {
    if (!isFree(index) || has("amount")) continue;

    if (words[index] === "entre" && words[index + 2] === "y") {
      const low = isFree(index + 1) ? readAmount(tokens[index + 1]) : null;
      const high = isFree(index + 3) ? readAmount(tokens[index + 3]) : null;
      if (low !== null && high !== null && isFree(index + 2)) {
        claim(
          {
            kind: "amount",
            min: Math.min(low.amount, high.amount),
            max: Math.max(low.amount, high.amount),
            currency: low.currency ?? high.currency,
          },
          index,
          4,
        );
        continue;
      }
    }

    const symbol = /^([<>])=?(.*)$/.exec(tokens[index]);
    if (symbol !== null) {
      const stuck = symbol[2] !== "";
      const amount = stuck
        ? readAmount(symbol[2])
        : isFree(index + 1)
          ? readAmount(tokens[index + 1])
          : null;
      if (amount !== null) {
        const atLeast = symbol[1] === ">";
        claim(
          {
            kind: "amount",
            min: atLeast ? amount.amount : null,
            max: atLeast ? null : amount.amount,
            currency: amount.currency,
          },
          index,
          stuck ? 1 : 2,
        );
        continue;
      }
    }

    for (const [comparisons, atLeast] of [
      [AT_LEAST, true],
      [AT_MOST, false],
    ] as const) {
      const comparison = comparisons.find((sequence) => matchesAt(index, sequence));
      if (comparison === undefined) continue;
      const at = index + comparison.length;
      const amount = isFree(at) ? readAmount(tokens[at]) : null;
      if (amount === null) continue;
      claim(
        {
          kind: "amount",
          min: atLeast ? amount.amount : null,
          max: atLeast ? null : amount.amount,
          currency: amount.currency,
        },
        index,
        comparison.length + 1,
      );
      break;
    }
  }

  // A period: "agosto", "agosto 2025", "agosto de 2025", "el mes pasado",
  // "este año", or a day the quick entry would read, "ayer" or "15/9". A month
  // with no year is the last time it came round.
  const today = parseIsoDate(context.today);
  for (let index = 0; index < tokens.length && !has("period"); index++) {
    if (!isFree(index)) continue;

    const month = MONTHS[words[index]];
    if (month !== undefined) {
      let year =
        month <= today.getMonth() + 1 ? today.getFullYear() : today.getFullYear() - 1;
      let length = 1;
      const yearAt = (at: number) =>
        isFree(at) && /^(19|20)\d{2}$/.test(words[at]) ? Number(words[at]) : null;
      const plain = yearAt(index + 1);
      const joined =
        (words[index + 1] === "de" || words[index + 1] === "del") && isFree(index + 1)
          ? yearAt(index + 2)
          : null;
      if (plain !== null) {
        year = plain;
        length = 2;
      } else if (joined !== null) {
        year = joined;
        length = 3;
      }
      claim(
        {
          kind: "period",
          ...monthBounds(year, month),
          label: formatMonthLabel(monthKey(year, month)),
        },
        index,
        length,
      );
      continue;
    }

    const relative = RELATIVE_PERIODS.find((period) => matchesAt(index, period.words));
    if (relative !== undefined) {
      const year = today.getFullYear() + relative.years;
      if (relative.months === null) {
        claim(
          {
            kind: "period",
            from: `${year}-01-01`,
            to: `${year}-12-31`,
            label: String(year),
          },
          index,
          relative.words.length,
        );
      } else {
        const start = new Date(year, today.getMonth() + relative.months, 1);
        const key = monthKey(start.getFullYear(), start.getMonth() + 1);
        claim(
          {
            kind: "period",
            ...monthBounds(start.getFullYear(), start.getMonth() + 1),
            label: formatMonthLabel(key),
          },
          index,
          relative.words.length,
        );
      }
      continue;
    }

    const day = readDate(tokens[index], context.today);
    if (day !== null) {
      claim({ kind: "period", from: day, to: day, label: formatDate(day) }, index, 1);
    }
  }

  for (let index = 0; index < tokens.length; index++) {
    if (!isFree(index)) continue;
    const type = KINDS[words[index]];
    if (type !== undefined && !has("type")) {
      claim({ kind: "type", type }, index, 1);
      continue;
    }
    const currency = readCurrency(words[index]);
    if (currency !== null && !has("currency")) {
      claim({ kind: "currency", currency }, index, 1);
    }
  }

  const typeRead = readings.find((entry) => entry.reading.kind === "type")?.reading;
  const typeFilter = typeRead?.kind === "type" ? typeRead.type : null;

  // A category by its whole name, the longest first, so "Comida rápida" wins
  // over "Comida". A name two categories share is only read when the kind
  // asked for tells them apart.
  const byName = [...context.categories]
    .map((category) => ({ category, sequence: splitQuery(category.name).map(normalise) }))
    .filter(({ sequence }) => sequence.length > 0)
    .sort((a, b) => b.sequence.length - a.sequence.length);
  for (let index = 0; index < tokens.length && !has("category"); index++) {
    const matching = byName.filter(({ sequence }) => matchesAt(index, sequence));
    if (matching.length === 0) continue;
    const longest = matching.filter(
      ({ sequence }) => sequence.length === matching[0].sequence.length,
    );
    const chosen =
      longest.length === 1
        ? longest[0]
        : longest.filter(({ category }) => category.type === typeFilter).length === 1
          ? longest.find(({ category }) => category.type === typeFilter)
          : undefined;
    if (chosen !== undefined) {
      claim(
        { kind: "category", category: chosen.category },
        index,
        chosen.sequence.length,
      );
    }
  }

  // An account after "con", "en" or "desde": by its whole name, or the way the
  // quick entry reads one ("mp", "banco").
  const currencyRead = readings.find((entry) => entry.reading.kind === "currency");
  const currency =
    currencyRead?.reading.kind === "currency"
      ? currencyRead.reading.currency
      : context.currency;
  const accountsByName = context.paymentMethods
    .map((account) => ({ account, sequence: splitQuery(account.name).map(normalise) }))
    .sort((a, b) => b.sequence.length - a.sequence.length);
  for (let index = 0; index < tokens.length - 1 && !has("account"); index++) {
    if (!isFree(index) || !ACCOUNT_CONNECTORS.has(words[index])) continue;
    const named = accountsByName.find(({ sequence }) => matchesAt(index + 1, sequence));
    if (named !== undefined) {
      claim(
        { kind: "account", account: named.account },
        index,
        named.sequence.length + 1,
      );
      continue;
    }
    const read = isFree(index + 1)
      ? readAccount(tokens[index + 1], context.paymentMethods, currency)
      : null;
    if (read !== null) claim({ kind: "account", account: read }, index, 2);
  }

  // Joining words go with whatever they sit next to.
  if (readings.length > 0) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < tokens.length; index++) {
        if (!isFree(index) || !FILLERS.has(words[index])) continue;
        const neighbour = claimedBy[index + 1] ?? claimedBy[index - 1];
        if (neighbour === undefined) continue;
        claimedBy[index] = neighbour;
        readings[neighbour].tokens.push(index);
        changed = true;
      }
    }
  }

  const filters: SearchFilters = {
    type: null,
    categoryId: null,
    paymentMethodId: null,
    currency: currencyRead === undefined ? null : currency,
    dateFrom: null,
    dateTo: null,
    minAmount: null,
    maxAmount: null,
    tag: null,
  };

  const chips = readings.map(({ reading, tokens: indices }): SearchChip => {
    const chip = (label: string, setsCurrency = false) => ({
      label,
      tokens: [...indices].sort((a, b) => a - b),
      setsCurrency,
    });
    switch (reading.kind) {
      case "tag":
        filters.tag = reading.name;
        return chip(`#${reading.name}`);
      case "amount": {
        filters.minAmount = reading.min;
        filters.maxAmount = reading.max;
        // A currency written with the amount ("más de us$100") says which
        // money is meant, as much as the word "dólares" would.
        if (reading.currency !== null && filters.currency === null) {
          filters.currency = reading.currency;
        }
        const shown = filters.currency ?? context.currency;
        const format = (amount: number) => formatCurrency(amount, shown);
        const withCurrency = reading.currency !== null;
        if (reading.min !== null && reading.max !== null) {
          return chip(
            `Entre ${format(reading.min)} y ${format(reading.max)}`,
            withCurrency,
          );
        }
        return reading.min !== null
          ? chip(`Desde ${format(reading.min)}`, withCurrency)
          : chip(`Hasta ${format(reading.max ?? 0)}`, withCurrency);
      }
      case "type":
        filters.type = reading.type;
        return chip(KIND_LABELS[reading.type]);
      case "currency":
        return chip(CURRENCY_SHORT_LABELS[reading.currency] ?? reading.currency, true);
      case "period":
        filters.dateFrom = reading.from;
        filters.dateTo = reading.to;
        return chip(reading.label);
      case "category":
        filters.categoryId = reading.category.id;
        return chip(`Categoría ${reading.category.name}`);
      case "account":
        filters.paymentMethodId = reading.account.id;
        return chip(`Cuenta ${reading.account.name}`);
    }
  });

  // In the order they were typed, whatever order they were read in.
  chips.sort((a, b) => a.tokens[0] - b.tokens[0]);

  const rest =
    readings.length === 0
      ? text
      : tokens.filter((_, index) => claimedBy[index] === undefined).join(" ");

  return { filters, rest, chips };
}

// The query without the words some of its chips were read from.
export function withoutChips(text: string, chips: SearchChip[]): string {
  const removed = new Set(chips.flatMap((chip) => chip.tokens));
  return splitQuery(text)
    .filter((_, index) => !removed.has(index))
    .join(" ");
}
