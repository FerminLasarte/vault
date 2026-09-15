import { useMemo, useState } from "react";
import { Check, ChevronDown, HandCoins, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListCard } from "@/components/ListCard";
import { ProgressBar } from "@/components/ui/progress-bar";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoanDialog } from "@/components/LoanDialog";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import {
  amortizationSchedule,
  outstandingByDirection,
  outstandingPrincipal,
  totalInterest,
} from "@/lib/loans";
import { formatCurrency, formatDate } from "@/lib/format";
import { LOAN_DIRECTION_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { LoanWithNames, NewLoan } from "@/db";

// A repayment on money I owe leaves my pocket, and a repayment on money owed to
// me arrives in it, so the two are never the same colour or the same sign.
function directionTone(direction: string): string {
  return direction === "borrowed" ? "text-negative" : "text-positive";
}

interface ScheduleProps {
  loan: LoanWithNames;
}

function AmortizationSchedule({ loan }: ScheduleProps) {
  const schedule = useMemo(() => amortizationSchedule(loan), [loan]);
  const interest = totalInterest(loan);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">
        {interest === 0
          ? "Sin interés: cada cuota es capital puro."
          : `Interés total ${formatCurrency(interest, loan.currency)} sobre un capital de ${formatCurrency(
              loan.principal,
              loan.currency,
            )}.`}
      </p>
      <div className="max-h-72 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuota</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="text-right">Capital</TableHead>
              <TableHead className="text-right">Interés</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.map((payment) => {
              const isPaid = payment.index < loan.confirmed_count;
              return (
                <TableRow
                  key={payment.index}
                  className={cn(isPaid && "text-muted-foreground line-through")}
                >
                  <TableCell>{payment.number}</TableCell>
                  <TableCell>{formatDate(payment.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(payment.amount, loan.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(payment.principal, loan.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(payment.interest, loan.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(payment.balance, loan.currency)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function LoansSection() {
  const {
    loans,
    categories,
    paymentMethods,
    isLoading,
    pending: pendingCommitments,
  } = useAppData();
  const { isMutating } = useAppStatus();
  const { addLoan, editLoan, removeLoan, confirmLoanPayment, registerAll } =
    useAppActions();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<LoanWithNames | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<LoanWithNames | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const pending = pendingCommitments.loans;

  const outstanding = useMemo(() => outstandingByDirection(loans), [loans]);

  function openCreate() {
    setEditing(null);
    setIsFormOpen(true);
  }

  async function handleSubmit(values: NewLoan) {
    if (editing) {
      await editLoan(editing.id, values);
    } else {
      await addLoan(values);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeLoan(pendingDeletion.id);
    setPendingDeletion(null);
  }

  async function payAll() {
    // One write for the lot, in the order listed: a loan's later payment
    // follows its earlier one (see recordSteps).
    await registerAll(
      pending.map((entry) => ({
        kind: "loan",
        id: entry.loan.id,
        index: entry.index,
        date: entry.date,
        amount: entry.amount,
      })),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionIntro
        description="Préstamos con o sin interés, en cualquiera de las dos direcciones."
        actionLabel="Nuevo préstamo"
        onAction={openCreate}
      />

      {!isLoading && outstanding.size > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Deliberately not netted into one figure: owing 100 and being owed
              300 is two facts, and a single "200" hides both. */}
          {(["borrowed", "lent"] as const).flatMap((direction) =>
            Array.from(outstanding.get(direction) ?? []).map(([currency, total]) => (
              <Card key={`${direction}-${currency}`}>
                <CardHeader>
                  <CardDescription>
                    {LOAN_DIRECTION_LABELS[direction]} en {currency}
                  </CardDescription>
                  <CardTitle
                    className={cn("text-2xl tabular-nums", directionTone(direction))}
                  >
                    {formatCurrency(total, currency)}
                  </CardTitle>
                </CardHeader>
              </Card>
            )),
          )}
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
            <CardDescription>Confirmá cada una cuando se haya pagado.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col">
              {pending.map((entry) => (
                <li
                  key={`${entry.loan.id}-${entry.index}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">
                      {entry.loan.description}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary">
                        Cuota {entry.number} de {entry.loan.installment_count}
                      </Badge>
                      <Badge variant="outline">
                        {LOAN_DIRECTION_LABELS[entry.loan.direction]} ·{" "}
                        {entry.loan.counterparty}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.date)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        directionTone(entry.loan.direction),
                      )}
                    >
                      {entry.loan.direction === "borrowed" ? "-" : "+"}
                      {formatCurrency(entry.amount, entry.loan.currency)}
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
                        void confirmLoanPayment(
                          entry.loan.id,
                          entry.index,
                          entry.date,
                          entry.amount,
                        )
                      }
                    >
                      <Check />
                      <span className="sr-only">
                        Registrar cuota {entry.number} de {entry.loan.description}
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
        title="Préstamos"
        isLoading={isLoading}
        isEmpty={loans.length === 0}
        empty={{
          message: "Todavía no cargaste ningún préstamo.",
          actionLabel: "Cargar el primero",
          onAction: openCreate,
        }}
      >
        <ul className="flex flex-col gap-5">
          {loans.map((loan) => {
            const remaining = outstandingPrincipal(loan);
            const paidRatio = loan.confirmed_count / loan.installment_count;
            const isSettled = loan.confirmed_count >= loan.installment_count;

            return (
              <li key={loan.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <HandCoins className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">
                      {loan.description}
                    </span>
                    <Badge variant="secondary">
                      {loan.confirmed_count} / {loan.installment_count}
                    </Badge>
                    <Badge variant="outline">
                      {LOAN_DIRECTION_LABELS[loan.direction]} · {loan.counterparty}
                    </Badge>
                    {isSettled && <Badge variant="secondary">Saldado</Badge>}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        "text-sm tabular-nums",
                        isSettled
                          ? "text-muted-foreground"
                          : directionTone(loan.direction),
                      )}
                    >
                      {formatCurrency(remaining, loan.currency)} pendiente
                    </span>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      label="Ver cronograma"
                      onClick={() =>
                        setExpanded((current) => (current === loan.id ? null : loan.id))
                      }
                    >
                      <ChevronDown
                        className={cn(
                          "transition-transform",
                          expanded === loan.id && "rotate-180",
                        )}
                      />
                      <span className="sr-only">
                        Ver cronograma de {loan.description}
                      </span>
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      label="Editar"
                      onClick={() => {
                        setEditing(loan);
                        setIsFormOpen(true);
                      }}
                    >
                      <Pencil />
                      <span className="sr-only">Editar {loan.description}</span>
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      label="Eliminar"
                      onClick={() => setPendingDeletion(loan)}
                    >
                      <Trash2 />
                      <span className="sr-only">Eliminar {loan.description}</span>
                    </ActionButton>
                  </div>
                </div>

                <ProgressBar ratio={paidRatio} />

                <p className="text-xs text-muted-foreground">
                  Capital {formatCurrency(loan.principal, loan.currency)} ·{" "}
                  {loan.annual_rate === 0 ? "sin interés" : `${loan.annual_rate}% TNA`} ·
                  primera cuota {formatDate(loan.first_due_date)}
                </p>

                {expanded === loan.id && <AmortizationSchedule loan={loan} />}
              </li>
            );
          })}
        </ul>
      </ListCard>

      <LoanDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        categories={categories}
        paymentMethods={paymentMethods}
        onSubmitLoan={handleSubmit}
      />

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar este préstamo?"
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
