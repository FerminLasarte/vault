// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TransactionsView } from "./TransactionsView";
import type { AppData } from "@/context/AppDataContext";
import type { TransactionWithCategory } from "@/db";

// The view reads everything through this one hook, so replacing it is enough to
// drive the component without a database or a Tauri runtime behind it.
const appData = vi.hoisted(() => ({ current: {} as AppData }));

vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
}));

beforeAll(() => {
  // Recharts and the popover primitives measure their container, which jsdom
  // does not implement.
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
  });
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
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: `Movimiento ${id}`,
    date: "2026-08-01",
    currency: "ARS",
    category_name: null,
    category_color: null,
    category_icon: null,
    payment_method_name: "Efectivo",
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  };
}

// The indicator renders as three JSX children ("1", " / ", "3"), so it reaches
// the DOM as separate text nodes and cannot be matched as one string.
function pageIndicator(): string {
  const element = screen.getByText((_, node) => {
    if (node === null) return false;
    return (
      /^\d+ \/ \d+$/.test(node.textContent?.trim() ?? "") && node.children.length === 0
    );
  });
  return element.textContent!.trim().replace(/\s+/g, " ");
}

function renderView(transactions: TransactionWithCategory[]) {
  appData.current = {
    transactions,
    categories: [],
    paymentMethods: [],
    categoryRules: [],
    tags: [],
    isLoading: false,
    isMutating: false,
    addTransaction: vi.fn(),
    editTransaction: vi.fn(),
    removeTransaction: vi.fn(),
  } as unknown as AppData;

  return render(
    <TransactionsView request={null} tab={null} onRequestHandled={vi.fn()} />,
  );
}

describe("TransactionsView and the Archivo menu", () => {
  // "Nueva transacción" chosen from another screen switches to this view and
  // hands it the request in the same render, so the view mounts with it
  // already pending. It used to count that request as handled on mount and
  // never open the dialog.
  it("opens the dialog for a request that was pending when it mounted", () => {
    renderView([]);
    const onRequestHandled = vi.fn();

    render(
      <TransactionsView
        request={{ action: "new-transaction", seq: 1 }}
        tab={null}
        onRequestHandled={onRequestHandled}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("Nueva transacción");
    expect(onRequestHandled).toHaveBeenCalledWith(1);
  });

  it("ignores an action meant for another view", () => {
    renderView([]);

    render(
      <TransactionsView
        request={{ action: "backup", seq: 1 }}
        tab={null}
        onRequestHandled={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("TransactionsView", () => {
  it("says so plainly when there is nothing to show", () => {
    renderView([]);
    expect(screen.getByText(/no hay transacciones/i)).toBeInTheDocument();
  });

  it("shows one page at a time and reports the real total", () => {
    // 120 rows over a page size of 50: the count in the footer must describe
    // the whole result set, not the slice on screen.
    renderView(Array.from({ length: 120 }, (_, index) => aTransaction(index + 1)));

    expect(screen.getByText(/120 transacciones/)).toBeInTheDocument();
    expect(pageIndicator()).toBe("1 / 3");
    expect(screen.getAllByRole("row")).toHaveLength(51); // 50 rows plus the header
  });

  it("moves between pages", async () => {
    const user = userEvent.setup();
    renderView(
      Array.from({ length: 120 }, (_, index) =>
        aTransaction(index + 1, { description: `Fila ${index + 1}` }),
      ),
    );

    expect(screen.getByText("Fila 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(pageIndicator()).toBe("2 / 3");
    expect(screen.queryByText("Fila 1")).not.toBeInTheDocument();
    expect(screen.getByText("Fila 51")).toBeInTheDocument();
  });

  it("returns to the first page when the search narrows the results", async () => {
    // The regression this guards: paging to the end, then filtering down to a
    // handful of rows, used to leave the table empty over a non-empty result.
    const user = userEvent.setup();
    renderView([
      ...Array.from({ length: 60 }, (_, index) =>
        aTransaction(index + 1, { description: `Relleno ${index + 1}` }),
      ),
      aTransaction(999, { description: "Alquiler" }),
    ]);

    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.type(screen.getByLabelText("Buscar"), "Alquiler");

    expect(screen.getByText("Alquiler")).toBeInTheDocument();
    expect(screen.getByText(/1 transacción/)).toBeInTheDocument();
  });

  it("filters by amount bounds", async () => {
    const user = userEvent.setup();
    renderView([
      aTransaction(1, { description: "Chico", amount: 500 }),
      aTransaction(2, { description: "Grande", amount: 50000 }),
    ]);

    await user.type(screen.getByLabelText(/monto mínimo/i), "1000");

    expect(screen.queryByText("Chico")).not.toBeInTheDocument();
    expect(screen.getByText("Grande")).toBeInTheDocument();
  });

  it("shows both legs of a cross-currency transfer", () => {
    renderView([
      aTransaction(1, {
        type: "transfer",
        description: "Compra de dólares",
        amount: 145000,
        currency: "ARS",
        destination_amount: 100,
        destination_currency: "USD",
        destination_payment_method_name: "Dólares",
      }),
    ]);

    const row = screen.getByText("Compra de dólares").closest("tr")!;
    // Intl separates the figure from the currency with a non-breaking space,
    // which is invisible in a diff and would make this fail for no real reason.
    const text = row.textContent!.replace(/\u00a0/g, " ");

    // Showing only the pesos leg would misrepresent what actually moved.
    expect(text).toContain("$ 145.000,00");
    expect(text).toContain("US$ 100,00");
  });
});
