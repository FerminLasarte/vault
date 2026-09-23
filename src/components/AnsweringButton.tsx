import { useState, type ComponentProps, type ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJustDone } from "@/hooks/useJustDone";
import { cn } from "@/lib/utils";

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
//
// Both faces are drawn at all times, stacked in one grid cell, and only one is
// visible. The button is always as wide as the wider of the two, so the
// buttons beside it in a row stay where they are when the label changes. The
// face that takes over fades in, the same way both directions.
export function AnsweringButton({
  icon: Icon,
  children,
  answer,
  onAction,
  ...props
}: AnsweringButtonProps) {
  const { done, markDone } = useJustDone();
  // Whether it has answered yet. Until then, the face on screen is the one the
  // button was drawn with, which is not a change and does not fade in.
  const [answered, setAnswered] = useState(false);

  return (
    <Button
      {...props}
      onClick={() => {
        void (async () => {
          if (!(await onAction())) return;
          setAnswered(true);
          markDone();
        })();
      }}
    >
      {/* The wrapper would otherwise stop Button's own gap, which differs by
          size, from spacing each icon and its label. */}
      <span className="inline-grid [gap:inherit]">
        <Face showing={!done} fades={answered}>
          <Icon />
          {children}
        </Face>
        <Face showing={done} fades={answered}>
          <Check />
          {answer}
        </Face>
      </span>
    </Button>
  );
}

function Face({
  showing,
  fades,
  children,
}: {
  showing: boolean;
  fades: boolean;
  children: ReactNode;
}) {
  return (
    <span
      data-slot="answering-face"
      aria-hidden={showing ? undefined : true}
      className={cn(
        "col-start-1 row-start-1 inline-flex items-center justify-center [gap:inherit]",
        !showing && "invisible",
        showing && fades && "animate-in duration-(--duration-fast) fade-in",
      )}
    >
      {children}
    </span>
  );
}
