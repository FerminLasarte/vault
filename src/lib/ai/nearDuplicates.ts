import { tokenize } from "@/lib/ai/categoryModel";
import {
  apartText,
  isBare,
  isRecent,
  sidesOf,
  withinReach,
  type AccountSide,
  type LedgerContext,
  type LedgerRow,
} from "@/lib/ai/ledger";
import { merchantKey, merchantName } from "@/lib/ai/merchants";
import { daysBetween, formatCurrency } from "@/lib/format";
import type { TransactionWithCategory } from "@/db/schema";

// The same movement recorded twice: typed by hand, then imported with the
// bank's date and the bank's text. The import already leaves out a row that is
// exactly one the app holds; this is the one that is not quite.

// A statement dates a card purchase when it settles, a day or two after it was
// typed.
export const MAX_DAYS_APART = 2;

const TYPE_PLURALS = { income: "ingresos", expense: "gastos" } as const;

function sameSide(x: AccountSide, y: AccountSide): boolean {
  return (
    x.accountId === y.accountId && x.direction === y.direction && x.cents === y.cents
  );
}

// The side two movements share: the same account, the same way, the same
// amount. Null when they touch no account in common like that.
function sharedSide(a: LedgerRow, b: LedgerRow): AccountSide | null {
  const others = sidesOf(b);
  return sidesOf(a).find((side) => others.some((other) => sameSide(side, other))) ?? null;
}

// What two descriptions have in common that says they are one place: the same
// name on screen, else a telling word they share. Null when nothing.
function commonName(a: string, b: string): string | null {
  // The clean name when either has one: what was typed is the user's own way
  // of writing it, and the bank's says it the way the lists show it.
  if (merchantKey(a) === merchantKey(b)) {
    return merchantName(a) ?? merchantName(b) ?? a.trim();
  }
  const words = new Set(tokenize(a));
  return tokenize(b).find((word) => !word.includes(" ") && words.has(word)) ?? null;
}

// Why two movements look like one, or null when they do not.
//
// Two incomes or two expenses: the same account, amount and a few days, and
// text that names the same place, since the same amount at the same shop twice
// in a week happens. An income or expense against a transfer: the side of the
// transfer in that account. The text cannot help there — a transfer is typed
// as "Ahorro" and the bank writes "TRANSF 0012" — and an exact amount leaving
// the same account within two days already says it. Two transfers: both sides.
export function nearDuplicateReason(a: LedgerRow, b: LedgerRow): string | null {
  if (Math.abs(daysBetween(a.date, b.date)) > MAX_DAYS_APART) return null;
  const when = apartText(a.date, b.date);

  if (a.type === "transfer" && b.type === "transfer") {
    const others = sidesOf(b);
    const same = sidesOf(a).every((side) =>
      others.some((other) => sameSide(side, other)),
    );
    if (!same) return null;
    return `Dos transferencias de ${formatCurrency(a.amount, a.currency)} entre las mismas cuentas, ${when}.`;
  }

  const side = sharedSide(a, b);
  if (side === null) return null;
  const amount = formatCurrency(
    side.cents / 100,
    a.type === "transfer" ? b.currency : a.currency,
  );

  if (a.type === "transfer" || b.type === "transfer") {
    const movement = a.type === "transfer" ? b : a;
    const noun = movement.type === "income" ? "Un ingreso" : "Un gasto";
    return `${noun} de ${amount} en la misma cuenta que una transferencia por ese monto, ${when}.`;
  }

  if (a.type !== b.type) return null;
  const name = commonName(a.description, b.description);
  if (name === null) return null;
  return `Dos ${TYPE_PLURALS[a.type]} de ${amount} en la misma cuenta, ${when}, los dos de «${name}».`;
}

// Derived from what the pair is, so an "Importar igual" in the preview is
// recognised in Atención once both are in the history.
export function duplicatePairId(a: LedgerRow, b: LedgerRow): string {
  const [first, second] = [a, b].sort((x, y) => x.date.localeCompare(y.date));
  const side = sharedSide(a, b) ?? sidesOf(a)[0];
  return [
    "duplicate",
    side?.accountId,
    side?.direction,
    side?.cents,
    first.date,
    second.date,
  ].join(":");
}

// Two movements can only be one when they share a side, so only movements
// sharing one are ever compared: these, by side.
export function groupBySide<T extends LedgerRow>(rows: readonly T[]): Map<string, T[]> {
  const bySide = new Map<string, T[]>();
  for (const row of rows) {
    for (const side of sidesOf(row)) {
      const key = sideKey(side);
      const group = bySide.get(key) ?? [];
      group.push(row);
      bySide.set(key, group);
    }
  }
  return bySide;
}

export function sideKey(side: AccountSide): string {
  return `${side.accountId}:${side.direction}:${side.cents}`;
}

export interface NearDuplicate<T extends TransactionWithCategory> {
  id: string;
  reason: string;
  // Oldest first.
  movements: [T, T];
  // Which of the two may be deleted from here (see isBare).
  removable: [boolean, boolean];
}

// The pairs in the recent history Atención asks about, newest first.
export function nearDuplicates<T extends TransactionWithCategory>(
  transactions: readonly T[],
  context: LedgerContext,
  today: string,
): NearDuplicate<T>[] {
  const bySide = groupBySide(withinReach(transactions, today, MAX_DAYS_APART));

  const seen = new Set<string>();
  const pairs: NearDuplicate<T>[] = [];
  for (const group of bySide.values()) {
    group.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        if (daysBetween(a.date, b.date) > MAX_DAYS_APART) break;
        const pairKey = `${a.id}:${b.id}`;
        if (seen.has(pairKey) || !isRecent(b.date, today)) continue;
        seen.add(pairKey);

        const reason = nearDuplicateReason(a, b);
        if (reason === null) continue;
        const id = duplicatePairId(a, b);
        if (context.isDismissed(id)) continue;

        pairs.push({
          id,
          reason,
          movements: [a, b],
          removable: [isBare(a, context.fromExpected), isBare(b, context.fromExpected)],
        });
      }
    }
  }

  return pairs.sort(
    (x, y) =>
      y.movements[1].date.localeCompare(x.movements[1].date) ||
      y.movements[1].id - x.movements[1].id,
  );
}
