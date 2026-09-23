// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRememberedScroll } from "./useRememberedScroll";

// jsdom lays nothing out, so `scrollTop` on a real element always reads back
// zero. This is the same interface the hook uses, and it remembers.
function aScrollingColumn() {
  const listeners = new Set<() => void>();

  return {
    scrollTop: 0,
    // How far the content lets the column go. A browser clamps any position
    // past it, and still reports the clamped one as a scroll.
    maxTop: Infinity,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
    // What the hook calls to put a view back, and what the test calls to
    // pretend somebody scrolled. Both end in the same place: a new position
    // and a scroll event, which is how the browser behaves too.
    scrollTo({ top }: { top: number }) {
      this.scrollTop = Math.min(top, this.maxTop);
      listeners.forEach((listener) => listener());
    },
  };
}

function mount(column: ReturnType<typeof aScrollingColumn>, view: string) {
  const ref = { current: column as unknown as HTMLElement };

  return renderHook(({ current }) => useRememberedScroll(ref, current), {
    initialProps: { current: view },
  });
}

describe("useRememberedScroll", () => {
  it("puts a view back where it was left", () => {
    // The restore scrolls the column, which tells the listener the position
    // changed. Reading the view from a ref that is set first is what keeps
    // that from overwriting where the old view was — get it wrong and the
    // last line here reads 0.
    const column = aScrollingColumn();
    const { rerender } = mount(column, "transactions");

    column.scrollTo({ top: 820 });
    rerender({ current: "settings" });
    expect(column.scrollTop).toBe(0);

    rerender({ current: "transactions" });
    expect(column.scrollTop).toBe(820);
  });

  it("remembers each view on its own", () => {
    const column = aScrollingColumn();
    const { rerender } = mount(column, "transactions");

    column.scrollTo({ top: 820 });
    rerender({ current: "settings" });
    column.scrollTo({ top: 140 });
    rerender({ current: "transactions" });
    expect(column.scrollTop).toBe(820);

    rerender({ current: "settings" });
    expect(column.scrollTop).toBe(140);
  });

  it("starts a view it has never seen at the top", () => {
    const column = aScrollingColumn();
    const { rerender } = mount(column, "transactions");

    column.scrollTo({ top: 820 });
    rerender({ current: "closes" });

    expect(column.scrollTop).toBe(0);
  });

  it("keeps a position the content was briefly too short for", () => {
    // A view that comes back shorter than it was left (a row deleted
    // elsewhere, a list still arriving) cannot be put back where it was, and
    // the browser answers the restore with a scroll to wherever it could go.
    // Taking that answer as the user's choice would lose the real position
    // for good.
    const column = aScrollingColumn();
    const { rerender } = mount(column, "transactions");

    column.scrollTo({ top: 820 });
    rerender({ current: "settings" });
    column.maxTop = 300;
    rerender({ current: "transactions" });
    expect(column.scrollTop).toBe(300);

    column.maxTop = Infinity;
    rerender({ current: "settings" });
    rerender({ current: "transactions" });
    expect(column.scrollTop).toBe(820);
  });
});
