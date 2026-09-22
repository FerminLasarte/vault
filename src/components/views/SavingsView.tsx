import { useMemo, useState } from "react";
import { PiggyBank, Plus, Trash2, Pencil, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListCard } from "@/components/ListCard";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ActionButton } from "@/components/ActionButton";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { SavingsGoalDialog } from "@/components/SavingsGoalDialog";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import { calculateSavingsProgress } from "@/lib/savings";
import { formatCurrency, formatDate, todayIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NewSavingsGoal, SavingsGoalWithNames } from "@/db";

export function SavingsView() {
  const {
    savingsGoals,
    savingsContributions,
    paymentMethods,
    transactions,
    isLoading,
    today,
  } = useAppData();
  const { isMutating } = useAppStatus();
  const { addSavingsGoal, editSavingsGoal, removeSavingsGoal, addSavingsContribution } =
    useAppActions();

  const progress = useMemo(
    () =>
      calculateSavingsProgress(
        savingsGoals,
        {
          accounts: paymentMethods,
          transactions,
          contributions: savingsContributions,
        },
        today,
      ),
    [savingsGoals, paymentMethods, transactions, savingsContributions, today],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoalWithNames | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<SavingsGoalWithNames | null>(
    null,
  );
  const [contributionDrafts, setContributionDrafts] = useState<Record<number, string>>(
    {},
  );

  function openCreate() {
    setEditing(null);
    setIsFormOpen(true);
  }

  async function handleSubmit(values: NewSavingsGoal) {
    if (editing) {
      await editSavingsGoal(editing.id, values);
    } else {
      await addSavingsGoal(values);
    }
  }

  async function handleContribute(goalId: number) {
    const amount = Number(contributionDrafts[goalId]);
    if (!Number.isFinite(amount) || amount === 0) return;

    await addSavingsContribution(goalId, amount, todayIsoDate(), null);
    setContributionDrafts((drafts) => ({ ...drafts, [goalId]: "" }));
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeSavingsGoal(pendingDeletion.id);
    setPendingDeletion(null);
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Ahorros"
        description="Objetivos de ahorro, con el ritmo que llevás y cuándo llegarías."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus />
            Nuevo objetivo
          </Button>
        }
      />

      <ListCard
        title="Tus objetivos"
        description="La proyección usa lo que ahorraste en los últimos tres meses."
        isLoading={isLoading}
        isEmpty={progress.length === 0}
        empty={{
          message: "Todavía no definiste ningún objetivo de ahorro.",
          actionLabel: "Crear el primero",
          onAction: openCreate,
        }}
      >
        <ul className="flex flex-col gap-6">
          {progress.map((entry) => (
            <li key={entry.goal.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <PiggyBank className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{entry.goal.name}</span>
                  <Badge variant="outline">{entry.goal.currency}</Badge>
                  {entry.goal.tracking_mode === "account" ? (
                    <Badge variant="secondary">
                      {entry.goal.payment_method_name ?? "Sin cuenta"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Aportes</Badge>
                  )}
                  {entry.isReached && <Badge>Alcanzado</Badge>}
                </div>

                <div className="row-actions flex shrink-0 items-center gap-1">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatCurrency(entry.current, entry.goal.currency)} /{" "}
                    {formatCurrency(entry.goal.target_amount, entry.goal.currency)}
                  </span>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label="Editar"
                    onClick={() => {
                      setEditing(entry.goal);
                      setIsFormOpen(true);
                    }}
                  >
                    <Pencil />
                    <span className="sr-only">Editar {entry.goal.name}</span>
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label="Eliminar"
                    onClick={() => setPendingDeletion(entry.goal)}
                  >
                    <Trash2 />
                    <span className="sr-only">Eliminar {entry.goal.name}</span>
                  </ActionButton>
                </div>
              </div>

              <ProgressBar
                ratio={entry.ratio}
                tone={entry.isReached ? "positive" : "primary"}
              />

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {entry.isReached ? (
                  <span>Objetivo alcanzado.</span>
                ) : (
                  <>
                    <span>
                      Faltan {formatCurrency(entry.remaining, entry.goal.currency)}
                    </span>
                    {entry.monthlyPace > 0 ? (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="size-3" />
                        {formatCurrency(entry.monthlyPace, entry.goal.currency)} por mes
                      </span>
                    ) : (
                      <span>Sin ritmo de ahorro en los últimos tres meses</span>
                    )}
                    {entry.projectedDate && (
                      <span>Llegarías el {formatDate(entry.projectedDate)}</span>
                    )}
                    {entry.goal.target_date && (
                      <span
                        className={cn(entry.isOnTrack === false && "text-destructive")}
                      >
                        Fecha límite {formatDate(entry.goal.target_date)}
                        {entry.isOnTrack === false && " · el ritmo no alcanza"}
                      </span>
                    )}
                  </>
                )}
              </div>

              {entry.goal.tracking_mode === "contributions" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Aportar hoy"
                    aria-label={`Aporte para ${entry.goal.name}`}
                    className="w-36"
                    value={contributionDrafts[entry.goal.id] ?? ""}
                    onChange={(event) =>
                      setContributionDrafts((drafts) => ({
                        ...drafts,
                        [entry.goal.id]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isMutating || !contributionDrafts[entry.goal.id]}
                    onClick={() => void handleContribute(entry.goal.id)}
                  >
                    Registrar aporte
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </ListCard>

      <SavingsGoalDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        paymentMethods={paymentMethods}
        onSubmitGoal={handleSubmit}
      />

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar este objetivo?"
        description={
          <>
            Se eliminará «{pendingDeletion?.name}» y los aportes que hayas registrado en
            él. Tus transacciones no se ven afectadas.
          </>
        }
        onConfirm={handleConfirmDelete}
        isMutating={isMutating}
      />
    </div>
  );
}
