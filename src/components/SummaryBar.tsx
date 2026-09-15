import type { ReactNode } from "react";
import { FigureBar, type Figure } from "@/components/FigureBar";
import { Hint } from "@/components/Hint";
import { formatCurrency } from "@/lib/format";
import type { FinancialSummary } from "@/lib/finance";

interface SummaryBarProps {
  // Totals for the currently selected period/filters, not an all-time balance.
  summary: FinancialSummary;
  currency: string;
  isLoading: boolean;
  // The same totals expressed in the other currency, already converted with
  // each movement valued at its own date. Null when no quote is known at all.
  convertedSummary: FinancialSummary | null;
  convertedCurrency: string;
  // Whether the conversion used the historical series or just today's quote,
  // so the figures never imply more precision than they have.
  usesHistoricalRates: boolean;
  footer?: ReactNode;
}

// Income first, then what went out, then what is left of it: the order the
// figures are arrived at.
//
// The last one is a *result*, not a balance. Income minus expenses over a slice
// of time says how that stretch went; it is not what the user has, which is a
// stock and lives on the summary tab. Two different numbers called "Balance"
// on two tabs of the same screen would be a trap.
const COLUMNS = [
  { key: "income", label: "Ingresos", tone: "positive" },
  { key: "expenses", label: "Gastos", tone: "negative" },
  { key: "result", label: "Resultado", tone: "signed" },
] as const;

// What the selected period added up to.
//
// Deliberately quiet: the analysis is read alongside the charts below it, and
// three big cards competing with them was the old arrangement.
export function SummaryBar({
  summary,
  currency,
  isLoading,
  convertedSummary,
  convertedCurrency,
  usesHistoricalRates,
  footer,
}: SummaryBarProps) {
  const values: Record<(typeof COLUMNS)[number]["key"], number> = {
    income: summary.income,
    expenses: summary.expenses,
    result: summary.balance,
  };

  const convertedValues: Record<(typeof COLUMNS)[number]["key"], number> | null =
    convertedSummary
      ? {
          income: convertedSummary.income,
          expenses: convertedSummary.expenses,
          result: convertedSummary.balance,
        }
      : null;

  const figures: Figure[] = COLUMNS.map(({ key, label, tone }) => ({
    key,
    label,
    value: isLoading ? "—" : formatCurrency(values[key], currency),
    valueClassName:
      tone === "positive"
        ? "text-positive"
        : tone === "negative"
          ? "text-negative"
          : // The result is the one figure whose colour is earned rather than
            // fixed: a period that ended in the red should say so.
            values[key] < 0
            ? "text-negative"
            : "text-positive",
    sub:
      !isLoading && convertedValues !== null ? (
        <Hint
          className="text-xs text-muted-foreground tabular-nums"
          label={
            usesHistoricalRates
              ? "Cada movimiento valuado a la cotización de su fecha"
              : "Valuado a la cotización de hoy. Traé el histórico en Ajustes para mayor precisión"
          }
        >
          ≈ {formatCurrency(convertedValues[key], convertedCurrency)}
          {!usesHistoricalRates && " *"}
        </Hint>
      ) : undefined,
  }));

  return <FigureBar figures={figures} footer={footer} />;
}
