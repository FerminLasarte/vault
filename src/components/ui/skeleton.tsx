import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// A block standing in for something that has not arrived yet.
//
// Only ever the shape of what is coming: a placeholder that does not match
// what replaces it makes the screen jump, which is the thing it was there to
// avoid. Callers give it that shape with `className`.
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // Not announced: a screen reader is told the region is busy by the
      // content it replaces, and reading out a row of empty boxes helps
      // nobody.
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
