import type { Category, CategoryRule, NewTransaction, PaymentMethod } from "@/db";
import type { CategoryModel } from "@/lib/ai/categoryModel";
import { suggestCategory, type CategorySuggestion } from "@/lib/ai/categorySuggestion";
import { parseIsoDate, toIsoDate } from "@/lib/format";
import { normalizeForSearch } from "@/lib/text";

// A movement typed as one line — "café 2500 mp ayer" — read into the fields
// the form would have asked for.
//
// The grammar is the order people already say it in: what it was, how much,
// and then, optionally, with what and when. The amount is the last figure on
// the line, so a number inside the description ("cuota 3 de 12") stays there.
// The account is only looked for after the amount, so "mercado libre" is a
// description and not the Mercado Pago account. Dates and currencies are
// distinctive enough to be read anywhere.
//
// Nothing here guesses silently: every field says where it came from, and
// whatever could not be read is a gap the screen shows before anything is
// saved.

export interface QuickEntryContext {
  today: string;
  paymentMethods: PaymentMethod[];
  categories: Category[];
  rules: CategoryRule[];
  // What the local AI learned; null with it switched off.
  model: CategoryModel | null;
  // The account each currency's latest movement went through, for when the
  // line names none. See lastUsedAccountByCurrency.
  lastUsedAccounts: Map<string, number>;
  // The currency to assume when neither an account nor a currency is typed:
  // whichever one the list is showing.
  defaultCurrency: string;
}

export interface QuickEntry {
  type: "income" | "expense";
  description: string;
  amount: number | null;
  currency: string;
  paymentMethodId: number | null;
  // Whether the account was assumed rather than typed, so the screen can say
  // so instead of presenting a guess as something the user wrote.
  accountAssumed: boolean;
  categoryId: number | null;
  // Who chose the category, a rule or the local AI, when one did.
  suggestion: CategorySuggestion | null;
  date: string;
}

// What still has to be filled in before the entry can be saved, in the order
// the line is typed.
export type QuickEntryGap = "description" | "amount" | "account" | "category" | "date";

const CURRENCY_WORDS: Record<string, string> = {
  usd: "USD",
  us$: "USD",
  u$s: "USD",
  dolar: "USD",
  dolares: "USD",
  ars: "ARS",
  peso: "ARS",
  pesos: "ARS",
};

// getDay() order, normalised the way the typed word will be.
const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

const RELATIVE_DAYS: Record<string, number> = { hoy: 0, ayer: 1, anteayer: 2 };

interface AmountToken {
  amount: number;
  sign: "+" | "-" | null;
  currency: string | null;
}

// A figure the way it gets typed in Argentina: a dot for thousands and a comma
// for decimals ("2.500,50"), with the forms people fall back on when typing
// fast — no separators, a lone dot for decimals ("12.50"), a "k" for
// thousands ("2,5k") — and a currency stuck to it ("$2500", "us$20").
function readNumber(core: string): number | null {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(core)) {
    return Number(core.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d+(,\d+)?$/.test(core)) return Number(core.replace(",", "."));
  if (/^\d+\.\d+$/.test(core)) return Number(core);
  return null;
}

function readAmount(token: string): AmountToken | null {
  let rest = token.toLowerCase();
  let sign: AmountToken["sign"] = null;
  let currency: string | null = null;

  if (rest.startsWith("+") || rest.startsWith("-")) {
    sign = rest[0] as "+" | "-";
    rest = rest.slice(1);
  }

  const prefix = ["us$", "u$s", "usd", "$"].find((symbol) => rest.startsWith(symbol));
  if (prefix !== undefined) {
    currency = prefix === "$" ? null : "USD";
    rest = rest.slice(prefix.length);
  }

  let multiplier = 1;
  if (rest.endsWith("k")) {
    multiplier = 1000;
    rest = rest.slice(0, -1);
  }

  const value = readNumber(rest);
  if (value === null || value <= 0) return null;

  return { amount: Math.round(value * multiplier * 100) / 100, sign, currency };
}

function daysBefore(today: string, days: number): string {
  const date = parseIsoDate(today);
  date.setDate(date.getDate() - days);
  return toIsoDate(date);
}

// "ayer", "viernes", "15/9", "15/9/2025". A weekday is the last one before
// today: on a Monday, "lunes" means a week ago, since today needs no date at
// all. A day and month with no year is the last time that day came round.
function readDate(token: string, today: string): string | null {
  const word = normalizeForSearch(token);

  if (word in RELATIVE_DAYS) return daysBefore(today, RELATIVE_DAYS[word]);

  const weekday = WEEKDAYS.indexOf(word);
  if (weekday !== -1) {
    const daysAgo = (parseIsoDate(today).getDay() - weekday + 7) % 7 || 7;
    return daysBefore(today, daysAgo);
  }

  const match = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/.exec(word);
  if (match === null) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const todayYear = parseIsoDate(today).getFullYear();
  const typedYear =
    match[3] === undefined
      ? null
      : match[3].length === 2
        ? 2000 + Number(match[3])
        : Number(match[3]);

  function dateIn(year: number): string | null {
    const date = new Date(year, month - 1, day);
    // Rejects 31/2 and the like, which Date would quietly roll over.
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return toIsoDate(date);
  }

  if (typedYear !== null) return dateIn(typedYear);

  const thisYear = dateIn(todayYear);
  if (thisYear === null) return null;
  return thisYear <= today ? thisYear : dateIn(todayYear - 1);
}

