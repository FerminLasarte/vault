// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BudgetDialog } from "./BudgetDialog";
import type { BudgetSuggestion } from "@/lib/ai/budgetSuggestions";
import type { BudgetPeriod, BudgetWithCategory, Category } from "@/db";

beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
  });
});

const CATEGORIES: Category[] = [
  { id: 1, name: "Comida", type: "expense", color: "#000", icon: "🍔" },
  { id: 2, name: "Salidas", type: "expense", color: "#111", icon: "🍻" },
];

const SALIDAS: BudgetWithCategory = {
  id: 9,
  category_id: 2,
  currency: "ARS",
  amount: 30000,
  period: "monthly",
  category_name: "Salidas",
  category_icon: "🍻",
  category_color: "#111",
};

// Comida usually costs 47.320 a month; Salidas has nothing to go by.
function suggest(
  categoryId: number,
  currency: string,
  period: BudgetPeriod,
): BudgetSuggestion | null {
  if (categoryId !== 1 || currency !== "ARS") return null;
  return {
    id: "budget:1:ARS",
    categoryId,
    currency,
    monthly: 47320,
    amount: period === "annual" ? 570000 : 48000,
    reason: "En los últimos 6 meses gastaste en Comida cerca de $ 47.320,00 por mes.",
  };
}

function renderDialog(editing: BudgetWithCategory | null = null) {
  const onSubmitBudget = vi.fn(() => Promise.resolve());
  render(
    <BudgetDialog
      open
      onOpenChange={vi.fn()}
      editing={editing}
      categories={CATEGORIES}
      suggest={suggest}
      onSubmitBudget={onSubmitBudget}
    />,
  );
  return onSubmitBudget;
}

const amountField = () => screen.getByLabelText<HTMLInputElement>("Tope");

describe("BudgetDialog and the suggested amount", () => {
  it("starts a new budget at what the category usually costs", async () => {
    renderDialog();

    expect(await screen.findByText("Sugerido por IA")).toBeTruthy();
    expect(amountField().value).toBe("48000");
  });

  it("follows the period while the amount is the suggestion", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(document.querySelector("#budget-period")!);
    await user.click(await screen.findByRole("option", { name: "Anual" }));

    expect(amountField().value).toBe("570000");
  });

  it("leaves an amount the user typed alone, and stops calling it the AI's", async () => {
    const user = userEvent.setup();
    const onSubmitBudget = renderDialog();

    await user.clear(amountField());
    await user.type(amountField(), "50000");
    expect(screen.queryByText("Sugerido por IA")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Guardar/ }));
    expect(onSubmitBudget).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 1, amount: 50000 }),
    );
  });

  it("never touches a budget being edited", () => {
    renderDialog(SALIDAS);

    expect(amountField().value).toBe("30000");
    expect(screen.queryByText("Sugerido por IA")).toBeNull();
  });
});
