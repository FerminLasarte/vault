import { useMemo, type ReactNode } from "react";
import { Controller, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiNote } from "@/components/AiMark";
import { DatePicker } from "@/components/DatePicker";
import { DescriptionAutocomplete } from "@/components/DescriptionAutocomplete";
import { TagInput } from "@/components/TagInput";
import type {
  TransactionFieldsState,
  TransactionForm,
} from "@/hooks/useTransactionFields";
import { merchantName } from "@/lib/ai/merchants";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { CURRENCY_LABELS } from "@/lib/currency";
import { idSelectProps } from "@/lib/forms";
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
  // Drawn under the category instead of the default note, for the inspector
  // to say which rule matches and offer what to do about it. Null draws
  // nothing.
  categoryHint?: ReactNode;
  // Whether the local AI is on, which decides whether the merchant name the
  // lists will show is announced under the description.
  aiEnabled: boolean;
}

// The fields of a transaction, drawn the same way wherever one is written.
//
// The description comes first, the way a movement is said — what it was, then
// how much and with what — and because picking a past merchant there fills in
// the fields below it.
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
  aiEnabled,
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
    descriptionOptions,
    pickDescription,
    suggestion,
    markCategoryChosen,
  } = fields;

  const id = (name: string) => `${idPrefix}-${name}`;
  const descriptionPlaceholder = isTransfer
    ? "Ej. Compra de dólares"
    : "Ej. Compra en el supermercado";

  // The name the lists will show for what is being typed, when the AI
  // recognises a merchant in it. Said here so a row never changes name without
  // its description having explained why.
  const description = useWatch({ control, name: "description" });
  const shownAs = aiEnabled ? merchantName(description ?? "") : null;

  // Said while the category is the one the AI suggested, whoever put it there:
  // a choice the user makes for themselves says nothing about the AI.
  const categoryId = useWatch({ control, name: "categoryId" });
  const aiReason =
    suggestion?.source === "ai" && suggestion.categoryId === categoryId
      ? suggestion.reason
      : null;

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
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={id("description")}>Descripción</Label>
        {descriptionOptions === null ? (
          <Input
            id={id("description")}
            placeholder={descriptionPlaceholder}
            {...descriptionField}
          />
        ) : (
          <DescriptionAutocomplete
            id={id("description")}
            placeholder={descriptionPlaceholder}
            {...descriptionField}
            value={description ?? ""}
            options={descriptionOptions}
            onPick={pickDescription}
          />
        )}
        {shownAs !== null && (
          <AiNote reason="Vault reconoce el comercio en el texto del banco. La descripción guardada no cambia.">
            Se muestra como «{shownAs}»
          </AiNote>
        )}
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

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
                {...idSelectProps(categorySelectItems, field.value, (categoryId) => {
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
          {categoryHint !== undefined
            ? categoryHint
            : aiReason !== null && <AiNote reason={aiReason}>Sugerida por IA</AiNote>}
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
              {...idSelectProps(originSelectItems, field.value, field.onChange)}
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
                {...idSelectProps(destinationSelectItems, field.value, field.onChange)}
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
