import type { ReactNode } from "react";
import { FigureBar, type Figure } from "@/components/FigureBar";
import { formatCurrency } from "@/lib/format";
import { CURRENCY_CODES, CURRENCY_SHORT_LABELS } from "@/lib/currency";

interface TotalBalanceCardProps {
  // What the user holds in each currency, keyed by code, and the two of them
  // added together in the selected currency — null when there is no quote to
  // add them with, since a total quietly missing the dollars would be wrong.
  perCurrency: Map<string, number>;
  unified: number | null;
  unifiedConverted: number | null;
  currency: string;
  convertedCurrency: string;
  isLoading: boolean;
  footer?: ReactNode;
}

// What the user has, all in — and in each currency on its own.
//
// The consolidated figure alone was accurate and still misleading: someone who
// lives on pesos and keeps dollars aside reads "16.745.488" and knows perfectly
// well that is not what they can spend this week. The two currencies are two
// different pockets, so they are shown as two, with the total beside them
// rather than instead of them.
//
// A stock rather than a flow, and that distinction is why this is the one
// figure on the screen that means something with no period attached: it is the
// accumulated result of everything so far. It counts each account's opening
// balance plus every movement since — the same arithmetic the accounts screen
// does, so the two can never disagree.
export function TotalBalanceCard({
  perCurrency,
  unified,
  unifiedConverted,
  currency,
  convertedCurrency,
  isLoading,
  footer,
}: TotalBalanceCardProps) {
  const figures: Figure[] = [
    ...CURRENCY_CODES.map((code) => ({
      key: code,
      label: CURRENCY_SHORT_LABELS[code] ?? code,
      value: formatCurrency(perCurrency.get(code) ?? 0, code),
    })),
    {
      key: "unified",
      label: "Total unificado",
      value: unified === null ? "—" : formatCurrency(unified, currency),
      sub:
        unified === null ? (
          <span className="text-xs text-muted-foreground">
            Traé una cotización para sumar las dos monedas
          </span>
        ) : unifiedConverted !== null ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            ≈ {formatCurrency(unifiedConverted, convertedCurrency)}
          </span>
        ) : undefined,
    },
  ];

  return <FigureBar figures={figures} isLoading={isLoading} footer={footer} />;
}
