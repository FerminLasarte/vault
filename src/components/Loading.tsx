import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSlowLoading } from "@/hooks/useSlowLoading";
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

interface LoadingProps {
  when: boolean;
  // The shape of what is coming, where a list of rows is not it — a chart is a
  // block, not a list.
  placeholder?: ReactNode;
  children: ReactNode;
}

// The content, or the shape of it while it is on its way.
//
// Three states rather than two, and the third is what this exists for: for the
// first fraction of a second of a load there is nothing here at all. The
// database is a file on the same machine, most loads are over before anyone
// could read a placeholder, and one that appears and vanishes inside 40ms
// reads as the interface flinching. `useSlowLoading` decides when that moment
// has passed, and holds the placeholder long enough to be read once it has.
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
// Seven sections were each writing the word "Cargando..." into a paragraph of
// their own, which said nothing about what was coming and left the screen to
// jump when it did.
export function Loading({ when, placeholder, children }: LoadingProps) {
  const showPlaceholder = useSlowLoading(when);

  if (showPlaceholder) return <>{placeholder ?? <LoadingRows />}</>;
  if (when) return null;

  return <>{children}</>;
}
