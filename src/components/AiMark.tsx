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
  // Aligned on the baseline of its letters, with the icon centred beside them:
  // a box takes its baseline from its first item, and the icon's is its bottom
  // edge, which would lift the mark above any line of text it sits in.
  const mark = (
    <span
      className={cn(
        "inline-flex shrink-0 items-baseline gap-1 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Sparkles aria-hidden className="size-3.5 self-center" />
      IA
    </span>
  );

  // The hint's trigger is a box of its own rather than a run of text: a run of
  // text sets a line at the surrounding font size, which seats the smaller mark
  // above the middle of the text beside it.
  return reason ? (
    <Hint label={reason} className="inline-flex">
      {mark}
    </Hint>
  ) : (
    mark
  );
}

interface AiNoteProps {
  reason: ReactNode;
  children: ReactNode;
  // A note that is prose rather than a line under a field reads at body size.
  className?: string;
}

// A line under a field saying what the AI did there — "Sugerida por IA", "Se
// muestra como «Rappi»" — with its mark and its reason. One look for all of
// them, so the AI always reads the same wherever it speaks.
//
// The mark keeps its own column: a sentence too long for one line wraps beside
// it, rather than dropping below and leaving the mark alone on a line. The
// column is one line of the note tall, so the mark sits on the middle of the
// first line whatever size the note reads at.
export function AiNote({ reason, children, className }: AiNoteProps) {
  return (
    <p className={cn("flex items-start gap-2 text-xs text-muted-foreground", className)}>
      <span className="flex h-lh shrink-0 items-center">
        <AiMark reason={reason} />
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {children}
      </span>
    </p>
  );
}
