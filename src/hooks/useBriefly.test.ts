// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBriefly } from "./useBriefly";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useBriefly", () => {
  it("holds what it was given, and then lets go", () => {
    const { result } = renderHook(() => useBriefly<number>(1000));

    expect(result.current.current).toBeNull();

    act(() => result.current.remember(7));
    expect(result.current.current).toBe(7);

    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.current).toBeNull();
  });

  it("takes the newer value and starts the wait again", () => {
    // Two rows written one after the other: the second is the one to point
    // at, and it gets its full moment rather than what was left of the first.
    const { result } = renderHook(() => useBriefly<number>(1000));

    act(() => result.current.remember(7));
    act(() => void vi.advanceTimersByTime(900));
    act(() => result.current.remember(9));

    expect(result.current.current).toBe(9);
    expect(vi.getTimerCount()).toBe(1);

    act(() => void vi.advanceTimersByTime(900));
    expect(result.current.current).toBe(9);

    act(() => void vi.advanceTimersByTime(100));
    expect(result.current.current).toBeNull();
  });

  it("can be handed the same value twice and still be seen", () => {
    // Editing one row twice in a row has to point at it twice, which it
    // cannot do if the second time is swallowed as "no change".
    const { result } = renderHook(() => useBriefly<number>(1000));

    act(() => result.current.remember(7));
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.current).toBeNull();

    act(() => result.current.remember(7));
    expect(result.current.current).toBe(7);
  });

  it("leaves no timer behind when what held it goes away", () => {
    const { result, unmount } = renderHook(() => useBriefly<number>(1000));

    act(() => result.current.remember(7));
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
