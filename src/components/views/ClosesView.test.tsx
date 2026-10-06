// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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

// Printing goes through a Tauri command, which does not exist here.
const printWindow = vi.hoisted(() => vi.fn());

vi.mock(import("@/lib/files"), async (importOriginal) => ({
  ...(await importOriginal()),
  printWindow,
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
    category_suggested: 0,
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

function renderView(transactions: TransactionWithCategory[], aiEnabled = false) {
  // Pinned so "closed" means the same months whenever the suite runs.
  vi.useFakeTimers({ now: new Date(2026, 8, 14), toFake: ["Date"] });
  appData.current = {
    transactions,
    categories: [],
    recurring: [],
    installmentPlans: [],
    loans: [],
    aiEnabled,
    isLoading: false,
  } as unknown as AppContext;
  return render(<ClosesView />);
}

// Amounts come with a non-breaking space after the sign.
const plain = (text: string | null | undefined) => text?.replace(/\u00a0/g, " ");

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

  // The print panel suggests the document title as the PDF's file name, so
  // without this every close was offered as "Vault.pdf".
  it("names the PDF after the month it closes", () => {
    printWindow.mockResolvedValue(undefined);

    renderView([aTransaction(1, { date: "2026-08-05" })]);
    fireEvent.click(screen.getByRole("button", { name: /Guardar como PDF/ }));

    expect(printWindow).toHaveBeenCalledExactlyOnceWith(
      "Vault - Cierre de agosto de 2026",
    );
  });

  describe("with the local AI on", () => {
    const month = [
      aTransaction(1, { date: "2026-08-01", type: "income", amount: 100000 }),
      aTransaction(2, { date: "2026-08-05", amount: 60000 }),
    ];

    it("narrates a month under its row, and only while it is open", () => {
      renderView(month, true);
      const toggle = screen.getByRole("button", {
        name: /Ver resumen de Agosto de 2026/,
      });

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(plain(screen.getByText(/te quedaron|a favor/).textContent)).toContain(
        "$ 40.000,00",
      );

      fireEvent.click(toggle);

      expect(screen.queryByText(/te quedaron|a favor/)).not.toBeInTheDocument();
    });

    it("puts the sentences on top of the printed close", () => {
      printWindow.mockResolvedValue(undefined);
      renderView(month, true);

      fireEvent.click(screen.getByRole("button", { name: /Guardar como PDF/ }));

      expect(screen.getByText("En pocas palabras")).toBeInTheDocument();
    });
  });

  it("offers no narrative with the local AI off", () => {
    printWindow.mockResolvedValue(undefined);
    renderView([aTransaction(1, { date: "2026-08-05" })]);

    fireEvent.click(screen.getByRole("button", { name: /Guardar como PDF/ }));

    expect(screen.queryByRole("button", { name: /Ver resumen/ })).not.toBeInTheDocument();
    expect(screen.queryByText("En pocas palabras")).not.toBeInTheDocument();
  });
});
