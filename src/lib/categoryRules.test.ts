import { describe, expect, it } from "vitest";
import type { Category, CategoryRule } from "@/db/schema";
import {
  matchCategoryId,
  matchCategoryIdForType,
  matchCategoryRule,
} from "@/lib/categoryRules";

function rule(id: number, pattern: string, categoryId: number): CategoryRule {
  return { id, pattern, category_id: categoryId };
}

describe("matchCategoryIdForType", () => {
  const categories: Category[] = [
    { id: 3, name: "Compras", type: "expense", color: "#f97316", icon: "🛍️" },
    { id: 8, name: "Cobros", type: "income", color: "#10b981", icon: "💰" },
  ];
  const rules = [rule(1, "mercado pago", 3), rule(2, "transferencia recibida", 8)];

  it("uses a rule whose category is of the movement's kind", () => {
    expect(
      matchCategoryIdForType("Pago Mercado Pago", rules, categories, "expense"),
    ).toBe(3);
  });

  it("never files a movement under a category of the other kind", () => {
    expect(
      matchCategoryIdForType("Pago Mercado Pago", rules, categories, "income"),
    ).toBeNull();
  });

  it("falls back to a shorter rule of the right kind over a longer one of the wrong kind", () => {
    // "transferencia recibida" is longer, but "mercado pago" is the only rule
    // that can hold an expense.
    expect(
      matchCategoryIdForType(
        "Transferencia recibida Mercado Pago",
        rules,
        categories,
        "expense",
      ),
    ).toBe(3);
    expect(
      matchCategoryIdForType(
        "Transferencia recibida Mercado Pago",
        rules,
        categories,
        "income",
      ),
    ).toBe(8);
  });

  it("ignores a rule whose category no longer exists", () => {
    expect(
      matchCategoryIdForType("Netflix", [rule(9, "netflix", 99)], categories, "expense"),
    ).toBeNull();
  });
});

describe("matchCategoryRule", () => {
  const rules = [
    rule(1, "netflix", 5),
    rule(2, "coto", 3),
    rule(3, "mercado", 6),
    rule(4, "mercado libre", 5),
  ];

  it("matches a description containing the pattern", () => {
    expect(matchCategoryRule("Netflix mensual", rules)?.category_id).toBe(5);
  });

  it("ignores case", () => {
    expect(matchCategoryId("NETFLIX", rules)).toBe(5);
  });

  it("ignores accents in either direction", () => {
    const accented = [rule(1, "almacén", 3)];
    expect(matchCategoryId("Compra en el almacen", accented)).toBe(3);
    expect(matchCategoryId("Compra en el almacén", [rule(1, "almacen", 3)])).toBe(3);
  });

  it("prefers the most specific pattern when several match", () => {
    expect(matchCategoryRule("Compra en Mercado Libre", rules)?.id).toBe(4);
  });

  it("still matches the general pattern on its own", () => {
    expect(matchCategoryRule("Mercado de barrio", rules)?.id).toBe(3);
  });

  it("returns null when nothing matches", () => {
    expect(matchCategoryRule("Peluquería", rules)).toBeNull();
    expect(matchCategoryId("Peluquería", rules)).toBeNull();
  });

  it("returns null for an empty description", () => {
    expect(matchCategoryRule("", rules)).toBeNull();
    expect(matchCategoryRule("   ", rules)).toBeNull();
  });

  it("treats a blank pattern as disabled rather than matching everything", () => {
    expect(matchCategoryRule("cualquier cosa", [rule(1, "   ", 9)])).toBeNull();
  });

  it("breaks ties on the lower id so ordering never decides", () => {
    const tied = [rule(7, "abcd", 1), rule(2, "efgh", 2)];
    expect(matchCategoryRule("abcd efgh", tied)?.id).toBe(2);
    expect(matchCategoryRule("abcd efgh", [...tied].reverse())?.id).toBe(2);
  });

  it("returns null when there are no rules at all", () => {
    expect(matchCategoryRule("Netflix", [])).toBeNull();
  });
});
