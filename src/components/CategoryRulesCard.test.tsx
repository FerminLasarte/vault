// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryRulesCard } from "./CategoryRulesCard";
import type { AppActions, AppData, AppStatus } from "@/context/AppDataContext";

// The provider's three halves, read here from one object.
type AppContext = AppData & AppActions & AppStatus;
import type { CategoryRuleWithCategory } from "@/db";

const appData = vi.hoisted(() => ({ current: {} as AppContext }));
vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
  useAppActions: () => appData.current,
  useAppStatus: () => appData.current,
}));

function renderCard(overrides: Partial<AppContext>) {
  appData.current = {
    categories: [],
    categoryRules: [],
    isLoading: false,
    isMutating: false,
    addCategoryRule: vi.fn(),
    editCategoryRule: vi.fn(),
    removeCategoryRule: vi.fn(),
    ...overrides,
  } as unknown as AppContext;

  return render(<CategoryRulesCard />);
}

describe("CategoryRulesCard", () => {
  // Before the first load every list is empty, and the card read that as "you
  // have no rules" for as long as the load took.
  it("does not claim there are no rules while they are still arriving", () => {
    const { container } = renderCard({ isLoading: true });

    expect(screen.queryByText(/Todavía no hay reglas/)).not.toBeInTheDocument();
    // Nothing at all yet: a load this young is usually over before a
    // placeholder could be read.
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
  });

  it("puts up the shape of the list once the load is taking a while", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderCard({ isLoading: true });

      act(() => void vi.advanceTimersByTime(120));

      expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
      expect(screen.queryByText(/Todavía no hay reglas/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
