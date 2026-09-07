import { useMemo, useState } from "react";
import { Check, Pause, Pencil, Play, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListCard } from "@/components/ListCard";
import { SectionIntro } from "@/components/SectionIntro";
import { ActionButton } from "@/components/ActionButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecurringDialog } from "@/components/RecurringDialog";
import { useAppData } from "@/hooks/useAppData";
import { collectPendingRecurrences } from "@/lib/pendingRecurring";
import { formatCurrency, formatDate, todayIsoDate } from "@/lib/format";
import { RECURRENCE_FREQUENCY_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { NewRecurringTransaction, RecurringTransactionWithNames } from "@/db";

export function RecurringSection() {
  const {
    recurring,
    categories,
    paymentMethods,
    isLoading,
    isMutating,
    addRecurring,
    editRecurring,
    removeRecurring,
    confirmRecurring,
    dismissRecurring,
  } = useAppData();

  const pending = useMemo(
    () => collectPendingRecurrences(recurring, todayIsoDate()),
    [recurring],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransactionWithNames | null>(null);
  const [pendingDeletion, setPendingDeletion] =
    useState<RecurringTransactionWithNames | null>(null);

  function openCreate() {
    setEditing(null);
    setIsFormOpen(true);
  }

  async function handleSubmit(values: NewRecurringTransaction) {
    if (editing) {
      await editRecurring(editing.id, values);
    } else {
      await addRecurring(values);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeRecurring(pendingDeletion.id);
    setPendingDeletion(null);
  }

  async function acceptAll() {
    // Sequential on purpose: each confirmation advances its template, and the
    // next one has to see that.
    for (const entry of pending) {
      await confirmRecurring(entry.template.id, entry.date);
    }
  }

  async function togglePaused(template: RecurringTransactionWithNames) {
    await editRecurring(template.id, {
      description: template.description,
      amount: template.amount,
      type: template.type,
      categoryId: template.category_id,
      paymentMethodId: template.payment_method_id,
      currency: template.currency,
      frequency: template.frequency,
      startDate: template.start_date,
      isActive: template.is_active !== 1,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* What used to be this screen's page header. As a tab it introduces
          itself the same way the instalments one beside it does: a line of
          description with its action on the right. */}
      <SectionIntro
        description="Movimientos que se repiten. Nada se registra hasta que lo confirmes."
        actionLabel="Nueva recurrente"
        onAction={openCreate}
      />

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {pending.length === 1
                ? "1 movimiento pendiente"
                : `${pending.length} movimientos pendientes`}
            </CardTitle>
            <CardDescription>
              Revisá el monto antes de aceptar: si cambió, editá la plantilla primero.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col">
              {pending.map((entry) => (
                <li
                  key={`${entry.template.id}-${entry.date}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">
                      {entry.template.description}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.date)}
                      </span>
                      {entry.template.category_name && (
                        <Badge variant="secondary">
                          {entry.template.category_icon} {entry.template.category_name}
                        </Badge>
                      )}
                      {entry.template.payment_method_name && (
                        <Badge variant="outline">
                          {entry.template.payment_method_name}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        entry.template.type === "income"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {entry.template.type === "income" ? "+" : "-"}
                      {formatCurrency(entry.template.amount, entry.template.currency)}
                    </span>
                    <ActionButton
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      label="Registrar"
                      disabled={isMutating}
                      onClick={() => void confirmRecurring(entry.template.id, entry.date)}
                    >
                      <Check />
                      <span className="sr-only">
                        Registrar {entry.template.description}
                      </span>
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      label="Descartar"
                      disabled={isMutating}
                      onClick={() => void dismissRecurring(entry.template.id, entry.date)}
                    >
                      <X />
                      <span className="sr-only">
                        Descartar {entry.template.description}
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
                  onClick={() => void acceptAll()}
                >
                  <Check />
                  Registrar todos
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ListCard
        title="Plantillas"
        isLoading={isLoading}
        isEmpty={recurring.length === 0}
        empty={{
          message: "Todavía no hay recurrentes. Por ejemplo, el alquiler o el sueldo.",
          actionLabel: "Crear la primera",
          onAction: openCreate,
        }}
      >
        <ul className="flex flex-col">
          {recurring.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    template.is_active !== 1 && "text-muted-foreground",
                  )}
                >
                  {template.description}
                </span>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">
                    {RECURRENCE_FREQUENCY_LABELS[template.frequency]}
                  </Badge>
                  <Badge variant="outline">
                    {TRANSACTION_TYPE_LABELS[template.type]}
                  </Badge>
                  <Badge variant="outline">{template.currency}</Badge>
                  {template.is_active !== 1 && (
                    <Badge variant="secondary">En pausa</Badge>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatCurrency(template.amount, template.currency)}
                </span>
                <ActionButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  label={template.is_active === 1 ? "Pausar" : "Reanudar"}
                  disabled={isMutating}
                  onClick={() => void togglePaused(template)}
                >
                  {template.is_active === 1 ? <Pause /> : <Play />}
                  <span className="sr-only">
                    {template.is_active === 1 ? "Pausar" : "Reanudar"}{" "}
                    {template.description}
                  </span>
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  label="Editar"
                  onClick={() => {
                    setEditing(template);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil />
                  <span className="sr-only">Editar {template.description}</span>
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  label="Eliminar"
                  onClick={() => setPendingDeletion(template)}
                >
                  <Trash2 />
                  <span className="sr-only">Eliminar {template.description}</span>
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      </ListCard>

      <RecurringDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        categories={categories}
        paymentMethods={paymentMethods}
        onSubmitRecurring={handleSubmit}
      />

      <AlertDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta recurrente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{pendingDeletion?.description}». Los movimientos que ya
              registraste a partir de ella se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isMutating}
              onClick={handleConfirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
