// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSlowLoading } from "./useSlowLoading";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function loading(isLoading: boolean) {
  return renderHook(({ busy }) => useSlowLoading(busy), {
    initialProps: { busy: isLoading },
  });
}

describe("useSlowLoading", () => {
  it("says nothing while the load might still turn out to be quick", () => {
    // The database is on the same machine and usually answers in a few
    // milliseconds. A placeholder that appears and vanishes inside that is a
    // flash, and a flash is worse than a card that was briefly empty.
    const { result } = loading(true);

    expect(result.current).toBe(false);

    act(() => void vi.advanceTimersByTime(119));
    expect(result.current).toBe(false);
  });

  it("gives up waiting and shows the placeholder", () => {
    const { result } = loading(true);

    act(() => void vi.advanceTimersByTime(120));

    expect(result.current).toBe(true);
  });

  it("never shows it for a load that beat the wait", () => {
    const { result, rerender } = loading(true);

    act(() => void vi.advanceTimersByTime(60));
    rerender({ busy: false });
    act(() => void vi.advanceTimersByTime(1000));

    expect(result.current).toBe(false);
  });

  it("keeps it up long enough to be read, once it is up", () => {
    // Otherwise a load that lands just after the placeholder appeared leaves
    // it on screen for a few milliseconds, which is the flash all over again.
    const { result, rerender } = loading(true);

    act(() => void vi.advanceTimersByTime(120));
    rerender({ busy: false });

    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe(true);

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it("does not hold it any longer than that when the load was slow", () => {
    const { result, rerender } = loading(true);

    act(() => void vi.advanceTimersByTime(2000));
    rerender({ busy: false });

    act(() => void vi.advanceTimersByTime(0));
    expect(result.current).toBe(false);
  });

  it("waits again the next time something is loading", () => {
    const { result, rerender } = loading(true);

    act(() => void vi.advanceTimersByTime(2000));
    rerender({ busy: false });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);

    rerender({ busy: true });
    act(() => void vi.advanceTimersByTime(119));
    expect(result.current).toBe(false);

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it("leaves no timer behind when the screen goes away mid-load", () => {
    const { unmount } = loading(true);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
