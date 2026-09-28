import { useEffect, useMemo } from "react";
import type {
  FieldPath,
  FieldPathValue,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";

// Only the three methods this needs, so the hook fits any of the forms however
// their input and output types differ.
export type SyncableForm<TFieldValues extends FieldValues> = Pick<
  UseFormReturn<TFieldValues>,
  "watch" | "getValues" | "setValue"
>;

interface FittingSelectionOptions<
  TFieldValues extends FieldValues,
  TGoverningPath extends FieldPath<TFieldValues>,
  TSelectedPath extends FieldPath<TFieldValues>,
  TItem extends { id: number },
> {
  form: SyncableForm<TFieldValues>;
  items: TItem[];
  // The field the user changes, and the field holding the id of an item that
  // has to fit it.
  governingField: TGoverningPath;
  selectedField: TSelectedPath;
  // Whether an item may be chosen while the governing field holds `value`.
  //
  // Define it outside the component, or memoize it: it is a dependency of the
  // effect below, and a fresh function on every render would re-run that
  // effect every render.
  fits: (item: TItem, value: FieldPathValue<TFieldValues, TGoverningPath>) => boolean;
}

// Ties a field holding an id to another field that narrows which ids it may
// hold: returns the items the Select should offer, and empties the selection
// once it no longer fits.
//
// The form decides this rather than the Select. A Select whose value is not one
// of its items quietly shows its placeholder while the form goes on holding
// the value, and nothing on screen says so; the row would be saved with two
// fields that disagree.
//
// Call it *after* whatever loads a row into the form (`useDialogForm`, or a
// `reset` effect declared above), so that effect runs first — see the effect
// below for why the order matters.
export function useFittingSelection<
  TFieldValues extends FieldValues,
  TGoverningPath extends FieldPath<TFieldValues>,
  TSelectedPath extends FieldPath<TFieldValues>,
  TItem extends { id: number },
>({
  form,
  items,
  governingField,
  selectedField,
  fits,
}: FittingSelectionOptions<TFieldValues, TGoverningPath, TSelectedPath, TItem>): TItem[] {
  const { watch, getValues, setValue } = form;

  const watchedGoverning = watch(governingField);
  const watchedSelected = watch(selectedField);

  // What the Select renders this pass. Built from the watched value on purpose:
  // it has to match what the rest of this render was drawn from.
  const available = useMemo(
    () => items.filter((item) => fits(item, watchedGoverning)),
    [items, watchedGoverning, fits],
  );

  // Keep the selection valid whenever the governing field changes or the items
  // load.
  //
  // Everything here is read through `getValues` rather than from the watched
  // values above, and that is the whole point. The effect that loads a row for
  // editing runs earlier in this same pass and calls `reset`; the watched
  // values are the render's snapshot, so they still hold whatever the form had
  // *before* that reset. Judging validity against them found the saved value
  // missing from a list built for the previous row, decided it was invalid,
  // and replaced it — silently reassigning every row that was opened for
  // editing.
  //
  // `reset` updates the form's values synchronously, so `getValues` here sees
  // what was just loaded.
  useEffect(() => {
    const governing = getValues(governingField);
    const selected = getValues(selectedField) as number | null;

    // A selection that stops fitting is emptied rather than replaced. Picking
    // one on the user's behalf would invent a choice they never made; where the
    // form requires one, its validation asks for it instead.
    if (items.some((item) => item.id === selected && fits(item, governing))) return;
    if (selected === null) return;

    setValue(selectedField, null as FieldPathValue<TFieldValues, TSelectedPath>, {
      shouldValidate: false,
    });
    // Triggered by the watched values changing, but deliberately read fresh
    // inside; see above.
  }, [
    items,
    watchedGoverning,
    watchedSelected,
    governingField,
    selectedField,
    fits,
    getValues,
    setValue,
  ]);

  return available;
}
