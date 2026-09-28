import { useCallback } from "react";
import type { FieldPath, FieldPathValue, FieldValues } from "react-hook-form";
import type { Category, CategoryType } from "@/db";
import { useFittingSelection, type SyncableForm } from "./useFittingSelection";

interface CategoryTypeSyncOptions<
  TFieldValues extends FieldValues,
  TTypePath extends FieldPath<TFieldValues>,
  TCategoryPath extends FieldPath<TFieldValues>,
> {
  form: SyncableForm<TFieldValues>;
  categories: Category[];
  // The field the user toggles, and the category field that field governs.
  typeField: TTypePath;
  categoryField: TCategoryPath;
  // Which kind of category the toggle currently calls for. `null` means none
  // applies at all — a transfer — and empties the field.
  //
  // Define it outside the component: it is a dependency of the sync, and a
  // fresh function on every render would re-run it every render.
  categoryTypeFor: (
    value: FieldPathValue<TFieldValues, TTypePath>,
  ) => CategoryType | null;
}

// Ties a category field to the type toggle that governs it: returns the
// categories the Select should offer, and keeps the selected one from
// belonging to the other list, so switching between Gasto and Ingreso cannot
// leave a category from the other list selected.
//
// Call it *after* whatever loads a row into the form; see useFittingSelection.
export function useCategoryTypeSync<
  TFieldValues extends FieldValues,
  TTypePath extends FieldPath<TFieldValues>,
  TCategoryPath extends FieldPath<TFieldValues>,
>({
  form,
  categories,
  typeField,
  categoryField,
  categoryTypeFor,
}: CategoryTypeSyncOptions<TFieldValues, TTypePath, TCategoryPath>): Category[] {
  const fits = useCallback(
    (category: Category, type: FieldPathValue<TFieldValues, TTypePath>) => {
      const wanted = categoryTypeFor(type);
      return wanted !== null && category.type === wanted;
    },
    [categoryTypeFor],
  );

  return useFittingSelection({
    form,
    items: categories,
    governingField: typeField,
    selectedField: categoryField,
    fits,
  });
}
