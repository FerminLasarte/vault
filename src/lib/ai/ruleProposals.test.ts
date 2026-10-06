import { describe, expect, it } from "vitest";
import type { Category, CategoryRule, Transaction } from "@/db/schema";
import { trainCategoryModel } from "./categoryModel";
import {
  CONTRADICTION_SHARE,
  MIN_OCCURRENCES,
  MIN_PATTERN_LENGTH,
  MIN_PURITY,
  adviseRules,
} from "./ruleProposals";

const SALARIO = 1;
const COMIDA = 3;
const TRANSPORTE = 4;
const COMPRAS = 7;
const SALIDA = 9;

function category(id: number, name: string, type: "income" | "expense"): Category {
  return { id, name, type, icon: "", color: "#000000" };
}

const CATEGORIES = [
  category(SALARIO, "Salario", "income"),
  category(COMIDA, "Comida", "expense"),
  category(TRANSPORTE, "Transporte", "expense"),
  category(COMPRAS, "Compras", "expense"),
  category(SALIDA, "Salida", "expense"),
];

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

function rule(id: number, pattern: string, categoryId: number): CategoryRule {
  return { id, pattern, category_id: categoryId };
}

function advise(transactions: Transaction[], rules: CategoryRule[] = []) {
  return adviseRules({
    model: trainCategoryModel(transactions),
    transactions,
    rules,
    categories: CATEGORIES,
  });
}

describe("rule proposals", () => {
  it("proposes a rule for a word that keeps landing in one category, and says why", () => {
    const { proposals } = advise(times(4, "MERPAGO*RAPPI", COMIDA));

    expect(proposals).toEqual([
      {
        id: `rule:rappi:${COMIDA}`,
        pattern: "rappi",
        categoryId: COMIDA,
        reason: "Tus 4 movimientos con «rappi» están en Comida.",
      },
    ]);
  });

  it(`needs ${MIN_OCCURRENCES} movements before proposing anything`, () => {
    expect(advise(times(MIN_OCCURRENCES - 1, "rappi", COMIDA)).proposals).toEqual([]);
    expect(advise(times(MIN_OCCURRENCES, "rappi", COMIDA)).proposals).toHaveLength(1);
  });

  it(`needs ${MIN_PURITY * 100}% of them in the category`, () => {
    // 9 of 10 is exactly the bar; 8 of 9 is just under it.
    const atTheBar = [...times(9, "uber", TRANSPORTE), movement("uber", COMIDA)];
    const underIt = [...times(8, "uber", TRANSPORTE), movement("uber", COMIDA)];

    expect(advise(atTheBar).proposals.map((proposal) => proposal.pattern)).toEqual([
      "uber",
    ]);
    expect(advise(atTheBar).proposals[0].reason).toBe(
      "9 de tus 10 movimientos con «uber» están en Transporte.",
    );
    expect(advise(underIt).proposals).toEqual([]);
  });

  // A rule matches anywhere in the text: "bar" would also catch "barbería".
  it(`never proposes a pattern shorter than ${MIN_PATTERN_LENGTH} characters`, () => {
    expect(advise(times(5, "ab", COMIDA)).proposals).toEqual([]);
  });

  // "bar" is also in "barbería".
  it("proposes one rule per merchant, the most specific that settles it", () => {
    const { proposals } = advise(times(4, "LA BIRRA BAR", SALIDA));

    expect(proposals.map((proposal) => proposal.pattern)).toEqual(["birra bar"]);
  });

  it("keeps two merchants that share a word apart", () => {
    const { proposals } = advise([
      ...times(4, "uber eats", COMIDA),
      ...times(3, "uber trip", TRANSPORTE),
    ]);

    expect(proposals.map((proposal) => [proposal.pattern, proposal.categoryId])).toEqual([
      ["uber eats", COMIDA],
      ["uber trip", TRANSPORTE],
    ]);
  });

  it("proposes nothing a rule already does", () => {
    const transactions = times(5, "rappi", COMIDA);

    expect(advise(transactions, [rule(1, "Rappi", COMIDA)]).proposals).toEqual([]);
  });

  // A shorter rule that puts these somewhere else is beaten by the longer one
  // proposed, which is what the user does by hand every time.
  it("proposes a more specific rule where a broader one gets them wrong", () => {
    const transactions = times(4, "uber eats", COMIDA);
    const { proposals } = advise(transactions, [rule(1, "uber", TRANSPORTE)]);

    // Not "eats": as long as "uber", it would lose to the older rule.
    expect(proposals.map((proposal) => proposal.pattern)).toEqual(["uber eats"]);
  });

  // A suggestion nobody looked at is the AI talking to itself.
  it("only learns from movements the user decided", () => {
    const transactions = [
      ...times(2, "rappi", COMIDA),
      movement("rappi", COMIDA, { category_suggested: 1 }),
      movement("rappi", null),
    ];

    expect(advise(transactions).proposals).toEqual([]);
  });

  it("proposes income rules from income", () => {
    const transactions = Array.from({ length: 3 }, () =>
      movement("HABERES ACME", SALARIO, { type: "income" }),
    );

    expect(advise(transactions).proposals).toMatchObject([
      { pattern: "haberes acme", categoryId: SALARIO },
    ]);
  });

  it("ranks proposals by how many movements they settle", () => {
    const { proposals } = advise([
      ...times(3, "rappi", COMIDA),
      ...times(6, "cabify", TRANSPORTE),
    ]);

    expect(proposals.map((proposal) => proposal.pattern)).toEqual(["cabify", "rappi"]);
  });
});

