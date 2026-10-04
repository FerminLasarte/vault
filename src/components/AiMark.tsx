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
