import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/Hint";

interface RemovableBadgeProps {
  children: ReactNode;
  // What a screen reader hears for the cross: "Quitar Viaje".
  removeLabel: string;
  onRemove: () => void;
}

// A value shown as a badge with a cross to take it away: a tag on a movement,
// a part of a search the AI understood.
export function RemovableBadge({ children, removeLabel, onRemove }: RemovableBadgeProps) {
  return (
    <Badge variant="secondary" className="gap-1">
      {children}
      <Hint
        label="Quitar"
        anchor="element"
        render={
          <button
            type="button"
            onClick={onRemove}
            className="icon-motion rounded-sm opacity-60 transition-opacity hover:opacity-100"
          />
        }
      >
        <X className="size-3" />
        <span className="sr-only">{removeLabel}</span>
      </Hint>
    </Badge>
  );
}
