import type { ReactNode } from "react";

// The rows of a statement the import does something particular with, each with
// what it is and what happens to it: instalments, possible duplicates, halves
// of a transfer.
export function StatementLines({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {children}
    </ul>
  );
}

export function StatementLine({
  description,
  detail,
  children,
}: {
  description: string;
  detail: string;
  // What the import does with it, and how to change that.
  children: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-xs">
      <div className="min-w-0">
        <p className="max-w-64 truncate">{description}</p>
        <p className="text-muted-foreground">{detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
        {children}
      </div>
    </li>
  );
}
