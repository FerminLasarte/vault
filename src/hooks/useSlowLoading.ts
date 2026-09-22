import { useEffect, useRef, useState } from "react";

// How long a load is allowed to take before it is worth telling the user
// anything, and how long the placeholder stays once it has appeared.
//
// The database is a file on the same machine and usually answers in a few
// milliseconds, so most loads never reach the first number. The second is what
// keeps the ones that just cross it from being a flicker.
const DELAY = 120;
const MINIMUM = 300;

// Whether a load has gone on long enough to be worth showing a placeholder
// for — and, once it has, whether the placeholder has been up long enough to
// be taken away.
//
// Both halves exist for the same reason: a placeholder that comes and goes
// faster than it can be read is noise, and reads as the interface flinching.
// A card that is briefly empty says nothing, which is the truth at 40ms.
export function useSlowLoading(isLoading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      if (visible) return;

      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, DELAY);

      return () => clearTimeout(timer);
    }

    if (!visible) return;

    // Whatever is left of the minimum, which is nothing at all for a load that
    // took its time.
    const left = MINIMUM - (Date.now() - (shownAt.current ?? 0));

    if (left <= 0) {
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => setVisible(false), left);

    return () => clearTimeout(timer);
  }, [isLoading, visible]);

  return visible;
}
