import { useState } from "react";
import { Pencil, RefreshCw } from "lucide-react";
import { z } from "zod";
import { ActionButton } from "@/components/ActionButton";
import { FormDialog } from "@/components/FormDialog";
import { Hint } from "@/components/Hint";
import { useDialogForm } from "@/hooks/useDialogForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import { MANUAL_RATE_SOURCE, RATE_TYPE_LABELS } from "@/lib/exchangeRate";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const rateSchema = z.object({
  buy: z.coerce.number().positive("Debe ser mayor que 0"),
  sell: z.coerce.number().positive("Debe ser mayor que 0"),
});

type RateFormInput = z.input<typeof rateSchema>;
type RateFormValues = z.output<typeof rateSchema>;

// The quote every conversion in the app is made with, at the foot of the
// sidebar.
//
// It used to be a line repeated under the balance, under the analysis figures
// and on the accounts screen: three copies of one fact, and none of them in
// sight from anywhere else. The quote belongs to the whole app rather than to
// any one screen, so it lives where the whole app is always visible.
//
// Collapsed, the sidebar has room for one button and no text, so the refresh
// button stays and carries the quote in its hint; correcting it by hand waits
// for a window wide enough to show what is being corrected.
export function ExchangeRateStatus() {
  const { rateType, exchangeRate } = useAppData();
  const { isRefreshingRate } = useAppStatus();
  const { refreshExchangeRate, saveManualExchangeRate } = useAppActions();

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

  const label = `Dólar ${RATE_TYPE_LABELS[rateType]}`;
  const value = exchangeRate ? formatCurrency(exchangeRate.sell, "ARS") : null;
  const detail = exchangeRate
    ? `${formatDate(exchangeRate.date)}${exchangeRate.source === MANUAL_RATE_SOURCE ? " · cargada a mano" : ""}`
    : "Conectate a internet o cargala a mano.";

  return (
    <div className="flex items-center justify-center gap-1 py-2 sm:justify-start sm:pr-1 sm:pl-3">
      <div className="hidden min-w-0 flex-1 flex-col sm:flex">
        <span className="text-xs text-sidebar-foreground/70">{label}</span>
        <span
          // Keyed by what it says, so a refreshed quote fades in rather than
          // swapping its digits in place — the same as the figures it feeds.
          key={value}
          className="arrive text-sm font-medium tabular-nums"
        >
          {value ?? "Sin cotización"}
        </span>
        <span className="text-xs text-sidebar-foreground/70">{detail}</span>
      </div>

      <Hint
        anchor="element"
        side="right"
        // Collapsed, this hint is the only place the quote is shown, so it
        // leads, on a line of its own above what the button does; expanded, it
        // is already on screen beside the button.
        label={
          <span className="flex flex-col">
            <span className="sm:hidden">
              {label}: {value ?? "sin cotización"}
              {exchangeRate && ` · ${detail}`}
            </span>
            <span>Actualizar cotización</span>
          </span>
        }
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={isRefreshingRate}
            onClick={() => void refreshExchangeRate()}
          />
        }
      >
        <RefreshCw className={cn(isRefreshingRate && "animate-spin")} />
        <span className="sr-only">Actualizar cotización</span>
      </Hint>

      <ActionButton
        type="button"
        variant="ghost"
        size="icon-sm"
        label="Corregir cotización"
        side="right"
        className="hidden sm:inline-flex"
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
