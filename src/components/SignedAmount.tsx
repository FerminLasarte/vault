import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionType } from "@/db/schema";

interface SignedAmountProps {
  amount: number;
  currency: string;
  // Which way the money moves. A transfer moves the user's own money and is
  // neither a gain nor a loss, so it carries no sign and no colour.
  type: TransactionType;
  // Drawn in the secondary colour, sign kept: something that has not happened
  // yet, or no longer counts.
  muted?: boolean;
  className?: string;
}

// A movement's amount the way the whole app shows money moving: coming in, in
// green with a plus; going out, in red with a minus. One place for it, so a
// figure never reads one way in a list and another in the next.
export function SignedAmount({
  amount,
  currency,
  type,
  muted = false,
  className,
}: SignedAmountProps) {
  return (
    <span
      className={cn(
        "text-sm font-medium tabular-nums whitespace-nowrap",
        muted
          ? "text-muted-foreground"
          : {
              "text-positive": type === "income",
              "text-negative": type === "expense",
            },
        className,
      )}
    >
      {type === "income" && "+"}
      {type === "expense" && "-"}
      {formatCurrency(amount, currency)}
    </span>
  );
}
