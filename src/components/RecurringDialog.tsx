import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { FormDialog } from "@/components/FormDialog";
import { useDialogForm } from "@/hooks/useDialogForm";
import { useCategoryTypeSync } from "@/hooks/useCategoryTypeSync";
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
import { CURRENCY_CODES, CURRENCY_LABELS } from "@/lib/currency";
import {
  CATEGORY_TYPE_LABELS,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
} from "@/lib/labels";
import { todayIsoDate } from "@/lib/format";
import type {
  Category,
  CategoryType,
  NewRecurringTransaction,
  PaymentMethod,
  RecurringTransactionWithNames,
} from "@/db";
import { toSelectValue } from "@/lib/forms";

const recurringSchema = z.object({
  description: z.string().trim().min(1, "La descripción es obligatoria"),
  amount: z.coerce.number().positive("El monto debe ser mayor que 0"),
  type: z.enum(["income", "expense"]),
  currency: z.string().min(1, "Seleccioná una moneda"),
  categoryId: z.coerce.number().int().positive().nullable(),
  paymentMethodId: z.coerce.number().int().positive().nullable(),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  // Unlike a transaction, this one may legitimately be in the future: it is
  // when the series begins, not when something happened.
  startDate: z.string().min(1, "Seleccioná una fecha"),
});

type RecurringFormInput = z.input<typeof recurringSchema>;
type RecurringFormValues = z.output<typeof recurringSchema>;

// A recurring template is either income or an expense, so its own type is
// already the kind of category it accepts.
const recurringCategoryType = (type: CategoryType) => type;

interface RecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: RecurringTransactionWithNames | null;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  onSubmitRecurring: (recurring: NewRecurringTransaction) => Promise<void>;
}

export function RecurringDialog({
  open,
  onOpenChange,
  editing,
  categories,
  paymentMethods,
  onSubmitRecurring,
}: RecurringDialogProps) {
  const form = useDialogForm<RecurringFormInput, RecurringFormValues>({
    schema: recurringSchema,
    open,
    defaultValues: {
      description: "",
      amount: 0,
      type: "expense",
      currency: CURRENCY_CODES[0],
      categoryId: null,
      paymentMethodId: null,
      frequency: "monthly",
      startDate: todayIsoDate(),
    },
    values: editing
      ? {
          description: editing.description,
          amount: editing.amount,
          type: editing.type,
          currency: editing.currency,
          categoryId: editing.category_id,
          paymentMethodId: editing.payment_method_id,
          frequency: editing.frequency,
          startDate: editing.start_date,
        }
      : {
          description: "",
          amount: 0,
          type: "expense",
          currency: CURRENCY_CODES[0],
          categoryId: null,
          paymentMethodId: null,
          frequency: "monthly",
          startDate: todayIsoDate(),
        },
  });

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const selectedCurrency = watch("currency");

  // Declared after `useDialogForm` so the reset that loads a template runs
  // before the check inside; see the hook.
  const availableCategories = useCategoryTypeSync({
    form,
    categories,
    typeField: "type",
    categoryField: "categoryId",
    categoryTypeFor: recurringCategoryType,
    // The category is optional here — "Sin categoría" is a real answer — so a
    // selection that no longer fits is dropped rather than replaced.
    fallback: "none",
  });

  const availableAccounts = useMemo(
    () => paymentMethods.filter((method) => method.currency === selectedCurrency),
    [paymentMethods, selectedCurrency],
  );

  async function onSubmit(values: RecurringFormValues) {
    await onSubmitRecurring({
      ...values,
      // Editing must not silently resume a template the user had paused.
      isActive: editing ? editing.is_active === 1 : true,
    });
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar recurrente" : "Nueva recurrente"}
      description="La fecha de inicio ancla toda la serie. Si es el 31, los meses cortos usan su último día y el resto vuelve al 31."
      className="sm:max-w-lg"
      layout="grid"
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="recurring-description">Descripción</Label>
        <Input
          id="recurring-description"
          placeholder="Ej. Alquiler"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-type">Tipo</Label>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select
              items={CATEGORY_TYPE_LABELS}
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger id="recurring-type" className="w-full">
                <SelectValue placeholder="Seleccioná un tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">{CATEGORY_TYPE_LABELS.expense}</SelectItem>
                <SelectItem value="income">{CATEGORY_TYPE_LABELS.income}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-amount">Monto</Label>
        <Input
          id="recurring-amount"
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
        <Label htmlFor="recurring-currency">Moneda</Label>
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              items={CURRENCY_LABELS}
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger id="recurring-currency" className="w-full">
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
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-frequency">Frecuencia</Label>
        <Controller
          control={control}
          name="frequency"
          render={({ field }) => (
            <Select
              items={RECURRENCE_FREQUENCY_LABELS}
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger id="recurring-frequency" className="w-full">
                <SelectValue placeholder="Seleccioná una frecuencia" />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_FREQUENCIES.map((frequency) => (
                  <SelectItem key={frequency} value={frequency}>
                    {RECURRENCE_FREQUENCY_LABELS[frequency]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-category">Categoría</Label>
        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <Select
              items={Object.fromEntries(
                availableCategories.map((category) => [
                  String(category.id),
                  category.name,
                ]),
              )}
              value={toSelectValue(field.value)}
              onValueChange={(value) => field.onChange(Number(value))}
            >
              <SelectTrigger id="recurring-category" className="w-full">
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.icon} {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recurring-account">Cuenta</Label>
        <Controller
          control={control}
          name="paymentMethodId"
          render={({ field }) => (
            <Select
              items={Object.fromEntries(
                availableAccounts.map((method) => [String(method.id), method.name]),
              )}
              value={toSelectValue(field.value)}
              onValueChange={(value) => field.onChange(Number(value))}
              disabled={availableAccounts.length === 0}
            >
              <SelectTrigger id="recurring-account" className="w-full">
                <SelectValue placeholder="Sin cuenta" />
              </SelectTrigger>
              <SelectContent>
                {availableAccounts.map((method) => (
                  <SelectItem key={method.id} value={String(method.id)}>
                    {method.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="recurring-start">Primera ocurrencia</Label>
        <Controller
          control={control}
          name="startDate"
          render={({ field }) => (
            <DatePicker
              id="recurring-start"
              value={field.value}
              onChange={field.onChange}
              className="sm:w-auto"
            />
          )}
        />
        {errors.startDate && (
          <p className="text-xs text-destructive">{errors.startDate.message}</p>
        )}
      </div>
    </FormDialog>
  );
}
