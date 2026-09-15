import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListCard } from "@/components/ListCard";
import { ActionButton } from "@/components/ActionButton";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageHeader } from "@/components/layout/PageHeader";
import { PaymentMethodDialog } from "@/components/PaymentMethodDialog";
import { ExchangeRateBar } from "@/components/ExchangeRateBar";
import { useAppData } from "@/hooks/useAppData";
import {
  calculateAccountBalances,
  consolidateByCurrency,
  totalBalanceByCurrency,
} from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { outstandingByCurrency } from "@/lib/installments";
import { PAYMENT_METHOD_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { NewPaymentMethod, PaymentMethod } from "@/db";

export function AccountsView() {
  const {
    paymentMethods,
    transactions,
    installmentPlans,
    exchangeRate,
    isLoading,
    isMutating,
    addPaymentMethod,
    editPaymentMethod,
    removePaymentMethod,
  } = useAppData();

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

  const debtByCurrency = useMemo(
    () => outstandingByCurrency(installmentPlans),
    [installmentPlans],
  );

  const debtArs = useMemo(
    () => consolidateByCurrency(debtByCurrency, "ARS", exchangeRate?.sell ?? 0),
    [debtByCurrency, exchangeRate],
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

  // What deleting the account will do with its history, in figures: the
  // movements and the opening balance move to "Sin asignar" rather than
  // disappearing (see deletePaymentMethod).
  const deletionNotice = useMemo(() => {
    if (pendingDeletion === null) return "";
    const movements = transactions.filter(
      (transaction) =>
        transaction.payment_method_id === pendingDeletion.id ||
        transaction.destination_payment_method_id === pendingDeletion.id,
    ).length;
    const unassigned = `«Sin asignar (${pendingDeletion.currency})»`;

    if (movements === 1) {
      return `Su movimiento se conserva y pasa a ${unassigned}, junto con su saldo.`;
    }
    if (movements > 1) {
      return `Sus ${movements} movimientos se conservan y pasan a ${unassigned}, junto con su saldo.`;
    }
    if (pendingDeletion.initial_balance !== 0) {
      return `No tiene movimientos; su saldo inicial pasa a ${unassigned}.`;
    }
    return "No tiene movimientos registrados.";
  }, [pendingDeletion, transactions]);

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
        description="Gestiona tus cuentas y métodos de pago."
        actions={
          <Button type="button" onClick={openCreateDialog}>
            <Plus />
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

          {/* Shown only when there is debt: an always-visible pair of zeroes
              would add noise for anyone who never buys in instalments. */}
          {debtArs !== null && debtArs > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardDescription>Deuda pendiente</CardDescription>
                  <CardTitle className="text-2xl text-red-600 dark:text-red-400">
                    {formatCurrency(debtArs, "ARS")}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cuotas que todavía no registraste
                  </p>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <CardDescription>Patrimonio neto</CardDescription>
                  <CardTitle className="text-2xl">
                    {netWorthArs === null
                      ? "—"
                      : formatCurrency(netWorthArs - debtArs, "ARS")}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Bruto menos la deuda pendiente
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
          message: "Todavía no tienes cuentas registradas.",
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
                  (balances.get(method.id) ?? 0) < 0 && "text-red-600 dark:text-red-400",
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

      <AlertDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{pendingDeletion?.name}». {deletionNotice}
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
