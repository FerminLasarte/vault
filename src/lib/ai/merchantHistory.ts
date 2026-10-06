import { merchantKey, merchantName } from "@/lib/ai/merchants";
import { median } from "@/lib/ai/stats";
import { words } from "@/lib/ai/tokens";
import { parseIsoDate, toIsoDate } from "@/lib/format";
import type { CategoryType, Transaction } from "@/db/schema";

// What the user's own history says about each place they spend at or get paid
// from: what it is called, how often it comes up, what it usually costs and
// which account it usually goes through. Read by the form's autocomplete and by
// the quick entry, so both mean the same thing by "usually".
//
// One entry per merchant, kind of movement and currency: Spotify in pesos and
// Spotify in dollars are two habits, and no figure here ever mixes the two.

// How far back "usually" reaches. Prices drift every month, so an amount or an
// account from two years ago says little about the next one.
export const RECENT_MONTHS = 6;

// When one account is the account a merchant goes through: most of its recent
// movements, and more than one of them. Below that the quick entry keeps to the
// last account used and the form leaves the account alone.
export const MIN_ACCOUNT_SHARE = 0.6;
export const MIN_ACCOUNT_MOVEMENTS = 2;

// What has to be typed before past movements are offered, and how many at most.
export const MIN_TYPED = 2;
export const MAX_SUGGESTIONS = 5;

export interface UsualAccount {
  paymentMethodId: number;
  // `inAccount` of the merchant's `total` recent movements with an account
  // went through it.
  inAccount: number;
  total: number;
}

export interface MerchantEntry {
  // Unique per merchant, kind of movement and currency.
  id: string;
  // merchantKey of its movements.
  key: string;
  // What its latest movement is called on screen.
  label: string;
  type: CategoryType;
  currency: string;
  count: number;
  // Movements within RECENT_MONTHS of today.
  recentCount: number;
  lastDate: string;
  // The median of the recent amounts; null with nothing recent to go by.
  typicalAmount: number | null;
  account: UsualAccount | null;
}

export type MerchantHistory = Map<string, MerchantEntry>;

function entryId(key: string, type: CategoryType, currency: string): string {
  return `${type}:${currency}:${key}`;
}

function monthsBefore(today: string, months: number): string {
  const date = parseIsoDate(today);
  date.setMonth(date.getMonth() - months);
  return toIsoDate(date);
}

interface Tally {
  key: string;
  type: CategoryType;
  currency: string;
  count: number;
  latest: { date: string; id: number; description: string };
  recentAmounts: number[];
  recentAccounts: Map<number, number>;
}

function usualAccount(accounts: Map<number, number>): UsualAccount | null {
  let total = 0;
  let best: { id: number; count: number } | null = null;
  for (const [id, count] of accounts) {
    total += count;
    if (best === null || count > best.count || (count === best.count && id < best.id)) {
      best = { id, count };
    }
  }
  if (best === null || best.count < MIN_ACCOUNT_MOVEMENTS) return null;
  if (best.count / total < MIN_ACCOUNT_SHARE) return null;
  return { paymentMethodId: best.id, inAccount: best.count, total };
}

export function learnMerchantHistory(
  transactions: readonly Transaction[],
  today: string,
): MerchantHistory {
  const since = monthsBefore(today, RECENT_MONTHS);
  const tallies = new Map<string, Tally>();

  for (const transaction of transactions) {
    // A transfer is between the user's own accounts: no merchant behind it.
    if (transaction.type !== "income" && transaction.type !== "expense") continue;
    const key = merchantKey(transaction.description);
    if (key === "") continue;

    const id = entryId(key, transaction.type, transaction.currency);
    let tally = tallies.get(id);
    if (tally === undefined) {
      tally = {
        key,
        type: transaction.type,
        currency: transaction.currency,
        count: 0,
        latest: transaction,
        recentAmounts: [],
        recentAccounts: new Map(),
      };
      tallies.set(id, tally);
    }

    tally.count += 1;
    const { latest } = tally;
    if (
      transaction.date > latest.date ||
      (transaction.date === latest.date && transaction.id > latest.id)
    ) {
      tally.latest = transaction;
    }

    if (transaction.date < since) continue;
    tally.recentAmounts.push(transaction.amount);
    const account = transaction.payment_method_id;
    if (account !== null) {
      tally.recentAccounts.set(account, (tally.recentAccounts.get(account) ?? 0) + 1);
    }
  }

  const history: MerchantHistory = new Map();
  for (const [id, tally] of tallies) {
    const typical = median(tally.recentAmounts);
    history.set(id, {
      id,
      key: tally.key,
      label: merchantName(tally.latest.description) ?? tally.latest.description.trim(),
      type: tally.type,
      currency: tally.currency,
      count: tally.count,
      recentCount: tally.recentAmounts.length,
      lastDate: tally.latest.date,
      typicalAmount: typical === null ? null : Math.round(typical * 100) / 100,
      account: usualAccount(tally.recentAccounts),
    });
  }
  return history;
}

// The history of the merchant a movement is at, in its own kind and currency.
export function findMerchant(
  history: MerchantHistory,
  movement: { description: string; type: CategoryType; currency: string },
): MerchantEntry | null {
  const key = merchantKey(movement.description);
  if (key === "") return null;
  return history.get(entryId(key, movement.type, movement.currency)) ?? null;
}

// Why an account was assumed: "En los últimos 6 meses, 9 de tus 10 movimientos
// con «Rappi» se pagaron con Visa." Null for a merchant with no usual account.
export function usualAccountReason(
  entry: MerchantEntry,
  accountName: string,
): string | null {
  if (entry.account === null) return null;
  const { inAccount, total } = entry.account;
  const share = inAccount === total ? `tus ${total}` : `${inAccount} de tus ${total}`;
  const verb = entry.type === "expense" ? "se pagaron con" : "entraron en";
  return `En los últimos ${RECENT_MONTHS} meses, ${share} movimientos con «${entry.label}» ${verb} ${accountName}.`;
}

// Past merchants that what is being typed could be: any of whose words starts
// with it, so "libre" finds Mercado Libre. The ones that come up most lately
// first, then the most frequent overall, then the latest.
export function descriptionSuggestions(
  typed: string,
  history: MerchantHistory,
): MerchantEntry[] {
  const needle = words(typed).join(" ");
  if (needle.length < MIN_TYPED) return [];

  return Array.from(history.values())
    .filter((entry) => ` ${entry.key}`.includes(` ${needle}`))
    .sort(
      (a, b) =>
        b.recentCount - a.recentCount ||
        b.count - a.count ||
        b.lastDate.localeCompare(a.lastDate) ||
        a.label.localeCompare(b.label, "es"),
    )
    .slice(0, MAX_SUGGESTIONS);
}
