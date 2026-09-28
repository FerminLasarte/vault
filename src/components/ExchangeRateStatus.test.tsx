// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExchangeRateStatus } from "./ExchangeRateStatus";
import { formatDate } from "@/lib/format";
import type { AppActions, AppData, AppStatus } from "@/context/AppDataContext";
import type { ExchangeRate } from "@/db";

type AppContext = AppData & AppActions & AppStatus;

// The component reads everything through this one hook, so replacing it is
// enough to drive it without a database or a Tauri runtime behind it.
const appData = vi.hoisted(() => ({ current: {} as AppContext }));

vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
  useAppActions: () => appData.current,
  useAppStatus: () => appData.current,
}));

const RATE: ExchangeRate = {
  date: "2026-09-26",
  rate_type: "bolsa",
  buy: 1180,
  sell: 1234.5,
  source: "dolarapi:bolsa",
  fetched_at: "2026-09-26T12:00:00Z",
};

function renderStatus({
  exchangeRate = RATE,
  isRefreshingRate = false,
}: { exchangeRate?: ExchangeRate | null; isRefreshingRate?: boolean } = {}) {
  const refreshExchangeRate = vi.fn(() => Promise.resolve());
  appData.current = {
    rateType: "bolsa",
    exchangeRate,
    isRefreshingRate,
    refreshExchangeRate,
    saveManualExchangeRate: vi.fn(() => Promise.resolve()),
  } as unknown as AppContext;
  render(<ExchangeRateStatus />);
  return { refreshExchangeRate };
}

describe("ExchangeRateStatus", () => {
  it("shows which quote it is, its selling price and its date", () => {
    renderStatus();

    expect(screen.getByText("Dólar MEP (bolsa)")).toBeTruthy();
    // Written out rather than built with formatCurrency: the query collapses the
    // non-breaking space es-AR puts after the sign, and the literal says so.
    expect(screen.getByText("$ 1.234,50")).toBeTruthy();
    expect(screen.getByText(formatDate("2026-09-26"))).toBeTruthy();
  });

  it("says when the quote was entered by hand", () => {
    renderStatus({ exchangeRate: { ...RATE, source: "manual" } });

    expect(screen.getByText(`${formatDate("2026-09-26")} · cargada a mano`)).toBeTruthy();
  });

  // Without a quote the totals that need one read "—", so the one place that
  // explains why has to say how to get one.
  it("explains how to get a quote when there is none", () => {
    renderStatus({ exchangeRate: null });

    expect(screen.getByText("Sin cotización")).toBeTruthy();
    expect(screen.getByText("Conectate a internet o cargala a mano.")).toBeTruthy();
  });

  it("refreshes the quote when asked", () => {
    const { refreshExchangeRate } = renderStatus();

    fireEvent.click(screen.getByRole("button", { name: "Actualizar cotización" }));
    expect(refreshExchangeRate).toHaveBeenCalledOnce();
  });

  it("disables refreshing while a refresh is under way", () => {
    renderStatus({ isRefreshingRate: true });

    expect(screen.getByRole("button", { name: "Actualizar cotización" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
