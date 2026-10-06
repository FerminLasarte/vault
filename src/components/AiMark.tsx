import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Hint } from "@/components/Hint";
import { cn } from "@/lib/utils";

interface AiMarkProps {
  // Why the AI suggested or wrote this, from the data that produced it. Shown
  // on hover and on focus.
  reason?: ReactNode;
  className?: string;
}

// The one mark for anything the local AI suggested, detected or wrote, so it
// always reads as the AI and never as something the user typed. Sparkles and not
// the wand, which already means "category rule".
export function AiMark({ reason, className }: AiMarkProps) {
  const mark = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Sparkles aria-hidden className="size-3.5" />
      IA
    </span>
  );

  return reason ? <Hint label={reason}>{mark}</Hint> : mark;
}

interface AiNoteProps {
  reason: ReactNode;
  children: ReactNode;
}

// A line under a field saying what the AI did there — "Sugerida por IA", "Se
// muestra como «Rappi»" — with its mark and its reason. One look for all of
// them, so the AI always reads the same wherever it speaks.
//
// The mark keeps its own column: a sentence too long for one line wraps beside
// it, rather than dropping below and leaving the mark alone on a line.
export function AiNote({ reason, children }: AiNoteProps) {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <AiMark reason={reason} />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {children}
      </span>
    </p>
  );
}
