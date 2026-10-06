import { X } from "lucide-react";
import { ActionButton } from "@/components/ActionButton";
import { AiMark } from "@/components/AiMark";

interface StandoutLineProps {
  title: string;
  reason: string;
  onDismiss: () => void;
}

// The one thing the local AI has to say about the month right now, above
// everything else on Resumen: the category heading furthest above its usual
// month (see monthStandout.ts). Quiet like the Atención line under it, with the
// reason on the mark and a way to wave it away for the month.
export function StandoutLine({ title, reason, onDismiss }: StandoutLineProps) {
  return (
    <p className="arrive flex items-center gap-2 text-sm text-muted-foreground">
      <AiMark reason={reason} />
      <span>{title}</span>
      <span className="sr-only">. {reason}</span>
      <ActionButton
        type="button"
        variant="ghost"
        size="icon-xs"
        label="Descartar"
        className="text-muted-foreground"
        onClick={onDismiss}
      >
        <X />
        <span className="sr-only">Descartar {title}</span>
      </ActionButton>
    </p>
  );
}
