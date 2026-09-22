// A keystroke the app should keep its hands off.
//
// Single-key shortcuts are only ever free when nobody is writing. Somebody
// typing "3/4" into an amount, or "¿qué pasó?" into a description, is not
// asking to jump to the search box, and a shortcut that fires there is worse
// than no shortcut at all. The same goes for anything inside a dialog, which
// is a conversation of its own with its own answer to Escape.
export interface ShortcutContext {
  key: string;
  // What had the keyboard when the key was pressed.
  target: EventTarget | null;
  // Whether a modifier was held, which makes it somebody else's shortcut —
  // the system's, the browser's, or one of the app's own menu entries.
  //
  // Shift is not one of them, and must not be: on the keyboard this app is
  // written for, "/" is Shift+7.
  hasModifier: boolean;
  // Whether a dialog is on screen.
  isDialogOpen: boolean;
}

const WRITABLE = ["input", "textarea", "select"];

function isWriting(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (WRITABLE.includes(target.tagName.toLowerCase())) return true;

  // `closest` rather than `isContentEditable`, which answers for the element
  // itself only — and which jsdom does not implement, so a test could never
  // have caught this being wrong.
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

export function shouldIgnoreShortcut({
  key,
  target,
  hasModifier,
  isDialogOpen,
}: ShortcutContext): boolean {
  if (hasModifier || isDialogOpen) return true;

  // Escape is not something anyone types into a field, so it stays available
  // while writing: clearing the filters without first leaving the search box
  // is the obvious thing to want from it.
  if (key === "Escape") return false;

  return isWriting(target);
}

// Every dialog in the app, ordinary and destructive alike, marks its popup
// this way — the donation notice hides itself with the same test.
export const DIALOG_SELECTOR = '[data-slot$="dialog-content"]';
