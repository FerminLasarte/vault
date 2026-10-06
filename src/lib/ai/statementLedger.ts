import { ledgerRow, sidesOf, type LedgerContext, type LedgerRow } from "@/lib/ai/ledger";
import {
  duplicatePairId,
  groupBySide,
  nearDuplicateReason,
  sideKey,
} from "@/lib/ai/nearDuplicates";
import {
  joinedTransfer,
  matchTransfers,
  MAX_DAYS_APART,
  transferPairId,
  transferReason,
} from "@/lib/ai/splitTransfers";
import { daysBetween } from "@/lib/format";
import type { TransferJoin } from "@/db";
import type { NewTransaction, Transaction } from "@/db/schema";

// A statement's rows against the history, before anything is written: a row
// that is a movement the app already holds under other words, and a row that
// is the other half of a transfer whose first half is already there.

export interface StatementRow {
  line: number;
  transaction: NewTransaction;
}

export interface StatementDuplicate {
  line: number;
  description: string;
  // The movement the row seems to repeat.
  other: Transaction;
  // Whether the row goes in anyway: only when the user says so.
  imported: boolean;
  reason: string;
  id: string;
}

export interface StatementTransfer {
  line: number;
  description: string;
  // The half already in the history, which becomes the transfer.
  other: Transaction;
  // Whether the row is joined to it rather than imported: unless the user
  // says it is not a transfer.
  joined: boolean;
  join: TransferJoin;
  reason: string;
  id: string;
}

// Finds, row by row, the movement the history already holds that the row
// repeats. Each held movement answers for one row at most: two fares on the
// same day and one typed are one duplicate and one fare.
export function duplicateFinder(
  existing: readonly Transaction[],
  context: LedgerContext,
): (row: NewTransaction) => Omit<StatementDuplicate, "line" | "imported"> | null {
  const bySide = groupBySide(existing);
  const taken = new Set<number>();

  return (transaction) => {
    const row = ledgerRow(transaction);
    for (const side of sidesOf(row)) {
      for (const other of bySide.get(sideKey(side)) ?? []) {
        if (taken.has(other.id)) continue;
        const reason = nearDuplicateReason(row, other);
        if (reason === null) continue;
        const id = duplicatePairId(row, other);
        if (context.isDismissed(id)) continue;
        taken.add(other.id);
        return { description: transaction.description, other, reason, id };
      }
    }
    return null;
  };
}

type Half = LedgerRow & ({ row: StatementRow } | { held: Transaction });

// The rows that complete a transfer with a movement already held, each with
// the transfer the held one becomes. The rows are of one account, so two rows
// never make a transfer between themselves.
export function statementTransfers(
  rows: readonly StatementRow[],
  existing: readonly Transaction[],
  context: LedgerContext,
): Omit<StatementTransfer, "joined">[] {
  if (rows.length === 0) return [];
  const dates = rows.map((entry) => entry.transaction.date).sort();
  const [first, last] = [dates[0], dates[dates.length - 1]];

  // Only what is close enough to a row to be its other half — and to compete
  // with it for a third.
  const pool: Half[] = [
    ...rows.map((entry) => ({ ...ledgerRow(entry.transaction), row: entry })),
    ...existing
      .filter(
        (transaction) =>
          daysBetween(transaction.date, first) <= MAX_DAYS_APART &&
          daysBetween(last, transaction.date) <= MAX_DAYS_APART,
      )
      .map((transaction) => ({ ...transaction, held: transaction })),
  ];

  const found: Omit<StatementTransfer, "joined">[] = [];
  for (const { outgoing, incoming } of matchTransfers(pool, context.rateAt)) {
    // One half from the statement and one already held; any other pair is
    // Atención's to offer, not the import's.
    const [fromRow, held] =
      "row" in outgoing ? [outgoing, incoming] : [incoming, outgoing];
    if (!("row" in fromRow) || !("held" in held)) continue;
    if (context.fromExpected.has(held.held.id)) continue;

    const id = transferPairId(outgoing, incoming);
    if (context.isDismissed(id)) continue;

    found.push({
      line: fromRow.row.line,
      description: fromRow.description,
      other: held.held,
      join: {
        kept: held.held,
        transfer: joinedTransfer(outgoing, incoming, held.held.description),
      },
      reason: transferReason(outgoing, incoming, context.rateAt),
      id,
    });
  }
  return found.sort((a, b) => a.line - b.line);
}
