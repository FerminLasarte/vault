import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/DatePicker";
import { CURRENCY_CODES, CURRENCY_LABELS } from "@/lib/currency";
import type {
  NewSavingsGoal,
  PaymentMethod,
  SavingsGoalWithNames,
  SavingsTrackingMode,
} from "@/db";
import { toSelectValue } from "@/lib/forms";

const goalSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio"),
    targetAmount: z.coerce.number().positive("El objetivo debe ser mayor que 0"),
    currency: z.string().min(1, "Seleccioná una moneda"),
    trackingMode: z.enum(["account", "contributions"]),
    paymentMethodId: z.coerce.number().int().positive().nullable(),
    targetDate: z.string().nullable(),
  })
  // An account-tracked goal without an account would sit at zero forever with
  // no way for the user to see why.
  .superRefine((values, ctx) => {
    if (values.trackingMode === "account" && values.paymentMethodId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethodId"],
        message: "Elegí la cuenta que querés seguir",
      });
    }
  });

type GoalFormInput = z.input<typeof goalSchema>;
type GoalFormValues = z.output<typeof goalSchema>;

const TRACKING_LABELS: Record<SavingsTrackingMode, string> = {
  account: "Saldo de una cuenta",
  contributions: "Aportes que registrás",
};

interface SavingsGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: SavingsGoalWithNames | null;
  paymentMethods: PaymentMethod[];
  onSubmitGoal: (goal: NewSavingsGoal) => Promise<void>;
}

export function SavingsGoalDialog({
  open,
  onOpenChange,
  editing,
  paymentMethods,
  onSubmitGoal,
}: SavingsGoalDialogProps) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useDialogForm<GoalFormInput, GoalFormValues>({
    schema: goalSchema,
    open,
    defaultValues: {
      name: "",
      targetAmount: 0,
      currency: CURRENCY_CODES[0],
      trackingMode: "contributions",
      paymentMethodId: null,
      targetDate: null,
    },
    values: editing
      ? {
          name: editing.name,
          targetAmount: editing.target_amount,
          currency: editing.currency,
          trackingMode: editing.tracking_mode,
          paymentMethodId: editing.payment_method_id,
          targetDate: editing.target_date,
        }
      : {
          name: "",
          targetAmount: 0,
          currency: CURRENCY_CODES[0],
          trackingMode: "contributions",
          paymentMethodId: null,
          targetDate: null,
        },
  });

  const trackingMode = watch("trackingMode");
  const currency = watch("currency");

  const availableAccounts = useMemo(
    () => paymentMethods.filter((method) => method.currency === currency),
    [paymentMethods, currency],
  );

  async function onSubmit(values: GoalFormValues) {
    await onSubmitGoal(values);
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar objetivo" : "Nuevo objetivo"}
      description="Elegí cómo se mide el avance: solo con el saldo de una cuenta, o registrando vos cada aporte."
      className="sm:max-w-lg"
      layout="grid"
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="goal-name">Nombre</Label>
        <Input id="goal-name" placeholder="Ej. Viaje a Japón" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Cómo se mide</Label>
        <Controller
          control={control}
          name="trackingMode"
          render={({ field }) => (
            <Tabs
              value={field.value}
              onValueChange={(next) => field.onChange(String(next))}
            >
              <TabsList>
                <TabsTrigger value="contributions">
                  {TRACKING_LABELS.contributions}
                </TabsTrigger>
                <TabsTrigger value="account">{TRACKING_LABELS.account}</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="goal-target">Objetivo</Label>
        <Input
          id="goal-target"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          {...register("targetAmount")}
        />
        {errors.targetAmount && (
          <p className="text-xs text-destructive">{errors.targetAmount.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="goal-currency">Moneda</Label>
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              items={CURRENCY_LABELS}
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger id="goal-currency" className="w-full">
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

      {trackingMode === "account" && (
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="goal-account">Cuenta a seguir</Label>
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
                <SelectTrigger id="goal-account" className="w-full">
                  <SelectValue placeholder="Seleccioná una cuenta" />
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
          {availableAccounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No hay cuentas en {currency}. Creá una en la sección Cuentas.
            </p>
          ) : (
            errors.paymentMethodId && (
              <p className="text-xs text-destructive">{errors.paymentMethodId.message}</p>
            )
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="goal-date">Fecha límite (opcional)</Label>
        <Controller
          control={control}
          name="targetDate"
          render={({ field }) => (
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                id="goal-date"
                value={field.value ?? ""}
                onChange={field.onChange}
                className="sm:w-auto"
              />
              {field.value && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => field.onChange(null)}
                >
                  Quitar
                </Button>
              )}
            </div>
          )}
        />
        <p className="text-xs text-muted-foreground">
          Con fecha límite te digo si el ritmo actual alcanza.
        </p>
      </div>
    </FormDialog>
  );
}
