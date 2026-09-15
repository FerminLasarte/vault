// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TransactionDialog } from "./TransactionDialog";
import type {
  Category,
  CategoryRuleWithCategory,
  PaymentMethod,
  TransactionWithCategory,
} from "@/db";

beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
  });
});

// Deliberately ordered so the category under test is never the first one: the
// bug this guards against always produced the first entry in the list, so a
// fixture that happened to use it would pass either way.
const CATEGORIES: Category[] = [
  { id: 1, name: "Bookit", type: "expense", color: "#000", icon: "📚" },
  { id: 2, name: "Gimnasio", type: "expense", color: "#111", icon: "🏋️" },
  { id: 3, name: "Padel", type: "expense", color: "#222", icon: "🎾" },
  { id: 4, name: "Abuelo", type: "income", color: "#333", icon: "👴" },
  { id: 5, name: "Venta", type: "income", color: "#444", icon: "🏷️" },
];

const ACCOUNTS: PaymentMethod[] = [
  { id: 1, name: "Efectivo ARS", type: "cash", currency: "ARS", initial_balance: 0 },
];

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

// The option list is rendered into the DOM alongside the trigger, so matching
// on text alone finds the option too. Only the trigger says what is *selected*.
// Looked up in the document rather than the render container: the dialog is
// portalled to the end of <body>.
function selectedCategory(): string {
  const trigger = document.querySelector("#transaction-category");
  return trigger?.textContent?.trim() ?? "";
}

function renderDialog(
  editing: TransactionWithCategory | null,
  handlers: {
    onOpenChange?: (open: boolean) => void;
    onSubmitTransaction?: () => Promise<void>;
    categoryRules?: CategoryRuleWithCategory[];
  } = {},
) {
  return render(
    <TransactionDialog
      open
      onOpenChange={handlers.onOpenChange ?? vi.fn()}
      editing={editing}
      categories={CATEGORIES}
      categoryRules={handlers.categoryRules ?? []}
      tags={[]}
      paymentMethods={ACCOUNTS}
      defaultCurrency="ARS"
      onSubmitTransaction={handlers.onSubmitTransaction ?? vi.fn()}
    />,
  );
}

describe("TransactionDialog when editing", () => {
  it("shows the category the transaction actually has", () => {
    // The regression: opening a transaction for editing replaced its category
    // with the first one on the list, so saving silently reassigned it.
    renderDialog(aTransaction());

    expect(selectedCategory()).toContain("Padel");
    expect(selectedCategory()).not.toContain("Bookit");
  });

  it("shows the right category for an income too", () => {
    // Income reads from a different list, and the stale value it was compared
    // against came from the expense one.
    renderDialog(
      aTransaction({
        type: "income",
        category_id: 5,
        category_name: "Venta",
        description: "Ropa",
      }),
    );

    expect(selectedCategory()).toContain("Venta");
    expect(selectedCategory()).not.toContain("Abuelo");
  });

  it("keeps the rest of the transaction intact", () => {
    renderDialog(aTransaction({ tag_names: "viaje" }));

    expect(screen.getByDisplayValue("Mensual (abril)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50000")).toBeInTheDocument();
    expect(screen.getByText("viaje")).toBeInTheDocument();
  });

  it("still defaults to a usable category when creating", () => {
    // The repair is what gives a new transaction a sensible starting category;
    // fixing the edit case must not cost that.
    renderDialog(null);

    expect(selectedCategory()).toContain("Bookit");
  });
});

// A rule sending "netflix" to Gimnasio — deliberately not the first category,
// which the form would pick on its own anyway.
const NETFLIX_TO_GIMNASIO = {
  id: 1,
  pattern: "netflix",
  category_id: 2,
  category_name: "Gimnasio",
  category_icon: "🏋️",
} as CategoryRuleWithCategory;

describe("TransactionDialog and category rules", () => {
  it("keeps the saved category when a rule of another category matches", () => {
    // The regression: opening the transaction ran the rules over its saved
    // description, and saving then reassigned its category without a word.
    renderDialog(aTransaction({ description: "Netflix" }), {
      categoryRules: [NETFLIX_TO_GIMNASIO],
    });

    expect(selectedCategory()).toContain("Padel");
  });

  it("applies the rules to an edited transaction once its description changes", async () => {
    renderDialog(aTransaction({ description: "Cuota del club" }), {
      categoryRules: [NETFLIX_TO_GIMNASIO],
    });

    const description = screen.getByLabelText("Descripción");
    await userEvent.clear(description);
    await userEvent.type(description, "Netflix");

    expect(selectedCategory()).toContain("Gimnasio");
  });

  it("fills in the category of a new transaction as its description is typed", async () => {
    renderDialog(null, { categoryRules: [NETFLIX_TO_GIMNASIO] });

    await userEvent.type(screen.getByLabelText("Descripción"), "Netflix");

    expect(selectedCategory()).toContain("Gimnasio");
  });
});

// The frame every other form in a dialog already had: a line under the title
// and a way out that is not the corner cross.
describe("TransactionDialog as a dialog", () => {
  it("says what it is for and offers Cancelar", async () => {
    const onOpenChange = vi.fn();
    renderDialog(null, { onOpenChange });

    expect(screen.getByText(/no cuenta como ingreso ni como gasto/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes itself once the transaction is saved", async () => {
    const onOpenChange = vi.fn();
    const onSubmitTransaction = vi.fn(() => Promise.resolve());
    renderDialog(null, { onOpenChange, onSubmitTransaction });

    await userEvent.clear(screen.getByLabelText("Monto"));
    await userEvent.type(screen.getByLabelText("Monto"), "1500");
    await userEvent.type(screen.getByLabelText("Descripción"), "Verdulería");
    await userEvent.click(screen.getByRole("button", { name: "Agregar transacción" }));

    expect(onSubmitTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1500, description: "Verdulería", categoryId: 1 }),
      [],
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
