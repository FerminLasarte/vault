import { useState } from "react";
import { useSlowLoading } from "@/hooks/useSlowLoading";

export interface LoadingGate {
  // Something is still on its way, or its placeholder is still being held to
  // be read. The content waits, and so does anything that would say the
  // section is empty: that is only true once the wait is over.
  waiting: boolean;
  // The wait has gone on long enough for the placeholder to be drawn. Before
  // that it holds its space without being seen.
  drawn: boolean;
  // The content is taking the place of a wait, so it fades in rather than
  // cutting in. Content that was already here when the screen opened is shown
  // as it is: fading every section in again on each visit would make every
  // click wait on it.
  arriving: boolean;
}

// One decision about a load, for everything on a screen that depends on it.
//
// A component with more than one region waiting on the same data — a figure
// and its caption, a total and its chart — asks once and hands the answer to
// each of them. Two gates on the same load would run two clocks, and the
// regions would come and go a frame apart.
export function useLoadingGate(isLoading: boolean): LoadingGate {
  const drawn = useSlowLoading(isLoading);

  // Adjusted during render, as React recommends for state derived from a
  // change in props, rather than in an effect that would paint the content
  // once without its fade first.
  const [waited, setWaited] = useState(isLoading);
  if (isLoading && !waited) setWaited(true);

  return { waiting: isLoading || drawn, drawn, arriving: waited };
}
