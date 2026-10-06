import { describe, expect, it } from "vitest";
import type { Transaction } from "@/db/schema";
import {
  MAX_SUGGESTIONS,
  MIN_ACCOUNT_MOVEMENTS,
  MIN_ACCOUNT_SHARE,
  MIN_TYPED,
  RECENT_MONTHS,
  descriptionSuggestions,
  findMerchant,
  learnMerchantHistory,
  usualAccountReason,
  type MerchantEntry,
} from "./merchantHistory";

const TODAY = "2026-10-06";

let nextId = 1;
function movement(
  description: string,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id: nextId++,
    amount: 1000,
    type: "expense",
    category_id: null,
    payment_method_id: 1,
    destination_payment_method_id: null,
    destination_amount: null,
    description,
    date: "2026-09-01",
    currency: "ARS",
    category_suggested: 0,
    ...overrides,
  };
}

function times(count: number, description: string, overrides: Partial<Transaction> = {}) {
  return Array.from({ length: count }, () => movement(description, overrides));
}

function learn(transactions: Transaction[]) {
  return learnMerchantHistory(transactions, TODAY);
}

function only(transactions: Transaction[]): MerchantEntry {
  const entries = [...learn(transactions).values()];
  expect(entries).toHaveLength(1);
  return entries[0];
}

describe("learnMerchantHistory", () => {
  it("brings a statement line and the same merchant typed by hand together", () => {
    const entry = only([
      movement("MERPAGO*RAPPI 4471 CABA AR", { date: "2026-08-01" }),
      movement("rappi", { date: "2026-09-01" }),
    ]);

    expect(entry).toMatchObject({ key: "rappi", count: 2, lastDate: "2026-09-01" });
  });

  it("is named as the latest movement is shown", () => {
    expect(
      only([
        movement("rappi", { date: "2026-08-01" }),
        movement("MERPAGO*RAPPI 4471", { date: "2026-09-01" }),
      ]).label,
    ).toBe("Rappi");
    expect(only([movement("Café con Juan")]).label).toBe("Café con Juan");
  });

  it("keeps each kind of movement and each currency apart", () => {
    const history = learn([
      movement("Spotify"),
      movement("Spotify", { currency: "USD" }),
      movement("Spotify", { type: "income" }),
    ]);

    expect(history.size).toBe(3);
  });

  it("leaves transfers out", () => {
    expect(learn([movement("Ahorro", { type: "transfer" })]).size).toBe(0);
  });

  it("takes the typical amount from the recent movements only", () => {
    const entry = only([
      movement("Netflix", { amount: 3000, date: "2025-01-10" }),
      movement("Netflix", { amount: 9000, date: "2026-08-10" }),
      movement("Netflix", { amount: 9500, date: "2026-09-10" }),
    ]);

    expect(entry.typicalAmount).toBe(9250);
    expect(entry).toMatchObject({ count: 3, recentCount: 2 });
  });

  it(`counts ${RECENT_MONTHS} months back from today as recent`, () => {
    expect(only([movement("Netflix", { date: "2026-04-06" })]).recentCount).toBe(1);
    expect(only([movement("Netflix", { date: "2026-04-05" })]).recentCount).toBe(0);
  });

  it("has no typical amount with nothing recent", () => {
    expect(only([movement("Netflix", { date: "2024-01-10" })]).typicalAmount).toBeNull();
  });

  describe("the usual account", () => {
    it("is the one most of the recent movements went through", () => {
      const entry = only([
        ...times(3, "Rappi", { payment_method_id: 2 }),
        movement("Rappi", { payment_method_id: 1 }),
      ]);

      expect(entry.account).toEqual({ paymentMethodId: 2, inAccount: 3, total: 4 });
    });

    it(`needs at least ${MIN_ACCOUNT_MOVEMENTS} movements through it`, () => {
      expect(only([movement("Rappi", { payment_method_id: 2 })]).account).toBeNull();
      expect(only(times(2, "Rappi", { payment_method_id: 2 })).account).not.toBeNull();
    });

    it(`needs at least ${MIN_ACCOUNT_SHARE * 100}% of them`, () => {
      // 3 of 5 is exactly the share; 2 of 4 falls short.
      expect(
        only([
          ...times(3, "Rappi", { payment_method_id: 2 }),
          ...times(2, "Rappi", { payment_method_id: 1 }),
        ]).account,
      ).toMatchObject({ paymentMethodId: 2 });
      expect(
        only([
          ...times(2, "Rappi", { payment_method_id: 2 }),
          movement("Rappi", { payment_method_id: 1 }),
          movement("Rappi", { payment_method_id: 3 }),
        ]).account,
      ).toBeNull();
    });

    it("ignores the account of old movements", () => {
      expect(
        only(times(3, "Rappi", { payment_method_id: 2, date: "2025-01-01" })).account,
      ).toBeNull();
    });
  });
});

