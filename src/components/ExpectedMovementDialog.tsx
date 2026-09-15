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
import { CATEGORY_TYPE_LABELS } from "@/lib/labels";
import { todayIsoDate } from "@/lib/format";
import type {
  Category,
  CategoryType,
  ExpectedMovementWithNames,
  NewExpectedMovement,
  PaymentMethod,
} from "@/db";
import { toSelectValue } from "@/lib/forms";

const expectedSchema = z.object({
  description: z.string().trim().min(1, "La descripción es obligatoria"),
  amount: z.coerce.number().positive("El monto debe ser mayor que 0"),
  type: z.enum(["income", "expense"]),
  currency: z.string().min(1, "Seleccioná una moneda"),
  categoryId: z.coerce.number().int().positive().nullable(),
  paymentMethodId: z.coerce.number().int().positive().nullable(),
  // Nothing stops a date in the past: something can be known to be coming and
  // then be entered late, and rejecting it would only teach the user to lie
  // about the date to get the form to close.
  dueDate: z.string().min(1, "Seleccioná una fecha"),
});

type ExpectedFormInput = z.input<typeof expectedSchema>;
type ExpectedFormValues = z.output<typeof expectedSchema>;

// An expected movement is either income or an expense, so its own type is
// already the kind of category it accepts.
const expectedCategoryType = (type: CategoryType) => type;

const BLANK: ExpectedFormInput = {
  description: "",
  amount: 0,
  type: "expense",
  currency: CURRENCY_CODES[0],
  categoryId: null,
  paymentMethodId: null,
  dueDate: todayIsoDate(),
};

interface ExpectedMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ExpectedMovementWithNames | null;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  onSubmitExpected: (movement: NewExpectedMovement) => Promise<void>;
}

export function ExpectedMovementDialog({
  open,
  onOpenChange,
  editing,
  categories,
  paymentMethods,
  onSubmitExpected,
}: ExpectedMovementDialogProps) {
  const form = useDialogForm<ExpectedFormInput, ExpectedFormValues>({
    schema: expectedSchema,
    open,
    defaultValues: BLANK,
    values: editing
      ? {
          description: editing.description,
          amount: editing.amount,
          type: editing.type,
          currency: editing.currency,
          categoryId: editing.category_id,
          paymentMethodId: editing.payment_method_id,
          dueDate: editing.due_date,
        }
      : BLANK,
  });

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const selectedCurrency = watch("currency");

  // Declared after `useDialogForm` so the reset that loads a movement runs
  // before the check inside; see the hook.
  const availableCategories = useCategoryTypeSync({
    form,
    categories,
    typeField: "type",
    categoryField: "categoryId",
    categoryTypeFor: expectedCategoryType,
    // "Sin categoría" is a real answer here, so a selection that stops fitting
    // is dropped rather than replaced with one the user never picked.
    fallback: "none",
  });

  const availableAccounts = useMemo(
    () => paymentMethods.filter((method) => method.currency === selectedCurrency),
    [paymentMethods, selectedCurrency],
  );

  async function onSubmit(values: ExpectedFormValues) {
    await onSubmitExpected(values);
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar previsto" : "Nuevo previsto"}
      // Says what belongs here and, just as importantly, what does not: the
      // yearly insurance is a recurrente, and someone who files it here would
      // have to re-enter it every year without ever being told why.
      description="Algo que sabés que se viene y ocurre una sola vez. Si se repite todos los meses o todos los años, cargalo como recurrente."
      className="sm:max-w-lg"
      layout="grid"
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="expected-description">Descripción</Label>
        <Input
          id="expected-description"
          placeholder="Ej. Casamiento de Ana"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expected-type">Tipo</Label>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select
              items={CATEGORY_TYPE_LABELS}
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger id="expected-type" className="w-full">
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
        <Label htmlFor="expected-amount">Monto</Label>
        <Input
          id="expected-amount"
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
        <Label htmlFor="expected-currency">Moneda</Label>
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              items={CURRENCY_LABELS}
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger id="expected-currency" className="w-full">
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
        <Label htmlFor="expected-date">Fecha</Label>
        <Controller
          control={control}
          name="dueDate"
          render={({ field }) => (
            <DatePicker
              id="expected-date"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {errors.dueDate && (
          <p className="text-xs text-destructive">{errors.dueDate.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expected-category">Categoría</Label>
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
              <SelectTrigger id="expected-category" className="w-full">
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
        <Label htmlFor="expected-account">Cuenta</Label>
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
              <SelectTrigger id="expected-account" className="w-full">
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
    </FormDialog>
  );
}
