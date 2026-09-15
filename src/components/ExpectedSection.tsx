import { useMemo, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ExpectedMovementDialog } from "@/components/ExpectedMovementDialog";
import { useAppData } from "@/hooks/useAppData";
import { collectPendingExpected, collectUpcomingExpected } from "@/lib/expected";
import { formatCurrency, formatDate, todayIsoDate } from "@/lib/format";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ExpectedMovementWithNames, NewExpectedMovement } from "@/db";

// The amount, coloured and signed the way the rest of the app shows money
// moving. Shared by both lists so a figure never means two things.
function Amount({
  movement,
  muted = false,
}: {
  movement: ExpectedMovementWithNames;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "text-sm font-medium tabular-nums",
        muted
          ? "text-muted-foreground"
          : movement.type === "income"
            ? "text-positive"
            : "text-negative",
      )}
    >
      {movement.type === "income" ? "+" : "-"}
      {formatCurrency(movement.amount, movement.currency)}
    </span>
  );
}

function Tags({ movement }: { movement: ExpectedMovementWithNames }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-xs text-muted-foreground">
        {formatDate(movement.due_date)}
      </span>
      {movement.category_name && (
        <Badge variant="secondary">
          {movement.category_icon} {movement.category_name}
        </Badge>
      )}
      {movement.payment_method_name && (
        <Badge variant="outline">{movement.payment_method_name}</Badge>
      )}
      <Badge variant="outline">{TRANSACTION_TYPE_LABELS[movement.type]}</Badge>
    </div>
  );
}

export function ExpectedSection() {
  const {
    expectedMovements,
    categories,
    paymentMethods,
    isLoading,
    isMutating,
    addExpected,
    editExpected,
    removeExpected,
    confirmExpected,
    dismissExpected,
  } = useAppData();

  // Split rather than filtered in the markup: what needs a decision and what is
  // merely coming are two different requests of the reader, and mixing them in
  // one list makes the first easy to scroll past.
  const pending = useMemo(
    () => collectPendingExpected(expectedMovements, todayIsoDate()),
    [expectedMovements],
  );

  const upcoming = useMemo(
    () => collectUpcomingExpected(expectedMovements, todayIsoDate()),
    [expectedMovements],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpectedMovementWithNames | null>(null);
  const [pendingDeletion, setPendingDeletion] =
    useState<ExpectedMovementWithNames | null>(null);

  function openCreate() {
    setEditing(null);
    setIsFormOpen(true);
  }

  async function handleSubmit(values: NewExpectedMovement) {
    if (editing) {
      await editExpected(editing.id, values);
    } else {
      await addExpected(values);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeExpected(pendingDeletion.id);
    setPendingDeletion(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionIntro
        description="Lo que sabés que se viene y pasa una sola vez. Si se repite, va en Recurrentes."
        actionLabel="Nuevo previsto"
        onAction={openCreate}
      />

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {pending.length === 1
                ? "1 previsto que ya venció"
                : `${pending.length} previstos que ya vencieron`}
            </CardTitle>
            <CardDescription>
              Registralo si ocurrió, o descartalo si al final no pasó. Nada se anota solo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col">
              {pending.map((movement) => (
                <li
                  key={movement.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">
                      {movement.description}
                    </span>
                    <Tags movement={movement} />
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Amount movement={movement} />
                    <ActionButton
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      label="Registrar"
                      disabled={isMutating}
                      onClick={() => void confirmExpected(movement.id)}
                    >
                      <Check />
                      <span className="sr-only">Registrar {movement.description}</span>
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      label="Descartar"
                      disabled={isMutating}
                      onClick={() => void dismissExpected(movement.id)}
                    >
                      <X />
                      <span className="sr-only">Descartar {movement.description}</span>
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ListCard
        title="Lo que viene"
        isLoading={isLoading}
        isEmpty={upcoming.length === 0}
        empty={{
          message: "No tenés nada previsto. Por ejemplo, un casamiento o la VTV.",
          actionLabel: "Cargar el primero",
          onAction: openCreate,
        }}
      >
        <ul className="flex flex-col">
          {upcoming.map((movement) => (
            <li
              key={movement.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-medium">
                  {movement.description}
                </span>
                <Tags movement={movement} />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {/* Muted here and coloured in the list above: something
                        still months away is information, not a call to act. */}
                <Amount movement={movement} muted />
                <ActionButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  label="Editar"
                  onClick={() => {
                    setEditing(movement);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil />
                  <span className="sr-only">Editar {movement.description}</span>
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  label="Eliminar"
                  onClick={() => setPendingDeletion(movement)}
                >
                  <Trash2 />
                  <span className="sr-only">Eliminar {movement.description}</span>
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      </ListCard>

      <ExpectedMovementDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        categories={categories}
        paymentMethods={paymentMethods}
        onSubmitExpected={handleSubmit}
      />

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar este previsto?"
        description={
          <>
            Se eliminará «{pendingDeletion?.description}». Si ya lo registraste, la
            transacción se conserva.
          </>
        }
        onConfirm={handleConfirmDelete}
        isMutating={isMutating}
      />
    </div>
  );
}
