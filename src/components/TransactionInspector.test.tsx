// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionInspector } from "./TransactionInspector";
import type { AppActions, AppData, AppStatus } from "@/context/AppDataContext";
import type {
  Category,
  CategoryRuleWithCategory,
  PaymentMethod,
  TransactionWithCategory,
} from "@/db";

type AppContext = AppData & AppActions & AppStatus;

// The inspector reads everything through this one hook, so replacing it is
// enough to drive it without a database or a Tauri runtime behind it.
const appData = vi.hoisted(() => ({ current: {} as AppContext }));

vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
  useAppActions: () => appData.current,
  useAppStatus: () => appData.current,
}));

// The receipts section talks to the database on its own; it has tests of its
// own, and here it only has to stay out of the way.
vi.mock("@/components/TransactionAttachments", () => ({
  TransactionAttachments: () => null,
}));

beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
  });
});

// Deliberately ordered so the category under test is never the first one: the
// bug these guard against always produced the first entry in the list, so a
// fixture that happened to use it would pass either way.
const CATEGORIES: Category[] = [
  { id: 1, name: "Bookit", type: "expense", color: "#000", icon: "📚" },
  { id: 2, name: "Gimnasio", type: "expense", color: "#111", icon: "🏋️" },
  { id: 3, name: "Padel", type: "expense", color: "#222", icon: "🎾" },
  { id: 4, name: "Abuelo", type: "income", color: "#333", icon: "👴" },
  { id: 5, name: "Venta", type: "income", color: "#444", icon: "🏷️" },
];

// One in dollars, so that a change of currency has an account it could land on.
const ACCOUNTS: PaymentMethod[] = [
  { id: 1, name: "Efectivo ARS", type: "cash", currency: "ARS", initial_balance: 0 },
  { id: 2, name: "Banco", type: "bank", currency: "ARS", initial_balance: 0 },
  { id: 3, name: "Banco USD", type: "bank", currency: "USD", initial_balance: 0 },
];

// A rule sending "netflix" to Gimnasio — deliberately not the first category.
const NETFLIX_TO_GIMNASIO = {
  id: 1,
  pattern: "netflix",
  category_id: 2,
  category_name: "Gimnasio",
  category_icon: "🏋️",
} as CategoryRuleWithCategory;

function aTransaction(
  overrides: Partial<TransactionWithCategory> = {},
): TransactionWithCategory {
  return {
    id: 10,
    amount: 50000,
    type: "expense",
    category_id: 3,
    payment_method_id: 1,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Mensual (abril)",
    date: "2025-05-15",
    currency: "ARS",
    category_name: "Padel",
    category_color: "#222",
    category_icon: "🎾",
    payment_method_name: "Efectivo ARS",
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  };
}

let editTransaction: ReturnType<typeof vi.fn>;

beforeEach(() => {
  editTransaction = vi.fn(() => Promise.resolve());
});

function renderInspector(
  transaction: TransactionWithCategory = aTransaction(),
  categoryRules: CategoryRuleWithCategory[] = [],
) {
  appData.current = {
    categories: CATEGORIES,
    categoryRules,
    tags: [],
    paymentMethods: ACCOUNTS,
    editTransaction,
  } as unknown as AppContext;

  const onClose = vi.fn();
  const result = render(
    <TransactionInspector transaction={transaction} onClose={onClose} />,
  );
  return { ...result, onClose };
}

// The option list is rendered into the DOM alongside the trigger, so matching
// on text alone finds the option too. Only the trigger says what is selected.
function selectedCategory(): string {
  return document.querySelector("#inspector-category")?.textContent?.trim() ?? "";
}

// Long enough for the pause the inspector waits before saving, and for the
// save after it.
const SAVES = { timeout: 3000 };

// What a pause in the typing would have given it: long enough to be sure that
// nothing was going to be saved.
function aPause() {
  return new Promise((settle) => setTimeout(settle, 900));
}