// The account a word names: its initials ("mp" for Mercado Pago) or the start
// of its name ("banco", "efectivo"). When several share it, the currency typed
// decides, then the one the list is showing; an account still ambiguous after
// that is not a guess worth making.
function readAccount(
  token: string,
  accounts: PaymentMethod[],
  currency: string,
): PaymentMethod | null {
  const word = normalizeForSearch(token);
  if (word.length < 2) return null;

  const matching = accounts.filter((account) => {
    const name = normalizeForSearch(account.name);
    const words = name.split(/\s+/);
    const initials = words.map((part) => part[0]).join("");

    return (
      (words.length > 1 && initials === word) ||
      (word.length >= 3 && name.startsWith(word))
    );
  });

  if (matching.length <= 1) return matching[0] ?? null;

  const inCurrency = matching.filter((account) => account.currency === currency);
  return inCurrency.length === 1 ? inCurrency[0] : null;
}

export function parseQuickEntry(text: string, context: QuickEntryContext): QuickEntry {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");
  const used = new Set<number>();

  // The amount first, from the end, since it is what the rest is read around.
  let amount: AmountToken | null = null;
  let amountIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index--) {
    amount = readAmount(tokens[index]);
    if (amount !== null) {
      amountIndex = index;
      used.add(index);
      break;
    }
  }

  let date: string | null = null;
  let typedCurrency = amount?.currency ?? null;
  tokens.forEach((token, index) => {
    if (used.has(index)) return;

    const currency = CURRENCY_WORDS[normalizeForSearch(token)];
    if (currency !== undefined && typedCurrency === null) {
      typedCurrency = currency;
      used.add(index);
      return;
    }

    const read = date === null ? readDate(token, context.today) : null;
    if (read !== null) {
      date = read;
      used.add(index);
    }
  });

  let typedAccount: PaymentMethod | null = null;
  if (amountIndex !== -1) {
    for (
      let index = amountIndex + 1;
      index < tokens.length && typedAccount === null;
      index++
    ) {
      if (used.has(index)) continue;
      typedAccount = readAccount(
        tokens[index],
        context.paymentMethods,
        typedCurrency ?? context.defaultCurrency,
      );
      if (typedAccount !== null) used.add(index);
    }
  }

  const description = tokens.filter((_, index) => !used.has(index)).join(" ");

  // The account named wins over a currency typed beside it: the money left
  // that account, in whatever it holds.
  const currency = typedAccount?.currency ?? typedCurrency ?? context.defaultCurrency;

  const lastUsed = context.lastUsedAccounts.get(currency);
  const account =
    typedAccount ??
    context.paymentMethods.find(
      (method) => method.id === lastUsed && method.currency === currency,
    ) ??
    context.paymentMethods.find((method) => method.currency === currency) ??
    null;

  // A sign decides the kind outright. Without one, the suggestions do: an
  // expense first, since most of what gets typed is spending, then an income.
  const suggestions = {
    rules: context.rules,
    categories: context.categories,
    model: context.model,
  };
  let type: QuickEntry["type"] = amount?.sign === "+" ? "income" : "expense";
  let suggestion = suggestCategory({ description, type }, suggestions);
  if ((amount?.sign ?? null) === null && suggestion === null) {
    const income = suggestCategory({ description, type: "income" }, suggestions);
    if (income !== null) {
      type = "income";
      suggestion = income;
    }
  }

  return {
    type,
    description,
    amount: amount?.amount ?? null,
    currency,
    paymentMethodId: account?.id ?? null,
    accountAssumed: typedAccount === null,
    categoryId: suggestion?.categoryId ?? null,
    suggestion,
    date: date ?? context.today,
  };
}

export function quickEntryGaps(entry: QuickEntry, today: string): QuickEntryGap[] {
  const gaps: QuickEntryGap[] = [];
  if (entry.description === "") gaps.push("description");
  if (entry.amount === null) gaps.push("amount");
  if (entry.paymentMethodId === null) gaps.push("account");
  if (entry.categoryId === null) gaps.push("category");
  if (entry.date > today) gaps.push("date");
  return gaps;
}

// Only meaningful once quickEntryGaps has nothing left to ask for.
export function quickEntryToTransaction(entry: QuickEntry): NewTransaction {
  return {
    amount: entry.amount ?? 0,
    type: entry.type,
    categoryId: entry.categoryId,
    paymentMethodId: entry.paymentMethodId,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    description: entry.description,
    date: entry.date,
    currency: entry.currency,
  };
}

// Per currency, the account the latest movement went through: where a line
// that names no account most likely came from. Ties on a date go to the later
// row, which is the one entered last.
export function lastUsedAccountByCurrency(
  transactions: {
    id: number;
    date: string;
    currency: string;
    payment_method_id: number | null;
  }[],
): Map<string, number> {
  const latest = new Map<string, { date: string; id: number; accountId: number }>();

  for (const transaction of transactions) {
    if (transaction.payment_method_id === null) continue;
    const current = latest.get(transaction.currency);
    if (
      current === undefined ||
      transaction.date > current.date ||
      (transaction.date === current.date && transaction.id > current.id)
    ) {
      latest.set(transaction.currency, {
        date: transaction.date,
        id: transaction.id,
        accountId: transaction.payment_method_id,
      });
    }
  }

  return new Map(Array.from(latest, ([currency, entry]) => [currency, entry.accountId]));
}
