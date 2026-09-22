import { useCallback } from "react";
import { useBriefly } from "./useBriefly";

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
// arrives to a gaze that is not there. This is `useBriefly` with nothing to
// remember but the fact itself.
export function useJustDone(duration: number = DEFAULT_DURATION): JustDone {
  const { current, remember } = useBriefly<true>(duration);

  return {
    done: current === true,
    markDone: useCallback(() => remember(true), [remember]),
  };
}
