import { describe, expect, it } from "vitest";
import type { Transaction } from "@/db/schema";
import {
  MIN_CONFIDENCE,
  MIN_EVIDENCE,
  predictCategory,
  tokenize,
  trainCategoryModel,
} from "./categoryModel";

const COMIDA = 3;
const TRANSPORTE = 4;
const COMPRAS = 7;
const SALARIO = 1;

let nextId = 1;
function movement(
  description: string,
  categoryId: number | null,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id: nextId++,
    amount: 1000,
    type: "expense",
    category_id: categoryId,
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

function times(count: number, description: string, categoryId: number | null) {
  return Array.from({ length: count }, () => movement(description, categoryId));
}

function expense(description: string) {
  return { description, type: "expense" as const };
}

describe("tokenize", () => {
  it("keeps the words that say what a movement was, and the pairs they form", () => {
    expect(tokenize("MERPAGO*LA BIRRA BAR 0021 CABA AR")).toEqual([
      "birra",
      "bar",
      "birra bar",
    ]);
  });

  it("drops codes, numbers, card networks and filler words", () => {
    expect(tokenize("COMPRA DEBITO VISA 1234 P1A2B3")).toEqual([]);
  });

  it("counts a word once however often it appears", () => {
    expect(tokenize("cafe con leche cafe")).toEqual([
      "cafe",
      "leche",
      "cafe leche",
      "leche cafe",
    ]);
  });
});

describe("predictCategory", () => {
  it("learns where a word lands and says how often it did", () => {
    const model = trainCategoryModel(times(14, "MERPAGO*RAPPI 4471", COMIDA));

    expect(predictCategory(model, expense("MERPAGO*RAPPI 9999"))).toEqual({
      categoryId: COMIDA,
      confidence: 14 / 15,
      evidence: { word: "rappi", inCategory: 14, total: 14 },
    });
  });

  // A big category cannot drown a small one: what decides is how a word is
  // distributed, not how many movements each category holds overall.
  it("listens to the word, not to the size of the category", () => {
    const model = trainCategoryModel([
      ...times(200, "supermercado coto", COMIDA),
      ...times(3, "UBER *TRIP", TRANSPORTE),
    ]);

    expect(predictCategory(model, expense("UBER *TRIP HELP"))?.categoryId).toBe(
      TRANSPORTE,
    );
  });

  // "mercado libre" and "mercado pago" share a word and nothing else. Between
  // a word and a pair that say the same, the pair is the more specific.
  it("goes by the most telling word or pair of words", () => {
    const model = trainCategoryModel([
      ...times(5, "mercado libre", COMPRAS),
      ...times(5, "supermercado mercado", COMIDA),
    ]);

    expect(predictCategory(model, expense("MERCADO LIBRE 123"))).toMatchObject({
      categoryId: COMPRAS,
      evidence: { word: "mercado libre" },
    });
  });

  describe("stays silent", () => {
    it(`with fewer than ${MIN_EVIDENCE} movements to go by`, () => {
      const model = trainCategoryModel(times(MIN_EVIDENCE - 1, "rappi", COMIDA));

      expect(predictCategory(model, expense("rappi"))).toBeNull();
    });

    it(`below ${MIN_CONFIDENCE} confidence, and not at or above it`, () => {
      // 2 of 2 is 2/3 once the doubt is counted; 3 of 4 is 3/5.
      const enough = trainCategoryModel(times(2, "rappi", COMIDA));
      const split = trainCategoryModel([
        ...times(3, "rappi", COMIDA),
        movement("rappi", COMPRAS),
      ]);

      expect(
        predictCategory(enough, expense("rappi"))?.confidence,
      ).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
      expect(predictCategory(split, expense("rappi"))).toBeNull();
    });

    it("when a word is split between categories", () => {
      const model = trainCategoryModel([
        ...times(5, "mercado", COMIDA),
        ...times(5, "mercado", COMPRAS),
      ]);

      expect(predictCategory(model, expense("mercado"))).toBeNull();
    });

    it("when two telling words disagree", () => {
      const model = trainCategoryModel([
        ...times(5, "rappi", COMIDA),
        ...times(5, "farmacia", COMPRAS),
      ]);

      expect(predictCategory(model, expense("rappi farmacia"))).toBeNull();
    });

    it("about words it has never seen", () => {
      const model = trainCategoryModel(times(5, "rappi", COMIDA));

      expect(predictCategory(model, expense("verduleria"))).toBeNull();
    });
  });

  describe("learns only from what the user decided", () => {
    // A guess that taught the model would confirm itself on every import.
    it("ignores categories the AI chose and nobody has confirmed", () => {
      const model = trainCategoryModel(
        times(5, "rappi", COMIDA).map((transaction) => ({
          ...transaction,
          category_suggested: 1,
        })),
      );

      expect(predictCategory(model, expense("rappi"))).toBeNull();
    });

    it("ignores movements with no category, and transfers", () => {
      const model = trainCategoryModel([
        ...times(5, "rappi", null),
        ...times(5, "rappi", COMIDA).map((transaction) => ({
          ...transaction,
          type: "transfer" as const,
        })),
      ]);

      expect(predictCategory(model, expense("rappi"))).toBeNull();
    });

    it("keeps income and expenses apart", () => {
      const model = trainCategoryModel(
        times(5, "transferencia sueldo", SALARIO).map((transaction) => ({
          ...transaction,
          type: "income" as const,
        })),
      );

      expect(predictCategory(model, expense("transferencia sueldo"))).toBeNull();
      expect(
        predictCategory(model, { description: "transferencia sueldo", type: "income" })
          ?.categoryId,
      ).toBe(SALARIO);
    });
  });
});
