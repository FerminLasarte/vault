import { createContext, useState, type ReactNode } from "react";

// What each view was showing when it was left: its tab, its page, its search
// and its filters, by key (see useViewState).
//
// Views are swapped in and out of the one column rather than kept alive, so
// whatever a view holds in its own state starts over each time it is opened.
// This outlives them. It is held for as long as the app is open and no longer:
// coming back to a view finds it as it was left, and closing the app starts
// every view afresh, which is the point where a remembered filter would stop
// being a convenience and start hiding rows nobody remembers hiding.
// eslint-disable-next-line react-refresh/only-export-components
export const ViewStateContext = createContext<Map<string, unknown> | null>(null);

export function ViewStateProvider({ children }: { children: ReactNode }) {
  const [memory] = useState(() => new Map<string, unknown>());

  return <ViewStateContext.Provider value={memory}>{children}</ViewStateContext.Provider>;
}
