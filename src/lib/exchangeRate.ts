import type { ExchangeRate } from "@/db/schema";
import { toIsoDate, todayIsoDate } from "@/lib/format";

// The dollar rates dolarapi.com publishes, all of them real prices for the same
// day. Which one values a movement honestly depends on how the movement
// actually happened: a card purchase abroad settles at the card rate, savings
// bought through a broker at the MEP, and so on.
//
// The slugs are the provider's, used verbatim in both URLs and as the stored
// `rate_type`, so there is no mapping table to keep in sync.
export const RATE_TYPES = [
  "oficial",
  "blue",
  "bolsa",
  "contadoconliqui",
  "cripto",
  "tarjeta",
] as const;

export type RateType = (typeof RATE_TYPES)[number];

export const DEFAULT_RATE_TYPE: RateType = "bolsa";

export const RATE_TYPE_LABELS: Record<RateType, string> = {
  oficial: "Oficial",
  blue: "Blue",
  bolsa: "MEP (bolsa)",
  contadoconliqui: "Contado con liqui",
  cripto: "Cripto",
  tarjeta: "Tarjeta",
};

// One line each, because "contado con liqui" means nothing to most people and
// picking the wrong rate silently misvalues every foreign movement.
export const RATE_TYPE_DESCRIPTIONS: Record<RateType, string> = {
  oficial: "El del banco, sin impuestos incluidos.",
  blue: "El informal, el de la calle.",
  bolsa: "El MEP: lo que cuesta un dólar por la vía legal, comprando bonos.",
  contadoconliqui: "Como el MEP, pero para sacar los dólares al exterior.",
  cripto: "El que sale de comprar y vender stablecoins.",
  tarjeta: "El oficial más impuestos: el que te cobran por gastar afuera.",
};

export function isRateType(value: unknown): value is RateType {
  return typeof value === "string" && (RATE_TYPES as readonly string[]).includes(value);
}

export const MANUAL_RATE_SOURCE = "manual";

// The stored `source` records where a quote came from, so a manual correction
// is never overwritten by a later download.
export function rateSourceFor(type: RateType): string {
  return `dolarapi:${type}`;
}

// Today's quote for one rate. CORS is open and no key or account is involved,
// so the webview can read it directly and nothing about the user is ever sent.
function currentRateUrl(type: RateType): string {
  return `https://dolarapi.com/v1/dolares/${type}`;
}

// The same provider's historical series, one quote per business day back to
// 2018. Fetched on demand rather than at start-up: it is a few thousand records
// per rate, worth downloading once but not on every launch.
function historyUrl(type: RateType): string {
  return `https://api.argentinadatos.com/v1/cotizaciones/dolares/${type}`;
}

const REQUEST_TIMEOUT_MS = 8000;
const HISTORY_TIMEOUT_MS = 30000;

interface DolarApiResponse {
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

// `response.json()` is typed `any`, so annotating the result with an interface
// asserts a shape nobody checked — a change at the provider would surface as
// NaN deep inside a conversion instead of as a failed fetch. These guards make
// the parse the place where a bad payload stops.
function isRatePayload(value: unknown): value is DolarApiResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isValidRate(candidate.compra) && isValidRate(candidate.venta);
}

// The local calendar day of a provider timestamp, or null when there is none
// to read. A bare "YYYY-MM-DD" already is a calendar day and is taken as it
// is: `new Date` would read it as midnight UTC, which is the previous evening
// in Argentina.
function localDayOf(timestamp: string | undefined): string | null {
  if (timestamp === undefined) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;

  const instant = new Date(timestamp);
  return Number.isNaN(instant.getTime()) ? null : toIsoDate(instant);
}

// Fetches the current quote for one rate. Throws on any network, timeout or
// shape problem; callers are expected to fall back to the last cached quote,
// since being offline must never break the app.
export async function fetchRate(type: RateType): Promise<ExchangeRate> {
  const response = await fetch(currentRateUrl(type), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Exchange rate request failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!isRatePayload(payload)) {
    throw new Error("Exchange rate response did not contain usable figures");
  }

  // The API timestamps the quote itself, in UTC. Read as the local calendar day
  // — the one every other date in the app uses — rather than sliced: from 21:00
  // in Argentina the UTC date is already tomorrow, and a row keyed to tomorrow
  // wins over today's manual correction. Falling back to today keeps the row
  // keyable if the field is ever missing or unreadable.
  const date = localDayOf(payload.fechaActualizacion) ?? todayIsoDate();

  return {
    date,
    rate_type: type,
    buy: payload.compra,
    sell: payload.venta,
    source: rateSourceFor(type),
    fetched_at: new Date().toISOString(),
  };
}

interface DolarApiHistoryEntry {
  compra: number;
  venta: number;
  fecha: string;
}

// Downloads every historical quote for one rate. Entries that are malformed are
// skipped rather than failing the whole import: one bad day should not cost the
// series.
export async function fetchRateHistory(type: RateType): Promise<ExchangeRate[]> {
  const response = await fetch(historyUrl(type), {
    signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Exchange rate history request failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  const fetchedAt = new Date().toISOString();

  if (!Array.isArray(payload)) {
    throw new Error("Exchange rate history response was not a list");
  }

  return (payload as DolarApiHistoryEntry[])
    .filter(
      (entry) =>
        typeof entry.fecha === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(entry.fecha) &&
        isValidRate(entry.compra) &&
        isValidRate(entry.venta),
    )
    .map((entry) => ({
      date: entry.fecha,
      rate_type: type,
      buy: entry.compra,
      sell: entry.venta,
      source: rateSourceFor(type),
      fetched_at: fetchedAt,
    }));
}
