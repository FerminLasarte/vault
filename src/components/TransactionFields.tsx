import { useMemo, type ReactNode } from "react";
import { Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { TagInput } from "@/components/TagInput";
import type {
  TransactionFieldsState,
  TransactionForm,
} from "@/hooks/useTransactionFields";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { CURRENCY_LABELS } from "@/lib/currency";
import { onIdPicked, toSelectValue } from "@/lib/forms";
import { cn } from "@/lib/utils";
import type { Tag } from "@/db";

interface TransactionFieldsProps {
  form: TransactionForm;
  // What useTransactionFields worked out for this form.
  fields: TransactionFieldsState;
  tags: Tag[];
  // Prefixes every field's id. The dialog and the inspector can be on screen
  // together, and two fields sharing an id would leave a label pointing at the
  // wrong one.
  idPrefix: string;
  // Drawn under the category, for the inspector to say which rule matches.
  categoryHint?: ReactNode;
}

// The fields of a transaction, drawn the same way wherever one is written.
//
// Only the drawing: what the form does on its own lives in useTransactionFields,
// which the owner of the form calls. The column spans only take effect inside
// the dialog's two-column grid; in the inspector's single column they do
// nothing.
export function TransactionFields({
  form,
  fields,
  tags,
  idPrefix,
  categoryHint,
}: TransactionFieldsProps) {
  const {
    control,
    register,
    formState: { errors },
  } = form;
  const {
    isTransfer,
    isCrossCurrency,
    selectedCurrency,
    filteredCategories,
    originAccounts,
    destinationAccounts,
    destinationAccount,
    descriptionField,
    markCategoryChosen,
  } = fields;

  const id = (name: string) => `${idPrefix}-${name}`;

  const originSelectItems = useMemo(
    () =>
      Object.fromEntries(
        originAccounts.map((method) => [String(method.id), method.name]),
      ),
    [originAccounts],
  );

  const destinationSelectItems = useMemo(
    () =>
      Object.fromEntries(
        destinationAccounts.map((method) => [
          String(method.id),
          `${method.name} (${method.currency})`,
        ]),
      ),
    [destinationAccounts],
  );

  const categorySelectItems = useMemo(
    () =>
      Object.fromEntries(
        filteredCategories.map((category) => [String(category.id), category.name]),
      ),
    [filteredCategories],
  );

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("type")}>Tipo</Label>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select
              items={TRANSACTION_TYPE_LABELS}
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger id={id("type")} className="w-full">
                <SelectValue placeholder="Seleccioná un tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">{TRANSACTION_TYPE_LABELS.expense}</SelectItem>
                <SelectItem value="income">{TRANSACTION_TYPE_LABELS.income}</SelectItem>
                <SelectItem value="transfer">
                  {TRANSACTION_TYPE_LABELS.transfer}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("amount")}>{isTransfer ? "Monto enviado" : "Monto"}</Label>
        <Input
          id={id("amount")}
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          {...register("amount")}
        />
        {errors.amount && (
          <p className="text-xs text-destructive">{errors.amount.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("currency")}>Moneda</Label>
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              items={CURRENCY_LABELS}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger id={id("currency")} className="w-full">
                <SelectValue placeholder="Seleccioná una moneda" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CURRENCY_LABELS).map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.currency && (
          <p className="text-xs text-destructive">{errors.currency.message}</p>
        )}
      </div>

      {!isTransfer && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("category")}>Categoría</Label>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select
                items={categorySelectItems}
                value={toSelectValue(field.value)}
                onValueChange={onIdPicked((categoryId) => {
                  markCategoryChosen();
                  field.onChange(categoryId);
                })}
              >
                <SelectTrigger id={id("category")} className="w-full">
                  <SelectValue placeholder="Seleccioná una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.categoryId && (
            <p className="text-xs text-destructive">{errors.categoryId.message}</p>
          )}
          {categoryHint}
        </div>
      )}

      <div className={cn("flex flex-col gap-1.5", !isTransfer && "sm:col-span-2")}>
        <Label htmlFor={id("payment-method")}>
          {isTransfer ? "Cuenta de origen" : "Método de pago"}
        </Label>
        <Controller
          control={control}
          name="paymentMethodId"
          render={({ field }) => (
            <Select
              items={originSelectItems}
              value={toSelectValue(field.value)}
              onValueChange={onIdPicked(field.onChange)}
              disabled={originAccounts.length === 0}
            >
              <SelectTrigger id={id("payment-method")} className="w-full">
                <SelectValue placeholder="Seleccioná un método de pago" />
              </SelectTrigger>
              <SelectContent>
                {originAccounts.map((method) => (
                  <SelectItem key={method.id} value={String(method.id)}>
                    {method.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {originAccounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay cuentas en {selectedCurrency}. Creá una en la sección Cuentas.
          </p>
        ) : (
          errors.paymentMethodId && (
            <p className="text-xs text-destructive">{errors.paymentMethodId.message}</p>
          )
        )}
      </div>

      {isTransfer && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("destination")}>Cuenta de destino</Label>
          <Controller
            control={control}
            name="destinationPaymentMethodId"
            render={({ field }) => (
              <Select
                items={destinationSelectItems}
                value={toSelectValue(field.value)}
                onValueChange={onIdPicked(field.onChange)}
                disabled={destinationAccounts.length === 0}
              >
                <SelectTrigger id={id("destination")} className="w-full">
                  <SelectValue placeholder="Seleccioná la cuenta de destino" />
                </SelectTrigger>
                <SelectContent>
                  {destinationAccounts.map((method) => (
                    <SelectItem key={method.id} value={String(method.id)}>
                      {method.name} ({method.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.destinationPaymentMethodId && (
            <p className="text-xs text-destructive">
              {errors.destinationPaymentMethodId.message}
            </p>
          )}
        </div>
      )}

      {isCrossCurrency && destinationAccount && (
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={id("destination-amount")}>
            Monto recibido en {destinationAccount.currency}
          </Label>
          <Input
            id={id("destination-amount")}
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register("destinationAmount")}
          />
          <p className="text-xs text-muted-foreground">
            Lo que realmente entra en «{destinationAccount.name}». Al registrar ambos
            importes no hace falta ninguna cotización.
          </p>
          {errors.destinationAmount && (
            <p className="text-xs text-destructive">{errors.destinationAmount.message}</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={id("date")}>Fecha</Label>
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DatePicker
              id={id("date")}
              value={field.value}
              onChange={field.onChange}
              max={new Date()}
              className="sm:w-auto"
            />
          )}
        />
        {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={id("description")}>Descripción</Label>
        <Input
          id={id("description")}
          placeholder={
            isTransfer ? "Ej. Compra de dólares" : "Ej. Compra en el supermercado"
          }
          {...descriptionField}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={id("tags")}>Etiquetas</Label>
        <Controller
          control={control}
          name="tags"
          render={({ field }) => (
            <TagInput
              id={id("tags")}
              value={field.value}
              onChange={field.onChange}
              suggestions={tags}
            />
          )}
        />
      </div>
    </>
  );
}