describe("findMerchant", () => {
  const history = learn([
    movement("MERPAGO*RAPPI 4471"),
    movement("Rappi", { currency: "USD" }),
  ]);

  it("finds the merchant behind what was typed, in its kind and currency", () => {
    expect(
      findMerchant(history, { description: "rappi", type: "expense", currency: "ARS" }),
    ).toMatchObject({ currency: "ARS" });
    expect(
      findMerchant(history, { description: "rappi", type: "income", currency: "ARS" }),
    ).toBeNull();
  });

  it("finds nothing for an empty description", () => {
    expect(
      findMerchant(history, { description: " ", type: "expense", currency: "ARS" }),
    ).toBeNull();
  });
});

describe("usualAccountReason", () => {
  it("says how many movements went through the account", () => {
    const entry = only([
      ...times(9, "Rappi", { payment_method_id: 2 }),
      movement("Rappi", { payment_method_id: 1 }),
    ]);

    expect(usualAccountReason(entry, "Visa")).toBe(
      "En los últimos 6 meses, 9 de tus 10 movimientos con «Rappi» se pagaron con Visa.",
    );
  });

  it("says where income came in", () => {
    const entry = only(times(2, "Sueldo", { type: "income", payment_method_id: 2 }));

    expect(usualAccountReason(entry, "Banco")).toBe(
      "En los últimos 6 meses, tus 2 movimientos con «Sueldo» entraron en Banco.",
    );
  });

  it("has nothing to say without a usual account", () => {
    expect(usualAccountReason(only([movement("Rappi")]), "Visa")).toBeNull();
  });
});

describe("descriptionSuggestions", () => {
  it(`waits for ${MIN_TYPED} characters`, () => {
    const history = learn([movement("Rappi")]);

    expect(descriptionSuggestions("r", history)).toEqual([]);
    expect(descriptionSuggestions("ra", history)).toHaveLength(1);
  });

  it("matches the start of any word, ignoring accents and case", () => {
    const history = learn([movement("MERCADOLIBRE*COMPRA"), movement("Café con Juan")]);

    expect(descriptionSuggestions("libre", history)).toMatchObject([
      { label: "Mercado Libre" },
    ]);
    expect(descriptionSuggestions("JUAN", history)).toMatchObject([
      { label: "Café con Juan" },
    ]);
    expect(descriptionSuggestions("cafe", history)).toHaveLength(1);
    expect(descriptionSuggestions("afe", history)).toEqual([]);
  });

  it("puts what came up most lately first, then the most frequent", () => {
    const history = learn([
      ...times(5, "Supermercado Coto", { date: "2025-01-01" }),
      ...times(2, "Super Día", { date: "2026-09-01" }),
      movement("Superclub", { date: "2026-09-02" }),
    ]);

    expect(descriptionSuggestions("super", history).map((entry) => entry.label)).toEqual([
      "Super Día",
      "Superclub",
      "Supermercado Coto",
    ]);
  });

  it(`offers at most ${MAX_SUGGESTIONS}`, () => {
    const history = learn(
      Array.from({ length: MAX_SUGGESTIONS + 2 }, (_, index) =>
        movement(`Kiosco ${String.fromCharCode(97 + index)}${index}x`),
      ),
    );

    expect(descriptionSuggestions("kiosco", history)).toHaveLength(MAX_SUGGESTIONS);
  });
});
