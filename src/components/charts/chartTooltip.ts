import type { CSSProperties } from "react";

// How every chart tooltip in the app looks.
//
// One definition rather than one per chart: the two charts sit side by side on
// the statistics screen, and a popup that changes shape depending on which one
// the pointer is over reads as two different apps.
export const tooltipContentStyle: CSSProperties = {
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: "0.8rem",
  padding: "0.5rem 0.75rem",
};
