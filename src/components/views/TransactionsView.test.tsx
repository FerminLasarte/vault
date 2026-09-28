// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionsView } from "./TransactionsView";
import type { AppActions, AppData, AppStatus } from "@/context/AppDataContext";
import { ViewStateProvider } from "@/context/ViewStateContext";

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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

beforeAll(() => {
  // Recharts and the popover primitives measure their container, which jsdom
  // does not implement.
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
  });
});

const TODAY = "2026-09-28";

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

function renderView(
  transactions: TransactionWithCategory[],
  actions: Partial<AppActions> = {},
  data: Partial<AppData> = {},
) {
  appData.current = {
    transactions,
    categories: [{ id: 3, name: "Super", type: "expense", color: "#000", icon: "🛒" }],
    paymentMethods: [
      { id: 1, name: "Efectivo", type: "cash", currency: "ARS", initial_balance: 0 },
    ],
    categoryRules: [],
    tags: [],
    today: TODAY,
    isLoading: false,
    isMutating: false,
    addTransaction: vi.fn(),
    editTransaction: vi.fn(),
    removeTransaction: vi.fn(),
    ...data,
    ...actions,
  } as unknown as AppContext;

  // The provider stands for App, which outlives every view: `leave` and
  // `comeBack` swap the view out of it and back in, as the sidebar does.
  const result = render(
    <TransactionsView request={null} tab={null} onRequestHandled={vi.fn()} />,
    { wrapper: ViewStateProvider },
  );

  return {
    ...result,
    leave: () => result.rerender(<p>Ajustes</p>),
    comeBack: () =>
      result.rerender(
        <TransactionsView request={null} tab={null} onRequestHandled={vi.fn()} />,
      ),
  };
}

// A row the edit dialog can save as it opens: the form insists on an account
// and, for an expense, on a category.
function anEditable(
  id: number,
  overrides: Partial<TransactionWithCategory> = {},
): TransactionWithCategory {
  return aTransaction(id, {
    payment_method_id: 1,
    payment_method_name: "Efectivo",
    category_id: 3,
    category_name: "Super",
    ...overrides,
  });
}

// Saving from the edit dialog, with the database's answer standing in: the
// action resolves once the list has been read back, so the new list is in
// place by the time the view hears about it.
async function editAndSave(
  user: ReturnType<typeof userEvent.setup>,
  description: string,
  written: (transactions: TransactionWithCategory[]) => TransactionWithCategory[],
) {
  vi.mocked(appData.current.editTransaction).mockImplementation(() => {
    appData.current = {
      ...appData.current,
      transactions: written(appData.current.transactions),
    };
    return Promise.resolve();
  });

  await user.click(screen.getByRole("button", { name: `Editar ${description}` }));
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
}

