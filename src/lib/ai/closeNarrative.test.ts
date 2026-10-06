import { describe, expect, it } from "vitest";
import {
  factValues,
  fillTemplate,
  MAX_SENTENCES,
  narrate,
  narrateMonth,
  PHRASES,
} from "./closeNarrative";
import { FACT_VARIANTS, type CloseFact, type CloseFactKind } from "./closeFacts";
import { chargesOf, NOTHING_DECLARED } from "./testing/series";
import { buildMonthlyClose } from "@/lib/monthlyClose";
import type { TransactionWithCategory } from "@/db/schema";

// One fact of every kind, to be worded in each of its variants.
const SAMPLES: { [K in CloseFactKind]: Extract<CloseFact, { kind: K }> } = {
  balance: {
    kind: "balance",
    variant: "saved",
    income: 1000,
    expenses: 600,
    balance: 400,
  },
  savingRate: {
    kind: "savingRate",
    variant: "more",
    rate: 0.25,
    previousRate: 0.2,
    monthKey: "2026-08",
  },
  savingRateLastYear: {
    kind: "savingRateLastYear",
    variant: "more",
    rate: 0.25,
    previousRate: 0.1,
    monthKey: "2025-09",
  },
  categoryRise: {
    kind: "categoryRise",
    variant: "up",
    category: "Comida",
    current: 1350,
    previous: 1000,
    change: 0.35,
    monthKey: "2026-08",
  },
  categoryFall: {
    kind: "categoryFall",
    variant: "lower",
    category: "Salidas",
    current: 1000,
    previous: 2000,
    change: 0.5,
    monthKey: "2026-08",
  },
  newCategory: {
    kind: "newCategory",
    variant: "new",
    category: "Salud",
    current: 1000,
    monthKey: "2026-08",
  },
  rise: {
    kind: "rise",
    variant: "one",
    rises: [{ name: "Netflix", previous: 5000, latest: 5900, rise: 0.18 }],
  },
  unusual: {
    kind: "unusual",
    variant: "one",
    top: { name: "Farmacity", amount: 45000, typical: 7000, date: "2026-09-04" },
    others: 0,
  },
};

const KINDS = Object.keys(FACT_VARIANTS) as CloseFactKind[];

// Amounts come with a non-breaking space after the sign; read here as a plain
// one.
const plain = (text: string | undefined) => text?.replace(/\u00a0/g, " ");

describe("closePhrases.json", () => {
  it("words every kind of fact in every variant, and nothing else", () => {
    expect(Object.keys(PHRASES).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      expect(Object.keys(PHRASES[kind].variants).sort()).toEqual(
        [...FACT_VARIANTS[kind]].sort(),
      );
    }
  });

  it("gives every kind its own priority, the balance first", () => {
    const priorities = KINDS.map((kind) => PHRASES[kind].priority);

    expect(new Set(priorities).size).toBe(KINDS.length);
    expect(Math.min(...priorities)).toBe(PHRASES.balance.priority);
  });

  it("offers more than one wording of everything", () => {
    for (const kind of KINDS) {
      for (const wordings of Object.values(PHRASES[kind].variants)) {
        expect(wordings.length).toBeGreaterThan(1);
      }
    }
  });

  it("writes no figure of its own: every number comes from a fact", () => {
    for (const kind of KINDS) {
      for (const wording of Object.values(PHRASES[kind].variants).flat()) {
        expect(wording).not.toMatch(/\d/);
      }
    }
  });

  it("fills every placeholder of every wording, as a whole sentence", () => {
    for (const kind of KINDS) {
      const values = factValues(SAMPLES[kind], "ARS");
      for (const wording of Object.values(PHRASES[kind].variants).flat()) {
        const sentence = fillTemplate(wording, values);
        expect(sentence, wording).not.toMatch(/[{}]/);
        expect(sentence, wording).toMatch(/^[A-ZÁÉÍÓÚÑ$]/);
        expect(sentence, wording).toMatch(/[.)]$/);
      }
    }
  });
});

describe("narrate", () => {
  const facts = KINDS.map((kind) => SAMPLES[kind]);

  it(`tells the balance first and at most ${MAX_SENTENCES} things`, () => {
    const sentences = narrate([...facts].reverse(), "2026-09", "ARS");

    expect(sentences).toHaveLength(MAX_SENTENCES);
    expect(plain(sentences[0])).toMatch(/\$ 1\.000,00/);
  });

  it("always words the same close the same way", () => {
    expect(narrate(facts, "2026-09", "ARS")).toEqual(narrate(facts, "2026-09", "ARS"));
  });

  it("takes its figures from the fact, formatted the Argentine way", () => {
    const sentence = plain(narrate([SAMPLES.rise], "2026-09", "ARS")[0]);

    expect(sentence).toContain("$ 5.000,00");
    expect(sentence).toContain("$ 5.900,00");
    expect(sentence).toContain("(+18%)");
  });

  it("names the charges that went up one by one", () => {
    const values = factValues(
      {
        kind: "rise",
        variant: "several",
        rises: [
          { name: "Netflix", previous: 5000, latest: 5900, rise: 0.18 },
          { name: "Spotify", previous: 3000, latest: 3360, rise: 0.12 },
        ],
      },
      "ARS",
    );

    expect(values.list).toBe("Netflix (+18%) y Spotify (+12%)");
  });

  it("writes months in lower case inside a sentence", () => {
    expect(factValues(SAMPLES.savingRate, "ARS").month).toBe("agosto de 2026");
  });
});

describe("narrateMonth", () => {
  let nextId = 1;
  const tx = (overrides: Partial<TransactionWithCategory>): TransactionWithCategory => ({
    id: nextId++,
    amount: 100,
    type: "expense",
    category_id: 1,
    payment_method_id: 1,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Gasto",
    date: "2026-09-10",
    currency: "ARS",
    category_suggested: 0,
    category_name: "Comida",
    category_color: "#000",
    category_icon: "🍽️",
    payment_method_name: "Banco",
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  });

  it("narrates each currency the month moved, apart", () => {
    const netflix = chargesOf(
      "Netflix",
      ["2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10"],
      [5000, 5000, 5000, 5900],
      { currency: "USD" },
    ).map((movement) => tx(movement));
    const transactions = [
      tx({ type: "income", amount: 100000, category_id: 9, category_name: "Sueldo" }),
      tx({ amount: 60000 }),
      ...netflix,
    ];
    const close = buildMonthlyClose(transactions, "2026-09");

    const narrative = narrateMonth(close, {
      transactions,
      categories: [],
      commitments: NOTHING_DECLARED,
    });

    expect([...narrative.keys()]).toEqual(["ARS", "USD"]);
    expect(plain(narrative.get("ARS")?.[0])).toContain("$ 40.000,00");
    expect(plain(narrative.get("USD")?.join(" "))).toContain("US$ 5.900,00");
    expect(narrative.get("ARS")?.join(" ")).not.toContain("Netflix");
  });
});
