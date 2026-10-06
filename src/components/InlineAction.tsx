import { Button } from "@/components/ui/button";

// An action inside a line of hint text, such as applying what a rule would do.
export function InlineAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      type="button"
      variant="link"
      size="xs"
      className="h-auto px-0 text-foreground underline decoration-muted-foreground/50"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
