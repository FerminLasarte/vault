import { useEffect, useRef } from "react";
import { DIALOG_SELECTOR, shouldIgnoreShortcut } from "@/lib/shortcuts";

// What to do about a key, by the name the browser gives it: "/", "Escape".
export type Shortcuts = Record<string, (() => void) | undefined>;

// The keys a screen answers, in one place.
//
// Written here rather than as a `keydown` on some element, because these are
// answers the whole screen gives: pressing "/" anywhere on Transacciones means
// "let me search", not "let me search if the focus happens to be in the right
// half of the page". Which keystrokes are the app's to take at all is
// `shouldIgnoreShortcut`'s decision, and it is the same decision for every
// screen that ever adds one.
export function useShortcuts(shortcuts: Shortcuts): void {
  // Held in a ref so the listener is bound once rather than on every render:
  // the object a screen passes is new each time, and its handlers close over
  // state that changes constantly.
  const latest = useRef(shortcuts);

  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const handler = latest.current[event.key];

      if (handler === undefined) return;

      if (
        shouldIgnoreShortcut({
          key: event.key,
          target: event.target,
          // Shift deliberately left out: "/" is Shift+7 on the keyboard this
          // app is written for.
          hasModifier: event.metaKey || event.ctrlKey || event.altKey,
          isDialogOpen: document.querySelector(DIALOG_SELECTOR) !== null,
        })
      ) {
        return;
      }

      // Only once it is certain the app is taking the key: "/" types a
      // character, and swallowing it while someone is writing would be the
      // shortcut doing harm rather than nothing.
      event.preventDefault();
      handler();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
