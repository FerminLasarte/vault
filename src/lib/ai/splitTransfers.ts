import {
  apartText,
  isBare,
  isRecent,
  toCents,
  withinReach,
  type LedgerContext,
  type LedgerRow,
} from "@/lib/ai/ledger";
import { daysBetween, formatCurrency, parseIsoDate, toIsoDate } from "@/lib/format";
import type { RateLookup } from "@/lib/finance";
import type { TransferJoin } from "@/db";
import type { NewTransaction, TransactionWithCategory } from "@/db/schema";

// A move between two of the user's own accounts that came in as two movements:
// an expense in one, from one account's statement, and an income in the other,
// from the other's. Left like that it counts twice, as money spent and as money
// earned. Joined, it is the one transfer it was.

// How far apart the two halves may be dated: a transfer made at night lands the
// next day.
export const MAX_DAYS_APART = 1;

// Between pesos and dollars, how far the rate the two amounts imply may sit
// from that day's quote. The bank's own rate is never exactly the one the app
// keeps, but it is close to it.
export const RATE_TOLERANCE = 0.05;

export interface TransferMatch<T extends LedgerRow> {
  outgoing: T;
  incoming: T;
}

// The rate two halves imply, in pesos per dollar; null unless one is in each.
function impliedRate(outgoing: LedgerRow, incoming: LedgerRow): number | null {
  const pesos = [outgoing, incoming].find((row) => row.currency === "ARS");
  const dollars = [outgoing, incoming].find((row) => row.currency === "USD");
  return pesos && dollars ? pesos.amount / dollars.amount : null;
}

function halvesMatch(outgoing: LedgerRow, incoming: LedgerRow, rateAt: RateLookup) {
  if (outgoing.payment_method_id === incoming.payment_method_id) return false;
  if (Math.abs(daysBetween(outgoing.date, incoming.date)) > MAX_DAYS_APART) return false;
  if (outgoing.currency === incoming.currency) {
    return toCents(outgoing.amount) === toCents(incoming.amount);
  }
  const implied = impliedRate(outgoing, incoming);
  const rate = rateAt(outgoing.date);
  if (implied === null || rate === null) return false;
  return Math.abs(implied - rate) <= rate * RATE_TOLERANCE;
}

function shifted(date: string, days: number): string {
  const day = parseIsoDate(date);
  day.setDate(day.getDate() + days);
  return toIsoDate(day);
}

// Every expense and income that make a transfer together, and only together:
// a half that could pair with two others is not paired at all, since picking
// one would be a guess.
export function matchTransfers<T extends LedgerRow>(
  rows: readonly T[],
  rateAt: RateLookup,
): TransferMatch<T>[] {
  const incomesByDate = new Map<string, T[]>();
  for (const row of rows) {
    if (row.type !== "income" || row.payment_method_id === null) continue;
    const sameDay = incomesByDate.get(row.date) ?? [];
    sameDay.push(row);
    incomesByDate.set(row.date, sameDay);
  }

  const candidates = new Map<T, T[]>();
  const timesTaken = new Map<T, number>();
  for (const outgoing of rows) {
    if (outgoing.type !== "expense" || outgoing.payment_method_id === null) continue;
    const found: T[] = [];
    for (let offset = -MAX_DAYS_APART; offset <= MAX_DAYS_APART; offset++) {
      for (const incoming of incomesByDate.get(shifted(outgoing.date, offset)) ?? []) {
        if (!halvesMatch(outgoing, incoming, rateAt)) continue;
        found.push(incoming);
        timesTaken.set(incoming, (timesTaken.get(incoming) ?? 0) + 1);
      }
    }
    candidates.set(outgoing, found);
  }

  const matches: TransferMatch<T>[] = [];
  for (const [outgoing, found] of candidates) {
    if (found.length === 1 && timesTaken.get(found[0]) === 1) {
      matches.push({ outgoing, incoming: found[0] });
    }
  }
  return matches;
}

// Derived from what the pair is, so a "no" given in the import preview is
// recognised in Atención once both halves are in the history.
export function transferPairId(outgoing: LedgerRow, incoming: LedgerRow): string {
  return [
    "transfer",
    outgoing.payment_method_id,
    incoming.payment_method_id,
    outgoing.date,
    toCents(outgoing.amount),
    toCents(incoming.amount),
  ].join(":");
}

export function transferReason(
  outgoing: LedgerRow,
  incoming: LedgerRow,
  rateAt: RateLookup,
): string {
  const when = apartText(outgoing.date, incoming.date);
  const out = formatCurrency(outgoing.amount, outgoing.currency);
  if (outgoing.currency === incoming.currency) {
    return `Un gasto y un ingreso de ${out} ${when}, en dos de tus cuentas.`;
  }
  const into = formatCurrency(incoming.amount, incoming.currency);
  const implied = formatCurrency(impliedRate(outgoing, incoming) ?? 0, "ARS");
  const quote = formatCurrency(rateAt(outgoing.date) ?? 0, "ARS");
  return `Un gasto de ${out} y un ingreso de ${into} ${when}: ${implied} por dólar, cerca de la cotización de ese día (${quote}).`;
}

// The transfer the two halves were: from the expense's account, on its date,
// to the income's account with what arrived there. Under the description of
// the movement that is kept, which may be one the user typed.
export function joinedTransfer(
  outgoing: LedgerRow,
  incoming: LedgerRow,
  description: string,
): NewTransaction {
  return {
    amount: outgoing.amount,
    type: "transfer",
    categoryId: null,
    paymentMethodId: outgoing.payment_method_id,
    destinationPaymentMethodId: incoming.payment_method_id,
    destinationAmount: incoming.amount,
    description,
    date: outgoing.date,
    currency: outgoing.currency,
  };
}

export interface SplitTransfer<
  T extends TransactionWithCategory,
> extends TransferMatch<T> {
  id: string;
  reason: string;
  // One of the two becomes the transfer; the other is deleted.
  join: TransferJoin;
  removed: T;
}

// The halves in the recent history that Atención offers to join, newest first.
//
// The income is the one deleted unless something hangs on it (see isBare),
// then the expense; with something on both, neither is offered. A movement
// confirmed from an expected one was declared as what it is, and is left out.
export function splitTransfers<T extends TransactionWithCategory>(
  transactions: readonly T[],
  context: LedgerContext,
  today: string,
): SplitTransfer<T>[] {
  const pool = withinReach(transactions, today, MAX_DAYS_APART);
  const offers: SplitTransfer<T>[] = [];
  for (const { outgoing, incoming } of matchTransfers(pool, context.rateAt)) {
    const later = outgoing.date > incoming.date ? outgoing.date : incoming.date;
    if (!isRecent(later, today)) continue;
    if (context.fromExpected.has(outgoing.id) || context.fromExpected.has(incoming.id))
      continue;

    const id = transferPairId(outgoing, incoming);
    if (context.isDismissed(id)) continue;

    const removed = [incoming, outgoing].find((half) =>
      isBare(half, context.fromExpected),
    );
    if (removed === undefined) continue;
    const kept = removed === incoming ? outgoing : incoming;

    offers.push({
      id,
      outgoing,
      incoming,
      reason: transferReason(outgoing, incoming, context.rateAt),
      join: { kept, transfer: joinedTransfer(outgoing, incoming, kept.description) },
      removed,
    });
  }

  return offers.sort(
    (a, b) =>
      b.outgoing.date.localeCompare(a.outgoing.date) || b.outgoing.id - a.outgoing.id,
  );
}
