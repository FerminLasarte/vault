// `z.coerce.number()` accepts anything on the way in, so react-hook-form types
// those fields as `unknown` — which is honest: at the moment the select renders,
// nothing has proven the value is a number yet.
//
// A Select of ids then has to turn that value into the string its items are
// keyed by, and `String(unknown)` would quietly render "[object Object]" if the
// shape ever changed. This narrows first and returns the empty string for
// anything that has no sensible textual form, which no item is keyed by.
function toSelectValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  return "";
}

// The props of a Select whose items are ids: the items, the value it shows,
// and what it hands back to the form field it edits.
//
// base-ui's Select, once its list has been opened, reports a value of its own
// whenever the one it holds drops out of its items: the value it held when it
// mounted, if that is still listed, and null otherwise. The mount value cannot
// be told apart from a pick, and it is stale: a dialog mounts before its row is
// loaded, and the inspector stays mounted from one row to the next, so it came
// back as an earlier row's account or category. The Select skips all of it
// while its value is null, so it is only ever handed an id among its items, or
// null. An id the form holds that is not listed is shown as nothing selected,
// and the form empties it itself (useFittingSelection).
//
// The null guard stays for what the Select may still report on its own: read
// as a number, a null was id 0, recorded as a change the user made. None of
// these lists offers "none" as an item to pick.
export function idSelectProps(
  items: Record<string, string>,
  value: unknown,
  onChange: (id: number) => void,
) {
  const selected = toSelectValue(value);
  return {
    items,
    value: Object.hasOwn(items, selected) ? selected : null,
    onValueChange: (picked: string | null) => {
      if (picked !== null) onChange(Number(picked));
    },
  };
}
