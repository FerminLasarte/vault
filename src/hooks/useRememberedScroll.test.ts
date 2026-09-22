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
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
    // What the hook calls to put a view back, and what the test calls to
    // pretend somebody scrolled. Both end in the same place: a new position
    // and a scroll event, which is how the browser behaves too.
    scrollTo({ top }: { top: number }) {
      this.scrollTop = top;
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

  it("does not file the position it restores against the view being left", () => {
    // The restore scrolls the column, which tells the listener the position
    // changed. Reading the view from a ref that is set first is what keeps
    // that from overwriting where the old view was.
    const column = aScrollingColumn();
    const { rerender } = mount(column, "transactions");

    column.scrollTo({ top: 820 });
    rerender({ current: "settings" });
    rerender({ current: "transactions" });

    expect(column.scrollTop).toBe(820);
  });
});
