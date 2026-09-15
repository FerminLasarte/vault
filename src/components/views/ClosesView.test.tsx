// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClosesView } from "./ClosesView";
import type { AppActions, AppData, AppStatus } from "@/context/AppDataContext";

// The provider's three halves, read here from one object.
type AppContext = AppData & AppActions & AppStatus;
import type { TransactionWithCategory } from "@/db";

// The view reads everything through this one hook, so replacing it is enough to
// drive the component without a database or a Tauri runtime behind it.
const appData = vi.hoisted(() => ({ current: {} as AppContext }));

vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
  useAppActions: () => appData.current,
  useAppStatus: () => appData.current,
}));

afterEach(() => {
  vi.useRealTimers();
});

function aTransaction(
  id: number,
  overrides: Partial<TransactionWithCategory> = {},
): TransactionWithCategory {
  return {
    id,
    amount: 1000,
    type: "expense",
    category_id: null,
    payment_method_id: 1,
    destination_payment_method_id: null,
    destination_amount: null,
    description: `Movimiento ${id}`,
    date: "2026-07-10",
    currency: "ARS",
    category_name: null,
    category_color: null,
    category_icon: null,
    payment_method_name: "Banco",
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  };
}

function renderView(transactions: TransactionWithCategory[]) {
  // Pinned so "closed" means the same months whenever the suite runs.
  vi.useFakeTimers({ now: new Date(2026, 8, 14), toFake: ["Date"] });
  appData.current = { transactions, isLoading: false } as unknown as AppContext;
  return render(<ClosesView />);
}

describe("ClosesView", () => {
  it("opens when a closed month only moved money between accounts", () => {
    renderView([
      aTransaction(1, { date: "2026-08-05" }),
      aTransaction(2, {
        date: "2026-07-10",
        type: "transfer",
        destination_payment_method_id: 2,
        destination_payment_method_name: "Efectivo",
      }),
    ]);

    expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.queryByText("Julio de 2026")).not.toBeInTheDocument();
  });

  it("skips a month whose movements add up to nothing rather than crashing", () => {
    // An expense of zero counts as a movement but leaves no totals to show.
    renderView([
      aTransaction(1, { date: "2026-08-05" }),
      aTransaction(2, { date: "2026-07-10", amount: 0 }),
    ]);

    expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.queryByText("Julio de 2026")).not.toBeInTheDocument();
  });
});
