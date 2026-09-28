// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetWorthBar } from "./NetWorthBar";
import type { NetWorth } from "@/lib/netWorth";

const HOLDINGS = new Map([
  ["ARS", 500000],
  ["USD", 100],
]);

function renderBar(worth: Partial<NetWorth>, convertedNet: number | null = 400) {
  render(
    <NetWorthBar
      holdings={HOLDINGS}
      worth={{ gross: 600000, debt: 0, receivable: 0, net: 600000, ...worth }}
      convertedNet={convertedNet}
      currency="ARS"
      convertedCurrency="USD"
      isLoading={false}
    />,
  );
}

// The query collapses the non-breaking space es-AR puts after the sign, so the
// amounts are written out with a plain one.
describe("NetWorthBar", () => {
  it("leads with the net worth, and the other currency under it", () => {
    renderBar({ net: 480000, debt: 120000 });

    expect(screen.getByText("Patrimonio neto")).toBeTruthy();
    expect(screen.getByText("$ 480.000,00")).toBeTruthy();
    expect(screen.getByText("≈ US$ 400,00")).toBeTruthy();
  });

  it("breaks it down into what is held in each currency", () => {
    renderBar({});

    expect(screen.getByText("$ 500.000,00")).toBeTruthy();
    expect(screen.getByText("US$ 100,00")).toBeTruthy();
  });

  it("leaves the debt and what is owed out when there is none", () => {
    renderBar({});
    expect(screen.queryByText("Deuda pendiente")).toBeNull();
    expect(screen.queryByText("Te deben")).toBeNull();
  });

  it("shows the debt and what is owed as parts of the net worth", () => {
    renderBar({ debt: 120000, receivable: 30000, net: 510000 });

    expect(screen.getByText("Deuda pendiente")).toBeTruthy();
    expect(screen.getByText("$ 120.000,00")).toBeTruthy();
    expect(screen.getByText("Te deben")).toBeTruthy();
    expect(screen.getByText("$ 30.000,00")).toBeTruthy();
  });

  // A total that quietly left the dollars out would look right and be wrong.
  it("shows no net worth without a quote, and says how to get one", () => {
    renderBar({ gross: null, net: null }, null);

    expect(screen.getByText("—")).toBeTruthy();
    expect(
      screen.getByText("Traé una cotización para sumar las dos monedas"),
    ).toBeTruthy();
  });
});
