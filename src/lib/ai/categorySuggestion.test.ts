import { describe, expect, it } from "vitest";
import type { Category, CategoryRule, Transaction } from "@/db/schema";
import hints from "./data/categoryHints.json";
import dictionary from "./data/merchants.json";
import { trainCategoryModel } from "./categoryModel";
import { suggestCategory } from "./categorySuggestion";

const CATEGORIES: Category[] = [
  { id: 1, name: "Salario", type: "income", color: "", icon: "" },
  { id: 3, name: "Comida", type: "expense", color: "", icon: "" },
  { id: 4, name: "Transporte", type: "expense", color: "", icon: "" },
  { id: 5, name: "Ocio", type: "expense", color: "", icon: "" },
];

function history(count: number, description: string, categoryId: number): Transaction[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
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
  }));
}

const NO_HISTORY = trainCategoryModel([]);

function expense(description: string) {
  return { description, type: "expense" as const };
}

describe("suggestCategory", () => {
  it("lets the user's rule win over anything learned", () => {
    const rule: CategoryRule = { id: 1, pattern: "rappi", category_id: 5 };
    const suggestion = suggestCategory(expense("rappi"), {
      rules: [rule],
      categories: CATEGORIES,
      model: trainCategoryModel(history(10, "rappi", 3)),
    });

    expect(suggestion).toEqual({ source: "rule", categoryId: 5, rule });
  });

  it("suggests what the history says, and says why", () => {
    const suggestion = suggestCategory(expense("MERPAGO*RAPPI 1"), {
      rules: [],
      categories: CATEGORIES,
      model: trainCategoryModel([...history(14, "rappi", 3), ...history(1, "rappi", 5)]),
    });

    expect(suggestion).toEqual({
      source: "ai",
      categoryId: 3,
      reason: "14 de tus 15 movimientos con «rappi» están en Comida.",
    });
  });

  it("says it plainly when every one of them is there", () => {
    const suggestion = suggestCategory(expense("rappi"), {
      rules: [],
      categories: CATEGORIES,
      model: trainCategoryModel(history(3, "rappi", 3)),
    });

    expect(suggestion).toMatchObject({
      reason: "Tus 3 movimientos con «rappi» están en Comida.",
    });
  });

  // With nothing learned yet, a merchant everyone knows still says something
  // about where it goes — in the user's own categories, or nowhere.
  describe("with no history to go by", () => {
    it("places a known merchant in the user's category for that kind of place", () => {
      expect(
        suggestCategory(expense("MERPAGO*RAPPI 4471"), {
          rules: [],
          categories: CATEGORIES,
          model: NO_HISTORY,
        }),
      ).toEqual({
        source: "ai",
        categoryId: 3,
        reason: "Rappi es una app de delivery.",
      });

      expect(
        suggestCategory(expense("nafta ypf"), {
          rules: [],
          categories: CATEGORIES,
          model: NO_HISTORY,
        }),
      ).toMatchObject({ categoryId: 4 });
    });

    it("says nothing when the user has no category for it", () => {
      expect(
        suggestCategory(expense("EDENOR 123"), {
          rules: [],
          categories: CATEGORIES,
          model: NO_HISTORY,
        }),
      ).toBeNull();
    });

    it("never files income under a merchant's kind of spending", () => {
      expect(
        suggestCategory(
          { description: "MERPAGO*RAPPI", type: "income" },
          { rules: [], categories: CATEGORIES, model: NO_HISTORY },
        ),
      ).toBeNull();
    });
  });

  it("does not suggest a category that no longer exists", () => {
    const suggestion = suggestCategory(expense("rappi"), {
      rules: [],
      categories: CATEGORIES.filter((category) => category.id !== 3),
      model: trainCategoryModel(history(5, "rappi", 3)),
    });

    expect(suggestion).toBeNull();
  });

  // The switch in Ajustes: off, the rules are all there is, as before.
  it("leaves only the rules when the local AI is off", () => {
    expect(
      suggestCategory(expense("MERPAGO*RAPPI"), {
        rules: [],
        categories: CATEGORIES,
        model: null,
      }),
    ).toBeNull();
  });
});

describe("the category hints", () => {
  it("cover every kind of place the merchant dictionary names", () => {
    for (const merchant of dictionary.merchants) {
      if ("hint" in merchant) expect(Object.keys(hints)).toContain(merchant.hint);
    }
  });
});
