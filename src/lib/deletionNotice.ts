// What a delete takes with it besides the row itself, in the words its
// confirmation uses. Said before the delete rather than discovered after it: a
// category's budgets and rules go with it by cascade, and a savings goal that
// follows an account's balance is left following nothing.

// "su presupuesto" or "sus 3 presupuestos"; null when there are none.
function counted(count: number, one: string, many: string): string | null {
  if (count === 0) return null;
  return count === 1 ? one : `sus ${count} ${many}`;
}

// The sentence about what goes with a category, or null when nothing does.
export function categoryDeletionNotice(
  budgetCount: number,
  ruleCount: number,
): string | null {
  const parts = [
    counted(budgetCount, "su presupuesto", "presupuestos"),
    counted(ruleCount, "su regla de categorización", "reglas de categorización"),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;

  const verb = budgetCount + ruleCount === 1 ? "se elimina" : "se eliminan";
  return `También ${verb} ${parts.join(" y ")}.`;
}

// The sentence about the savings goals that follow an account's balance, or
// null when none does. They are kept, but with no account behind them they
// stop showing what was saved.
export function accountGoalsNotice(goalCount: number): string | null {
  if (goalCount === 0) return null;
  return goalCount === 1
    ? "El objetivo de ahorro que la sigue queda sin cuenta y deja de mostrar lo ahorrado hasta que le elijas otra."
    : `Los ${goalCount} objetivos de ahorro que la siguen quedan sin cuenta y dejan de mostrar lo ahorrado hasta que les elijas otra.`;
}
