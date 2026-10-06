import type { PaymentMethod } from "@/db";
import { parseIsoDate, toIsoDate } from "@/lib/format";
import { normalizeForSearch } from "@/lib/text";

// Values read out of words someone typed: an amount, a date, a currency, an
// account. Shared by everything that reads a line of free text — the quick
// entry and the search box — so "ayer", "2,5k" or "mp" mean the same thing in
// both.

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

export interface AmountToken {
  amount: number;
  sign: "+" | "-" | null;
  currency: string | null;
}

// The currency a word names on its own: "usd", "dólares", "pesos".
export function readCurrency(token: string): string | null {
  return CURRENCY_WORDS[normalizeForSearch(token)] ?? null;
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

export function readAmount(token: string): AmountToken | null {
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
export function readDate(token: string, today: string): string | null {
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
export function readAccount(
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
