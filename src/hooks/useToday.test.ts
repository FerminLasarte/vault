// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToday } from "./useToday";

// Left open overnight, every "today" read once at render time stayed on the
// day before: badges, pending lists and the default period all missed
// whatever fell due after midnight.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date(2026, 8, 14, 23, 59));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useToday", () => {
  it("moves on at midnight with the app left open", () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-09-14");

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(result.current).toBe("2026-09-15");
  });

  it("catches up when the window comes back after the computer slept", () => {
    // A sleeping computer does not fire timers on time, so the midnight one
    // cannot be the only way the day moves on.
    const { result } = renderHook(() => useToday());

    vi.setSystemTime(new Date(2026, 8, 16, 9, 0));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(result.current).toBe("2026-09-16");
  });
});
