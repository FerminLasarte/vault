import { describe, expect, it } from "vitest";
import {
  lastUsedAccountByCurrency,
  parseQuickEntry,
  quickEntryGaps,
  quickEntryToTransaction,
  type QuickEntryContext,
} from "./quickEntry";
import type { Category, CategoryRule, PaymentMethod } from "@/db";

// A Monday, so the weekday cases have a fixed point to count back from.
const TODAY = "2026-09-28";

function anAccount(id: number, name: string, currency = "ARS"): PaymentMethod {
  return { id, name, type: "cash", currency, initial_balance: 0 };
}

function aCategory(id: number, name: string, type: Category["type"]): Category {
  return { id, name, type, color: "#000000", icon: "" };
}

const ACCOUNTS = [
  anAccount(1, "Efectivo ARS"),
  anAccount(2, "Mercado Pago"),
  anAccount(3, "Efectivo USD", "USD"),
  anAccount(4, "Banco Galicia"),
];

const CATEGORIES = [
  aCategory(10, "Comida", "expense"),
  aCategory(11, "Sueldo", "income"),
  aCategory(12, "Compras", "expense"),
];

const RULES: CategoryRule[] = [
  { id: 1, pattern: "café", category_id: 10 },
  { id: 2, pattern: "sueldo", category_id: 11 },
];

function context(overrides: Partial<QuickEntryContext> = {}): QuickEntryContext {
  return {
    today: TODAY,
    paymentMethods: ACCOUNTS,
    categories: CATEGORIES,
    rules: RULES,
    lastUsedAccounts: new Map([
      ["ARS", 1],
      ["USD", 3],
    ]),
    defaultCurrency: "ARS",
    ...overrides,
  };
}

function parse(text: string, overrides: Partial<QuickEntryContext> = {}) {
  return parseQuickEntry(text, context(overrides));
}

describe("parseQuickEntry", () => {
  it("reads a description, an amount, an account and a date", () => {
    const entry = parse("café 2500 mp ayer");

    expect(entry).toMatchObject({
      type: "expense",
      description: "café",
      amount: 2500,
      currency: "ARS",
      paymentMethodId: 2,
      accountAssumed: false,
      categoryId: 10,
      date: "2026-09-27",
    });
    expect(entry.rule?.pattern).toBe("café");
  });

  it("keeps the description as it was typed", () => {
    expect(parse("Café con Juan 2500").description).toBe("Café con Juan");
  });

  describe("amounts", () => {
    it.each([
      ["2500", 2500],
      ["2.500", 2500],
      ["1.250.000", 1250000],
      ["2500,50", 2500.5],
      ["2.500,50", 2500.5],
      ["12.50", 12.5],
      ["2,5k", 2500],
      ["3k", 3000],
      ["$2500", 2500],
    ])("reads %s as %d", (token, amount) => {
      expect(parse(`almuerzo ${token}`).amount).toBe(amount);
    });

    // A number inside the description ("iPhone 16", "cuota 3") is not the
    // amount; the amount is the last figure typed.
    it("takes the last figure as the amount and leaves the others in the text", () => {
      const entry = parse("cuota 3 de 12 45000");

      expect(entry.amount).toBe(45000);
      expect(entry.description).toBe("cuota 3 de 12");
    });

    it("has no amount when none was typed", () => {
      expect(parse("café").amount).toBeNull();
    });
  });

  describe("type", () => {
    it("is an expense unless something says otherwise", () => {
      expect(parse("almuerzo 2500").type).toBe("expense");
    });

    it("is income when the amount carries a plus sign", () => {
      expect(parse("venta de la bici +90000").type).toBe("income");
    });

    it("is income when only an income rule matches the description", () => {
      const entry = parse("sueldo 900000");

      expect(entry.type).toBe("income");
      expect(entry.categoryId).toBe(11);
    });

    // A rule only ever files a movement of its own kind.
    it("does not take an income rule's category for a forced expense", () => {
      const entry = parse("sueldo -900000");

      expect(entry.type).toBe("expense");
      expect(entry.categoryId).toBeNull();
    });
  });

  describe("accounts", () => {
    it("recognises an account by its initials", () => {
      expect(parse("café 2500 mp").paymentMethodId).toBe(2);
    });

    it("recognises an account by the start of its name", () => {
      expect(parse("café 2500 banco").paymentMethodId).toBe(4);
    });

    it("ignores accents and case", () => {
      expect(parse("café 2500 MERCADO").paymentMethodId).toBe(2);
    });

    // "mercado libre" is a description, not the Mercado Pago account.
    it("only looks for the account after the amount", () => {
      const entry = parse("mercado libre 5000");

      expect(entry.description).toBe("mercado libre");
      expect(entry.accountAssumed).toBe(true);
    });

    it("breaks a tie between two accounts with the currency", () => {
      expect(parse("café 2500 efectivo").paymentMethodId).toBe(1);
      expect(parse("taxi 20 efectivo usd").paymentMethodId).toBe(3);
    });

    it("takes the currency from the account", () => {
      expect(parse("regalo 50 efectivo usd").currency).toBe("USD");
      expect(parse("almuerzo 2500 mp", { defaultCurrency: "USD" }).currency).toBe("ARS");
    });

    it("falls back to the last account used in the currency", () => {
      const entry = parse("almuerzo 2500");

      expect(entry.paymentMethodId).toBe(1);
      expect(entry.accountAssumed).toBe(true);
    });

    it("falls back to the last account used in a currency named alone", () => {
      const entry = parse("almuerzo 20 usd");

      expect(entry.currency).toBe("USD");
      expect(entry.paymentMethodId).toBe(3);
    });

    it("falls back to the first account of the currency when none was used yet", () => {
      expect(
        parse("almuerzo 2500", { lastUsedAccounts: new Map() }).paymentMethodId,
      ).toBe(1);
    });

    it("has no account when the currency has none", () => {
      expect(parse("almuerzo 2500", { paymentMethods: [] }).paymentMethodId).toBeNull();
    });
  });

  describe("dates", () => {
    it("is today when no date is typed", () => {
      expect(parse("café 2500").date).toBe(TODAY);
    });

    it.each([
      ["hoy", "2026-09-28"],
      ["ayer", "2026-09-27"],
      ["anteayer", "2026-09-26"],
      // Today is a Monday, so "lunes" means the one before.
      ["lunes", "2026-09-21"],
      ["viernes", "2026-09-25"],
      ["sábado", "2026-09-26"],
      ["15/9", "2026-09-15"],
      ["15-09", "2026-09-15"],
      ["3/2/2025", "2025-02-03"],
      ["3/2/25", "2025-02-03"],
      // Without a year, the last time that day came round.
      ["15/10", "2025-10-15"],
    ])("reads %s", (token, date) => {
      expect(parse(`café 2500 ${token}`).date).toBe(date);
    });

    it("leaves an impossible date in the description", () => {
      const entry = parse("café 31/2 2500");

      expect(entry.date).toBe(TODAY);
      expect(entry.description).toBe("café 31/2");
    });
  });
});