function successToast() {
  return vi.mocked(toast.success).mock.calls.at(-1);
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
      { wrapper: ViewStateProvider },
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
      { wrapper: ViewStateProvider },
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

describe("TransactionsView when the user comes back to it", () => {
  // Going to Ajustes and back used to rebuild the view from scratch: page one,
  // no search, no filters, under a scroll position remembered from the list
  // that was really there.
  it("is on the page, search and filters it was left with", async () => {
    const user = userEvent.setup();
    const view = renderView(
      Array.from({ length: 120 }, (_, index) =>
        aTransaction(index + 1, { description: `Fila ${index + 1}`, amount: 500 }),
      ),
    );

    await user.type(screen.getByLabelText("Buscar"), "Fila");
    await user.type(screen.getByLabelText(/monto mínimo/i), "100");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(pageIndicator()).toBe("2 / 3");

    view.leave();
    view.comeBack();

    expect(pageIndicator()).toBe("2 / 3");
    expect(screen.getByLabelText("Buscar")).toHaveValue("Fila");
    expect(screen.getByLabelText(/monto mínimo/i)).toHaveValue(100);
  });

  it("is on the currency it was left on", async () => {
    const user = userEvent.setup();
    const view = renderView([
      aTransaction(1, { description: "En pesos" }),
      aTransaction(2, { description: "En dólares", currency: "USD" }),
    ]);

    await user.click(screen.getByRole("tab", { name: "USD" }));
    view.leave();
    view.comeBack();

    expect(screen.getByText("En dólares")).toBeInTheDocument();
    expect(screen.queryByText("En pesos")).not.toBeInTheDocument();
  });
});

describe("TransactionsView after a write", () => {
  // The table sorts by date, so a row that was just written can land on any
  // page, and the filters can leave it out altogether. Saving has to answer
  // "where did it go" wherever that is.
  it("goes to the page the row landed on and brings it into view", async () => {
    const user = userEvent.setup();
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    renderView(Array.from({ length: 120 }, (_, index) => anEditable(index + 1)));

    // Re-dated so that seventy rows now sort above it: page two.
    await editAndSave(user, "Movimiento 1", ([edited, ...rest]) => [
      ...rest.slice(0, 70),
      { ...edited, date: "2026-01-01" },
      ...rest.slice(70),
    ]);

    expect(pageIndicator()).toBe("2 / 3");
    const row = screen.getByText("Movimiento 1").closest("tr");
    expect(row).toHaveClass("just-written");
    expect(scrolled.mock.contexts).toContain(row);
    expect(successToast()).toEqual(["Transacción actualizada", undefined]);
  });

  it("says so when the filters hide it, and clears them on request", async () => {
    const user = userEvent.setup();
    renderView([anEditable(1), anEditable(2), anEditable(3)]);

    await user.type(screen.getByLabelText("Buscar"), "Movimiento 1");
    await editAndSave(user, "Movimiento 1", ([edited, ...rest]) => [
      { ...edited, description: "Kiosco" },
      ...rest,
    ]);

    expect(screen.queryByText("Kiosco")).not.toBeInTheDocument();
    const [message, options] = successToast()!;
    expect(message).toBe("Transacción actualizada");
    expect(options).toMatchObject({
      description: "Los filtros activos la ocultan.",
      action: { label: "Limpiar filtros" },
    });

    act(() => clickAction(options));

    expect(screen.getByLabelText("Buscar")).toHaveValue("");
    expect(screen.getByText("Kiosco").closest("tr")).toHaveClass("just-written");
  });

  it("switches to its currency when that is what hides it", async () => {
    // The currency is not one of the filters "Limpiar filtros" empties in the
    // bar — there is always one — but a row in dollars stays out of sight on
    // the pesos tab however many filters are cleared.
    const user = userEvent.setup();
    renderView([anEditable(1), anEditable(2)]);

    await editAndSave(user, "Movimiento 1", ([edited, ...rest]) => [
      { ...edited, currency: "USD" },
      ...rest,
    ]);

    expect(screen.queryByText("Movimiento 1")).not.toBeInTheDocument();

    act(() => clickAction(successToast()![1]));

    expect(screen.getByRole("tab", { name: "USD" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Movimiento 1")).toBeInTheDocument();
  });
});

describe("The quick entry", () => {
  const SUPER_RULE = { categoryRules: [{ id: 1, pattern: "super", category_id: 3 }] };

  function quickEntry() {
    return screen.getByRole("textbox", { name: "Carga rápida" });
  }

  it("shows what it understood before anything is saved", async () => {
    const user = userEvent.setup();
    renderView([], {}, SUPER_RULE as Partial<AppData>);

    await user.type(quickEntry(), "super 2500");

    const reading = screen.getByText(/por la regla «super»/).closest("p")!;
    expect(reading).toHaveTextContent("Gasto");
    expect(reading).toHaveTextContent("«super»");
    expect(reading).toHaveTextContent("Super, por la regla «super»");
    expect(reading).toHaveTextContent("Efectivo, por defecto");
    expect(screen.getByText("Enter guarda · Tab abre el formulario")).toBeInTheDocument();
  });

  // The form's submit tells creating from editing by `editing`, which is still
  // set after the edit dialog closes. Going through it, Enter here would have
  // rewritten the row edited last instead of adding a new one.
  it("adds a new movement on Enter, even right after a row was edited", async () => {
    const user = userEvent.setup();
    const addTransaction = vi.fn(() => Promise.resolve(99));
    renderView([anEditable(1)], { addTransaction }, SUPER_RULE as Partial<AppData>);

    await editAndSave(user, "Movimiento 1", (transactions) => transactions);
    await user.type(quickEntry(), "super 2500{Enter}");

    expect(addTransaction).toHaveBeenCalledExactlyOnceWith(
      {
        amount: 2500,
        type: "expense",
        categoryId: 3,
        paymentMethodId: 1,
        destinationPaymentMethodId: null,
        destinationAmount: null,
        description: "super",
        date: TODAY,
        currency: "ARS",
      },
      [],
    );
    expect(appData.current.editTransaction).toHaveBeenCalledOnce();
    expect(quickEntry()).toHaveValue("");
  });

  it("hands the line to the whole form on Tab, filled in", async () => {
    const user = userEvent.setup();
    renderView([], {}, SUPER_RULE as Partial<AppData>);

    await user.type(quickEntry(), "super 2500 ayer");
    await user.keyboard("{Tab}");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Nueva transacción");
    expect(screen.getByLabelText("Descripción")).toHaveValue("super");
    expect(screen.getByLabelText("Monto")).toHaveValue(2500);
  });

  // Nothing to save yet, so Enter goes where the gap can be filled.
  it("sends a line with something missing to the form on Enter", async () => {
    const user = userEvent.setup();
    const addTransaction = vi.fn(() => Promise.resolve(99));
    renderView([], { addTransaction });

    await user.type(quickEntry(), "almuerzo 2500");
    expect(screen.getByText("Sin categoría")).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(addTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Nueva transacción");
  });

  it("empties the line on Escape", async () => {
    const user = userEvent.setup();
    renderView([]);

    await user.type(quickEntry(), "super 2500{Escape}");

    expect(quickEntry()).toHaveValue("");
  });
});

function clickAction(options: unknown) {
  const { action } = options as { action: { onClick: (event: unknown) => void } };
  action.onClick({});
}
