import { useState } from "react";
import { AiMark } from "@/components/AiMark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppActions, useAppStatus } from "@/hooks/useAppData";
import { useMerchantName } from "@/hooks/useMerchantName";
import { formatCurrency, formatDate } from "@/lib/format";
import { isReported } from "@/lib/reportedError";
import type { UncategorisedGroup } from "@/lib/ai/uncategorised";
import type { TransactionWithCategory } from "@/db/schema";

interface UncategorisedDialogProps {
  // The group under review, or null with the dialog closed.
  group: UncategorisedGroup<TransactionWithCategory> | null;
  onClose: () => void;
}

// Uncategorised movements the AI places in one category, reviewed and applied
// together. Every row starts ticked; what the user unticks was looked at and
// turned down, so it is not suggested for this category again.
//
// Mounted per group (see its key in OverviewView), so the ticks start afresh
// for each one.
export function UncategorisedDialog({ group, onClose }: UncategorisedDialogProps) {
  const { categoriseTransactions, dismissAiSuggestions } = useAppActions();
  const { isMutating } = useAppStatus();
  const merchantName = useMerchantName();
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set());

  const rows = group?.rows ?? [];
  const ticked = rows.filter((row) => !unticked.has(row.transaction.id));

  function toggle(id: number, checked: boolean) {
    setUnticked((current) => {
      const next = new Set(current);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApply() {
    if (group === null || ticked.length === 0) return;
    try {
      await categoriseTransactions(
        ticked.map((row) => row.transaction.id),
        group.categoryId,
      );
    } catch (error) {
      // Stays open with the ticks as they were; the failure has been told.
      if (!isReported(error)) throw error;
      return;
    }
    const turnedDown = rows.filter((row) => unticked.has(row.transaction.id));
    if (turnedDown.length > 0) {
      await dismissAiSuggestions(turnedDown.map((row) => row.dismissalId));
    }
    onClose();
  }

  async function handleDismiss() {
    await dismissAiSuggestions(rows.map((row) => row.dismissalId));
    onClose();
  }

  return (
    <Dialog open={group !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {rows.length === 1
              ? `1 movimiento parece ${group?.categoryName}`
              : `${rows.length} movimientos parecen ${group?.categoryName}`}
          </DialogTitle>
          <DialogDescription>
            Destildá los que no van. Los que destildes no se vuelven a sugerir para esta
            categoría.
          </DialogDescription>
        </DialogHeader>

        <ul className="-mx-1 max-h-80 divide-y divide-border overflow-y-auto px-1">
          {rows.map(({ transaction, reason }) => {
            const id = `uncategorised-${transaction.id}`;
            return (
              <li key={transaction.id} className="flex items-center gap-3 py-2.5">
                <Checkbox
                  id={id}
                  checked={!unticked.has(transaction.id)}
                  onCheckedChange={(checked) => toggle(transaction.id, checked)}
                />
                <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {merchantName(transaction.description) ?? transaction.description}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(transaction.date)}
                    {transaction.payment_method_name &&
                      ` · ${transaction.payment_method_name}`}
                  </span>
                </label>
                <AiMark reason={reason} />
                <span className="shrink-0 text-sm tabular-nums">
                  {formatCurrency(transaction.amount, transaction.currency)}
                </span>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isMutating}
            onClick={() => void handleDismiss()}
          >
            Descartar
          </Button>
          <Button
            type="button"
            disabled={isMutating || ticked.length === 0}
            onClick={() => void handleApply()}
          >
            {ticked.length === rows.length
              ? "Aplicar a todos"
              : `Aplicar a ${ticked.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
