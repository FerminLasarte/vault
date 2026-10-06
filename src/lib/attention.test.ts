import { describe, expect, it } from "vitest";
import type { BudgetWithCategory } from "@/db/schema";
import type { BudgetProgress } from "@/lib/finance";
import { MAX_AI_NOTICES, buildAttentionItems } from "@/lib/attention";
import { lateIncome } from "@/lib/ai/lateIncome";
import { priceRises } from "@/lib/ai/priceRises";
import { unregisteredSeries } from "@/lib/ai/unregisteredSeries";
import {
  MONTHLY,
  NOTHING_DECLARED,
  charges,
  chargesOf,
  detect,
  recurringTemplate,
} from "@/lib/ai/testing/series";

function makeOverspent(categoryName: string, ratio: number): BudgetProgress {
  const budget = {
    id: Math.random(),
    category_id: 1,
    currency: "ARS",
    amount: 1000,
    period: "monthly",
    category_name: categoryName,
    category_icon: "🍔",
    category_color: "#000000",
  } satisfies BudgetWithCategory;

  return {
    budget,
    spent: budget.amount * ratio,
    remaining: budget.amount - budget.amount * ratio,
    ratio,
    isExceeded: true,
  };
}

const CALM = {
  overspent: [],
  backup: { daysAgo: 1, isOverdue: false },
  pendingCount: 0,
  suggestedCount: 0,
  uncategorised: [],
  lateIncome: [],
  rises: [],
  unregistered: [],
  pendingClose: null,
};

describe("buildAttentionItems", () => {
  it("says nothing when there is nothing to say", () => {
    expect(buildAttentionItems(CALM)).toEqual([]);
  });

  it("names the exceeded budgets and how far over they are", () => {
    const [item] = buildAttentionItems({
      ...CALM,
      overspent: [makeOverspent("Comida", 1.8)],
    });

    expect(item).toMatchObject({ kind: "budget", tone: "critical" });
    expect(item.title).toBe("Superaste un presupuesto");
    expect(item.detail).toBe("Comida (180%)");
  });

  it("counts several exceeded budgets and lists them together", () => {
    const [item] = buildAttentionItems({
      ...CALM,
      overspent: [makeOverspent("Comida", 1.2), makeOverspent("Transporte", 1.05)],
    });

    expect(item.title).toBe("Superaste 2 presupuestos");
    expect(item.detail).toBe("Comida (120%) · Transporte (105%)");
  });

  it("distinguishes a stale backup from one that was never taken", () => {
    const [stale] = buildAttentionItems({
      ...CALM,
      backup: { daysAgo: 30, isOverdue: true },
    });
    expect(stale.title).toBe("Hace 30 días que no guardás una copia");

    const [never] = buildAttentionItems({
      ...CALM,
      backup: { daysAgo: null, isOverdue: true },
    });
    expect(never.title).toBe("Nunca guardaste una copia de seguridad");
  });

  it("stays quiet about a backup that is recent enough", () => {
    expect(
      buildAttentionItems({ ...CALM, backup: { daysAgo: 3, isOverdue: false } }),
    ).toEqual([]);
  });

  it("marks pending confirmations as ordinary work rather than a warning", () => {
    const [item] = buildAttentionItems({ ...CALM, pendingCount: 1 });

    expect(item).toMatchObject({ kind: "pending", tone: "neutral" });
    expect(item.title).toBe("Tenés 1 movimiento pendiente de confirmar");
  });

  it("pluralises the pending count", () => {
    const [item] = buildAttentionItems({ ...CALM, pendingCount: 4 });

    expect(item.title).toBe("Tenés 4 movimientos pendientes de confirmar");
  });

  it("orders everything by what it costs to ignore it", () => {
    const items = buildAttentionItems({
      overspent: [makeOverspent("Comida", 1.1)],
      backup: { daysAgo: 30, isOverdue: true },
      pendingCount: 2,
      suggestedCount: 3,
      uncategorised: [{ id: "uncategorised:4", size: 5, categoryName: "Super" }],
      lateIncome: [],
      rises: [],
      unregistered: [],
      pendingClose: "2026-07",
    });

    // Money already spent, then data that could be lost, then work still to do,
    // and last the one where nothing is wrong at all.
    expect(items.map((item) => item.kind)).toEqual([
      "budget",
      "backup",
      "pending",
      "suggested",
      "uncategorised",
      "close",
    ]);
  });
});

