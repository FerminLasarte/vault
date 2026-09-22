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
  // Rendered as a last row inside the same card, under a rule.
  footer?: ReactNode;
}

// A row of figures that belong to one question.
//
// Shared by the bars on the statistics screen so they cannot drift apart: one
// adds up what the user has, another what a period moved, another what the
// months ahead already owe, and reading them as the same kind of thing is only
// true while they look the same.
//
// The card around the figures is part of what is shared, header included. A
// caller that builds its own card to get a title is how the padding drifted
// out of alignment once already.
export function FigureBar({
  figures,
  title,
  icon: Icon,
  isLoading = false,
  footer,
}: FigureBarProps) {
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

      <CardContent>
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              "grid grid-cols-1 gap-3 sm:gap-0 sm:divide-x sm:divide-border",
              figures.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
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
                <span className="text-xs text-muted-foreground">{figure.label}</span>
                {isLoading ? (
                  // The height of the line it replaces, so nothing shifts when
                  // the figure lands.
                  <Skeleton className="my-1 h-5 w-32" />
                ) : (
                  <span
                    className={cn(
                      "text-lg font-medium tabular-nums",
                      figure.valueClassName,
                    )}
                  >
                    {figure.value}
                  </span>
                )}
                {!isLoading && figure.sub}
              </div>
            ))}
          </div>

          {footer && <div className="border-t border-border pt-3">{footer}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
