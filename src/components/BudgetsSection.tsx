import { useCallback, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AiMark, AiNote } from "@/components/AiMark";
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
import { isDismissed } from "@/lib/ai/state";
import { paceReason, type BudgetPace } from "@/lib/ai/monthPace";
import {
  budgetProposals,
  categorySpending,
  suggestBudget,
} from "@/lib/ai/budgetSuggestions";
import type { BudgetPeriod, BudgetWithCategory, NewBudget } from "@/db";

// How many proposed budgets are shown at once; the rest wait for these to be
// created or dismissed.
const SHOWN_PROPOSALS = 3;

export function BudgetsSection() {
  const {
    budgets,
    transactions,
    categories,
    aiEnabled,
    aiDismissed,
    budgetPaces,
    today,
    isLoading,
  } = useAppData();
  const { isMutating } = useAppStatus();
  const { addBudget, editBudget, removeBudget, dismissAiSuggestions } = useAppActions();

  const progress = useMemo(
    () => calculateBudgetProgress(budgets, transactions),
    [budgets, transactions],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetWithCategory | null>(null);
  const [draft, setDraft] = useState<NewBudget | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<BudgetWithCategory | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories],
  );

  // What each category usually costs a month, read once for the proposals and
  // for the amount a new budget starts at. Only with the local AI on.
  const spending = useMemo(
    () => (aiEnabled ? categorySpending(transactions, today) : null),
    [aiEnabled, transactions, today],
  );

  const proposals = useMemo(
    () =>
      spending === null
        ? []
        : budgetProposals(spending, budgets, expenseCategories, (id) =>
            isDismissed(aiDismissed, id, today),
          ).slice(0, SHOWN_PROPOSALS),
    [spending, budgets, expenseCategories, aiDismissed, today],
  );

  const suggest = useCallback(
    (categoryId: number, currency: string, period: BudgetPeriod) => {
      const category = expenseCategories.find((entry) => entry.id === categoryId);
      return spending === null || category === undefined
        ? null
        : suggestBudget(spending, category, currency, period);
    },
    [spending, expenseCategories],
  );

  function openCreate(from: NewBudget | null = null) {
    setEditing(null);
    setDraft(from);
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
        onAction={() => openCreate()}
        disabled={expenseCategories.length === 0}
      />

      <ListCard
        title="Periodo actual"
        isLoading={isLoading}
        isEmpty={progress.length === 0 && proposals.length === 0}
        empty={{
          message: "Todavía no definiste ningún presupuesto.",
          actionLabel: "Crear el primero",
          onAction: () => openCreate(),
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

              <PaceNote budget={entry.budget} pace={budgetPaces?.get(entry.budget.id)} />
            </li>
          ))}
        </ul>

        {proposals.length > 0 && (
          <section
            aria-labelledby="budget-proposals"
            className={progress.length > 0 ? "mt-6" : undefined}
          >
            <h3
              id="budget-proposals"
              className="text-xs font-medium text-muted-foreground"
            >
              Sugeridos por IA
            </h3>
            <ul className="flex flex-col">
              {proposals.map((proposal) => {
                const category = expenseCategories.find(
                  (candidate) => candidate.id === proposal.categoryId,
                );
                return (
                  <li
                    key={proposal.id}
                    className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <AiMark reason={proposal.reason} />
                      <span className="truncate text-sm font-medium">
                        {category?.icon} {category?.name}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {formatCurrency(proposal.amount, proposal.currency)} por mes
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        aria-label={`Descartar el presupuesto de ${category?.name}`}
                        onClick={() => void dismissAiSuggestions([proposal.id])}
                      >
                        Descartar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        aria-label={`Crear el presupuesto de ${category?.name}`}
                        onClick={() =>
                          openCreate({
                            categoryId: proposal.categoryId,
                            currency: proposal.currency,
                            amount: proposal.amount,
                            period: "monthly",
                          })
                        }
                      >
                        Crear
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </ListCard>

      <BudgetDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        draft={draft}
        categories={expenseCategories}
        suggest={spending === null ? undefined : suggest}
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

// The line under a monthly budget the month is on course to pass, while it has
// not yet.
function PaceNote({
  budget,
  pace,
}: {
  budget: BudgetWithCategory;
  pace: BudgetPace | undefined;
}) {
  if (pace === undefined || pace.crossingDay === null) return null;
  return (
    <AiNote
      reason={paceReason(pace.pace, budget.currency, ` en ${budget.category_name}`)}
    >
      Si el resto del mes va como siempre, superarías el tope el {pace.crossingDay}.
    </AiNote>
  );
}