// Left by an import: categories the AI chose, waiting for a look.
describe("the suggested categories row", () => {
  it("counts them and says where to review them", () => {
    const [one] = buildAttentionItems({ ...CALM, suggestedCount: 1 });
    const [many] = buildAttentionItems({ ...CALM, suggestedCount: 12 });

    expect(one.title).toBe("Revisá 1 categoría sugerida por IA");
    expect(many.title).toBe("Revisá 12 categorías sugeridas por IA");
    expect(many.detail).toContain("Transacciones");
    expect(many.tone).toBe("neutral");
  });
});

describe("uncategorised movements the AI can place", () => {
  function group(id: number, size: number, categoryName: string) {
    return { id: `uncategorised:${id}`, size, categoryName };
  }

  it("names the group and offers to review it", () => {
    const [item] = buildAttentionItems({
      ...CALM,
      uncategorised: [group(4, 23, "Supermercado")],
    });

    expect(item).toMatchObject({
      key: "uncategorised:4",
      kind: "uncategorised",
      tone: "neutral",
      title: "23 movimientos sin categoría parecen Supermercado",
      actionLabel: "Revisar",
    });
  });

  it("gives each group its own row", () => {
    const items = buildAttentionItems({
      ...CALM,
      uncategorised: [group(4, 3, "Super"), group(5, 2, "Transporte")],
    });

    expect(items.map((item) => item.key)).toEqual(["uncategorised:4", "uncategorised:5"]);
  });

  // Atención stays calm: the AI never takes the line over.
  it(`shows at most ${MAX_AI_NOTICES} AI notices, what it already wrote first`, () => {
    const items = buildAttentionItems({
      ...CALM,
      pendingCount: 1,
      suggestedCount: 2,
      uncategorised: [group(4, 9, "Super"), group(5, 5, "Ocio"), group(6, 2, "Salud")],
      pendingClose: "2026-07",
    });

    expect(items.map((item) => item.key)).toEqual([
      "pending",
      "suggested",
      "uncategorised:4",
      "uncategorised:5",
      "close",
    ]);
  });
});

describe("the monthly close row", () => {
  it("names the month and offers the way out", () => {
    const [item] = buildAttentionItems({ ...CALM, pendingClose: "2026-07" });

    expect(item.kind).toBe("close");
    expect(item.title).toContain("Julio de 2026");
    expect(item.actionLabel).toBe("Guardar como PDF");
  });

  it("is neutral: nothing is wrong, something is ready", () => {
    const [item] = buildAttentionItems({ ...CALM, pendingClose: "2026-07" });
    expect(item.tone).toBe("neutral");
  });
});

