// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryDialog } from "./CategoryDialog";
import type { Category, NewCategory } from "@/db";

const existing: Category[] = [
  { id: 1, name: "Comida", type: "expense", color: "#f97316", icon: "🍽️" },
  { id: 2, name: "Otros", type: "expense", color: "#64748b", icon: "📦" },
];

function renderDialog(editing: Category | null = null) {
  const onSubmitCategory = vi.fn<(category: NewCategory) => Promise<void>>(() =>
    Promise.resolve(),
  );
  render(
    <CategoryDialog
      open
      onOpenChange={() => {}}
      editing={editing}
      categories={existing}
      onSubmitCategory={onSubmitCategory}
    />,
  );
  return onSubmitCategory;
}

describe("CategoryDialog", () => {
  it("gives a new category a colour no other category has", async () => {
    const onSubmitCategory = renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "Mascotas");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmitCategory).toHaveBeenCalled());
    const { color } = onSubmitCategory.mock.calls[0][0];
    // Every category used to be saved with Otros' grey, which made the slices
    // of the pie chart impossible to tell apart.
    expect(existing.map((category) => category.color)).not.toContain(color);
  });

  it("lets the colour be changed, including on a category that is still grey", async () => {
    const onSubmitCategory = renderDialog({
      id: 3,
      name: "Mascotas",
      type: "expense",
      color: "#64748b",
      icon: "🐶",
    });

    await userEvent.click(screen.getByRole("button", { name: "Rosa" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmitCategory).toHaveBeenCalled());
    expect(onSubmitCategory.mock.calls[0][0].color).toBe("#ec4899");
  });
});
