// `z.coerce.number()` accepts anything on the way in, so react-hook-form types
// those fields as `unknown` — which is honest: at the moment the select renders,
// nothing has proven the value is a number yet.
//
// Every select in the app then has to turn that value into the string the
// component expects, and `String(unknown)` would quietly render "[object
// Object]" if the shape ever changed. This narrows first and returns the empty
// string for anything that has no sensible textual form, which is exactly what
// a select needs to show "nothing selected".
export function toSelectValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  return "";
}

// What a Select of ids hands to the form field it edits.
//
// Besides what the user picks, base-ui's Select reports a value of its own
// when the one it holds drops out of its items: `null`, or whatever it held
// when it mounted. Read as a number, that null was id 0, recorded as a change
// the user made. It carries no news either: the lists that narrow while a form
// is open — accounts by currency, categories by type — are kept in step by the
// form itself (useFittingSelection), whether or not the Select has noticed. So
// the null is ignored on every Select of ids, even where the field may be
// empty: none of them offers "none" as an item to pick.
//
// The other value, the one from mount, cannot be told apart from a pick and
// still goes through.
export function onIdPicked(onChange: (id: number) => void) {
  return (value: string | null) => {
    if (value !== null) onChange(Number(value));
  };
}
