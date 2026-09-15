import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { FormDialog } from "@/components/FormDialog";
import { useDialogForm } from "@/hooks/useDialogForm";
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
import { financingCost, installmentAmounts } from "@/lib/installments";
import { formatCurrency, formatPercent, todayIsoDate } from "@/lib/format";
import type {
  Category,
  InstallmentPlanWithNames,
  NewInstallmentPlan,
  PaymentMethod,
} from "@/db";
import { toSelectValue } from "@/lib/forms";

const planSchema = z.object({
  description: z.string().trim().min(1, "La descripción es obligatoria"),
  totalAmount: z.coerce.number().positive("El total debe ser mayor que 0"),
  installmentCount: z.coerce
    .number()
    .int()
    .min(2, "Una compra en cuotas necesita al menos 2")
    .max(120, "Como máximo 120 cuotas"),
  currency: z.string().min(1, "Seleccioná una moneda"),
  categoryId: z.coerce.number().int().positive().nullable(),
  paymentMethodId: z.coerce.number().int().positive().nullable(),
  firstDueDate: z.string().min(1, "Seleccioná una fecha"),
  // Optional on purpose. Plenty of purchases really are interest-free, and an
  // empty field means "no lo sé" rather than "no hay recargo" — so it stays
  // null instead of defaulting to the total.
  cashPrice: z
    .union([z.literal(""), z.coerce.number().positive("Debe ser mayor que 0")])
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});

type PlanFormInput = z.input<typeof planSchema>;
type PlanFormValues = z.output<typeof planSchema>;

interface InstallmentPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: InstallmentPlanWithNames | null;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  onSubmitPlan: (plan: NewInstallmentPlan) => Promise<void>;
}

export function InstallmentPlanDialog({
  open,
  onOpenChange,
  editing,
  categories,
  paymentMethods,
  onSubmitPlan,
}: InstallmentPlanDialogProps) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useDialogForm<PlanFormInput, PlanFormValues>({
    schema: planSchema,
    open,
    defaultValues: {
      description: "",
      totalAmount: 0,
      installmentCount: 12,
      currency: CURRENCY_CODES[0],
      categoryId: null,
      paymentMethodId: null,
      firstDueDate: todayIsoDate(),
      cashPrice: null,
    },
    values: editing
      ? {
          description: editing.description,
          totalAmount: editing.total_amount,
          installmentCount: editing.installment_count,
          currency: editing.currency,
          categoryId: editing.category_id,
          paymentMethodId: editing.payment_method_id,
          firstDueDate: editing.first_due_date,
          cashPrice: editing.cash_price,
        }
      : {
          description: "",
          totalAmount: 0,
          installmentCount: 12,
          currency: CURRENCY_CODES[0],
          categoryId: null,
          paymentMethodId: null,
          firstDueDate: todayIsoDate(),
          cashPrice: null,
        },
  });

  const total = Number(watch("totalAmount")) || 0;
  const count = Number(watch("installmentCount")) || 0;
  const currency = watch("currency");
  const cashPriceInput = watch("cashPrice");

  // Shown live so the split — and the cent the last instalment absorbs — is
  // visible before saving rather than a surprise later.
  const preview = useMemo(() => {
    if (total <= 0 || count < 2) return null;
    const amounts = installmentAmounts(total, count);
    const first = amounts[0];
    const last = amounts[amounts.length - 1];
    return { first, last, differs: first !== last };
  }, [total, count]);

  // What the financing costs, shown while the form is still being filled: the
  // point of asking for the cash price is to see this before committing.
  const cost = useMemo(() => {
    const cash = Number(cashPriceInput);
    if (!cashPriceInput || !Number.isFinite(cash)) return null;
    return financingCost({ total_amount: total, cash_price: cash });
  }, [total, cashPriceInput]);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories],
  );

  const availableAccounts = useMemo(
    () => paymentMethods.filter((method) => method.currency === currency),
    [paymentMethods, currency],
  );

  async function onSubmit(values: PlanFormValues) {
    await onSubmitPlan(values);
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar compra en cuotas" : "Nueva compra en cuotas"}
      description="Cada cuota se propone en su mes y se registra cuando la confirmes."
      className="sm:max-w-lg"
      layout="grid"
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="plan-description">Descripción</Label>
        <Input
          id="plan-description"
          placeholder="Ej. Notebook"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-total">Total</Label>
        <Input
          id="plan-total"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          {...register("totalAmount")}
        />
        {errors.totalAmount && (
          <p className="text-xs text-destructive">{errors.totalAmount.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-cash-price">Precio de contado (opcional)</Label>
        <Input
          id="plan-cash-price"
          type="number"
          step="0.01"
          min="0"
          placeholder="Si lo sabés"
          {...register("cashPrice")}
        />
        {errors.cashPrice && (
          <p className="text-xs text-destructive">{errors.cashPrice.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-count">Cantidad de cuotas</Label>
        <Input
          id="plan-count"
          type="number"
          step="1"
          min="2"
          {...register("installmentCount")}
        />
        {errors.installmentCount && (
          <p className="text-xs text-destructive">{errors.installmentCount.message}</p>
        )}
      </div>

      {cost && (
        <p className="text-xs sm:col-span-2">
          {cost.surcharge > 0 ? (
            <span className="text-destructive">
              Pagás {formatCurrency(cost.surcharge, currency)} más que al contado (
              {formatPercent(cost.ratio)}).
            </span>
          ) : cost.surcharge < 0 ? (
            <span className="text-muted-foreground">
              Sale {formatCurrency(Math.abs(cost.surcharge), currency)} menos que al
              contado.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Sin recargo: son cuotas sin interés.
            </span>
          )}
        </p>
      )}

      {preview && (
        <p className="text-xs text-muted-foreground sm:col-span-2">
          {count} cuotas de {formatCurrency(preview.first, currency)}
          {preview.differs &&
            `, y la última de ${formatCurrency(preview.last, currency)} para que cierre exacto`}
          .
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-currency">Moneda</Label>
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              items={CURRENCY_LABELS}
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger id="plan-currency" className="w-full">
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
        <Label htmlFor="plan-category">Categoría</Label>
        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <Select
              items={Object.fromEntries(
                expenseCategories.map((category) => [String(category.id), category.name]),
              )}
              value={toSelectValue(field.value)}
              onValueChange={(value) => field.onChange(Number(value))}
            >
              <SelectTrigger id="plan-category" className="w-full">
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                {expenseCategories.map((category) => (
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
        <Label htmlFor="plan-account">Cuenta</Label>
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
              <SelectTrigger id="plan-account" className="w-full">
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-first-due">Primera cuota</Label>
        <Controller
          control={control}
          name="firstDueDate"
          render={({ field }) => (
            <DatePicker
              id="plan-first-due"
              value={field.value}
              onChange={field.onChange}
              className="w-full"
            />
          )}
        />
        {errors.firstDueDate && (
          <p className="text-xs text-destructive">{errors.firstDueDate.message}</p>
        )}
      </div>
    </FormDialog>
  );
}
