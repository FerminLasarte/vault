import { describe, expect, it } from "vitest";
import type { Category, PaymentMethod } from "@/db/schema";
import { formatCurrency } from "@/lib/format";
import { parseSearchQuery, withoutChips, type SearchContext } from "./searchQuery";

// A Tuesday in October.
const TODAY = "2026-10-06";

function aCategory(id: number, name: string, type: Category["type"]): Category {
  return { id, name, type, color: "", icon: "" };
}

function anAccount(id: number, name: string, currency = "ARS"): PaymentMethod {
  return { id, name, type: "cash", currency, initial_balance: 0 };
}

const CONTEXT: SearchContext = {
  today: TODAY,
  categories: [
    aCategory(1, "Comida", "expense"),
    aCategory(2, "Comida rápida", "expense"),
    aCategory(3, "Sueldo", "income"),
    aCategory(4, "Otros", "expense"),
    aCategory(5, "Otros", "income"),
  ],
  paymentMethods: [
    anAccount(1, "Mercado Pago"),
    anAccount(2, "Efectivo ARS"),
    anAccount(3, "Efectivo USD", "USD"),
    anAccount(4, "Visa"),
  ],
  tags: [{ id: 1, name: "Viaje" }],
  currency: "ARS",
};

function parse(text: string) {
  return parseSearchQuery(text, CONTEXT);
}

function labels(text: string) {
  return parse(text).chips.map((chip) => chip.label);
}

