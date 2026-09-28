import { useEffect, useMemo } from "react";
import type {
  FieldPath,
  FieldPathValue,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";
import type { Category, CategoryType } from "@/db";

// Only the three methods this needs, so the hook fits any of the forms however
// their input and output types differ.
type SyncableForm<TFieldValues extends FieldValues> = Pick<
  UseFormReturn<TFieldValues>,
  "watch" | "getValues" | "setValue"
>;

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
  // Define it outside the component: it is a dependency of the effect below,
  // and a fresh function on every render would re-run that effect every render.
  categoryTypeFor: (
    value: FieldPathValue<TFieldValues, TTypePath>,
  ) => CategoryType | null;
}

// Ties a category field to the type toggle that governs it: returns the
// categories the Select should offer, and keeps the selected one from
// belonging to the other list.
//
// Call it *after* whatever loads a row into the form (`useDialogForm`, or a
// `reset` effect declared above), so that effect runs first — see the effect
// below for why the order matters.
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
  const { watch, getValues, setValue } = form;

  const watchedType = watch(typeField);
  const watchedCategoryId = watch(categoryField);

  // What the Select renders this pass. Built from the watched type on purpose:
  // it has to match the type the rest of this render was drawn from.
  const availableCategories = useMemo(() => {
    const wanted = categoryTypeFor(watchedType);
    if (wanted === null) return [];
    return categories.filter((category) => category.type === wanted);
  }, [categories, watchedType, categoryTypeFor]);

  // Keep the selected category valid whenever the type changes or categories
  // load, so switching between Gasto and Ingreso cannot leave a category from
  // the other list selected. Nothing on screen would say so — a Select whose
  // value is not one of its items quietly shows its placeholder instead — and
  // the row would be saved with a type and a category that disagree.
  //
  // Everything here is read through `getValues` rather than from the watched
  // values above, and that is the whole point. The effect that loads a row for
  // editing runs earlier in this same pass and calls `reset`; the watched
  // values are the render's snapshot, so they still hold whatever the form had
  // *before* that reset. Judging validity against them found the saved category
  // missing from a list built for the previous type, decided it was invalid,
  // and replaced it — silently reassigning the category of every row that was
  // opened for editing.
  //
  // `reset` updates the form's values synchronously, so `getValues` here sees
  // what was just loaded.
  useEffect(() => {
    const wanted = categoryTypeFor(getValues(typeField));
    const selected = getValues(categoryField) as number | null;

    // A selection that stops fitting is emptied rather than replaced. Picking
    // one on the user's behalf would invent a choice they never made; where the
    // form requires a category, its validation asks for one instead.
    if (
      wanted !== null &&
      categories.some((category) => category.type === wanted && category.id === selected)
    ) {
      return;
    }
    if (selected === null) return;

    setValue(categoryField, null as FieldPathValue<TFieldValues, TCategoryPath>, {
      shouldValidate: false,
    });
    // Triggered by the watched values changing, but deliberately read fresh
    // inside; see above.
  }, [
    categories,
    watchedType,
    watchedCategoryId,
    typeField,
    categoryField,
    categoryTypeFor,
    getValues,
    setValue,
  ]);

  return availableCategories;
}
