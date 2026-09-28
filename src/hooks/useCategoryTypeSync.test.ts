// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { useCategoryTypeSync } from "./useCategoryTypeSync";
import type { Category } from "@/db";

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

interface Values {
  type: "income" | "expense" | "transfer";
  categoryId: number | null;
}

const categoryTypeFor = (type: Values["type"]) => (type === "transfer" ? null : type);

interface HarnessProps {
  row: Values;
  categories: Category[];
}

// Stands in for the dialogs: a form, an effect that loads a row into it, and
// the sync declared after that effect — the order the hook relies on.
function useHarness({ row, categories }: HarnessProps) {
  const form = useForm<Values>({
    defaultValues: { type: "expense", categoryId: null },
  });

  const { reset } = form;
  useEffect(() => {
    reset(row);
  }, [row, reset]);

  const available = useCategoryTypeSync({
    form,
    categories,
    typeField: "type",
    categoryField: "categoryId",
    categoryTypeFor,
  });

  return { form, available };
}

function renderSync(props: Partial<HarnessProps> = {}) {
  return renderHook(useHarness, {
    initialProps: {
      row: { type: "expense", categoryId: 3 },
      categories: CATEGORIES,
      ...props,
    } satisfies HarnessProps,
  });
}

describe("useCategoryTypeSync", () => {
  it("keeps the category a row was just loaded with", () => {
    // The regression: the categories arriving in the same pass as the reset
    // made the check run against the render's stale values, which still held
    // the previous row's type. The saved category looked like it belonged to
    // the other list, and was silently reassigned.
    const { result, rerender } = renderSync({
      row: { type: "expense", categoryId: 3 },
      categories: [],
    });

    rerender({
      row: { type: "income", categoryId: 5 },
      categories: CATEGORIES,
    });

    expect(result.current.form.getValues("categoryId")).toBe(5);
  });

  it("drops a category that belongs to the other type", () => {
    const { result } = renderSync();

    act(() => {
      result.current.form.setValue("type", "income");
    });

    expect(result.current.form.getValues("categoryId")).toBeNull();
  });

  it("leaves an empty optional category empty", () => {
    // "Sin categoría" is a real answer, so nothing may be chosen on the user's
    // behalf — not on load, and not when the toggle moves.
    const { result } = renderSync({ row: { type: "expense", categoryId: null } });

    expect(result.current.form.getValues("categoryId")).toBeNull();

    act(() => {
      result.current.form.setValue("type", "income");
    });

    expect(result.current.form.getValues("categoryId")).toBeNull();
  });

  it("empties the field for a type that takes no category at all", () => {
    const { result } = renderSync();

    act(() => {
      result.current.form.setValue("type", "transfer");
    });

    expect(result.current.form.getValues("categoryId")).toBeNull();
    expect(result.current.available).toEqual([]);
  });

  it("offers only the categories of the current type", () => {
    const { result } = renderSync();

    expect(result.current.available.map((category) => category.name)).toEqual([
      "Bookit",
      "Gimnasio",
      "Padel",
    ]);

    act(() => {
      result.current.form.setValue("type", "income");
    });

    expect(result.current.available.map((category) => category.name)).toEqual([
      "Abuelo",
      "Venta",
    ]);
  });
});
