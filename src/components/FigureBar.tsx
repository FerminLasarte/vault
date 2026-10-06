import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadingGate, type LoadingGate } from "@/hooks/useLoadingGate";
import { cn } from "@/lib/utils";

export interface Figure {
  key: string;
  label: string;
  // Already formatted: this component decides how figures sit next to each
  // other, never what they say.
  value: string;
  // The quieter line underneath — a conversion, a share, a comparison.
  sub?: ReactNode;
  valueClassName?: string;
}

interface FigureBarProps {
  figures: Figure[];
  // The one figure the row explains, drawn above it and larger. Part of the
  // bar rather than a component of its own so it waits on the same gate: two
  // gates on one load would land the headline and its breakdown a frame apart.
  lead?: Figure;
  // While the figures are on their way, the bar keeps its layout and stands
  // each one in for a block of its size. A dash would be a lie here: this is
  // the same bar that writes "—" for a total it genuinely cannot work out.
  isLoading?: boolean;
  // A quiet label above the row, naming what the figures are of. Left out when
  // the surrounding screen already says it.
  title?: string;
  // Sits opposite the title, and is styled here rather than by the caller so
  // that two titled bars cannot end up with two different icons.
  icon?: LucideIcon;
}

// Spelled out in full so Tailwind can find every class it has to generate.
const COLUMNS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
};

// How a figure looks in each of the two places it can sit: the size of the
// value, and of the placeholders that hold its place while it loads.
const SIZES = {
  lead: {
    label: "text-sm",
    value: "font-heading text-4xl font-semibold tracking-tight",
    valueSkeleton: "my-1.5 h-9 w-64",
    subSkeleton: "h-4 w-40",
  },
  row: {
    label: "text-xs",
    value: "text-lg font-medium",
    valueSkeleton: "my-1 h-5 w-32",
    subSkeleton: "h-4 w-24",
  },
} as const;

interface FigureCellProps {
  figure: Figure;
  gate: LoadingGate;
  size: keyof typeof SIZES;
}

function FigureCell({ figure, gate, size }: FigureCellProps) {
  const sizes = SIZES[size];
  // Every placeholder here is held unseen until the wait is worth drawing.
  const held = !gate.drawn && "invisible";

  return (
    <>
      <span className={cn(sizes.label, "text-muted-foreground")}>{figure.label}</span>
      {gate.waiting ? (
        // The height of the line it replaces, so nothing shifts when the
        // figure lands. Held unseen until the wait is worth drawing, like every
        // other placeholder.
        <Skeleton className={cn(sizes.valueSkeleton, held)} />
      ) : (
        <span
          // Keyed by what it says, so that changing the period or the filters
          // fades the new figure in instead of swapping the digits where they
          // stand, which reads as a glitch. Deliberately not a count-up: a
          // balance climbing towards its value is marketing, not money.
          //
          // The same fade as anything else that arrives, which is also how the
          // figure comes in after a load: being keyed, it is a new element then
          // too.
          key={figure.value}
          className={cn("arrive tabular-nums", sizes.value, figure.valueClassName)}
        >
          {figure.value}
        </span>
      )}
      {figure.sub &&
        (gate.waiting ? (
          // The caller already knows whether a line sits under this figure,
          // even before its data is here, so its place is held and the bar
          // does not grow when the figure lands.
          <Skeleton className={cn(sizes.subSkeleton, held)} />
        ) : (
          // Lands with the figure it qualifies. Still a column, so the line
          // inside keeps the width it had as the column's own item.
          <div className="arrive flex flex-col">{figure.sub}</div>
        ))}
    </>
  );
}

// A row of figures that belong to one question.
//
// Shared by the bars on the overview so they cannot drift apart: one
// adds up what the user has, another what a period moved, another what the
// months ahead already owe, and reading them as the same kind of thing is only
// true while they look the same.
//
// The card around the figures is part of what is shared, header included. A
// caller that builds its own card to get a title is how the padding drifted
// out of alignment once already.
export function FigureBar({
  figures,
  lead,
  title,
  icon: Icon,
  isLoading = false,
}: FigureBarProps) {
  // One gate for every figure in the bar, so they are drawn and land together.
  const gate = useLoadingGate(isLoading);

  return (
    <Card>
      {title && (
        <CardHeader>
          <CardDescription>{title}</CardDescription>
          {Icon && (
            <CardAction>
              <Icon className="size-4 text-muted-foreground" />
            </CardAction>
          )}
        </CardHeader>
      )}

      <CardContent className="flex flex-col gap-4">
        {lead && (
          <div className="flex flex-col gap-0.5 border-b border-border pb-4">
            <FigureCell figure={lead} gate={gate} size="lead" />
          </div>
        )}

        <div
          className={cn(
            "grid grid-cols-1 gap-3 sm:gap-0 sm:divide-x sm:divide-border",
            COLUMNS[figures.length] ?? COLUMNS[2],
          )}
        >
          {figures.map((figure, index) => (
            <div
              key={figure.key}
              className={cn(
                "flex flex-col gap-0.5",
                // The dividers do the separating, so only the inner columns
                // need the breathing room around them.
                index > 0 && "sm:pl-4",
                index < figures.length - 1 && "sm:pr-4",
              )}
            >
              <FigureCell figure={figure} gate={gate} size="row" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
