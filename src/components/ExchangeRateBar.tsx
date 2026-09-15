import { useState } from "react";
import { Pencil, RefreshCw } from "lucide-react";
import { z } from "zod";
import { ActionButton } from "@/components/ActionButton";
import { FormDialog } from "@/components/FormDialog";
import { useDialogForm } from "@/hooks/useDialogForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppData } from "@/hooks/useAppData";
import { MANUAL_RATE_SOURCE, RATE_TYPE_LABELS } from "@/lib/exchangeRate";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const rateSchema = z.object({
  buy: z.coerce.number().positive("Debe ser mayor que 0"),
  sell: z.coerce.number().positive("Debe ser mayor que 0"),
});

type RateFormInput = z.input<typeof rateSchema>;
type RateFormValues = z.output<typeof rateSchema>;

export function ExchangeRateBar() {
  const {
    rateType,
    exchangeRate,
    isRefreshingRate,
    refreshExchangeRate,
    saveManualExchangeRate,
  } = useAppData();

  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useDialogForm<RateFormInput, RateFormValues>({
    schema: rateSchema,
    open: isEditing,
    defaultValues: { buy: 0, sell: 0 },
    values: { buy: exchangeRate?.buy ?? 0, sell: exchangeRate?.sell ?? 0 },
  });

  async function onSubmit(values: RateFormValues) {
    await saveManualExchangeRate(values.buy, values.sell);
    setIsEditing(false);
  }

  const isManual = exchangeRate?.source === MANUAL_RATE_SOURCE;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {exchangeRate ? (
        <span>
          Dólar {RATE_TYPE_LABELS[rateType]} {formatCurrency(exchangeRate.sell, "ARS")} ·{" "}
          {formatDate(exchangeRate.date)}
          {isManual && " · cargado a mano"}
        </span>
      ) : (
        <span>
          Sin cotización de {RATE_TYPE_LABELS[rateType].toLowerCase()} todavía. Conectate
          a internet o cargala a mano.
        </span>
      )}

      <ActionButton
        type="button"
        variant="ghost"
        size="icon-sm"
        label="Actualizar cotización"
        disabled={isRefreshingRate}
        onClick={() => void refreshExchangeRate()}
      >
        <RefreshCw className={cn(isRefreshingRate && "animate-spin")} />
        <span className="sr-only">Actualizar cotización</span>
      </ActionButton>

      <ActionButton
        type="button"
        variant="ghost"
        size="icon-sm"
        label="Corregir cotización"
        onClick={() => setIsEditing(true)}
      >
        <Pencil />
        <span className="sr-only">Corregir cotización</span>
      </ActionButton>

      <FormDialog
        open={isEditing}
        onOpenChange={setIsEditing}
        title="Corregir cotización"
        description="Se guarda con la fecha de hoy y reemplaza a la obtenida online. Se usa el valor de venta para convertir entre pesos y dólares."
        onSubmit={handleSubmit(onSubmit)}
        isSubmitting={isSubmitting}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exchange-rate-buy">Compra</Label>
          <Input
            id="exchange-rate-buy"
            type="number"
            step="0.01"
            min="0"
            {...register("buy")}
          />
          {errors.buy && <p className="text-xs text-destructive">{errors.buy.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exchange-rate-sell">Venta</Label>
          <Input
            id="exchange-rate-sell"
            type="number"
            step="0.01"
            min="0"
            {...register("sell")}
          />
          {errors.sell && (
            <p className="text-xs text-destructive">{errors.sell.message}</p>
          )}
        </div>
      </FormDialog>
    </div>
  );
}
