import { DEFAULT_CURRENCY } from "@/lib/currency";

// Amounts are written the Argentine way: "$ 1.234,50", "US$ 1.234,50".
const AMOUNT_LOCALE = "es-AR";
// Dates and chart ticks stay on es-ES, where es-AR reads worse: it spells a
// short date "05 de sept de 2026", longer in every table, and abbreviates
// thousands as "8 K" but "12,3 k" on the same axis, where es-ES says "8 mil".
const DATE_LOCALE = "es-ES";

// Building an Intl formatter costs far more than using one, and these run once
// per row, so one is kept per currency.
const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatCurrency(
  value: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  let formatter = currencyFormatters.get(currency);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(AMOUNT_LOCALE, { style: "currency", currency });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}

const percentFormatter = new Intl.NumberFormat(AMOUNT_LOCALE, {
  style: "percent",
  maximumFractionDigits: 1,
});

// A ratio (0.275) as a percentage ("27,5%"). One decimal, because a financing
// surcharge is rarely a round number and rounding to whole points would report
// 27% for both 27,1% and 27,9%.
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}

const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

// Parses a "YYYY-MM-DD" string as a local date. Using `new Date(isoString)`
// instead would parse it as UTC midnight, which shifts to the previous day
// once formatted in negative-UTC-offset timezones.
export function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

export function formatDate(isoDate: string): string {
  return dateFormatter.format(parseIsoDate(isoDate));
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

const monthFormatters = {
  long: new Intl.DateTimeFormat(DATE_LOCALE, { month: "long", year: "numeric" }),
  short: new Intl.DateTimeFormat(DATE_LOCALE, { month: "short", year: "numeric" }),
};

// Formats a "YYYY-MM" key as a human month label, e.g. "Julio de 2026" (long)
// or "jul 2026" (short, used for compact chart axes).
export function formatMonthLabel(
  monthKey: string,
  style: "long" | "short" = "long",
): string {
  const [year, month] = monthKey.split("-").map(Number);
  const label = monthFormatters[style].format(new Date(year, month - 1, 1));
  return style === "long" ? capitalize(label) : label;
}

const compactFormatter = new Intl.NumberFormat(DATE_LOCALE, {
  notation: "compact",
  maximumFractionDigits: 1,
});

// Short form for chart axis ticks. A tick has to read at a glance and has very
// little room: "8 mil" carries the magnitude that "$ 8.000,00" buries, and the
// currency is deliberately left off because repeating it on every tick is noise
// the tooltip and the summary cards already cover.
export function formatCompactAmount(value: number): string {
  return compactFormatter.format(value);
}