// Read from what repeats on its own (see series.ts).
describe("notices about repeating movements", () => {
  const NBSP = "\u00a0";
  const nothingDismissed = () => false;
  const FOUR_MONTHS = ["2026-06-10", ...MONTHLY];

  function late(today = "2026-10-08") {
    const salary = charges(
      "Sueldo",
      ["2026-06-04", "2026-07-03", "2026-08-05", "2026-09-04"],
      { type: "income" },
    );
    return lateIncome(detect(salary, NOTHING_DECLARED, today), today, nothingDismissed);
  }

  function rises(recurring = NOTHING_DECLARED.recurring) {
    const netflix = chargesOf("DLO*NETFLIX", FOUR_MONTHS, [5000, 5000, 5000, 5900]);
    return priceRises(
      detect(netflix, { ...NOTHING_DECLARED, recurring }),
      nothingDismissed,
    );
  }

  function unregistered() {
    return unregisteredSeries(detect(charges("Spotify", MONTHLY)), nothingDismissed);
  }

  it("says when income is late, and when it usually comes in", () => {
    const [item] = buildAttentionItems({ ...CALM, lateIncome: late() });

    expect(item).toMatchObject({
      key: "late:income:ARS:sueldo:monthly:2026-10",
      kind: "late",
      tone: "neutral",
      title: "Sueldo suele entrar alrededor del 4 y todavía no llegó",
      detail: "En los últimos 4 meses entró entre el 3 y el 5.",
      dismissalId: "late:income:ARS:sueldo:monthly:2026-10",
    });
    expect(item.actionLabel).toBeUndefined();
  });

  it("says how much a charge went up", () => {
    const [item] = buildAttentionItems({ ...CALM, rises: rises() });

    expect(item).toMatchObject({
      kind: "rise",
      tone: "neutral",
      title: `Netflix pasó de $${NBSP}5.000,00 a $${NBSP}5.900,00 (+18%)`,
      detail: "Comparado con los 3 cobros anteriores.",
      dismissalId: "rise:expense:ARS:netflix:monthly:5900",
    });
    expect(item.actionLabel).toBeUndefined();
  });

  it("offers to update a declared recurring movement that went up", () => {
    const [item] = buildAttentionItems({
      ...CALM,
      rises: rises([recurringTemplate({ amount: 5000 })]),
    });

    expect(item.detail).toBe(
      `Comparado con los 3 cobros anteriores. Tu recurrente todavía dice $${NBSP}5.000,00.`,
    );
    expect(item.actionLabel).toBe("Actualizar");
  });

  it("offers to add what repeats as a recurring movement", () => {
    const [item] = buildAttentionItems({ ...CALM, unregistered: unregistered() });

    expect(item).toMatchObject({
      key: "series:expense:ARS:spotify:monthly",
      kind: "unregistered",
      tone: "neutral",
      title: "Parece que pagás Spotify todos los meses",
      detail: `3 veces seguidas, cerca de $${NBSP}5.000,00; la última el 10 sept 2026.`,
      actionLabel: "Agregar",
      dismissalId: "series:expense:ARS:spotify:monthly",
    });
  });

  it("says what comes in, for income", () => {
    const salary = charges("Sueldo", MONTHLY, { type: "income" });
    const [item] = buildAttentionItems({
      ...CALM,
      unregistered: unregisteredSeries(detect(salary), nothingDismissed),
    });

    expect(item.title).toBe("Parece que cobrás Sueldo todos los meses");
  });

  // Atención stays calm, and what costs the most to ignore gets the places.
  it(`puts money missing or spent first, within the ${MAX_AI_NOTICES} AI notices`, () => {
    const items = buildAttentionItems({
      ...CALM,
      suggestedCount: 2,
      uncategorised: [{ id: "uncategorised:4", size: 9, categoryName: "Super" }],
      lateIncome: late(),
      rises: rises(),
      unregistered: unregistered(),
    });

    expect(items.map((item) => item.kind)).toEqual(["late", "rise", "suggested"]);
  });

  it("lets only these be dismissed from the line", () => {
    const items = buildAttentionItems({
      ...CALM,
      suggestedCount: 2,
      uncategorised: [{ id: "uncategorised:4", size: 9, categoryName: "Super" }],
      unregistered: unregistered(),
    });

    expect(items.map((item) => item.dismissalId)).toEqual([
      undefined,
      undefined,
      "series:expense:ARS:spotify:monthly",
    ]);
  });

  // One notice per series: the rise says more, and costs more to ignore.
  describe("a series that went up and was never declared", () => {
    const netflix = chargesOf("DLO*NETFLIX", FOUR_MONTHS, [5000, 5000, 5000, 5900]);

    it("is one notice, the rise, which offers to add it", () => {
      const series = detect(netflix);
      const items = buildAttentionItems({
        ...CALM,
        rises: priceRises(series, nothingDismissed),
        unregistered: unregisteredSeries(series, nothingDismissed),
      });

      expect(items.map((item) => [item.kind, item.actionLabel])).toEqual([
        ["rise", "Agregar"],
      ]);
    });

    it("offers nothing to add once adding it was turned down", () => {
      const series = detect(netflix);
      const [item] = buildAttentionItems({
        ...CALM,
        rises: priceRises(series, nothingDismissed),
        unregistered: unregisteredSeries(
          series,
          (id) => id === "series:expense:ARS:netflix:monthly",
        ),
      });

      expect(item.kind).toBe("rise");
      expect(item.actionLabel).toBeUndefined();
    });

    it("leaves the other series alone", () => {
      const series = detect([...netflix, ...charges("Spotify", MONTHLY)]);
      const items = buildAttentionItems({
        ...CALM,
        rises: priceRises(series, nothingDismissed),
        unregistered: unregisteredSeries(series, nothingDismissed),
      });

      expect(items.map((item) => item.key)).toEqual([
        "rise:expense:ARS:netflix:monthly:5900",
        "series:expense:ARS:spotify:monthly",
      ]);
    });
  });
});
