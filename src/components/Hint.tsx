import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HintProps {
  // The explanation itself. Everything the app says on hover goes through
  // here, so there is exactly one place deciding how it looks.
  label: ReactNode;
  // The element the explanation belongs to. Defaults to an inline span, which
  // is what a piece of text that needs explaining usually is.
  render?: ReactElement;
  // Where the explanation sits. "cursor" lets it travel with the pointer,
  // which suits a stretch of text: the pointer can be anywhere along it, and a
  // box pinned to the middle of a line reads as belonging to nothing in
  // particular. "element" anchors it to the trigger, which suits controls,
  // where the target is small and its edges are the obvious place to point at.
  anchor?: "cursor" | "element";
  side?: "top" | "right" | "bottom" | "left";
  // Applied to the default span. Ignored when `render` is given, since the
  // element passed in carries its own classes.
  className?: string;
  children?: ReactNode;
}

// Hover text drawn by the app rather than by the operating system.
//
// The native `title` attribute is the thing this replaces: it takes about a
// second to appear, shows up at a fixed point regardless of where the pointer
// is, times out on its own after a few seconds, cannot be styled and ignores
// the theme — all of which reads as unfinished next to the rest of the
// interface. This stays up for as long as the pointer is on the trigger.
export function Hint({
  label,
  render,
  anchor = "cursor",
  side = "top",
  className,
  children,
}: HintProps) {
  const followsCursor = anchor === "cursor";

  return (
    <Tooltip trackCursorAxis={followsCursor ? "both" : "none"}>
      <TooltipTrigger
        render={
          render ?? (
            <span
              // Reachable without a pointer: an explanation nothing else says
              // is not optional information.
              tabIndex={0}
              // No cursor of its own: the explanation is a bonus on top of a
              // figure that already reads on its own, and a pointer that
              // changes shape over ordinary text promises an interaction that
              // is not there.
              className={cn(
                "w-fit rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                className,
              )}
            />
          )
        }
      >
        {children}
      </TooltipTrigger>

      {/* An arrow points at a fixed spot, which a travelling popup does not
          have, so it is only drawn for the anchored variant. The wider offset
          keeps the box clear of the pointer it is following. */}
      <TooltipContent
        side={side}
        sideOffset={followsCursor ? 12 : 4}
        showArrow={!followsCursor}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
