import {
  AlertTriangle,
  FileText,
  HardDriveDownload,
  Repeat,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Children, type ReactNode } from "react";
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
  // Rows the screen puts above its own notices, built from `NoticeRow`: the
  // AI's standout, which is worked out elsewhere but reads as one more notice.
  children?: ReactNode;
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

// Everything the screen has to raise, as a short list above the figures.
//
// It used to be a card with a row per notice, and before that a card per
// notice. Either way the screen opened on its warnings and the first real
// figure started halfway down. Then it became one line, which gave the figures
// back the top of the screen but ran the notices into each other: three of them
// side by side read as one long sentence. So each notice has a row again, with
// no card around them: the icons stand in one column and every headline starts
// at the same place, its action right after it.
//
// The detail — which budgets, where to go, what the close contains — is the
// headline's hint, and is also in the text for a screen reader, which cannot
// hover. The list stays in the muted colour of secondary text; with no card to
// turn red, a critical notice is marked on the notice itself, its icon and its
// headline taking the destructive colour.
export function AttentionNotice({
  items,
  onAction,
  onDismiss,
  children,
}: AttentionNoticeProps) {
  const handed = Children.toArray(children);
  if (items.length === 0 && handed.length === 0) return null;

  return (
    <ul className="arrive grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-sm">
      {handed}
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        const isCritical = item.tone === "critical";

        return (
          <NoticeRow
            key={item.key}
            lead={
              <Icon
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  isCritical ? "text-destructive" : "text-muted-foreground",
                )}
              />
            }
          >
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
              <DismissButton title={item.title} onDismiss={() => onDismiss(item)} />
            )}
          </NoticeRow>
        );
      })}
    </ul>
  );
}

interface NoticeRowProps {
  // What leads the row: the notice's icon, or the AI's mark.
  lead: ReactNode;
  // The headline, then whatever can be done about it.
  children: ReactNode;
}

// One row of the list. The rows share the list's two columns, so the lead
// column is as wide as its widest entry — the AI's mark, when there is one —
// and every headline lines up after it. As tall as the buttons a row may hold,
// so a row with nothing to press sits at the same pitch as one with.
export function NoticeRow({ lead, children }: NoticeRowProps) {
  return (
    <li className="col-span-2 grid min-h-6 grid-cols-subgrid items-center">
      <span className="flex items-center">{lead}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {children}
      </div>
    </li>
  );
}

// Waves a notice away for good, named after it for a screen reader.
export function DismissButton({
  title,
  onDismiss,
}: {
  title: string;
  onDismiss: () => void;
}) {
  return (
    <ActionButton
      type="button"
      variant="ghost"
      size="icon-xs"
      label="Descartar"
      className="text-muted-foreground"
      onClick={onDismiss}
    >
      <X />
      <span className="sr-only">Descartar {title}</span>
    </ActionButton>
  );
}
