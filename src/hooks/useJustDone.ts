import { useCallback, useEffect, useRef, useState } from "react";

// Long enough to be read without looking for it, short enough that the control
// is back to normal before anyone wants to use it again.
const DEFAULT_DURATION = 1500;

export interface JustDone {
  // Whether the action reported back a moment ago, and the control should
  // still be saying so.
  done: boolean;
  markDone: () => void;
}

// Remembers, for a moment, that something just worked.
//
// The signal an action gives back belongs where the user is looking, which is
// the control they pressed — a toast in the corner is a different place and
// arrives to a gaze that is not there. This holds the flag that lets a control
// answer in place, and owns the timer that takes it back, so that no caller has
// to remember to clear one.
export function useJustDone(duration: number = DEFAULT_DURATION): JustDone {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markDone = useCallback(() => {
    // Repeating the action restarts the answer rather than stacking a second
    // timer behind the first, which would cut the new answer short by however
    // long the old one had left.
    if (timer.current !== null) clearTimeout(timer.current);

    setDone(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setDone(false);
    }, duration);
  }, [duration]);

  // The control can go away while it is still answering: a dialog closes, or
  // the row it sits in is gone once the work lands.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { done, markDone };
}
