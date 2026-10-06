import { describe, expect, it } from "vitest";
import { RECENT_DAYS } from "./ledger";
import {
  MAX_DAYS_APART,
  duplicatePairId,
  nearDuplicateReason,
  nearDuplicates,
} from "./nearDuplicates";
import { LEDGER, TODAY, WALLET, held } from "@/lib/ai/testing/ledger";
import type { TransactionWithCategory } from "@/db/schema";
import type { LedgerContext } from "./ledger";

const NBSP = " ";

function expense(description: string, overrides: Partial<TransactionWithCategory> = {}) {
  return held({ description, amount: 10250, ...overrides });
}

function transfer(overrides: Partial<TransactionWithCategory> = {}) {
  return held({
    type: "transfer",
    description: "Ahorro",
    amount: 10250,
    destination_payment_method_id: WALLET,
    destination_amount: 10250,
    ...overrides,
  });
}

function pairs(
  transactions: TransactionWithCategory[],
  context: Partial<LedgerContext> = {},
) {
  return nearDuplicates(transactions, { ...LEDGER, ...context }, TODAY);
}

describe("nearDuplicates", () => {
  it("finds a typed movement imported again under the bank's text", () => {
    const typed = expense("rappi", { date: "2026-10-01" });
    const imported = expense("MERPAGO*RAPPI 4471", { date: "2026-10-02" });

    expect(pairs([imported, typed])).toEqual([
      {
        id: duplicatePairId(typed, imported),
        reason: `Dos gastos de $${NBSP}10.250,00 en la misma cuenta, con un día de diferencia, los dos de «Rappi».`,
        movements: [typed, imported],
        removable: [true, true],
      },
    ]);
  });

  it("reads a word the two share when their names differ", () => {
    expect(
      nearDuplicateReason(expense("super coto"), expense("COTO CICSA 123")),
    ).toContain("los dos de «coto»");
  });

  it(`looks ${MAX_DAYS_APART} days apart, and no further`, () => {
    const typed = expense("rappi", { date: "2026-10-01" });
    expect(pairs([typed, expense("RAPPI", { date: "2026-10-03" })])).toHaveLength(1);
    expect(pairs([typed, expense("RAPPI", { date: "2026-10-04" })])).toEqual([]);
  });

  it("needs the same account, amount and kind, and a name in common", () => {
    const typed = expense("rappi");
    expect(pairs([typed, expense("RAPPI", { payment_method_id: WALLET })])).toEqual([]);
    expect(pairs([typed, expense("RAPPI", { amount: 10251 })])).toEqual([]);
    expect(pairs([typed, expense("RAPPI", { type: "income" })])).toEqual([]);
    expect(pairs([typed, expense("PEDIDOS YA")])).toEqual([]);
  });

  // A transfer is typed as "Ahorro" and the bank writes "TRANSF 0012": the text
  // never agrees, and the same amount leaving the same account says enough.
  it("finds a statement's expense that is a transfer typed by hand", () => {
    const typed = transfer();
    const imported = expense("TRANSF 0012");

    const [pair] = pairs([typed, imported]);
    expect(pair.reason).toBe(
      `Un gasto de $${NBSP}10.250,00 en la misma cuenta que una transferencia por ese monto, el mismo día.`,
    );
  });

  it("finds an income that is where a transfer arrived", () => {
    const typed = transfer({ destination_amount: 9000 });
    const imported = held({
      type: "income",
      description: "TRANSF RECIBIDA",
      payment_method_id: WALLET,
      amount: 9000,
    });

    expect(pairs([typed, imported])[0].reason).toMatch(/^Un ingreso de/);
  });

  it("finds two transfers only when both sides are the same", () => {
    expect(pairs([transfer(), transfer()])).toHaveLength(1);
    expect(pairs([transfer(), transfer({ destination_payment_method_id: 9 })])).toEqual(
      [],
    );
  });

  it("says which of the two may be deleted from here", () => {
    const typed = expense("rappi", { tag_names: "viaje" });
    const imported = expense("RAPPI", { id: 900 });

    expect(
      pairs([typed, imported], { fromExpected: new Set([900]) })[0].removable,
    ).toEqual([false, false]);
  });

  it("leaves out a pair the user said is not a duplicate", () => {
    const typed = expense("rappi");
    const imported = expense("RAPPI");
    const id = duplicatePairId(typed, imported);
    expect(pairs([typed, imported], { isDismissed: (other) => other === id })).toEqual(
      [],
    );
  });

  it(`looks ${RECENT_DAYS} days back`, () => {
    expect(
      pairs([
        expense("rappi", { date: "2026-07-08" }),
        expense("RAPPI", { date: "2026-07-08" }),
      ]),
    ).toHaveLength(1);
    expect(
      pairs([
        expense("rappi", { date: "2026-07-07" }),
        expense("RAPPI", { date: "2026-07-07" }),
      ]),
    ).toEqual([]);
  });

  it("compares nothing in an account it does not share", () => {
    const noAccount = { payment_method_id: null };
    expect(pairs([expense("rappi", noAccount), expense("rappi", noAccount)])).toEqual([]);
  });
});
