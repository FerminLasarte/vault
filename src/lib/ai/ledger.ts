import { daysBetween } from "@/lib/format";
import type { RateLookup } from "@/lib/finance";
import type { NewTransaction, Transaction, TransactionWithCategory } from "@/db/schema";

// What the ledger checks (split transfers, near-duplicates) read of a movement,
// and the few rules both follow: how far back Atención looks, and which
// movement may be deleted by one of their suggestions.

// How far back Atención looks for a movement recorded twice or split in two.
// Statements are imported within weeks of the fact; older pairs were lived
// with long enough to have been noticed.
export const RECENT_DAYS = 90;

// The parts of a movement both checks read. A stored movement has them; an
// imported row is put in this shape by `ledgerRow`.
export type LedgerRow = Pick<
  Transaction,
  | "type"
  | "amount"
  | "currency"
  | "date"
  | "description"
  | "payment_method_id"
  | "destination_payment_method_id"
  | "destination_amount"
>;

export function ledgerRow(transaction: NewTransaction): LedgerRow {
  return {
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    date: transaction.date,
    description: transaction.description,
    payment_method_id: transaction.paymentMethodId,
    destination_payment_method_id: transaction.destinationPaymentMethodId,
    destination_amount: transaction.destinationAmount,
  };
}

// What both checks need besides the movements. Null in the import context with
// the AI off.
export interface LedgerContext {
  // The quote of each day, for a transfer between pesos and dollars.
  rateAt: RateLookup;
  // Movements confirmed from an expected movement: declared by the user as the
  // income or the expense they are, so never joined or deleted from here.
  fromExpected: ReadonlySet<number>;
  isDismissed: (id: string) => boolean;
}

// One movement as it touches one account: what left it or came into it.
export interface AccountSide {
  accountId: number;
  direction: "out" | "in";
  // In cents, so two amounts compare exactly.
  cents: number;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

// A movement with no account touches none that can be compared.
export function sidesOf(row: LedgerRow): AccountSide[] {
  const sides: AccountSide[] = [];
  if (row.payment_method_id !== null) {
    sides.push({
      accountId: row.payment_method_id,
      direction: row.type === "income" ? "in" : "out",
      cents: toCents(row.amount),
    });
  }
  if (row.type === "transfer" && row.destination_payment_method_id !== null) {
    sides.push({
      accountId: row.destination_payment_method_id,
      direction: "in",
      cents: toCents(row.destination_amount ?? row.amount),
    });
  }
  return sides;
}

// Whether `date` is within RECENT_DAYS of today.
export function isRecent(date: string, today: string): boolean {
  return daysBetween(date, today) <= RECENT_DAYS;
}

// The movements a recent pair can be made of: RECENT_DAYS back, and `margin`
// days more, so a movement just outside the window still counts against one
// inside it.
export function withinReach<T extends LedgerRow>(
  rows: readonly T[],
  today: string,
  margin: number,
): T[] {
  return rows.filter((row) => daysBetween(row.date, today) <= RECENT_DAYS + margin);
}

// How two dates read in a reason.
export function apartText(a: string, b: string): string {
  const days = Math.abs(daysBetween(a, b));
  if (days === 0) return "el mismo día";
  return days === 1 ? "con un día de diferencia" : `con ${days} días de diferencia`;
}

// A movement nothing else hangs on: no tags, no attachments, not confirmed
// from an expected movement. Only such a movement is deleted by these
// suggestions, so that "Deshacer" brings all of it back.
export function isBare(
  transaction: TransactionWithCategory,
  fromExpected: ReadonlySet<number>,
): boolean {
  return (
    transaction.tag_names === null &&
    transaction.attachment_count === 0 &&
    !fromExpected.has(transaction.id)
  );
}
