import { useCallback, useEffect, useRef, useState } from "react";

export interface Briefly<T> {
  // What was handed over a moment ago, or null once the moment has passed.
  current: T | null;
  remember: (value: T) => void;
}

// Holds on to something for a moment and then lets go of it.
//
// Two answers in the interface are the same shape: a button that says it
// copied something, and a row that says it is the one just written. Both are
// true for a second or so and then stop being interesting, and both would
// otherwise leave a timer running when whatever held them goes away. One
// implementation, so that cannot be got right in one place and wrong in the
// other.
export function useBriefly<T>(duration: number): Briefly<T> {
  const [current, setCurrent] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remember = useCallback(
    (value: T) => {
      // A second value takes the first one's place and starts the wait again,
      // rather than stacking a timer that would cut it short by however long
      // the old one had left.
      if (timer.current !== null) clearTimeout(timer.current);

      setCurrent(value);
      timer.current = setTimeout(() => {
        timer.current = null;
        setCurrent(null);
      }, duration);
    },
    [duration],
  );

  // Whatever is holding this can go away while it is still remembering: a
  // dialog closes, or the row is gone once the work lands.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { current, remember };
}
