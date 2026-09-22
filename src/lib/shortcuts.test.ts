// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { shouldIgnoreShortcut } from "./shortcuts";

function context(overrides: Partial<Parameters<typeof shouldIgnoreShortcut>[0]> = {}) {
  return {
    key: "/",
    target: document.body,
    hasModifier: false,
    isDialogOpen: false,
    ...overrides,
  };
}

function element(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe("shouldIgnoreShortcut", () => {
  it("lets a bare key through when nobody is writing", () => {
    expect(shouldIgnoreShortcut(context())).toBe(false);
  });

  it("keeps out of the way of anything being typed into", () => {
    for (const html of [
      "<input />",
      "<textarea></textarea>",
      "<select></select>",
      '<div contenteditable="true"></div>',
    ]) {
      expect(shouldIgnoreShortcut(context({ target: element(html) }))).toBe(true);
    }
  });

  it("leaves a key with a modifier to whoever else claimed it", () => {
    // Cmd+/ and Ctrl+/ belong to the system, the browser or the app's own
    // menu, none of which asked this to join in.
    expect(shouldIgnoreShortcut(context({ hasModifier: true }))).toBe(true);
  });

  it("says nothing while a dialog is open", () => {
    // A dialog is its own conversation, and it has its own answer to Escape.
    expect(shouldIgnoreShortcut(context({ isDialogOpen: true }))).toBe(true);
  });

  it("still answers Escape from inside a field", () => {
    // Nobody types an Escape, and clearing the filters without first having to
    // leave the search box is the whole point of it.
    expect(
      shouldIgnoreShortcut(context({ key: "Escape", target: element("<input />") })),
    ).toBe(false);
  });

  it("leaves Escape to the dialog while there is one", () => {
    expect(shouldIgnoreShortcut(context({ key: "Escape", isDialogOpen: true }))).toBe(
      true,
    );
  });

  it("is not fooled by a button, which is focusable but not writable", () => {
    expect(shouldIgnoreShortcut(context({ target: element("<button></button>") }))).toBe(
      false,
    );
  });
});
