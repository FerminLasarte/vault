// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJustDone } from "./useJustDone";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useJustDone", () => {
  it("starts with nothing to say", () => {
    const { result } = renderHook(() => useJustDone());

    expect(result.current.done).toBe(false);
  });

  it("says so as soon as the action reports back", () => {
    const { result } = renderHook(() => useJustDone());

    act(() => result.current.markDone());

    expect(result.current.done).toBe(true);
  });

  it("stops saying so, so the button goes back to being a button", () => {
    const { result } = renderHook(() => useJustDone(1500));

    act(() => result.current.markDone());
    act(() => void vi.advanceTimersByTime(1499));
    expect(result.current.done).toBe(true);

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.done).toBe(false);
  });

  it("starts the wait again when the action is repeated, rather than stacking", () => {
    // Someone who copies twice should get the second answer in full, and one
    // timer should never be able to cut another one short.
    const { result } = renderHook(() => useJustDone(1500));

    act(() => result.current.markDone());
    act(() => void vi.advanceTimersByTime(1000));
    act(() => result.current.markDone());

    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.done).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.done).toBe(false);
  });

  it("leaves no timer behind when the button goes away mid-answer", () => {
    // A dialog can close, or a list can drop the row, while the answer is
    // still on screen. The timer that fires after that has nothing to set.
    const { result, unmount } = renderHook(() => useJustDone());

    act(() => result.current.markDone());
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
