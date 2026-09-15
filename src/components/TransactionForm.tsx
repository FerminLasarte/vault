import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCategoryTypeSync } from "@/hooks/useCategoryTypeSync";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
  Category,
  CategoryRuleWithCategory,
  TransactionType,
  Tag,
  NewTransaction,
  PaymentMethod,
  TransactionWithCategory,
} from "@/db";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { CURRENCY_LABELS } from "@/lib/currency";
import { todayIsoDate } from "@/lib/format";
import { matchCategoryIdForType } from "@/lib/categoryRules";
import { splitTagNames } from "@/lib/text";
import { cn } from "@/lib/utils";
import { toSelectValue } from "@/lib/forms";

const transactionFormSchema = z
  .object({
    type: z.enum(["income", "expense", "transfer"]),
    amount: z.coerce.number().positive("El monto debe ser mayor que 0"),
    currency: z.string().min(1, "Seleccioná una moneda"),
    paymentMethodId: z.coerce.number().int().positive("Seleccioná un método de pago"),
    destinationPaymentMethodId: z.coerce.number().int().positive().nullable(),
    destinationAmount: z.coerce.number().positive().nullable(),
    categoryId: z.coerce.number().int().positive().nullable(),
    description: z.string().trim().min(1, "La descripción es obligatoria"),
    date: z
      .string()
      .min(1, "Seleccioná una fecha")
      .refine((value) => value <= todayIsoDate(), {
        message: "La fecha no puede ser posterior a hoy",
      }),
  })
  // Which fields are required depends on the type: a transfer needs a
  // destination account and cannot have a category, while income and expenses
  // need a category and have no destination.
  .superRefine((values, ctx) => {
    if (values.type === "transfer") {
      if (values.destinationPaymentMethodId === null) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationPaymentMethodId"],
          message: "Seleccioná la cuenta de destino",
        });
      } else if (values.destinationPaymentMethodId === values.paymentMethodId) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationPaymentMethodId"],
          message: "La cuenta de destino debe ser distinta de la de origen",
        });
      }
      if (values.destinationAmount === null) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationAmount"],
          message: "Indicá cuánto llega a la cuenta de destino",
        });
      }
      return;
    }

    if (values.categoryId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Seleccioná una categoría",
      });
    }
  });

type TransactionFormInput = z.input<typeof transactionFormSchema>;
type TransactionFormValues = z.output<typeof transactionFormSchema>;

// A transfer moves money between two accounts of the user's own, so it is
// neither income nor an expense and takes no category at all.
const transactionCategoryType = (type: TransactionType) =>
  type === "transfer" ? null : type;

interface TransactionFormProps {
  categories: Category[];
  categoryRules: CategoryRuleWithCategory[];
  tags: Tag[];
  paymentMethods: PaymentMethod[];
  defaultCurrency: string;
  // When set, the form edits this transaction instead of creating a new one.
  editing?: TransactionWithCategory | null;
  onSubmitTransaction: (transaction: NewTransaction, tags: string[]) => Promise<void>;
}

function blankForm(currency: string): TransactionFormInput {
  return {
    type: "expense",
    amount: 0,
    currency,
    paymentMethodId: undefined,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    categoryId: null,
    description: "",
    date: todayIsoDate(),
  };
}

