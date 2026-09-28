import type { FieldPath, FieldValues } from "react-hook-form";
import type { PaymentMethod } from "@/db";
import { useFittingSelection, type SyncableForm } from "./useFittingSelection";

interface AccountCurrencySyncOptions<
  TFieldValues extends FieldValues,
  TCurrencyPath extends FieldPath<TFieldValues>,
  TAccountPath extends FieldPath<TFieldValues>,
> {
  form: SyncableForm<TFieldValues>;
  paymentMethods: PaymentMethod[];
  // The currency the user picks, and the account field it governs.
  currencyField: TCurrencyPath;
  accountField: TAccountPath;
}

// Outside the hook so the sync gets the same function on every render.
const accountFitsCurrency = (account: PaymentMethod, currency: unknown) =>
  account.currency === currency;

// Ties an account field to the currency the form is in: returns the accounts
// the Select should offer, and empties the account once the currency changes
// away from it, so a movement in dollars cannot be saved against an account in
// pesos.
//
// Call it *after* whatever loads a row into the form; see useFittingSelection.
export function useAccountCurrencySync<
  TFieldValues extends FieldValues,
  TCurrencyPath extends FieldPath<TFieldValues>,
  TAccountPath extends FieldPath<TFieldValues>,
>({
  form,
  paymentMethods,
  currencyField,
  accountField,
}: AccountCurrencySyncOptions<
  TFieldValues,
  TCurrencyPath,
  TAccountPath
>): PaymentMethod[] {
  return useFittingSelection({
    form,
    items: paymentMethods,
    governingField: currencyField,
    selectedField: accountField,
    fits: accountFitsCurrency,
  });
}
