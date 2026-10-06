import { AiMark } from "@/components/AiMark";
import { FigureBar, type Figure } from "@/components/FigureBar";
import { endOfMonthBreakdown, type EndOfMonth } from "@/lib/ai/endOfMonth";
import { formatCurrency, formatDate } from "@/lib/format";
import { CURRENCY_CODES, CURRENCY_SHORT_LABELS } from "@/lib/currency";
import type { NetWorth } from "@/lib/netWorth";

interface NetWorthBarProps {
  // What the user holds in each currency, keyed by code.
  holdings: Map<string, number>;
  // The net worth and its parts, in the selected currency.
  worth: NetWorth;
  // The net worth in the other currency, or null when there is no quote.
  convertedNet: number | null;
  currency: string;
  convertedCurrency: string;
  // What the accounts in the selected currency will hold when the month ends,
  // as the local AI estimates it; null with it off or too little history.
  endOfMonth: EndOfMonth | null;
  isLoading: boolean;
}

// The figure the overview opens with: what the user is worth, all in — and
// under it, what that figure is made of.
//
// The net rather than the gross, because the gross overstates anyone paying
// something off in instalments and understates anyone who lent money. The
// gross is still there in its parts: each currency on its own, because someone
// who lives on pesos and keeps dollars aside knows perfectly well that the two
// are different pockets.
//
// A stock rather than a flow, and that is why it needs no period: it is the
// accumulated result of everything so far. It is worked out by the same
// function as the accounts screen, so the two can never disagree.
export function NetWorthBar({
  holdings,
  worth,
  convertedNet,
  currency,
  convertedCurrency,
  endOfMonth,
  isLoading,
}: NetWorthBarProps) {
  // Null rather than approximate when there is no quote to add the currencies
  // with: a total quietly missing the dollars would be wrong.
  const note =
    worth.net === null
      ? "Traé una cotización para sumar las dos monedas"
      : convertedNet !== null
        ? `≈ ${formatCurrency(convertedNet, convertedCurrency)}`
        : null;

  const lead: Figure = {
    key: "net",
    label: "Patrimonio neto",
    value: worth.net === null ? "—" : formatCurrency(worth.net, currency),
    sub: note !== null && (
      <span className="text-sm text-muted-foreground tabular-nums">{note}</span>
    ),
  };

  const figures: Figure[] = [
    ...CURRENCY_CODES.map((code) => ({
      key: code,
      label: CURRENCY_SHORT_LABELS[code] ?? code,
      value: formatCurrency(holdings.get(code) ?? 0, code),
    })),
    // Only when something is owed either way: an always-visible pair of zeroes
    // would add noise for anyone who never buys in instalments or lends money.
    ...(worth.debt !== null && worth.debt > 0
      ? [
          {
            key: "debt",
            label: "Deuda pendiente",
            value: formatCurrency(worth.debt, currency),
            valueClassName: "text-negative",
          },
        ]
      : []),
    ...(worth.receivable !== null && worth.receivable > 0
      ? [
          {
            key: "receivable",
            label: "Te deben",
            value: formatCurrency(worth.receivable, currency),
          },
        ]
      : []),
    // Where the selected currency's pocket ends the month: an estimate, so it
    // carries the AI's mark and what it is made of.
    ...(endOfMonth !== null
      ? [
          {
            key: "end-of-month",
            label: "Fin de mes estimado",
            value: formatCurrency(endOfMonth.estimate, currency),
            valueClassName: endOfMonth.estimate < 0 ? "text-negative" : undefined,
            sub: (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AiMark
                  reason={
                    <span className="flex flex-col gap-0.5">
                      {endOfMonthBreakdown(endOfMonth, currency).map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </span>
                  }
                />
                al {formatDate(endOfMonth.date)}
              </span>
            ),
          },
        ]
      : []),
  ];

  return <FigureBar lead={lead} figures={figures} isLoading={isLoading} />;
}