describe("TransactionInspector, opening a transaction", () => {
  it("shows the category the transaction actually has", () => {
    // The regression: opening a transaction for editing replaced its category
    // with the first one on the list, so saving silently reassigned it.
    renderInspector();

    expect(selectedCategory()).toContain("Padel");
  });

  it("shows the right category for an income too", () => {
    renderInspector(
      aTransaction({
        type: "income",
        category_id: 5,
        category_name: "Venta",
        description: "Ropa",
      }),
    );

    expect(selectedCategory()).toContain("Venta");
  });

  it("shows the rest of the transaction as it was saved", () => {
    renderInspector(aTransaction({ tag_names: "viaje" }));

    expect(screen.getByLabelText("Descripción")).toHaveValue("Mensual (abril)");
    expect(screen.getByLabelText("Monto")).toHaveValue(50000);
    expect(screen.getByText("viaje")).toBeInTheDocument();
  });

  // Only what the user changes is saved. The form adjusts itself — here it
  // settles the account of a row whose account was deleted, once the accounts
  // arrive — and saving that unasked would edit a row the user only looked at.
  it("saves nothing just for being open", async () => {
    const transaction = aTransaction({ payment_method_id: null });
    const { rerender } = renderInspector(transaction);
    appData.current = { ...appData.current, paymentMethods: [] };
    rerender(<TransactionInspector transaction={transaction} onClose={vi.fn()} />);

    appData.current = { ...appData.current, paymentMethods: ACCOUNTS };
    rerender(<TransactionInspector transaction={transaction} onClose={vi.fn()} />);
    await aPause();

    expect(editTransaction).not.toHaveBeenCalled();
    expect(screen.getByText("Los cambios se guardan solos")).toBeInTheDocument();
  });

  it("closes from its own button", async () => {
    const { onClose } = renderInspector();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("TransactionInspector, saving", () => {
  it("saves a change on its own once the typing stops", async () => {
    renderInspector();

    const amount = screen.getByLabelText("Monto");
    await userEvent.clear(amount);
    await userEvent.type(amount, "62000");

    await waitFor(() => expect(editTransaction).toHaveBeenCalled(), SAVES);
    // Once, with the finished figure — not once per keystroke.
    expect(editTransaction).toHaveBeenCalledExactlyOnceWith(
      10,
      {
        amount: 62000,
        type: "expense",
        currency: "ARS",
        categoryId: 3,
        paymentMethodId: 1,
        destinationPaymentMethodId: null,
        destinationAmount: null,
        description: "Mensual (abril)",
        date: "2025-05-15",
      },
      [],
    );
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
  });

  it("does not save a value the transaction cannot have, and says why", async () => {
    renderInspector();

    await userEvent.clear(screen.getByLabelText("Descripción"));

    expect(
      await screen.findByText("La descripción es obligatoria", {}, SAVES),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sin guardar hasta completar lo que falta"),
    ).toBeInTheDocument();
    expect(editTransaction).not.toHaveBeenCalled();
  });

  // An expense turned into a transfer is incomplete until it says where the
  // money went; saving it half-way would put a transfer with no destination
  // in the list.
  it("holds a change of type until the transaction is complete again", async () => {
    renderInspector();

    await userEvent.click(screen.getByLabelText("Tipo"));
    await userEvent.click(await screen.findByRole("option", { name: "Transferencia" }));

    expect(
      await screen.findByText(
        "Seleccioná la cuenta de destino",
        { selector: "p" },
        SAVES,
      ),
    ).toBeInTheDocument();
    expect(editTransaction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("Cuenta de destino"));
    await userEvent.click(await screen.findByRole("option", { name: "Banco (ARS)" }));

    await waitFor(() => expect(editTransaction).toHaveBeenCalledOnce(), SAVES);
    expect(editTransaction.mock.calls[0][1]).toMatchObject({
      type: "transfer",
      categoryId: null,
      destinationPaymentMethodId: 2,
      destinationAmount: 50000,
    });
  });

  // The account list only offers accounts in the transaction's currency.
  // Handing the change to the first account in the new one would pick an
  // account for the user, and saving it would move the movement there unasked.
  it("empties the account a new currency leaves behind, and waits for another", async () => {
    renderInspector();

    await userEvent.click(screen.getByLabelText("Moneda"));
    await userEvent.click(await screen.findByRole("option", { name: /Dólar/ }));

    expect(
      await screen.findByText("Seleccioná un método de pago", { selector: "p" }, SAVES),
    ).toBeInTheDocument();
    expect(editTransaction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("Método de pago"));
    await userEvent.click(await screen.findByRole("option", { name: "Banco USD" }));

    await waitFor(() => expect(editTransaction).toHaveBeenCalledOnce(), SAVES);
    expect(editTransaction.mock.calls[0][1]).toMatchObject({
      currency: "USD",
      paymentMethodId: 3,
    });
  });

  // base-ui's Select, once its list has been opened, answers a value that
  // drops out of its items by going back to the one it held when it mounted.
  // The inspector stays mounted from one row to the next, so that value is an
  // earlier row's account, and it came back as if the user had picked it.
  it("does not bring back an earlier row's account", async () => {
    const earlier = aTransaction({ id: 9, payment_method_id: 2 });
    const { rerender } = renderInspector(earlier);
    rerender(<TransactionInspector transaction={aTransaction()} onClose={vi.fn()} />);

    await userEvent.click(screen.getByLabelText("Método de pago"));
    await userEvent.keyboard("{Escape}");
    for (const currency of [/Dólar/, /Peso/]) {
      await userEvent.click(screen.getByLabelText("Moneda"));
      await userEvent.click(await screen.findByRole("option", { name: currency }));
    }
    await aPause();

    expect(document.querySelector("#inspector-payment-method")?.textContent).toContain(
      "Seleccioná un método de pago",
    );
    expect(editTransaction).not.toHaveBeenCalled();
  });

  it("saves what was still waiting when it closes", async () => {
    const { unmount } = renderInspector();

    await userEvent.type(screen.getByLabelText("Descripción"), " y mayo");
    unmount();

    await waitFor(() => expect(editTransaction).toHaveBeenCalledOnce(), SAVES);
    expect(editTransaction.mock.calls[0][1]).toMatchObject({
      description: "Mensual (abril) y mayo",
    });
  });
});

describe("TransactionInspector and category rules", () => {
  it("keeps the saved category when a rule of another category matches", async () => {
    // The regression: opening the transaction ran the rules over its saved
    // description, and saving then reassigned its category without a word.
    renderInspector(aTransaction({ description: "Netflix" }), [NETFLIX_TO_GIMNASIO]);

    await aPause();

    expect(selectedCategory()).toContain("Padel");
    expect(editTransaction).not.toHaveBeenCalled();
  });

  // Nothing records which rule chose a saved category, so the inspector says
  // what a rule would do and lets the user decide.
  it("says what a matching rule would do, and applies it on request", async () => {
    renderInspector(aTransaction({ description: "Netflix" }), [NETFLIX_TO_GIMNASIO]);

    expect(
      screen.getByText(/La regla «netflix» la pondría en Gimnasio/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Aplicarla" }));

    expect(selectedCategory()).toContain("Gimnasio");
    await waitFor(() => expect(editTransaction).toHaveBeenCalledOnce(), SAVES);
    expect(editTransaction.mock.calls[0][1]).toMatchObject({ categoryId: 2 });
  });

  it("says so when the category is the one the rule would choose", () => {
    renderInspector(
      aTransaction({ description: "Netflix", category_id: 2, category_name: "Gimnasio" }),
      [NETFLIX_TO_GIMNASIO],
    );

    expect(screen.getByText("Coincide con la regla «netflix».")).toBeInTheDocument();
  });

  it("applies the rules once the description changes", async () => {
    renderInspector(aTransaction({ description: "Cuota del club" }), [
      NETFLIX_TO_GIMNASIO,
    ]);

    const description = screen.getByLabelText("Descripción");
    await userEvent.clear(description);
    await userEvent.type(description, "Netflix");

    expect(selectedCategory()).toContain("Gimnasio");
  });
});
