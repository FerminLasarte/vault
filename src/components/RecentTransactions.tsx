import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/Loading";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import type { TransactionWithCategory } from "@/db/schema";

// Enough to cover the last week or so of ordinary use without turning into a
// second transactions screen — anything longer is a list to work in, and that
// list already exists one click away in the sidebar.
const RECENT_COUNT = 6;

interface RecentTransactionsProps {
  // Already filtered and sorted newest first, so this component only ever
  // takes the top of the list the rest of the screen is looking at.
  transactions: TransactionWithCategory[];
  // Named in the subtitle so the absence of the other currency's movements
  // reads as a choice rather than as missing data.
  currency: string;
  isLoading: boolean;
}

function secondaryLabel(transaction: TransactionWithCategory): string {
  if (transaction.type === "transfer") return "Transferencia";
  return transaction.category_name
    ? `${transaction.category_icon ?? ""} ${transaction.category_name}`.trim()
    : "Sin categoría";
}

export function RecentTransactions({
  transactions,
  currency,
  isLoading,
}: RecentTransactionsProps) {
  const recent = transactions.slice(0, RECENT_COUNT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimas transacciones</CardTitle>
        <CardDescription>
          Los {RECENT_COUNT} movimientos más recientes en {currency}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Loading when={isLoading}>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay movimientos en {currency}.
            </p>
          ) : (
            // Divided rather than boxed: six rows of cards inside a card would be
            // a lot of chrome for what is a short list.
            <ul className="divide-y divide-border">
              {recent.map((transaction) => (
                <li
                  key={transaction.id}
                  className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {transaction.description || secondaryLabel(transaction)}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">{secondaryLabel(transaction)}</span>
                      <span aria-hidden>·</span>
                      <span className="shrink-0">{formatDate(transaction.date)}</span>
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {transaction.payment_method_name && (
                      <Badge variant="secondary" className="hidden sm:inline-flex">
                        {transaction.payment_method_name}
                        {transaction.type === "transfer" &&
                          transaction.destination_payment_method_name && (
                            <>
                              <ArrowRight className="size-3" />
                              {transaction.destination_payment_method_name}
                            </>
                          )}
                      </Badge>
                    )}
                    <span
                      className={cn(
                        "text-sm font-medium tabular-nums whitespace-nowrap",
                        transaction.type === "income" && "text-positive",
                        transaction.type === "expense" && "text-negative",
                      )}
                    >
                      {/* A transfer moves the user's own money and is neither a
                        gain nor a loss, so it carries no sign. */}
                      {transaction.type === "income" && "+"}
                      {transaction.type === "expense" && "-"}
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Loading>
      </CardContent>
    </Card>
  );
}
