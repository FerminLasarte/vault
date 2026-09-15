// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryRulesCard } from "./CategoryRulesCard";
import type { AppData } from "@/context/AppDataContext";
import type { CategoryRuleWithCategory } from "@/db";

const appData = vi.hoisted(() => ({ current: {} as AppData }));
vi.mock("@/hooks/useAppData", () => ({ useAppData: () => appData.current }));

function renderCard(overrides: Partial<AppData>) {
  appData.current = {
    categories: [],
    categoryRules: [],
    isLoading: false,
    isMutating: false,
    addCategoryRule: vi.fn(),
    editCategoryRule: vi.fn(),
    removeCategoryRule: vi.fn(),
    ...overrides,
  } as unknown as AppData;

  return render(<CategoryRulesCard />);
}

describe("CategoryRulesCard", () => {
  // Before the first load every list is empty, and the card read that as "you
  // have no rules" for as long as the load took.
  it("says it is loading rather than that there are no rules", () => {
    renderCard({ isLoading: true });

    expect(screen.getByText("Cargando...")).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no hay reglas/)).not.toBeInTheDocument();
  });

  it("shows the empty state once loaded", () => {
    renderCard({ isLoading: false });

    expect(screen.getByText(/Todavía no hay reglas/)).toBeInTheDocument();
  });

  // Deleting a rule used to happen on the first click, unlike every other
  // delete in the app.
  it("asks before deleting a rule", async () => {
    const removeCategoryRule = vi.fn(() => Promise.resolve());
    renderCard({
      categoryRules: [
        {
          id: 7,
          pattern: "netflix",
          category_id: 1,
          category_name: "Ocio",
          category_icon: "🎬",
        } as CategoryRuleWithCategory,
      ],
      removeCategoryRule,
    });

    await userEvent.click(screen.getByRole("button", { name: /Eliminar regla netflix/ }));

    expect(removeCategoryRule).not.toHaveBeenCalled();
    expect(screen.getByText("¿Eliminar esta regla?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(removeCategoryRule).toHaveBeenCalledWith(7);
  });
});
