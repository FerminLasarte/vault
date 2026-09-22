import { useMemo, useState } from "react";
import { Check, CreditCard, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionIntro } from "@/components/SectionIntro";
import { ActionButton } from "@/components/ActionButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoansSection } from "@/components/LoansSection";
import { ExpectedSection } from "@/components/ExpectedSection";
import { ListCard } from "@/components/ListCard";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RecurringSection } from "@/components/RecurringSection";
import { useRequestedTab } from "@/hooks/useRequestedTab";
import { COMMITMENT_TABS, DEFAULT_COMMITMENT_TAB } from "@/lib/navigation";
import type { CommitmentTab } from "@/lib/navigation";
import type { ViewProps } from "@/lib/menu";
import { InstallmentPlanDialog } from "@/components/InstallmentPlanDialog";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import {
  financingCost,
  outstandingAmount,
  outstandingByCurrency,
} from "@/lib/installments";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import type { InstallmentPlanWithNames, NewInstallmentPlan } from "@/db";

export function CommitmentsView({ tab }: ViewProps) {
  const [current, setCurrent] = useRequestedTab<CommitmentTab>(
    tab,
    COMMITMENT_TABS,
    DEFAULT_COMMITMENT_TAB,
  );

  const {
    installmentPlans,
    categories,
    paymentMethods,
    isLoading,
    pending: pendingCommitments,
  } = useAppData();

  const { isMutating } = useAppStatus();

  const {
    addInstallmentPlan,
    editInstallmentPlan,
    removeInstallmentPlan,
    confirmInstallment,
    registerAll,
  } = useAppActions();

  const pending = pendingCommitments.installments;

  const outstanding = useMemo(
    () => Array.from(outstandingByCurrency(installmentPlans)),
    [installmentPlans],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<InstallmentPlanWithNames | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<InstallmentPlanWithNames | null>(
    null,
  );

  function openCreate() {
    setEditing(null);
    setIsFormOpen(true);
  }

  async function handleSubmit(values: NewInstallmentPlan) {
    if (editing) {
      await editInstallmentPlan(editing.id, values);
    } else {
      await addInstallmentPlan(values);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeInstallmentPlan(pendingDeletion.id);
    setPendingDeletion(null);
  }

  async function payAll() {
    // One write for the lot, in the order listed: a plan's later instalment
    // follows its earlier one (see recordSteps).
    await registerAll(
      pending.map((entry) => ({
        kind: "installment",
        id: entry.plan.id,
        index: entry.index,
        date: entry.date,
        amount: entry.amount,
      })),
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Compromisos"
        description="Lo que se repite, lo que estás pagando en cuotas y lo que prestaste o te prestaron."
      />

      <Tabs
        value={current}
        onValueChange={(next) => setCurrent(String(next) as CommitmentTab)}
      >
        <TabsList>
          <TabsTrigger value="recurring">Recurrentes</TabsTrigger>
          <TabsTrigger value="installments">Compras en cuotas</TabsTrigger>
          <TabsTrigger value="loans">Préstamos</TabsTrigger>
          <TabsTrigger value="expected">Previstos</TabsTrigger>
        </TabsList>

        <TabsContent value="recurring" className="pt-6">
          <RecurringSection />
        </TabsContent>

        <TabsContent value="installments" className="flex flex-col gap-6 pt-6">
          <SectionIntro
            description="Compras en cuotas iguales. Cargá el precio de contado y te dice cuánto de más estás pagando."
            actionLabel="Nueva compra en cuotas"
            onAction={openCreate}
          />

          {!isLoading && outstanding.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {outstanding.map(([currency, total]) => (
                <Card key={currency}>
                  <CardHeader>
                    <CardDescription>Deuda pendiente en {currency}</CardDescription>
                    <CardTitle className="text-2xl">
                      {formatCurrency(total, currency)}
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {pending.length === 1
                    ? "1 cuota vencida"
                    : `${pending.length} cuotas vencidas`}
                </CardTitle>
                <CardDescription>
                  Confirmá cada una cuando la hayas pagado.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-col">
                  {pending.map((entry) => (
                    <li
                      key={`${entry.plan.id}-${entry.index}`}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-sm font-medium">
                          {entry.plan.description}
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="secondary">
                            Cuota {entry.number} de {entry.plan.installment_count}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(entry.date)}
                          </span>
                        </div>
                      </div>

                      <div className="row-actions flex shrink-0 items-center gap-2">
                        <span className="text-sm font-medium tabular-nums text-negative">
                          -{formatCurrency(entry.amount, entry.plan.currency)}
                        </span>
                        <ActionButton
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          label="Registrar cuota"
                          disabled={isMutating}
                          disabledReason={
                            entry.waitingFor === null
                              ? null
                              : `Primero registrá la cuota ${entry.waitingFor}`
                          }
                          onClick={() =>
                            void confirmInstallment(
                              entry.plan.id,
                              entry.index,
                              entry.date,
                              entry.amount,
                            )
                          }
                        >
                          <Check />
                          <span className="sr-only">
                            Registrar cuota {entry.number} de {entry.plan.description}
                          </span>
                        </ActionButton>
                      </div>
                    </li>
                  ))}
                </ul>

                {pending.length > 1 && (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isMutating}
                      onClick={() => void payAll()}
                    >
                      <Check />
                      Registrar todas
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <ListCard
            title="Compras en cuotas"
            isLoading={isLoading}
            isEmpty={installmentPlans.length === 0}
            empty={{
              message: "Todavía no cargaste ninguna compra en cuotas.",
              actionLabel: "Cargar la primera",
              onAction: openCreate,
            }}
          >
            <ul className="flex flex-col gap-5">
              {installmentPlans.map((plan) => {
                const remaining = outstandingAmount(plan);
                const paidRatio = plan.confirmed_count / plan.installment_count;
                const isSettled = plan.confirmed_count >= plan.installment_count;
                const cost = financingCost(plan);

                return (
                  <li key={plan.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">
                          {plan.description}
                        </span>
                        <Badge variant="secondary">
                          {plan.confirmed_count} / {plan.installment_count}
                        </Badge>
                        <Badge variant="outline">{plan.currency}</Badge>
                        {isSettled && <Badge variant="secondary">Saldada</Badge>}
                      </div>

                      <div className="row-actions flex shrink-0 items-center gap-1">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(remaining, plan.currency)} pendiente
                        </span>
                        <ActionButton
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          label="Editar"
                          onClick={() => {
                            setEditing(plan);
                            setIsFormOpen(true);
                          }}
                        >
                          <Pencil />
                          <span className="sr-only">Editar {plan.description}</span>
                        </ActionButton>
                        <ActionButton
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          label="Eliminar"
                          onClick={() => setPendingDeletion(plan)}
                        >
                          <Trash2 />
                          <span className="sr-only">Eliminar {plan.description}</span>
                        </ActionButton>
                      </div>
                    </div>

                    <ProgressBar ratio={paidRatio} />

                    <p className="text-xs text-muted-foreground">
                      Total {formatCurrency(plan.total_amount, plan.currency)} · primera
                      cuota {formatDate(plan.first_due_date)}
                      {cost !== null && cost.surcharge > 0 && (
                        <>
                          {" · "}
                          <span className="text-destructive">
                            {formatCurrency(cost.surcharge, plan.currency)} de recargo (
                            {formatPercent(cost.ratio)})
                          </span>
                        </>
                      )}
                      {cost !== null && cost.surcharge === 0 && " · sin interés"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </ListCard>
        </TabsContent>

        <TabsContent value="expected" className="pt-6">
          <ExpectedSection />
        </TabsContent>

        <TabsContent value="loans" className="pt-6">
          <LoansSection />
        </TabsContent>
      </Tabs>

      <InstallmentPlanDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        categories={categories}
        paymentMethods={paymentMethods}
        onSubmitPlan={handleSubmit}
      />

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar esta compra en cuotas?"
        description={
          <>
            Se eliminará «{pendingDeletion?.description}». Las cuotas que ya registraste
            se conservan como movimientos.
          </>
        }
        onConfirm={handleConfirmDelete}
        isMutating={isMutating}
      />
    </div>
  );
}
