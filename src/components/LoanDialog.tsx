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
import { frenchPayment, monthlyRate, totalCost, totalInterest } from "@/lib/loans";
import { formatCurrency, todayIsoDate } from "@/lib/format";
import { toSelectValue } from "@/lib/forms";
import { LOAN_DIRECTION_LABELS } from "@/lib/labels";
import type { Category, LoanWithNames, NewLoan, PaymentMethod } from "@/db";

const loanSchema = z.object({
  direction: z.enum(["borrowed", "lent"]),
  counterparty: z.string().trim().min(1, "Indicá con quién es el préstamo"),
  description: z.string().trim().min(1, "La descripción es obligatoria"),
  principal: z.coerce.number().positive("El capital debe ser mayor que 0"),
  currency: z.string().min(1, "Seleccioná una moneda"),
  // Zero is valid on purpose: a loan between two people usually has no
  // interest, and that is the same maths with a rate of nothing.
  annualRate: z.coerce
    .number()
    .min(0, "La tasa no puede ser negativa")
    .max(1000, "Esa tasa parece un error"),
  installmentCount: z.coerce
    .number()
    .int()
    .min(1, "Necesita al menos una cuota")
    .max(360, "Como máximo 360 cuotas"),
  categoryId: z.coerce.number().int().positive().nullable(),
  paymentMethodId: z.coerce.number().int().positive().nullable(),
  firstDueDate: z.string().min(1, "Seleccioná una fecha"),
});

type LoanFormInput = z.input<typeof loanSchema>;
type LoanFormValues = z.output<typeof loanSchema>;

// Which categories make sense depends on the direction: repaying what I owe is
// an expense, being repaid is income.
const loanCategoryType = (direction: LoanFormInput["direction"]) =>
  direction === "borrowed" ? "expense" : "income";

const EMPTY_LOAN: LoanFormInput = {
  direction: "borrowed",
  counterparty: "",
  description: "",
  principal: 0,
  currency: CURRENCY_CODES[0],
  annualRate: 0,
  installmentCount: 12,
  categoryId: null,
  paymentMethodId: null,
  firstDueDate: todayIsoDate(),
};

interface LoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: LoanWithNames | null;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  onSubmitLoan: (loan: NewLoan) => Promise<void>;
}

export function LoanDialog({
  open,
  onOpenChange,
  editing,
  categories,
  paymentMethods,
  onSubmitLoan,
}: LoanDialogProps) {
  const form = useDialogForm<LoanFormInput, LoanFormValues>({
    schema: loanSchema,
    open,
    defaultValues: EMPTY_LOAN,
    values: editing
      ? {
          direction: editing.direction,
          counterparty: editing.counterparty,
          description: editing.description,
          principal: editing.principal,
          currency: editing.currency,
          annualRate: editing.annual_rate,
          installmentCount: editing.installment_count,
          categoryId: editing.category_id,
          paymentMethodId: editing.payment_method_id,
          firstDueDate: editing.first_due_date,
        }
      : EMPTY_LOAN,
  });

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const principal = Number(watch("principal")) || 0;
  const annualRate = Number(watch("annualRate")) || 0;
  const count = Number(watch("installmentCount")) || 0;
  const currency = watch("currency");
  const direction = watch("direction");

  // Shown live, because what a loan actually costs is the one thing worth
  // knowing before agreeing to it — and it is not visible from the terms alone.
  const preview = useMemo(() => {
    if (principal <= 0 || count < 1) return null;

    const terms = {
      principal,
      annual_rate: annualRate,
      installment_count: count,
      first_due_date: todayIsoDate(),
      confirmed_count: 0,
    };

    return {
      payment: frenchPayment(principal, monthlyRate(annualRate), count),
      interest: totalInterest(terms),
      cost: totalCost(terms),
    };
  }, [principal, annualRate, count]);

  // Declared after `useDialogForm` so the reset that loads a loan runs before
  // the check inside; see the hook.
  const relevantCategories = useCategoryTypeSync({
    form,
    categories,
    typeField: "direction",
    categoryField: "categoryId",
    categoryTypeFor: loanCategoryType,
    // The category is optional here — "Sin categoría" is a real answer — so a
    // selection that no longer fits is dropped rather than replaced.
    fallback: "none",
  });

  const availableAccounts = useMemo(
    () => paymentMethods.filter((method) => method.currency === currency),
    [paymentMethods, currency],
  );

  async function onSubmit(values: LoanFormValues) {
    await onSubmitLoan(values);
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar préstamo" : "Nuevo préstamo"}
      description="Cada cuota se propone en su mes y se registra cuando la confirmes. Con tasa 0 las cuotas son todas iguales."
      className="sm:max-w-lg"
      layout="grid"
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loan-direction">Tipo</Label>
        <Controller
          control={control}
          name="direction"
          render={({ field }) => (
            <Select
              items={LOAN_DIRECTION_LABELS}
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger id="loan-direction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LOAN_DIRECTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loan-counterparty">
          {direction === "borrowed" ? "Le debo a" : "Me debe"}
        </Label>
        <Input
          id="loan-counterparty"
          placeholder="Ej. Banco Nación, Martín"
          {...register("counterparty")}
        />
        {errors.counterparty && (
          <p className="text-xs text-destructive">{errors.counterparty.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="loan-description">Descripción</Label>
        <Input
          id="loan-description"
          placeholder="Ej. Préstamo personal"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loan-principal">Capital</Label>
        <Input
          id="loan-principal"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          {...register("principal")}
        />
        {errors.principal && (
          <p className="text-xs text-destructive">{errors.principal.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loan-rate">Tasa anual (TNA %)</Label>
        <Input
          id="loan-rate"
          type="number"
          step="0.01"
          min="0"
          placeholder="0"
          {...register("annualRate")}
        />
        {errors.annualRate && (
          <p className="text-xs text-destructive">{errors.annualRate.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loan-count">Cantidad de cuotas</Label>
        <Input
          id="loan-count"
          type="number"
          step="1"
          min="1"
          {...register("installmentCount")}
        />
        {errors.installmentCount && (
          <p className="text-xs text-destructive">{errors.installmentCount.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loan-currency">Moneda</Label>
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              items={CURRENCY_LABELS}
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger id="loan-currency" className="w-full">
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

      {preview && (
        <div className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:col-span-2">
          <p className="text-sm">
            {count} {count === 1 ? "cuota" : "cuotas"} de{" "}
            <span className="font-medium">
              {formatCurrency(preview.payment, currency)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {preview.interest === 0
              ? "Sin interés: se devuelve exactamente el capital."
              : `Interés total ${formatCurrency(preview.interest, currency)} · ${
                  direction === "borrowed" ? "vas a pagar" : "vas a cobrar"
                } ${formatCurrency(preview.cost, currency)} en total.`}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loan-category">Categoría</Label>
        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <Select
              items={Object.fromEntries(
                relevantCategories.map((category) => [
                  String(category.id),
                  category.name,
                ]),
              )}
              value={toSelectValue(field.value)}
              onValueChange={(value) => field.onChange(Number(value))}
            >
              <SelectTrigger id="loan-category" className="w-full">
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                {relevantCategories.map((category) => (
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
        <Label htmlFor="loan-account">Cuenta</Label>
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
              <SelectTrigger id="loan-account" className="w-full">
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
        <Label htmlFor="loan-first-due">Primera cuota</Label>
        <Controller
          control={control}
          name="firstDueDate"
          render={({ field }) => (
            <DatePicker
              id="loan-first-due"
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