export function TransactionForm({
  categories,
  categoryRules,
  tags,
  paymentMethods,
  defaultCurrency,
  editing = null,
  onSubmitTransaction,
}: TransactionFormProps) {
  const isEditing = editing !== null;

  const form = useForm<TransactionFormInput, unknown, TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: blankForm(defaultCurrency),
  });

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  // Load the transaction being edited, or fall back to a blank form when
  // switching back to create mode.
  useEffect(() => {
    categoryTouchedRef.current = false;
    setSelectedTags(splitTagNames(editing?.tag_names ?? null));
    reset(
      editing
        ? {
            type: editing.type,
            amount: editing.amount,
            currency: editing.currency,
            paymentMethodId: editing.payment_method_id ?? undefined,
            destinationPaymentMethodId: editing.destination_payment_method_id,
            destinationAmount: editing.destination_amount,
            categoryId: editing.category_id,
            description: editing.description,
            date: editing.date,
          }
        : blankForm(defaultCurrency),
    );
    // `defaultCurrency` is intentionally excluded: changing the view's filter
    // should not wipe a form the user is already filling in. The separate
    // effect below syncs just that field in create mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, reset]);

  // Keep the currency field in sync with the view's currency filter, so a new
  // transaction defaults to whichever currency the user is looking at. Never
  // applied while editing, which would overwrite the saved currency.
  useEffect(() => {
    if (isEditing) return;
    setValue("currency", defaultCurrency);
  }, [defaultCurrency, isEditing, setValue]);

  // Once the user picks a category by hand, the rules stop second-guessing them
  // until they edit the description again — an autocomplete that keeps
  // overriding a deliberate choice is worse than no autocomplete.
  const categoryTouchedRef = useRef(false);

  // Kept outside react-hook-form because tags are their own table rather than a
  // field on the transaction, and they are saved through a separate call.
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const selectedType = watch("type");
  const typedDescription = watch("description");
  const selectedCurrency = watch("currency");
  const selectedPaymentMethodId = watch("paymentMethodId");
  const selectedDestinationId = watch("destinationPaymentMethodId");
  const selectedAmount = watch("amount");

  const isTransfer = selectedType === "transfer";

  // Declared after the effect that loads a transaction for editing, so that
  // reset runs before the check inside; see the hook.
  const filteredCategories = useCategoryTypeSync({
    form,
    categories,
    typeField: "type",
    categoryField: "categoryId",
    categoryTypeFor: transactionCategoryType,
    // Income and expenses require a category, so one that no longer fits is
    // replaced rather than left empty.
    fallback: "first",
  });

  // Only accounts held in the transaction's own currency can pay for it. For a
  // transfer this is the origin side.
  const originAccounts = useMemo(
    () => paymentMethods.filter((method) => method.currency === selectedCurrency),
    [paymentMethods, selectedCurrency],
  );

  // The destination is deliberately not filtered by currency: moving pesos into
  // a dollar account is the whole point of supporting cross-currency transfers.
  const destinationAccounts = useMemo(
    () => paymentMethods.filter((method) => method.id !== selectedPaymentMethodId),
    [paymentMethods, selectedPaymentMethodId],
  );

  const destinationAccount = useMemo(
    () => paymentMethods.find((method) => method.id === selectedDestinationId) ?? null,
    [paymentMethods, selectedDestinationId],
  );

  // When both sides hold the same currency the arriving figure is simply the
  // amount sent, so the field is hidden and kept in sync behind the scenes.
  const isSameCurrencyTransfer =
    isTransfer &&
    destinationAccount !== null &&
    destinationAccount.currency === selectedCurrency;

  const isCrossCurrency =
    isTransfer &&
    destinationAccount !== null &&
    destinationAccount.currency !== selectedCurrency;

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

  // Keep the selected origin valid whenever the currency changes or accounts load.
  useEffect(() => {
    const stillValid = originAccounts.some(
      (method) => method.id === selectedPaymentMethodId,
    );
    if (!stillValid) {
      setValue("paymentMethodId", originAccounts[0]?.id, {
        shouldValidate: false,
      });
    }
  }, [originAccounts, selectedPaymentMethodId, setValue]);

  // Drop a destination that stopped being selectable (it became the origin, or
  // the type went back to income/expense).
  useEffect(() => {
    if (!isTransfer) {
      setValue("destinationPaymentMethodId", null, { shouldValidate: false });
      setValue("destinationAmount", null, { shouldValidate: false });
      return;
    }
    if (
      selectedDestinationId !== null &&
      !destinationAccounts.some((method) => method.id === selectedDestinationId)
    ) {
      setValue("destinationPaymentMethodId", null, { shouldValidate: false });
    }
  }, [isTransfer, destinationAccounts, selectedDestinationId, setValue]);

  // Mirror the sent amount into the received one for same-currency transfers,
  // so the user never has to type the same figure twice. Deliberately keyed on
  // "both sides are known to match" rather than "not cross-currency": while the
  // destination is still unresolved the field must be left alone, or loading a
  // saved cross-currency transfer would overwrite its received amount with the
  // sent one.
  useEffect(() => {
    if (!isSameCurrencyTransfer) return;
    setValue("destinationAmount", selectedAmount, { shouldValidate: false });
  }, [isSameCurrencyTransfer, selectedAmount, setValue]);

  // Fill in the category from the rules as the description is typed. Only rules
  // of the form's own kind apply: an expense rule while the form is on income
  // is left alone rather than silently switching the type.
  useEffect(() => {
    if (selectedType === "transfer" || categoryTouchedRef.current) return;

    const matched = matchCategoryIdForType(
      typedDescription ?? "",
      categoryRules,
      categories,
      selectedType,
    );
    if (matched === null) return;

    setValue("categoryId", matched, { shouldValidate: false });
  }, [typedDescription, categoryRules, categories, selectedType, setValue]);

  const categorySelectItems = useMemo(
    () =>
      Object.fromEntries(
        filteredCategories.map((category) => [String(category.id), category.name]),
      ),
    [filteredCategories],
  );

  async function onSubmit(values: TransactionFormValues) {
    const transfer = values.type === "transfer";

    await onSubmitTransaction(
      {
        amount: values.amount,
        type: values.type,
        currency: values.currency,
        categoryId: transfer ? null : values.categoryId,
        paymentMethodId: values.paymentMethodId,
        destinationPaymentMethodId: transfer ? values.destinationPaymentMethodId : null,
        destinationAmount: transfer ? values.destinationAmount : null,
        description: values.description,
        date: values.date,
      },
      selectedTags,
    );

    // Keep the form ready for another entry when creating; when editing, the
    // caller closes the dialog, so blanking the fields would only flicker.
    if (isEditing) return;

    setSelectedTags([]);
    reset({
      type: values.type,
      amount: 0,
      currency: values.currency,
      paymentMethodId: values.paymentMethodId,
      destinationPaymentMethodId: values.destinationPaymentMethodId,
      destinationAmount: null,
      categoryId: values.categoryId,
      description: "",
      date: todayIsoDate(),
    });
  }

  return (
    <div className="@container">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-4 @sm:grid-cols-2"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transaction-type">Tipo</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                items={TRANSACTION_TYPE_LABELS}
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger id="transaction-type" className="w-full">
                  <SelectValue placeholder="Seleccioná un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">
                    {TRANSACTION_TYPE_LABELS.expense}
                  </SelectItem>
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
          <Label htmlFor="transaction-amount">
            {isTransfer ? "Monto enviado" : "Monto"}
          </Label>
          <Input
            id="transaction-amount"
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
          <Label htmlFor="transaction-currency">Moneda</Label>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Select
                items={CURRENCY_LABELS}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger id="transaction-currency" className="w-full">
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
            <Label htmlFor="transaction-category">Categoría</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select
                  items={categorySelectItems}
                  value={toSelectValue(field.value)}
                  onValueChange={(value) => {
                    categoryTouchedRef.current = true;
                    field.onChange(Number(value));
                  }}
                >
                  <SelectTrigger id="transaction-category" className="w-full">
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
          </div>
        )}

        <div className={cn("flex flex-col gap-1.5", !isTransfer && "@sm:col-span-2")}>
          <Label htmlFor="transaction-payment-method">
            {isTransfer ? "Cuenta de origen" : "Método de pago"}
          </Label>
          <Controller
            control={control}
            name="paymentMethodId"
            render={({ field }) => (
              <Select
                items={originSelectItems}
                value={toSelectValue(field.value)}
                onValueChange={(value) => field.onChange(Number(value))}
                disabled={originAccounts.length === 0}
              >
                <SelectTrigger id="transaction-payment-method" className="w-full">
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
            <Label htmlFor="transaction-destination">Cuenta de destino</Label>
            <Controller
              control={control}
              name="destinationPaymentMethodId"
              render={({ field }) => (
                <Select
                  items={destinationSelectItems}
                  value={toSelectValue(field.value)}
                  onValueChange={(value) => field.onChange(Number(value))}
                  disabled={destinationAccounts.length === 0}
                >
                  <SelectTrigger id="transaction-destination" className="w-full">
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
          <div className="flex flex-col gap-1.5 @sm:col-span-2">
            <Label htmlFor="transaction-destination-amount">
              Monto recibido en {destinationAccount.currency}
            </Label>
            <Input
              id="transaction-destination-amount"
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
              <p className="text-xs text-destructive">
                {errors.destinationAmount.message}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5 @sm:col-span-2">
          <Label htmlFor="transaction-date">Fecha</Label>
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <DatePicker
                id="transaction-date"
                value={field.value}
                onChange={field.onChange}
                max={new Date()}
                className="@sm:w-auto"
              />
            )}
          />
          {errors.date && (
            <p className="text-xs text-destructive">{errors.date.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 @sm:col-span-2">
          <Label htmlFor="transaction-description">Descripción</Label>
          <Input
            id="transaction-description"
            placeholder={
              isTransfer ? "Ej. Compra de dólares" : "Ej. Compra en el supermercado"
            }
            {...register("description")}
          />
          {errors.description && (
            <p className="text-xs text-destructive">{errors.description.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 @sm:col-span-2">
          <Label htmlFor="transaction-tags">Etiquetas</Label>
          <TagInput
            id="transaction-tags"
            value={selectedTags}
            onChange={setSelectedTags}
            suggestions={tags}
          />
        </div>

        <div className="@sm:col-span-2">
          <Button type="submit" disabled={isSubmitting} className="w-full @sm:w-auto">
            {isSubmitting
              ? "Guardando..."
              : isEditing
                ? "Guardar cambios"
                : isTransfer
                  ? "Registrar transferencia"
                  : "Agregar transacción"}
          </Button>
        </div>
      </form>
    </div>
  );
}
