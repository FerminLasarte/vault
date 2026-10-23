import { AiMark } from "@/components/AiMark";
import { DismissButton, NoticeRow } from "@/components/AttentionNotice";

interface StandoutLineProps {
  title: string;
  reason: string;
  onDismiss: () => void;
}

// The one thing the local AI has to say about the month right now, at the top
// of Resumen: the category heading furthest above its usual month (see
// monthStandout.ts). The first row of the notices list, led by the AI's mark
// with the reason on it, and with a way to wave it away for the month.
export function StandoutLine({ title, reason, onDismiss }: StandoutLineProps) {
  return (
    <NoticeRow lead={<AiMark reason={reason} />}>
      <span className="text-muted-foreground">{title}</span>
      <span className="sr-only">. {reason}</span>
      <DismissButton title={title} onDismiss={onDismiss} />
    </NoticeRow>
  );
}
