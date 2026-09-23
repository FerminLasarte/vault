import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

// Keeps each view where it was left.
//
// Every view is drawn into the same scrolling column, so moving between them
// is not navigation as a browser understands it: nothing is pushed, nothing
// is popped, and there is nowhere for a scroll position to be remembered. The
// effect is that reading halfway down a long list, stepping into Ajustes and
// coming back puts the user at the top again, with the row they were looking
// at somewhere below.
//
// The position is followed as it changes rather than read when the view is
// left: by the time React has swapped the children, the column already holds
// the new view's content and may have clamped the old position away.
//
// Each view keeps its own tab, page and filters while it is away (see
// useViewState), so the content a position is put back onto is the content it
// was taken from.
export function useRememberedScroll(
  column: RefObject<HTMLElement | null>,
  view: string,
): void {
  const positions = useRef(new Map<string, number>());
  const current = useRef(view);
  // Where a view is being put back to, until the browser has answered.
  const restoring = useRef<number | null>(null);

  useEffect(() => {
    const element = column.current;

    if (element === null) return;

    const onScroll = () => {
      const target = restoring.current;
      restoring.current = null;

      // The answer to a restore that fell short: the view came back shorter
      // than it was left (a row deleted elsewhere, a list still arriving), and
      // the browser went as far as it could. That is not the user moving, and
      // keeping the real position puts the view back properly next time.
      if (target !== null && element.scrollTop < target) return;

      positions.current.set(current.current, element.scrollTop);
    };

    element.addEventListener("scroll", onScroll, { passive: true });

    return () => element.removeEventListener("scroll", onScroll);
  }, [column]);

  // Before the browser paints, so the new view is never seen at the wrong
  // height first.
  useLayoutEffect(() => {
    const element = column.current;

    if (element === null) return;

    // Set before the scroll below, which fires the listener above: it has to
    // record against the view being arrived at, not the one being left.
    current.current = view;

    // `scrollTo` rather than assigning `scrollTop`: writing to a property of
    // something passed in is a mutation as far as the React compiler is
    // concerned, and it is right to say so even when the something is a DOM
    // node.
    const target = positions.current.get(view) ?? 0;
    restoring.current = target;
    element.scrollTo({ top: target });
    // Got there: whatever the browser reports next is the user's.
    if (element.scrollTop >= target) restoring.current = null;
  }, [column, view]);
}
