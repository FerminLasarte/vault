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
import { CURRENCY_CODES } from "@/lib/currency";
import { PAYMENT_METHOD_TYPE_LABELS, PAYMENT_METHOD_TYPES } from "@/lib/labels";
import type { NewPaymentMethod, PaymentMethod } from "@/db";

const paymentMethodSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  type: z.enum(["bank", "cash", "wallet", "card", "other"]),
  currency: z.string().min(1, "Seleccioná una moneda"),
  // Negative values are legitimate here: a credit card account starts in debt.
  initialBalance: z.coerce.number("Ingresá un saldo válido"),
});

type PaymentMethodFormInput = z.input<typeof paymentMethodSchema>;
type PaymentMethodFormValues = z.output<typeof paymentMethodSchema>;

const EMPTY_METHOD: PaymentMethodFormInput = {
  name: "",
  type: "bank",
  currency: CURRENCY_CODES[0],
  initialBalance: 0,
};

const CURRENCY_ITEMS = Object.fromEntries(
  CURRENCY_CODES.map((currency) => [currency, currency]),
);

interface PaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` puts the dialog in create mode.
  editing: PaymentMethod | null;
  onSubmitMethod: (method: NewPaymentMethod) => Promise<void>;
}

export function PaymentMethodDialog({
  open,
  onOpenChange,
  editing,
  onSubmitMethod,
}: PaymentMethodDialogProps) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useDialogForm<PaymentMethodFormInput, PaymentMethodFormValues>({
    schema: paymentMethodSchema,
    open,
    defaultValues: EMPTY_METHOD,
    values: editing
      ? {
          name: editing.name,
          type: editing.type,
          currency: editing.currency,
          initialBalance: editing.initial_balance,
        }
      : EMPTY_METHOD,
  });

  async function onSubmit(values: PaymentMethodFormValues) {
    await onSubmitMethod(values);
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar cuenta" : "Nueva cuenta"}
      description="Las cuentas se usan como método de pago al registrar transacciones."
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-method-name">Nombre</Label>
        <Input
          id="payment-method-name"
          placeholder="Ej. Galicia Dólares"
          {...register("name")}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-method-type">Tipo</Label>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select
              items={PAYMENT_METHOD_TYPE_LABELS}
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger id="payment-method-type" className="w-full">
                <SelectValue placeholder="Seleccioná un tipo" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PAYMENT_METHOD_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-method-currency">Moneda</Label>
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              items={CURRENCY_ITEMS}
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger id="payment-method-currency" className="w-full">
                <SelectValue placeholder="Seleccioná una moneda" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_CODES.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-method-initial-balance">Saldo inicial</Label>
        <Input
          id="payment-method-initial-balance"
          type="number"
          step="0.01"
          placeholder="0.00"
          {...register("initialBalance")}
        />
        <p className="text-xs text-muted-foreground">
          El saldo que tenía la cuenta antes de empezar a registrar movimientos acá. Puede
          ser negativo.
        </p>
        {errors.initialBalance && (
          <p className="text-xs text-destructive">{errors.initialBalance.message}</p>
        )}
      </div>
    </FormDialog>
  );
}
