import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/Hint";

interface ActionButtonProps extends Omit<ComponentProps<typeof Button>, "title"> {
  // The hover text. Kept short: it names the action, while the richer
  // screen-reader name stays in the button's own sr-only child, where it can
  // say which row it belongs to.
  label: string;
  // Why the action is not available right now. When given, the button is
  // disabled and this replaces `label` as the hover text — a greyed-out button
  // with no explanation reads as broken.
  disabledReason?: string | null;
}

// A button that says what it does on hover. Nothing but a `Hint` around a
// `Button`, which is the common case often enough to be worth a name.
export function ActionButton({
  label,
  disabledReason,
  children,
  ...props
}: ActionButtonProps) {
  if (disabledReason) {
    // The hint hangs off a wrapper: a disabled button takes no pointer events,
    // so it could never show one itself. The wrapper is focusable for the same
    // reason, so the explanation is reachable from the keyboard too.
    return (
      <Hint
        label={disabledReason}
        anchor="element"
        render={
          <span
            tabIndex={0}
            className="inline-flex rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <Button {...props} disabled>
          {children}
        </Button>
      </Hint>
    );
  }

  return (
    <Hint label={label} anchor="element" render={<Button {...props} />}>
      {children}
    </Hint>
  );
}
