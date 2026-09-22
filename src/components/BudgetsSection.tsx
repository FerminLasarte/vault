import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListCard } from "@/components/ListCard";
import { SectionIntro } from "@/components/SectionIntro";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ActionButton } from "@/components/ActionButton";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { BudgetDialog } from "@/components/BudgetDialog";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import { calculateBudgetProgress } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { BUDGET_PERIOD_LABELS } from "@/lib/labels";
import type { BudgetWithCategory, NewBudget } from "@/db";

export function BudgetsSection() {
  const { budgets, transactions, categories, isLoading } = useAppData();
  const { isMutating } = useAppStatus();
  const { addBudget, editBudget, removeBudget } = useAppActions();

  const progress = useMemo(
    () => calculateBudgetProgress(budgets, transactions),
    [budgets, transactions],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetWithCategory | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<BudgetWithCategory | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories],
  );

  function openCreate() {
    setEditing(null);
    setIsFormOpen(true);
  }

  async function handleSubmit(values: NewBudget) {
    if (editing) {
      await editBudget(editing.id, values);
    } else {
      await addBudget(values);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeBudget(pendingDeletion.id);
    setPendingDeletion(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* This screen's page header, demoted to the tab's own intro row. */}
      <SectionIntro
        description="Topes de gasto por categoría, mensuales o anuales."
        actionLabel="Nuevo presupuesto"
        onAction={openCreate}
        disabled={expenseCategories.length === 0}
      />

      <ListCard
        title="Periodo actual"
        isLoading={isLoading}
        isEmpty={progress.length === 0}
        empty={{
          message: "Todavía no definiste ningún presupuesto.",
          actionLabel: "Crear el primero",
          onAction: openCreate,
          disabled: expenseCategories.length === 0,
        }}
      >
        <ul className="flex flex-col gap-5">
          {progress.map((entry) => (
            <li key={entry.budget.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {entry.budget.category_icon} {entry.budget.category_name}
                  </span>
                  <Badge variant="outline">
                    {BUDGET_PERIOD_LABELS[entry.budget.period]}
                  </Badge>
                  <Badge variant="outline">{entry.budget.currency}</Badge>
                  {entry.isExceeded && <Badge variant="destructive">Superado</Badge>}
                </div>

                <div className="row-actions flex shrink-0 items-center gap-1">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatCurrency(entry.spent, entry.budget.currency)} /{" "}
                    {formatCurrency(entry.budget.amount, entry.budget.currency)}
                  </span>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label="Editar"
                    onClick={() => {
                      setEditing(entry.budget);
                      setIsFormOpen(true);
                    }}
                  >
                    <Pencil />
                    <span className="sr-only">
                      Editar presupuesto de {entry.budget.category_name}
                    </span>
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label="Eliminar"
                    onClick={() => setPendingDeletion(entry.budget)}
                  >
                    <Trash2 />
                    <span className="sr-only">
                      Eliminar presupuesto de {entry.budget.category_name}
                    </span>
                  </ActionButton>
                </div>
              </div>

              <ProgressBar
                ratio={entry.ratio}
                tone={entry.isExceeded ? "destructive" : "primary"}
              />

              <p className="text-xs text-muted-foreground">
                {entry.isExceeded
                  ? `Te pasaste por ${formatCurrency(
                      Math.abs(entry.remaining),
                      entry.budget.currency,
                    )}`
                  : `Te quedan ${formatCurrency(entry.remaining, entry.budget.currency)}`}
                {" · "}
                {Math.round(entry.ratio * 100)}%
              </p>
            </li>
          ))}
        </ul>
      </ListCard>

      <BudgetDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        categories={expenseCategories}
        onSubmitBudget={handleSubmit}
      />

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar este presupuesto?"
        description={
          <>
            Se eliminará el tope de «{pendingDeletion?.category_name}». Tus transacciones
            no se ven afectadas.
          </>
        }
        onConfirm={handleConfirmDelete}
        isMutating={isMutating}
      />
    </div>
  );
}
