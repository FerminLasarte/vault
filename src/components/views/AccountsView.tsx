import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListCard } from "@/components/ListCard";
import { ActionButton } from "@/components/ActionButton";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { PaymentMethodDialog } from "@/components/PaymentMethodDialog";
import { ExchangeRateBar } from "@/components/ExchangeRateBar";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import {
  calculateAccountBalances,
  consolidateByCurrency,
  totalBalanceByCurrency,
} from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { netWorthAdjustments } from "@/lib/netWorth";
import { PAYMENT_METHOD_TYPE_LABELS } from "@/lib/labels";
import { accountCommitmentsNotice, accountGoalsNotice } from "@/lib/deletionNotice";
import { cn } from "@/lib/utils";
import type { NewPaymentMethod, PaymentMethod } from "@/db";

export function AccountsView() {
  const {
    paymentMethods,
    transactions,
    recurring,
    installmentPlans,
    loans,
    expectedMovements,
    savingsGoals,
    exchangeRate,
    isLoading,
  } = useAppData();
  const { isMutating } = useAppStatus();
  const { addPaymentMethod, editPaymentMethod, removePaymentMethod } = useAppActions();

  // Balances are derived, never stored: recomputing them from the movements
  // keeps them correct after any edit or deletion, with nothing to resync.
  const balances = useMemo(
    () => calculateAccountBalances(paymentMethods, transactions),
    [paymentMethods, transactions],
  );

  const totalsByCurrency = useMemo(
    () => totalBalanceByCurrency(paymentMethods, balances),
    [paymentMethods, balances],
  );

  const currencyTotals = useMemo(() => Array.from(totalsByCurrency), [totalsByCurrency]);

  const adjustments = useMemo(
    () => netWorthAdjustments(installmentPlans, loans),
    [installmentPlans, loans],
  );

  const debtArs = useMemo(
    () => consolidateByCurrency(adjustments.debt, "ARS", exchangeRate?.sell ?? 0),
    [adjustments, exchangeRate],
  );

  const receivableArs = useMemo(
    () => consolidateByCurrency(adjustments.receivable, "ARS", exchangeRate?.sell ?? 0),
    [adjustments, exchangeRate],
  );

  // Null whenever there is no usable rate yet, which the card reports instead
  // of showing a total that silently leaves one currency out.
  const netWorthArs = useMemo(
    () => consolidateByCurrency(totalsByCurrency, "ARS", exchangeRate?.sell ?? 0),
    [totalsByCurrency, exchangeRate],
  );

  const netWorthUsd = useMemo(
    () => consolidateByCurrency(totalsByCurrency, "USD", exchangeRate?.sell ?? 0),
    [totalsByCurrency, exchangeRate],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PaymentMethod | null>(null);

  // What deleting the account will do with what hangs off it, in figures: the
  // movements, the opening balance and the commitments move to "Sin asignar"
  // rather than disappearing (see deletePaymentMethod), and a savings goal that
  // follows its balance is left following nothing.
  const deletionNotice = useMemo(() => {
    if (pendingDeletion === null) return "";
    const movements = transactions.filter(
      (transaction) =>
        transaction.payment_method_id === pendingDeletion.id ||
        transaction.destination_payment_method_id === pendingDeletion.id,
    ).length;
    const unassigned = `«Sin asignar (${pendingDeletion.currency})»`;

    const history =
      movements === 1
        ? `Su movimiento se conserva y pasa a ${unassigned}, junto con su saldo.`
        : movements > 1
          ? `Sus ${movements} movimientos se conservan y pasan a ${unassigned}, junto con su saldo.`
          : pendingDeletion.initial_balance !== 0
            ? `No tiene movimientos; su saldo inicial pasa a ${unassigned}.`
            : "No tiene movimientos registrados.";

    const usesIt = (row: { payment_method_id: number | null }) =>
      row.payment_method_id === pendingDeletion.id;
    const commitments = accountCommitmentsNotice(
      [recurring, installmentPlans, loans, expectedMovements]
        .map((rows) => rows.filter(usesIt).length)
        .reduce((sum, count) => sum + count, 0),
      pendingDeletion.currency,
    );
    const goals = accountGoalsNotice(
      savingsGoals.filter((goal) => goal.tracking_mode === "account" && usesIt(goal))
        .length,
    );
    return [history, commitments, goals].filter((part) => part !== null).join(" ");
  }, [
    pendingDeletion,
    transactions,
    recurring,
    installmentPlans,
    loans,
    expectedMovements,
    savingsGoals,
  ]);

  function openCreateDialog() {
    setEditing(null);
    setIsFormOpen(true);
  }

  function openEditDialog(method: PaymentMethod) {
    setEditing(method);
    setIsFormOpen(true);
  }

  async function handleSubmitMethod(values: NewPaymentMethod) {
    if (editing) {
      await editPaymentMethod(editing.id, values);
    } else {
      await addPaymentMethod(values);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removePaymentMethod(pendingDeletion.id);
    setPendingDeletion(null);
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Cuentas"
        description="Gestioná tus cuentas y métodos de pago."
        actions={
          <Button type="button" onClick={openCreateDialog}>
            <Plus data-motion="turn" />
            Nueva cuenta
          </Button>
        }
      />

      {!isLoading && currencyTotals.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {currencyTotals.map(([currency, total]) => (
              <Card key={currency}>
                <CardHeader>
                  <CardDescription>Total en {currency}</CardDescription>
                  <CardTitle className="text-2xl">
                    {formatCurrency(total, currency)}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}

            <Card>
              <CardHeader>
                <CardDescription>Patrimonio bruto</CardDescription>
                <CardTitle className="text-2xl">
                  {netWorthArs === null ? "—" : formatCurrency(netWorthArs, "ARS")}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {netWorthUsd === null
                    ? "Necesita una cotización para consolidar"
                    : `≈ ${formatCurrency(netWorthUsd, "USD")}`}
                </p>
              </CardHeader>
            </Card>
          </div>

          {/* Shown only when something is owed either way: an always-visible
              pair of zeroes would add noise for anyone who never buys in
              instalments or lends money. */}
          {debtArs !== null &&
            receivableArs !== null &&
            (debtArs > 0 || receivableArs > 0) && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {debtArs > 0 && (
                  <Card>
                    <CardHeader>
                      <CardDescription>Deuda pendiente</CardDescription>
                      <CardTitle className="text-2xl text-negative">
                        {formatCurrency(debtArs, "ARS")}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Cuotas sin registrar y el capital de los préstamos que debés
                      </p>
                    </CardHeader>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardDescription>Patrimonio neto</CardDescription>
                    <CardTitle className="text-2xl">
                      {netWorthArs === null
                        ? "—"
                        : formatCurrency(netWorthArs - debtArs + receivableArs, "ARS")}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {receivableArs === 0
                        ? "Bruto menos la deuda pendiente"
                        : debtArs === 0
                          ? "Bruto más lo que te deben"
                          : "Bruto menos la deuda, más lo que te deben"}
                    </p>
                  </CardHeader>
                </Card>
              </div>
            )}

          <ExchangeRateBar />
        </div>
      )}

      <ListCard
        title="Cuentas y métodos de pago"
        isLoading={isLoading}
        isEmpty={paymentMethods.length === 0}
        empty={{
          message: "Todavía no tenés cuentas registradas.",
          actionLabel: "Agregar la primera",
          onAction: openCreateDialog,
        }}
      >
        <ul className="flex flex-col">
          {paymentMethods.map((method) => (
            <li
              key={method.id}
              className="flex items-center gap-4 border-b border-border py-3 last:border-0"
            >
              {/* The name column takes the slack rather than the row
                      distributing it: with `justify-between` the amount sat
                      wherever each account name happened to end, so the column
                      came out ragged from one row to the next. */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium">{method.name}</span>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">
                    {PAYMENT_METHOD_TYPE_LABELS[method.type]}
                  </Badge>
                  <Badge variant="outline">{method.currency}</Badge>
                </div>
              </div>

              <span
                className={cn(
                  "shrink-0 text-right text-sm font-medium tabular-nums",
                  (balances.get(method.id) ?? 0) < 0 && "text-negative",
                )}
              >
                {formatCurrency(balances.get(method.id) ?? 0, method.currency)}
              </span>

              <div className="flex shrink-0 items-center gap-1">
                <ActionButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  label="Editar"
                  onClick={() => openEditDialog(method)}
                >
                  <Pencil />
                  <span className="sr-only">Editar {method.name}</span>
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  label="Eliminar"
                  onClick={() => setPendingDeletion(method)}
                >
                  <Trash2 />
                  <span className="sr-only">Eliminar {method.name}</span>
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      </ListCard>

      <PaymentMethodDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        onSubmitMethod={handleSubmitMethod}
      />

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar esta cuenta?"
        description={
          <>
            Se eliminará «{pendingDeletion?.name}». {deletionNotice}
          </>
        }
        onConfirm={handleConfirmDelete}
        isMutating={isMutating}
      />
    </div>
  );
}