describe("rule notes", () => {
  it("says when a rule matches nothing", () => {
    const { notes } = advise(times(3, "rappi", COMIDA), [rule(5, "Netflix", SALIDA)]);

    expect(notes.get(5)).toEqual({
      kind: "unused",
      id: `rule-unused:5:netflix:${SALIDA}`,
      message: "No coincide con ningún movimiento.",
      reason: "Ninguno de tus movimientos contiene «Netflix».",
    });
  });

  // An expense rule never decides an income, so an income is no match.
  it("counts only movements of the rule's own kind", () => {
    const transactions = [movement("acme", SALARIO, { type: "income" })];

    expect(advise(transactions, [rule(5, "acme", COMPRAS)]).notes.get(5)?.kind).toBe(
      "unused",
    );
  });

  it("says when a rule is always beaten by a more specific one", () => {
    const rules = [rule(1, "mercado", COMPRAS), rule(2, "mercado libre", COMPRAS)];
    const { notes } = advise(times(MIN_OCCURRENCES, "mercado libre", COMPRAS), rules);

    expect(notes.get(1)).toMatchObject({
      kind: "shadowed",
      message: "Nunca decide: siempre gana una regla más específica.",
      reason: "En tus 3 movimientos con «mercado» decide «mercado libre».",
    });
    expect(notes.has(2)).toBe(false);
  });

  it(`waits for ${MIN_OCCURRENCES} movements before calling a rule beaten`, () => {
    const rules = [rule(1, "mercado", COMPRAS), rule(2, "mercado libre", COMPRAS)];
    const { notes } = advise(times(MIN_OCCURRENCES - 1, "mercado libre", COMPRAS), rules);

    expect(notes.has(1)).toBe(false);
  });

  it("proposes moving a rule to where the user keeps putting its movements", () => {
    const transactions = [
      ...times(3, "pedidos ya", SALIDA),
      movement("pedidos ya", COMIDA),
    ];
    const { notes } = advise(transactions, [rule(4, "pedidos", COMIDA)]);

    expect(notes.get(4)).toEqual({
      kind: "contradicted",
      id: `rule-contradicted:4:pedidos:${COMIDA}:${SALIDA}`,
      message: "La mayoría de lo que decide está en Salida.",
      reason: "3 de tus 4 movimientos con «pedidos» están en Salida.",
      categoryId: SALIDA,
      categoryName: "Salida",
    });
  });

  it(`needs more than ${CONTRADICTION_SHARE * 100}% elsewhere, and ${MIN_OCCURRENCES} of them`, () => {
    const half = [...times(3, "pedidos", SALIDA), ...times(3, "pedidos", COMIDA)];
    const tooFew = [...times(2, "pedidos", SALIDA), movement("pedidos", COMIDA)];

    expect(advise(half, [rule(4, "pedidos", COMIDA)]).notes.has(4)).toBe(false);
    expect(advise(tooFew, [rule(4, "pedidos", COMIDA)]).notes.has(4)).toBe(false);
  });

  it("says nothing about a rule that does its job", () => {
    const { notes } = advise(times(5, "rappi", COMIDA), [rule(1, "rappi", COMIDA)]);

    expect(notes.size).toBe(0);
  });
});
