import { normalizeForSearch as normalize } from "@/lib/text";
import type { Transaction } from "@/db/schema";

// What makes an imported row the same movement as one already held: the same
// day, kind, amount, currency and text. Enough to catch a file being imported
// twice, without needing an id that a hand-edited file or a bank statement
// would not carry. A stored movement and a row about to be written both have
// these fields under these names.
export type DuplicateIdentity = Pick<
  Transaction,
  "date" | "type" | "amount" | "currency" | "description"
>;

function duplicateKey(movement: DuplicateIdentity): string {
  return [
    movement.date,
    movement.type,
    movement.amount,
    movement.currency,
    normalize(movement.description ?? ""),
  ].join("|");
}

// How many of each movement the app already holds, handed out one at a time:
// a row is a duplicate only while the file has not yet brought more of it than
// that. Re-importing an overlapping file skips what came in last time, but two
// identical fares on the same day are two fares.
//
// Returns whether the row is one already held, counting it if so.
export function heldCopies(
  existing: readonly DuplicateIdentity[],
): (row: DuplicateIdentity) => boolean {
  const held = new Map<string, number>();
  for (const movement of existing) {
    const key = duplicateKey(movement);
    held.set(key, (held.get(key) ?? 0) + 1);
  }

  return (row) => {
    const key = duplicateKey(row);
    const left = held.get(key) ?? 0;
    if (left === 0) return false;
    held.set(key, left - 1);
    return true;
  };
}
