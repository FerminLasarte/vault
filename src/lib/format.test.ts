import { describe, expect, it } from "vitest";
import {
  formatCompactAmount,
  formatCurrency,
  formatDate,
  formatMonthLabel,
  formatPercent,
} from "@/lib/format";

// Intl separates the number from its unit with a non-breaking space, and that
// matters here: it is what stops a chart tick from wrapping mid-label.
const NBSP = "\u00a0";

describe("formatCurrency", () => {
  it("writes pesos and dollars the Argentine way", () => {
    expect(formatCurrency(1234.5, "ARS")).toBe(`$${NBSP}1.234,50`);
    expect(formatCurrency(1234.5, "USD")).toBe(`US$${NBSP}1.234,50`);
  });

  it("groups thousands from four digits on, not five", () => {
    expect(formatCurrency(1234.5, "ARS")).toContain("1.234");
    expect(formatCurrency(12345.5, "ARS")).toContain("12.345");
  });

  it("puts the sign before the symbol", () => {
    expect(formatCurrency(-1234.5, "USD")).toBe(`-US$${NBSP}1.234,50`);
  });

  it("keeps each currency's formatter apart", () => {
    expect(formatCurrency(1, "ARS")).toBe(`$${NBSP}1,00`);
    expect(formatCurrency(1, "USD")).toBe(`US$${NBSP}1,00`);
    expect(formatCurrency(1, "ARS")).toBe(`$${NBSP}1,00`);
  });
});

describe("formatPercent", () => {
  it("keeps one decimal, in the Argentine form", () => {
    expect(formatPercent(0.275)).toBe("27,5%");
  });
});

// Dates and chart ticks deliberately stay on es-ES (see src/lib/format.ts).
describe("dates", () => {
  it("abbreviates the month without a \u00abde\u00bb", () => {
    expect(formatDate("2026-09-05")).toBe("05 sept 2026");
  });

  it("names whole months", () => {
    expect(formatMonthLabel("2026-09")).toBe("Septiembre de 2026");
    expect(formatMonthLabel("2026-09", "short")).toBe("sept 2026");
  });
});

describe("formatCompactAmount", () => {
  it("leaves small numbers alone", () => {
    expect(formatCompactAmount(0)).toBe("0");
    expect(formatCompactAmount(500)).toBe("500");
  });

  it("abbreviates thousands", () => {
    expect(formatCompactAmount(8000)).toBe(`8${NBSP}mil`);
    expect(formatCompactAmount(450000)).toBe(`450${NBSP}mil`);
  });

  it("abbreviates millions", () => {
    expect(formatCompactAmount(1200000)).toBe(`1,2${NBSP}M`);
  });

  it("keeps at most one decimal so a tick never grows unbounded", () => {
    expect(formatCompactAmount(12345)).toBe(`12,3${NBSP}mil`);
  });

  it("joins the number and unit with a non-breaking space", () => {
    expect(formatCompactAmount(8000)).toContain(NBSP);
    expect(formatCompactAmount(8000)).not.toContain(" ");
  });

  it("handles negatives", () => {
    expect(formatCompactAmount(-8000)).toBe(`-8${NBSP}mil`);
  });
});
