import { describe, expect, it } from "vitest";
import { RECENT_DAYS } from "./ledger";
import {
  MAX_DAYS_APART,
  RATE_TOLERANCE,
  joinedTransfer,
  splitTransfers,
  transferPairId,
} from "./splitTransfers";
import {
  BANK,
  DOLLARS,
  LEDGER,
  RATE,
  TODAY,
  WALLET,
  held,
} from "@/lib/ai/testing/ledger";
import type { TransactionWithCategory } from "@/db/schema";
import type { LedgerContext } from "./ledger";

const NBSP = "\u00a0";

function expense(overrides: Partial<TransactionWithCategory> = {}) {
  return held({ type: "expense", payment_method_id: BANK, ...overrides });
}

function income(overrides: Partial<TransactionWithCategory> = {}) {
  return held({
    type: "income",
    payment_method_id: WALLET,
    payment_method_name: "Mercado Pago",
    description: "Transferencia recibida",
    ...overrides,
  });
}

function offers(
  transactions: TransactionWithCategory[],
  context: Partial<LedgerContext> = {},
) {
  return splitTransfers(transactions, { ...LEDGER, ...context }, TODAY);
}

describe("splitTransfers", () => {
  it("pairs an expense and an income of the same amount in two accounts", () => {
    const out = expense();
    const into = income();

    const [offer, ...rest] = offers([out, into]);

    expect(rest).toEqual([]);
    expect(offer).toMatchObject({
      id: transferPairId(out, into),
      outgoing: out,
      incoming: into,
      reason: `Un gasto y un ingreso de $${NBSP}50.000,00 el mismo día, en dos de tus cuentas.`,
      removed: into,
    });
    expect(offer.join).toEqual({
      kept: out,
      transfer: joinedTransfer(out, into, out.description),
    });
  });

  it("turns the pair into a transfer from the expense's account to the income's", () => {
    expect(joinedTransfer(expense(), income(), "Ahorro")).toEqual({
      amount: 50000,
      type: "transfer",
      categoryId: null,
      paymentMethodId: BANK,
      destinationPaymentMethodId: WALLET,
      destinationAmount: 50000,
      description: "Ahorro",
      date: "2026-10-01",
      currency: "ARS",
    });
  });

  it(`pairs them up to ${MAX_DAYS_APART} day apart, and no further`, () => {
    expect(offers([expense(), income({ date: "2026-10-02" })])).toHaveLength(1);
    expect(offers([expense(), income({ date: "2026-09-30" })])).toHaveLength(1);
    expect(offers([expense(), income({ date: "2026-10-03" })])).toEqual([]);
  });

  it("needs the same amount to the cent, and two different accounts", () => {
    expect(offers([expense(), income({ amount: 50000.01 })])).toEqual([]);
    expect(offers([expense(), income({ payment_method_id: BANK })])).toEqual([]);
    expect(offers([expense({ payment_method_id: null }), income()])).toEqual([]);
  });

  // Picking one of two would be a guess.
  it("pairs nothing when a half could go with two others", () => {
    expect(offers([expense(), income(), income({ date: "2026-10-02" })])).toEqual([]);
    expect(offers([expense(), expense({ date: "2026-10-02" }), income()])).toEqual([]);
  });

  describe("between pesos and dollars", () => {
    function dollarIncome(amount: number) {
      return income({ payment_method_id: DOLLARS, currency: "USD", amount });
    }

    it("pairs them when the rate they imply is near that day's quote", () => {
      const [offer] = offers([expense({ amount: 1_450_000 }), dollarIncome(1000)]);

      expect(offer.reason).toBe(
        `Un gasto de $${NBSP}1.450.000,00 y un ingreso de US$${NBSP}1.000,00 el mismo día: $${NBSP}1.450,00 por dólar, cerca de la cotización de ese día ($${NBSP}1.450,00).`,
      );
      expect(offer.join.transfer).toMatchObject({
        amount: 1_450_000,
        currency: "ARS",
        destinationAmount: 1000,
      });
    });

    it(`allows ${RATE_TOLERANCE * 100}% away from the quote, and no more`, () => {
      const within = RATE * (1 + RATE_TOLERANCE) * 1000;
      const beyond = RATE * (1 + RATE_TOLERANCE + 0.01) * 1000;
      expect(offers([expense({ amount: within }), dollarIncome(1000)])).toHaveLength(1);
      expect(offers([expense({ amount: beyond }), dollarIncome(1000)])).toEqual([]);
    });

    it("pairs nothing without a quote", () => {
      expect(
        offers([expense({ amount: 1_450_000 }), dollarIncome(1000)], {
          rateAt: () => null,
        }),
      ).toEqual([]);
    });
  });

  // The undo has to bring the deleted half back whole.
  it("deletes the half nothing hangs on, and offers nothing if both carry something", () => {
    const tagged = income({ tag_names: "viaje" });
    const out = expense();
    expect(offers([out, tagged])[0]).toMatchObject({
      removed: out,
      join: { kept: tagged },
    });

    expect(
      offers([expense({ attachment_count: 1 }), income({ tag_names: "viaje" })]),
    ).toEqual([]);
  });

  it("leaves out a movement confirmed from an expected one", () => {
    const out = expense();
    expect(offers([out, income()], { fromExpected: new Set([out.id]) })).toEqual([]);
  });

  it("leaves out a pair the user said is not a transfer", () => {
    const out = expense();
    const into = income();
    const id = transferPairId(out, into);
    expect(offers([out, into], { isDismissed: (other) => other === id })).toEqual([]);
  });

  it(`looks ${RECENT_DAYS} days back`, () => {
    expect(
      offers([expense({ date: "2026-07-08" }), income({ date: "2026-07-08" })]),
    ).toHaveLength(1);
    expect(
      offers([expense({ date: "2026-07-07" }), income({ date: "2026-07-07" })]),
    ).toEqual([]);
  });
});
