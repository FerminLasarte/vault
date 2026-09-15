import { cn } from "@/lib/utils";

// How full the bar reads, which is not always the same as how full it is.
type ProgressTone = "primary" | "destructive" | "positive";

interface ProgressBarProps {
  // Can exceed 1 or go negative: the fill is clamped, the number is not. Every
  // caller shows the true figure beside the bar — "180%" has to stay sayable.
  ratio: number;
  tone?: ProgressTone;
  // The thinner bar is for the summary cards, where the figure leads and the
  // bar is only a hint.
  size?: "default" | "sm";
  className?: string;
}

const TONE_CLASSES: Record<ProgressTone, string> = {
  primary: "bg-primary",
  destructive: "bg-destructive",
  positive: "bg-positive",
};

export function ProgressBar({
  ratio,
  tone = "primary",
  size = "default",
  className,
}: ProgressBarProps) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-secondary",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", TONE_CLASSES[tone])}
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }}
      />
    </div>
  );
}
