import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/Hint";

interface ActionButtonProps extends Omit<ComponentProps<typeof Button>, "title"> {
  // The hover text. Kept short: it names the action, while the richer
  // screen-reader name stays in the button's own sr-only child, where it can
  // say which row it belongs to.
  label: string;
}

// A button that says what it does on hover. Nothing but a `Hint` around a
// `Button`, which is the common case often enough to be worth a name.
export function ActionButton({ label, children, ...props }: ActionButtonProps) {
  return (
    <Hint label={label} anchor="element" render={<Button {...props} />}>
      {children}
    </Hint>
  );
}
