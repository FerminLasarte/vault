import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDeleteDialogProps {
  open: boolean;
  // Called when the dialog is dismissed without deleting: Cancelar, Escape or a
  // click outside.
  onClose: () => void;
  title: string;
  // What goes and what stays. Worth writing per row: a delete that takes
  // budgets or rules with it has to say so before, not after.
  description: ReactNode;
  // Not closed from here: the caller closes it once the delete has gone
  // through, so a failed one leaves the dialog where it was.
  onConfirm: () => void | Promise<void>;
  isMutating: boolean;
}

// The question every delete asks before it happens. Eleven screens were drawing
// this by hand, and two deletes were not asking at all.
export function ConfirmDeleteDialog({
  open,
  onClose,
  title,
  description,
  onConfirm,
  isMutating,
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isMutating}
            onClick={onConfirm}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
