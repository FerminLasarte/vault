import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  // The page's own tabs, when it has them. They stay in view with the title,
  // so moving to another tab never means scrolling back up first.
  tabs?: ReactNode;
}

export function PageHeader({ title, description, actions, tabs }: PageHeaderProps) {
  return (
    // Stays at the top of the column while the page scrolls under it, so the
    // title and what can be done from it are always at hand. It reaches out
    // over the column's padding — up to the window's edge and across its full
    // width — and is opaque, so what scrolls under it disappears behind it
    // rather than showing through between the header and the edge. The bottom
    // padding is the cushion between the two, cancelled by the margin under it
    // so the page sits where it did.
    //
    // It is also the second drag region, after the sidebar header. Together
    // they cover the width of the window's top edge, which on macOS is the only
    // way to move it: the title bar is an overlay the webview draws over. The
    // attribute has to sit on the elements the cursor actually lands on, so the
    // empty space in this header drags while the buttons in `actions` and the
    // tabs keep taking their own clicks — a drag never starts from a child.
    <div
      data-tauri-drag-region
      className="sticky top-0 z-10 -mx-4 -mt-4 -mb-4 bg-background px-4 pt-4 pb-4 sm:-mx-8 sm:-mt-8 sm:px-8 sm:pt-8"
    >
      <div
        data-tauri-drag-region
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div data-tauri-drag-region>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {tabs && <div className="mt-6 sm:mt-8">{tabs}</div>}
    </div>
  );
}
