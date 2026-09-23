import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadingGate, type LoadingGate } from "@/hooks/useLoadingGate";
import { cn } from "@/lib/utils";

interface LoadingRowsProps {
  // Enough to read as a list without pretending to know how long the real one
  // is. Three is what most of these sections hold on a quiet month.
  rows?: number;
  className?: string;
}

// What a list looks like before it has arrived.
//
// Every list in the app is the same row twice over — something named on the
// left, a figure on the right — so the placeholder is that shape, and a screen
// keeps its outline while the data lands instead of appearing out of an empty
// box. The widths alternate so it reads as a list of different things rather
// than as a bar chart.
export function LoadingRows({ rows = 3, className }: LoadingRowsProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center justify-between gap-4">
          <Skeleton className={cn("h-4", row % 2 === 0 ? "w-48" : "w-36")} />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

interface LoadingSlotProps {
  gate: LoadingGate;
  // The shape of what is coming, where a list of rows is not it — a chart is a
  // block, not a list. `null` for a region that has no shape to hold.
  placeholder?: ReactNode;
  // For the wrapper both the placeholder and the content sit in. A caller whose
  // content is several siblings laid out by the parent — a flex gap, say —
  // moves that layout here, since the wrapper is now what holds them.
  className?: string;
  children: ReactNode;
}

// One region of a screen, driven by a gate the caller already holds.
//
// For a component with more than one region waiting on the same load, which
// asks `useLoadingGate` once and hands the answer to each: two gates would run
// two clocks, and the regions would come and go a frame apart. Everything
// else wants `Loading`.
//
// Three states rather than two, and the first is what this exists for: for
// the first fraction of a second of a load nothing is drawn at all. The
// database is a file on the same machine, most loads are over before anyone
// could read a placeholder, and one that appears and vanishes inside 40ms
// reads as the interface flinching. The placeholder is there all the same,
// holding its space unseen, so drawing it moves nothing, and neither does the
// content when the load is over before it.
//
// Rendering the children early instead is not an option: the data is empty
// until it lands, so a list would show "todavía no tenés categorías" to
// someone who has two hundred.
//
// The children are built either way, as JSX always is, and only mounted when
// the wait is over — so what they read has to survive the data not being there
// yet. Everything the app holds is an empty array until it loads, which is
// safe; a list that can be null is not, and has to be defaulted by its caller.
//
// The one element around both is kept on purpose. The content fades in by
// that element taking the fade the moment the placeholder leaves it, and a
// region the user comes back to, whose data never left, is shown as it is.
export function LoadingSlot({
  gate,
  placeholder = <LoadingRows />,
  className,
  children,
}: LoadingSlotProps) {
  if (gate.waiting) {
    return <div className={cn(className, !gate.drawn && "invisible")}>{placeholder}</div>;
  }

  return <div className={cn(className, gate.arriving && "arrive")}>{children}</div>;
}

interface LoadingProps extends Omit<LoadingSlotProps, "gate"> {
  when: boolean;
}

// The content, or the shape of it while it is on its way.
//
// Seven sections were each writing the word "Cargando..." into a paragraph of
// their own, which said nothing about what was coming and left the screen to
// jump when it did.
export function Loading({ when, ...slot }: LoadingProps) {
  return <LoadingSlot gate={useLoadingGate(when)} {...slot} />;
}
