import { useMemo, useState } from "react";
import { ChevronDown, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ActionButton";
import { CloseNarrative } from "@/components/CloseNarrative";
import { PageHeader } from "@/components/layout/PageHeader";
import { ListCard } from "@/components/ListCard";
import { PrintableSheet } from "@/components/reports/PrintableSheet";
import { PrintableClose } from "@/components/reports/PrintableClose";
import { useAppData } from "@/hooks/useAppData";
import { usePrintRequest } from "@/hooks/usePrintRequest";
import { buildMonthlyTrend, filterByCurrency } from "@/lib/finance";
import {
  buildMonthlyClose,
  closeDocumentTitle,
  closedMonthKeys,
  type MonthlyClose,
} from "@/lib/monthlyClose";
import { narrateMonth } from "@/lib/ai/closeNarrative";
import { CURRENCY_CODES } from "@/lib/currency";
import { formatCurrency, formatMonthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MonthTotals {
  currency: string;
  income: number;
  expenses: number;
  balance: number;
}

// Every month that has closed, and a way to put each one on paper.
//
// The notice on the overview announces a close once and then stops
// asking, which is right for a nudge and wrong for an archive: a report you
// dealt with in September is still the report of August. This is where they all
// stay.
//
// Nothing is stored. Each document is built from the transactions when it is
// asked for, so a movement corrected months later corrects its close too — a
// saved PDF would have quietly gone stale instead.
//
// There is no currency switch here on purpose. A close covers whatever the
// month moved, so choosing a currency first would only ever mean choosing which
// half of it to look at.
export function ClosesView() {
  const {
    transactions,
    categories,
    recurring,
    installmentPlans,
    loans,
    aiEnabled,
    isLoading,
  } = useAppData();
  const { request, requestPrint } = usePrintRequest<string>();

  // The month whose narrative is open. One at a time, like the loan schedules.
  const [expanded, setExpanded] = useState<string | null>(null);

  // A month's close in a few sentences, from the local AI; null with it off.
  const narrate = useMemo(() => {
    if (!aiEnabled) return null;
    const sources = {
      transactions,
      categories,
      commitments: { recurring, installmentPlans, loans },
    };
    return (close: MonthlyClose) => narrateMonth(close, sources);
  }, [aiEnabled, transactions, categories, recurring, installmentPlans, loans]);

  const monthKeys = useMemo(() => closedMonthKeys(transactions), [transactions]);

  // The figures the list shows are exactly what `buildMonthlyTrend` produces, so
  // it is called once per currency rather than reimplemented in one pass: two
  // walks over a few hundred rows is not worth a second copy of "what counts as
  // income". Building a full close per row would be the expensive mistake —
  // that one walks the history once per comparison period too.
  const months = useMemo(() => {
    const byCurrency = CURRENCY_CODES.map((currency) => ({
      currency,
      trend: buildMonthlyTrend(filterByCurrency(transactions, currency), monthKeys),
    }));

    return (
      monthKeys
        .map((monthKey, index) => ({
          monthKey,
          totals: byCurrency
            .map(({ currency, trend }) => ({
              currency,
              income: trend[index].income,
              expenses: trend[index].expenses,
              balance: trend[index].income - trend[index].expenses,
            }))
            // A currency that did not move that month says nothing by being
            // listed as three zeroes.
            .filter(
              (entry): entry is MonthTotals => entry.income > 0 || entry.expenses > 0,
            ),
        }))
        // A month can still end up with no figures at all — an expense of zero
        // counts as a movement but adds nothing — and a row has to lead with
        // one currency, so such a month is left out rather than rendered.
        .filter((month) => month.totals.length > 0)
    );
  }, [transactions, monthKeys]);

  // Only the month actually being printed is built in full, and only once it is
  // asked for.
  const printing = useMemo(() => {
    if (request === null) return null;
    const close = buildMonthlyClose(transactions, request.target);

    return {
      close,
      narrative: narrate?.(close),
      // Stamped when the document is built rather than on every render, so the
      // date on the footer is the moment it was produced.
      generatedAt: new Date().toISOString(),
    };
  }, [request, transactions, narrate]);

  // Only the month that is open is narrated, and only while it is.
  const narrative = useMemo(
    () =>
      expanded === null || narrate === null
        ? null
        : narrate(buildMonthlyClose(transactions, expanded)),
    [expanded, narrate, transactions],
  );

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Cierres"
        description="Cómo terminó cada mes, comparado con el anterior y con el mismo mes del año pasado."
      />

      <PrintableSheet>
        {printing && (
          <PrintableClose
            close={printing.close}
            narrative={printing.narrative}
            generatedAt={printing.generatedAt}
          />
        )}
      </PrintableSheet>

      <ListCard
        title="Meses cerrados"
        description="El mes en curso no aparece: un cierre que todavía puede cambiar no es un cierre."
        isLoading={isLoading}
        isEmpty={months.length === 0}
        empty={{ message: "Todavía no cerró ningún mes con movimientos." }}
      >
        <ul className="flex flex-col">
          {months.map((month) => {
            // The first currency leads and the rest sit under it, quieter: they
            // are the same month, and stacking them keeps that visible without
            // ever suggesting the two figures could be added.
            const [main, ...rest] = month.totals;
            const isOpen = expanded === month.monthKey;

            return (
              <li
                key={month.monthKey}
                className="flex flex-col border-b border-border py-3 last:border-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">
                      {formatMonthLabel(month.monthKey)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(main.income, main.currency)} de ingresos ·{" "}
                      {formatCurrency(main.expenses, main.currency)} de gastos
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex flex-col items-end">
                      <span
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          main.balance < 0 && "text-negative",
                        )}
                      >
                        {formatCurrency(main.balance, main.currency)}
                      </span>
                      {rest.map((entry) => (
                        <span
                          key={entry.currency}
                          className={cn(
                            "text-xs tabular-nums text-muted-foreground",
                            entry.balance < 0 && "text-negative/80",
                          )}
                        >
                          {formatCurrency(entry.balance, entry.currency)}
                        </span>
                      ))}
                    </div>

                    {narrate !== null && (
                      <ActionButton
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        label="Ver resumen"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : month.monthKey)}
                      >
                        <ChevronDown className={cn(isOpen && "rotate-180")} />
                        <span className="sr-only">
                          Ver resumen de {formatMonthLabel(month.monthKey)}
                        </span>
                      </ActionButton>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        requestPrint(month.monthKey, closeDocumentTitle(month.monthKey))
                      }
                    >
                      <FileDown />
                      Guardar como PDF
                    </Button>
                  </div>
                </div>

                {isOpen && narrative !== null && <CloseNarrative narrative={narrative} />}
              </li>
            );
          })}
        </ul>
      </ListCard>
    </div>
  );
}
