import type { ExpectedMovementWithNames } from "@/db/schema";

// What is known to be coming but was never committed to.
//
// The distinction this file exists to protect is the one `projection.ts` draws
// in its header: an instalment, a loan payment and a recurring template all
// have a schedule the app derives, so what they will cost is read rather than
// guessed. An expected movement is a single date the user asserted. Both are
// worth showing; blending them into one figure would make neither believable,
// so they are collected apart and stay apart all the way to the screen.

// Only movements still awaiting a decision are ever counted. A confirmed one is
// a real transaction by now and would be counted twice; a dismissed one was
// decided against and never happened at all.
function isOpen(movement: ExpectedMovementWithNames): boolean {
  return movement.status === "pending";
}

// Everything whose date has arrived and that has not been dealt with, soonest
// first. Unlike a recurring series there is nothing to advance past: a movement
// keeps waiting until the user confirms it or decides against it, which is what
// makes it safe to leave one sitting there for a week.
export function collectPendingExpected(
  movements: ExpectedMovementWithNames[],
  today: string,
): ExpectedMovementWithNames[] {
  return movements
    .filter((movement) => isOpen(movement) && movement.due_date <= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
}

// Still open and still ahead: what the section lists under "coming up", as
// opposed to what it lists as waiting for a decision.
export function collectUpcomingExpected(
  movements: ExpectedMovementWithNames[],
  today: string,
): ExpectedMovementWithNames[] {
  return movements
    .filter((movement) => isOpen(movement) && movement.due_date > today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
}

// What the open movements of one currency add up to inside a date window,
// split the way the rest of the app splits money. Overdue movements that were
// never dealt with stay in the window they were due in rather than rolling
// forward: the user said November, and moving it to December on their behalf
// would be the app inventing a decision.
export function expectedInWindow(
  movements: ExpectedMovementWithNames[],
  currency: string,
  from: string,
  to: string,
): { income: number; expenses: number } {
  let income = 0;
  let expenses = 0;

  for (const movement of movements) {
    if (!isOpen(movement)) continue;
    if (movement.currency !== currency) continue;
    if (movement.due_date < from || movement.due_date > to) continue;

    if (movement.type === "income") income += movement.amount;
    else expenses += movement.amount;
  }

  return { income, expenses };
}

// The movements expected ones were confirmed into: each declared by the user as
// the income or expense it is.
export function confirmedTransactionIds(
  movements: readonly ExpectedMovementWithNames[],
): Set<number> {
  const ids = new Set<number>();
  for (const movement of movements) {
    if (movement.status === "confirmed" && movement.transaction_id !== null) {
      ids.add(movement.transaction_id);
    }
  }
  return ids;
}
