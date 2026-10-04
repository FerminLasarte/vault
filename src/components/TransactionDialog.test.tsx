// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { trainCategoryModel, type CategoryModel } from "@/lib/ai/categoryModel";
import { TransactionDialog } from "./TransactionDialog";
import type { Category, CategoryRuleWithCategory, PaymentMethod } from "@/db";

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

// The option list is rendered into the DOM alongside the trigger, so matching
// on text alone finds the option too. Only the trigger says what is *selected*.
// Looked up in the document rather than the render container: the dialog is
// portalled to the end of <body>.
function selectedCategory(): string {
  return selectedIn("#transaction-category");
}

function selectedIn(trigger: string): string {
  return document.querySelector(trigger)?.textContent?.trim() ?? "";
}

function renderDialog(
  handlers: {
    onOpenChange?: (open: boolean) => void;
    onSubmitTransaction?: () => Promise<void>;
    categoryRules?: CategoryRuleWithCategory[];
    aiEnabled?: boolean;
    categoryModel?: CategoryModel | null;
  } = {},
) {
  return render(
    <TransactionDialog
      open
      onOpenChange={handlers.onOpenChange ?? vi.fn()}
      categories={CATEGORIES}
      categoryRules={handlers.categoryRules ?? []}
      tags={[]}
      paymentMethods={ACCOUNTS}
      defaultCurrency="ARS"
      aiEnabled={handlers.aiEnabled ?? false}
      categoryModel={handlers.categoryModel ?? null}
      onSubmitTransaction={handlers.onSubmitTransaction ?? vi.fn()}
    />,
  );
}

// A category picked on the user's behalf is a choice they never made, and the
// first one on the list was easy to accept without noticing — above all when
// the form opens already filled in from the quick entry.
describe("TransactionDialog when creating", () => {
  it("starts with no category rather than the first one", () => {
    renderDialog();

    expect(selectedCategory()).toContain("Seleccioná una categoría");
  });

  // The same holds for the account: with a single account in the currency it
  // was easy to take the one offered for the one meant.
  it("starts with no account rather than the first one", () => {
    renderDialog();

    expect(selectedIn("#transaction-payment-method")).toContain(
      "Seleccioná un método de pago",
    );
  });

  it("asks for a category instead of saving without one", async () => {
    const onSubmitTransaction = vi.fn(() => Promise.resolve());
    renderDialog({ onSubmitTransaction });

    await userEvent.clear(screen.getByLabelText("Monto"));
    await userEvent.type(screen.getByLabelText("Monto"), "1500");
    await userEvent.type(screen.getByLabelText("Descripción"), "Verdulería");
    await userEvent.click(screen.getByRole("button", { name: "Agregar transacción" }));

    expect(onSubmitTransaction).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Seleccioná una categoría", { selector: "p" }),
    ).toBeInTheDocument();
  });
});

// A rule sending "netflix" to Gimnasio — deliberately not the first category,
// so a rule that did nothing could not pass for one that worked.
const NETFLIX_TO_GIMNASIO = {
  id: 1,
  pattern: "netflix",
  category_id: 2,
  category_name: "Gimnasio",
  category_icon: "🏋️",
} as CategoryRuleWithCategory;

describe("TransactionDialog and category rules", () => {
  it("fills in the category of a new transaction as its description is typed", async () => {
    renderDialog({ categoryRules: [NETFLIX_TO_GIMNASIO] });

    await userEvent.type(screen.getByLabelText("Descripción"), "Netflix");

    expect(selectedCategory()).toContain("Gimnasio");
  });
});

// Where no rule speaks, the local AI fills the category in from the history,
// and the form says so, with the reason on hover.
describe("TransactionDialog and the local AI", () => {
  const padelHistory = trainCategoryModel(
    [1, 2, 3].map((id) => ({
      id,
      amount: 9000,
      type: "expense" as const,
      category_id: 3,
      payment_method_id: 1,
      destination_payment_method_id: null,
      destination_amount: null,
      description: "turno cancha",
      date: "2026-09-01",
      currency: "ARS",
      category_suggested: 0,
    })),
  );

  it("fills in the category it learned, and says it was the AI", async () => {
    renderDialog({ categoryModel: padelHistory });

    await userEvent.type(screen.getByLabelText("Descripción"), "turno cancha");

    expect(selectedCategory()).toContain("Padel");
    expect(screen.getByText("Sugerida por IA")).toBeInTheDocument();
  });

  it("stops saying so once the user picks another category", async () => {
    renderDialog({ categoryModel: padelHistory });

    await userEvent.type(screen.getByLabelText("Descripción"), "turno cancha");
    await userEvent.click(document.querySelector("#transaction-category")!);
    await userEvent.click(await screen.findByRole("option", { name: /Gimnasio/ }));

    expect(screen.queryByText("Sugerida por IA")).not.toBeInTheDocument();
  });
});

// The lists show the merchant instead of what the bank wrote, so the form says
// so before a row changes name with nothing to explain why.
describe("TransactionDialog and merchant names", () => {
  it("says what name a bank's description will be shown as", async () => {
    renderDialog({ aiEnabled: true });

    await userEvent.type(screen.getByLabelText("Descripción"), "MERPAGO*RAPPI 4471");

    expect(screen.getByText("Se muestra como «Rappi»")).toBeInTheDocument();
  });

  it("says nothing about what the user typed themselves", async () => {
    renderDialog({ aiEnabled: true });

    await userEvent.type(screen.getByLabelText("Descripción"), "almuerzo en rappi");

    expect(screen.queryByText(/Se muestra como/)).not.toBeInTheDocument();
  });

  it("says nothing with the local AI switched off", async () => {
    renderDialog({ aiEnabled: false });

    await userEvent.type(screen.getByLabelText("Descripción"), "MERPAGO*RAPPI 4471");

    expect(screen.queryByText(/Se muestra como/)).not.toBeInTheDocument();
  });
});

// The frame every other form in a dialog already had: a line under the title
// and a way out that is not the corner cross.
describe("TransactionDialog as a dialog", () => {
  it("says what it is for and offers Cancelar", async () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    expect(screen.getByText(/no cuenta como ingreso ni como gasto/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes itself once the transaction is saved", async () => {
    const onOpenChange = vi.fn();
    const onSubmitTransaction = vi.fn(() => Promise.resolve());
    // The rule chooses the category, which the form no longer does on its own.
    renderDialog({
      onOpenChange,
      onSubmitTransaction,
      categoryRules: [NETFLIX_TO_GIMNASIO],
    });

    await userEvent.clear(screen.getByLabelText("Monto"));
    await userEvent.type(screen.getByLabelText("Monto"), "1500");
    await userEvent.type(screen.getByLabelText("Descripción"), "Netflix");
    await userEvent.click(screen.getByLabelText("Método de pago"));
    await userEvent.click(await screen.findByRole("option", { name: "Efectivo ARS" }));
    await userEvent.click(screen.getByRole("button", { name: "Agregar transacción" }));

    expect(onSubmitTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1500,
        description: "Netflix",
        categoryId: 2,
        paymentMethodId: 1,
      }),
      [],
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
