import { AiMark } from "@/components/AiMark";
import { Hint } from "@/components/Hint";
import { SignedAmount } from "@/components/SignedAmount";
import { Button } from "@/components/ui/button";
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
import { formatDate } from "@/lib/format";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { isReported } from "@/lib/reportedError";
import type { NearDuplicate } from "@/lib/ai/nearDuplicates";
import type { TransactionWithCategory } from "@/db/schema";

interface DuplicateDialogProps {
  // The pair under review, or null with the dialog closed.
  pair: NearDuplicate<TransactionWithCategory> | null;
  onClose: () => void;
}

// Two movements that look like one, side by side, so the user picks the one
// that goes. Only one nothing hangs on can go from here: its "Deshacer" brings
// all of it back.
export function DuplicateDialog({ pair, onClose }: DuplicateDialogProps) {
  const { deleteDuplicate, dismissAiSuggestions } = useAppActions();
  const { isMutating } = useAppStatus();
  const merchantName = useMerchantName();

  async function handleDelete(transaction: TransactionWithCategory) {
    try {
      await deleteDuplicate(transaction);
    } catch (error) {
      // Stays open; the failure has been told.
      if (!isReported(error)) throw error;
      return;
    }
    onClose();
  }

  async function handleNotDuplicate() {
    if (pair === null) return;
    await dismissAiSuggestions([pair.id]);
    onClose();
  }

  return (
    <Dialog open={pair !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ¿Es el mismo movimiento?
            {pair && <AiMark reason={pair.reason} />}
          </DialogTitle>
          <DialogDescription>
            Eliminá el que sobra. Si son dos movimientos distintos, decilo y no se vuelve
            a preguntar.
          </DialogDescription>
        </DialogHeader>

        <ul className="-mx-1 divide-y divide-border px-1">
          {pair?.movements.map((transaction, index) => (
            <li key={transaction.id} className="flex items-center gap-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {merchantName(transaction.description) ?? transaction.description}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    formatDate(transaction.date),
                    transaction.type === "transfer"
                      ? `${TRANSACTION_TYPE_LABELS.transfer} a ${transaction.destination_payment_method_name ?? "otra cuenta"}`
                      : transaction.category_name,
                    transaction.payment_method_name,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <SignedAmount
                amount={transaction.amount}
                currency={transaction.currency}
                type={transaction.type}
                className="shrink-0"
              />
              {pair.removable[index] ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isMutating}
                  onClick={() => void handleDelete(transaction)}
                >
                  Eliminar este
                </Button>
              ) : (
                <Hint
                  anchor="element"
                  label="Tiene etiquetas, adjuntos o viene de un movimiento esperado: eliminalo desde Transacciones."
                >
                  {/* The hint's span takes the pointer: a disabled button
                      reports none. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled
                    className="pointer-events-none"
                  >
                    Eliminar este
                  </Button>
                </Hint>
              )}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isMutating}
            onClick={() => void handleNotDuplicate()}
          >
            No es un duplicado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