describe("quickEntryGaps", () => {
  it("has none for a complete entry", () => {
    expect(quickEntryGaps(parse("café 2500 mp ayer"), TODAY)).toEqual([]);
  });

  it("names everything still missing, in the order it was typed", () => {
    expect(quickEntryGaps(parse(""), TODAY)).toEqual([
      "description",
      "amount",
      "category",
    ]);
  });

  it("asks for a category when no rule matches", () => {
    expect(quickEntryGaps(parse("almuerzo 2500"), TODAY)).toEqual(["category"]);
  });

  it("asks for an account when the currency has none", () => {
    expect(quickEntryGaps(parse("café 2500", { paymentMethods: [] }), TODAY)).toEqual([
      "account",
    ]);
  });

  it("refuses a date after today", () => {
    expect(quickEntryGaps(parse("café 2500 1/1/2027"), TODAY)).toEqual(["date"]);
  });
});

describe("quickEntryToTransaction", () => {
  it("builds the movement the form would have saved", () => {
    expect(quickEntryToTransaction(parse("café 2500 mp ayer"))).toEqual({
      amount: 2500,
      type: "expense",
      categoryId: 10,
      paymentMethodId: 2,
      destinationPaymentMethodId: null,
      destinationAmount: null,
      description: "café",
      date: "2026-09-27",
      currency: "ARS",
    });
  });
});

describe("lastUsedAccountByCurrency", () => {
  it("keeps, per currency, the account of the latest movement", () => {
    const used = lastUsedAccountByCurrency([
      { id: 1, date: "2026-09-01", currency: "ARS", payment_method_id: 1 },
      { id: 2, date: "2026-09-20", currency: "ARS", payment_method_id: 2 },
      { id: 3, date: "2026-09-10", currency: "ARS", payment_method_id: 4 },
      { id: 4, date: "2026-09-05", currency: "USD", payment_method_id: 3 },
      { id: 5, date: "2026-09-25", currency: "ARS", payment_method_id: null },
    ]);

    expect(used).toEqual(
      new Map([
        ["ARS", 2],
        ["USD", 3],
      ]),
    );
  });

  it("breaks a tie on the same day with the later movement", () => {
    const used = lastUsedAccountByCurrency([
      { id: 7, date: "2026-09-20", currency: "ARS", payment_method_id: 1 },
      { id: 9, date: "2026-09-20", currency: "ARS", payment_method_id: 2 },
    ]);

    expect(used.get("ARS")).toBe(2);
  });
});
