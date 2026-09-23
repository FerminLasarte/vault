import { useViewState } from "@/hooks/useViewState";
import type { TabRequest, View } from "@/lib/navigation";

// Which tab a view is showing, when something outside the view can also ask for
// one.
//
// The tab is remembered view state — clicking one switches it, and it is still
// the one showing when the user comes back — with a single extra rule: a
// request naming one of this view's tabs wins. Requests naming somebody else's
// tab are ignored rather than clamped to a fallback, because a request left
// over from navigating elsewhere must not yank the user off the tab they are
// on.
export function useRequestedTab<T extends string>(
  key: `${View}.${string}`,
  request: TabRequest | null,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const [current, setCurrent] = useViewState<T>(key, fallback);
  // Remembered with the tab. App keeps the last request after it has been
  // answered, so a view coming back would otherwise answer it again and undo
  // whatever tab was picked since.
  const [handledSeq, setHandledSeq] = useViewState(`${key}.handled`, 0);

  // Adjusted during render rather than from an effect. React re-runs the
  // component with the new value before anything is painted, so the switch is
  // never visible — where an effect would paint the old tab first and then
  // replace it. That holds on the first render too: arriving from the menu
  // opens the requested tab, not the remembered one and then a visible switch.
  // It is also the only way React 19 allows: reacting to a changed prop by
  // setting state inside an effect is a lint error by now.
  //
  // The sequence number, not the value, is what marks a request as handled:
  // asking for the tab the user just navigated away from is a real request and
  // has to be honoured again.
  if (request !== null && request.seq !== handledSeq) {
    setHandledSeq(request.seq);
    if ((allowed as readonly string[]).includes(request.value)) {
      setCurrent(request.value as T);
    }
  }

  return [current, setCurrent];
}
