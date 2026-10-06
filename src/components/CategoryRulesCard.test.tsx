// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryRulesCard } from "./CategoryRulesCard";
import type { AppActions, AppData, AppStatus } from "@/context/AppDataContext";

// The provider's three halves, read here from one object.
type AppContext = AppData & AppActions & AppStatus;
import type { CategoryRuleWithCategory } from "@/db";
import type { Category, Transaction } from "@/db/schema";
import { trainCategoryModel } from "@/lib/ai/categoryModel";
import { drawnSkeletons } from "@/test/loading";

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
    transactions: [],
    categoryModel: null,
    aiDismissed: {},
    today: "2026-10-06",
    isLoading: false,
    isMutating: false,
    addCategoryRule: vi.fn(),
    editCategoryRule: vi.fn(),
    removeCategoryRule: vi.fn(),
    dismissAiSuggestions: vi.fn(),
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
    // Nothing drawn yet: a load this young is usually over before a
    // placeholder could be read. Its space is held, unseen.
    expect(drawnSkeletons(container)).toHaveLength(0);
  });

  it("puts up the shape of the list once the load is taking a while", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderCard({ isLoading: true });

      act(() => void vi.advanceTimersByTime(120));

      expect(drawnSkeletons(container).length).toBeGreaterThan(0);
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

const COMIDA = {
  id: 3,
  name: "Comida",
  type: "expense",
  icon: "🍔",
  color: "",
} as Category;
const SALIDA = {
  id: 9,
  name: "Salida",
  type: "expense",
  icon: "🍻",
  color: "",
} as Category;

let nextId = 1;
function movements(count: number, description: string, categoryId: number) {
  return Array.from({ length: count }, (): Transaction => ({
    id: nextId++,
    amount: 1000,
    type: "expense",
    category_id: categoryId,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description,
    date: "2026-09-01",
    currency: "ARS",
    category_suggested: 0,
  }));
}

function aiOn(transactions: Transaction[]) {
  return {
    categories: [COMIDA, SALIDA],
    transactions,
    categoryModel: trainCategoryModel(transactions),
  } as Partial<AppContext>;
}

function aRule(pattern: string, category: Category): CategoryRuleWithCategory {
  return {
    id: 7,
    pattern,
    category_id: category.id,
    category_name: category.name,
    category_icon: category.icon,
    category_type: "expense",
  };
}

describe("CategoryRulesCard with the local AI", () => {
  // The user with no rules yet is who the proposals are most for.
  it("proposes rules even before there are any, and creates one", async () => {
    const addCategoryRule = vi.fn(() => Promise.resolve());
    renderCard({ ...aiOn(movements(4, "MERPAGO*RAPPI", COMIDA.id)), addCategoryRule });

    expect(screen.queryByText(/Todavía no hay reglas/)).not.toBeInTheDocument();
    expect(screen.getByText("Sugeridas por IA")).toBeInTheDocument();
    expect(screen.getByText("rappi")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Crear la regla rappi/ }));
    expect(addCategoryRule).toHaveBeenCalledExactlyOnceWith({
      pattern: "rappi",
      categoryId: COMIDA.id,
    });
  });

  it("dismisses a proposal, and leaves it out once dismissed", async () => {
    const dismissAiSuggestions = vi.fn(() => Promise.resolve());
    const data = aiOn(movements(4, "rappi", COMIDA.id));
    renderCard({ ...data, dismissAiSuggestions });

    await userEvent.click(
      screen.getByRole("button", { name: /Descartar la regla rappi/ }),
    );
    expect(dismissAiSuggestions).toHaveBeenCalledExactlyOnceWith([
      `rule:rappi:${COMIDA.id}`,
    ]);

    cleanup();
    renderCard({ ...data, aiDismissed: { [`rule:rappi:${COMIDA.id}`]: null } });
    expect(screen.queryByText("Sugeridas por IA")).not.toBeInTheDocument();
  });

  it("proposes moving a rule the user keeps contradicting", async () => {
    const editCategoryRule = vi.fn(() => Promise.resolve());
    renderCard({
      ...aiOn(movements(3, "pedidos ya", SALIDA.id)),
      categoryRules: [aRule("pedidos", COMIDA)],
      editCategoryRule,
    });

    expect(
      screen.getByText(/La mayoría de lo que decide está en Salida/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pasarla a Salida" }));
    expect(editCategoryRule).toHaveBeenCalledExactlyOnceWith(7, {
      pattern: "pedidos",
      categoryId: SALIDA.id,
    });
  });

  it("says nothing with the local AI off", () => {
    renderCard({
      ...aiOn(movements(4, "rappi", COMIDA.id)),
      categoryModel: null,
      categoryRules: [aRule("netflix", SALIDA)],
    });

    expect(screen.queryByText("Sugeridas por IA")).not.toBeInTheDocument();
    expect(screen.queryByText(/No coincide/)).not.toBeInTheDocument();
  });
});