describe("parseSearchQuery", () => {
  it("reads the example the plan was written around", () => {
    const parsed = parse("comida en agosto más de 5000");

    expect(parsed.filters).toMatchObject({
      categoryId: 1,
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      minAmount: 5000,
      maxAmount: null,
    });
    expect(parsed.rest).toBe("");
    expect(parsed.chips.map((chip) => chip.label)).toEqual([
      "Categoría Comida",
      "Agosto de 2026",
      `Desde ${formatCurrency(5000, "ARS")}`,
    ]);
  });

  it("leaves a query with nothing it understands exactly as it was", () => {
    expect(parse("  pago de luz ")).toMatchObject({ rest: "  pago de luz ", chips: [] });
  });

  it("keeps what it does not understand as text, joining words included", () => {
    expect(parse("pago de luz en agosto").rest).toBe("pago de luz");
  });

  describe("periods", () => {
    it("takes a month with no year as the last time it came round", () => {
      expect(parse("octubre").filters.dateFrom).toBe("2026-10-01");
      expect(parse("noviembre").filters).toMatchObject({
        dateFrom: "2025-11-01",
        dateTo: "2025-11-30",
      });
    });

    it("reads a year after the month, with or without «de»", () => {
      expect(parse("agosto 2024").filters.dateFrom).toBe("2024-08-01");
      expect(parse("febrero de 2024").filters.dateTo).toBe("2024-02-29");
      expect(labels("febrero de 2024")).toEqual(["Febrero de 2024"]);
    });

    it("reads months and years relative to today", () => {
      expect(parse("el mes pasado").filters).toMatchObject({
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
      });
      expect(parse("este mes").filters.dateFrom).toBe("2026-10-01");
      expect(parse("este año").filters).toMatchObject({
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      });
      expect(parse("el año pasado").filters.dateFrom).toBe("2025-01-01");
    });

    it("crosses the year back for last month in January", () => {
      expect(
        parseSearchQuery("mes pasado", { ...CONTEXT, today: "2026-01-15" }).filters,
      ).toMatchObject({ dateFrom: "2025-12-01", dateTo: "2025-12-31" });
    });

    it("reads a single day the way the quick entry does", () => {
      expect(parse("ayer").filters).toMatchObject({
        dateFrom: "2026-10-05",
        dateTo: "2026-10-05",
      });
      expect(parse("15/9").filters.dateFrom).toBe("2026-09-15");
    });
  });

  describe("amounts", () => {
    it("reads at least, at most and a range", () => {
      expect(parse("más de 2k").filters.minAmount).toBe(2000);
      expect(parse("menos de 1.500,50").filters.maxAmount).toBe(1500.5);
      expect(parse("entre 5000 y 1000").filters).toMatchObject({
        minAmount: 1000,
        maxAmount: 5000,
      });
      expect(labels("entre 1000 y 5000")).toEqual([
        `Entre ${formatCurrency(1000, "ARS")} y ${formatCurrency(5000, "ARS")}`,
      ]);
    });

    it("reads a comparison sign, stuck to the figure or not", () => {
      expect(parse(">5000").filters.minAmount).toBe(5000);
      expect(parse("< 300").filters.maxAmount).toBe(300);
    });

    it("leaves a bare number as text", () => {
      expect(parse("cuota 3 de 12")).toMatchObject({ rest: "cuota 3 de 12", chips: [] });
    });

    it("takes the currency written with the figure", () => {
      expect(parse("más de us$100").filters).toMatchObject({
        minAmount: 100,
        currency: "USD",
      });
      expect(labels("más de us$100")).toEqual([`Desde ${formatCurrency(100, "USD")}`]);
    });
  });

  describe("kinds and currencies", () => {
    it("reads a kind in the plural", () => {
      expect(parse("ingresos").filters.type).toBe("income");
      expect(parse("gastos").filters.type).toBe("expense");
      expect(parse("transferencias").filters.type).toBe("transfer");
    });

    it("leaves the singular as text, the way banks write it", () => {
      expect(parse("transferencia recibida").chips).toEqual([]);
    });

    it("reads a currency", () => {
      expect(parse("en dólares").filters.currency).toBe("USD");
      expect(labels("en dólares")).toEqual(["En dólares"]);
    });
  });

  describe("categories", () => {
    it("reads a category by its whole name, the longest first", () => {
      expect(parse("comida rápida").filters.categoryId).toBe(2);
      expect(parse("comida").filters.categoryId).toBe(1);
      expect(parse("comidas")).toMatchObject({ rest: "comidas", chips: [] });
    });

    it("reads a name two categories share only when the kind tells them apart", () => {
      expect(parse("otros").filters.categoryId).toBeNull();
      expect(parse("ingresos otros").filters.categoryId).toBe(5);
    });
  });

  describe("accounts", () => {
    it("reads an account only after con, en or desde", () => {
      expect(parse("con mp").filters.paymentMethodId).toBe(1);
      expect(parse("en mercado pago").filters.paymentMethodId).toBe(1);
      expect(parse("desde visa").filters.paymentMethodId).toBe(4);
      expect(parse("mercado pago").filters.paymentMethodId).toBeNull();
    });

    it("tells two accounts apart by the currency asked for", () => {
      expect(parse("en efectivo").filters.paymentMethodId).toBe(2);
      expect(parse("en efectivo en dólares").filters.paymentMethodId).toBe(3);
    });
  });

  it("reads a tag that exists", () => {
    expect(parse("#viaje").filters.tag).toBe("Viaje");
    expect(parse("#otro")).toMatchObject({ rest: "#otro", chips: [] });
  });

  it("reads one of each, and leaves a second one as text", () => {
    const parsed = parse("agosto septiembre");

    expect(parsed.filters.dateFrom).toBe("2026-08-01");
    expect(parsed.rest).toBe("septiembre");
  });
});

describe("withoutChips", () => {
  it("takes away the words a chip was read from, joining words included", () => {
    const text = "comida en agosto más de 5000";
    const [, august] = parseSearchQuery(text, CONTEXT).chips;

    expect(withoutChips(text, [august])).toBe("comida más de 5000");
  });

  it("takes away what sets the currency, wherever it was written", () => {
    const text = "comida en dólares más de us$100";
    const { chips } = parseSearchQuery(text, CONTEXT);

    expect(
      withoutChips(
        text,
        chips.filter((chip) => chip.setsCurrency),
      ),
    ).toBe("comida");
  });
});
