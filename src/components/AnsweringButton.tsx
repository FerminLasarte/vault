import type { ComponentProps, ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJustDone } from "@/hooks/useJustDone";

interface AnsweringButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "onClick" | "children"
> {
  // What the button shows while there is nothing to report.
  icon: LucideIcon;
  children: ReactNode;
  // What it says once the work landed — "¡Copiado!", "¡Guardada!". Written as
  // the answer to the label, not as a repeat of it.
  answer: string;
  // Whether the work actually happened. Every action offered here can end
  // without doing anything — a save dialog the user cancelled, a clipboard
  // that refused — and a button that answers anyway is worse than one that
  // says nothing at all.
  onAction: () => boolean | Promise<boolean>;
}

// A button that says so, in place, once its action worked.
//
// The signal belongs where the user is looking, which is the control they
// pressed. A toast in the corner is somewhere else, and arrives to a gaze that
// has not moved: it is the right place for what needs explaining, and the
// wrong one for "that worked".
//
// The check is shared rather than passed in on purpose. A tick means the same
// thing everywhere, and picking a different mark per screen is how four
// buttons end up answering the same question four ways.
export function AnsweringButton({
  icon: Icon,
  children,
  answer,
  onAction,
  ...props
}: AnsweringButtonProps) {
  const { done, markDone } = useJustDone();

  return (
    <Button
      {...props}
      onClick={() => {
        void (async () => {
          if (await onAction()) markDone();
        })();
      }}
    >
      {done ? <Check /> : <Icon />}
      {done ? answer : children}
    </Button>
  );
}
