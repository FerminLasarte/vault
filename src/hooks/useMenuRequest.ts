import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { MenuAction, MenuRequest } from "@/lib/menu";

// The request a native menu entry made, held by App until the view that owns
// it has acted on it.
//
// Choosing an entry switches to the owning view and sets the request in the
// same render, so that view mounts with the request already pending. Clearing
// it once handled is what lets the view honour whatever it mounts with: a
// request still sitting here after it ran would run again every time the user
// came back to that view — the dialog reopening, the backup starting over.
export function usePendingMenuRequest(): {
  request: MenuRequest | null;
  issue: (action: MenuAction) => void;
  markHandled: (seq: number) => void;
} {
  const [request, setRequest] = useState<MenuRequest | null>(null);
  // Kept apart from the request so it survives the request being cleared. A
  // view that stays mounted remembers the last number it handled; starting
  // again from 1 would make it take the next click for one already done.
  const lastSeq = useRef(0);

  // The sequence number is what makes choosing the same entry twice count as
  // two requests.
  const issue = useCallback((action: MenuAction) => {
    lastSeq.current += 1;
    setRequest({ action, seq: lastSeq.current });
  }, []);

  // Only the request that was handled is cleared: a newer one that arrived in
  // the meantime still has to run.
  const markHandled = useCallback((seq: number) => {
    setRequest((current) => (current?.seq === seq ? null : current));
  }, []);

  return { request, issue, markHandled };
}

// Runs a view's handler for each new menu request, including one that was
// already pending when the view mounted, and reports it handled.
//
// An effect rather than work done during render: the handlers open native file
// dialogs and read or write files, which is reacting to an external system. The
// handler goes through `useEffectEvent` so it always sees the current render's
// state without re-running the effect on every render.
export function useMenuRequest(
  request: MenuRequest | null,
  onRequestHandled: (seq: number) => void,
  handle: (action: MenuAction) => void,
): void {
  // A ref rather than state: which request was already handled is bookkeeping
  // and nothing renders from it. Starts at 0, so a request the view mounts with
  // counts as new.
  const lastHandledSeq = useRef(0);
  const run = useEffectEvent(handle);

  useEffect(() => {
    if (request === null || request.seq === lastHandledSeq.current) return;
    lastHandledSeq.current = request.seq;
    onRequestHandled(request.seq);
    run(request.action);
  }, [request, onRequestHandled]);
}
