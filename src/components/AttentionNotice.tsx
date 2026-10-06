import {
  AlertTriangle,
  FileText,
  HardDriveDownload,
  Repeat,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { ActionButton } from "@/components/ActionButton";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/Hint";
import { cn } from "@/lib/utils";
import type { AttentionItem, AttentionKind } from "@/lib/attention";

interface AttentionNoticeProps {
  items: AttentionItem[];
  // What an actionable item does. Handed the item rather than passed inside it
  // so `attention.ts` stays free of functions and testable as data.
  onAction?: (item: AttentionItem) => void;
  // Waves away a notice that carries a `dismissalId`.
  onDismiss?: (item: AttentionItem) => void;
}

const ICONS: Record<AttentionKind, LucideIcon> = {
  budget: AlertTriangle,
  backup: HardDriveDownload,
  pending: Repeat,
  late: Sparkles,
  pace: Sparkles,
  rise: Sparkles,
  unusual: Sparkles,
  duplicate: Sparkles,
  transfer: Sparkles,
  suggested: Sparkles,
  uncategorised: Sparkles,
  unregistered: Sparkles,
  close: FileText,
};

// Everything the screen has to raise, as one quiet line above the figures.
//
// It used to be a card with a row per notice, and before that a card per
// notice. Either way the screen opened on its warnings and the first real
// figure started halfway down. A line says the same thing and gives the
// figures back the top of the screen: each notice is its headline, and its
// action when it has one, side by side.
//
// The detail — which budgets, where to go, what the close contains — is the
// headline's hint, and is also in the text for a screen reader, which cannot
// hover. The line stays in the muted colour of secondary text; with no card to
// turn red, a critical notice is marked on the notice itself, its icon and its
// headline taking the destructive colour.
//
// On a narrow window the notices wrap onto a second line rather than scroll.
export function AttentionNotice({ items, onAction, onDismiss }: AttentionNoticeProps) {
  if (items.length === 0) return null;

  return (
    <ul className="arrive flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        const isCritical = item.tone === "critical";

        return (
          <li key={item.key} className="flex items-center gap-2">
            <Icon
              aria-hidden
              className={cn(
                "size-4 shrink-0",
                isCritical ? "text-destructive" : "text-muted-foreground",
              )}
            />
            <Hint label={item.detail}>
              <span
                className={cn(isCritical ? "text-destructive" : "text-muted-foreground")}
              >
                {item.title}
              </span>
              <span className="sr-only">. {item.detail}</span>
            </Hint>
            {/* After the headline, so it reads before it offers. */}
            {item.actionLabel !== undefined && onAction && (
              <Button
                type="button"
                variant="link"
                size="xs"
                // Underlined from the start rather than on hover: on a line of
                // quiet text it is the one thing that can be pressed.
                className="px-1 text-foreground underline decoration-muted-foreground/50"
                onClick={() => onAction(item)}
              >
                {item.actionLabel}
              </Button>
            )}
            {/* Last and quietest: the AI's notices can be turned down where
                they sit, since nothing else would make them go away. */}
            {item.dismissalId !== undefined && onDismiss && (
              <ActionButton
                type="button"
                variant="ghost"
                size="icon-xs"
                label="Descartar"
                className="text-muted-foreground"
                onClick={() => onDismiss(item)}
              >
                <X />
                <span className="sr-only">Descartar {item.title}</span>
              </ActionButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
