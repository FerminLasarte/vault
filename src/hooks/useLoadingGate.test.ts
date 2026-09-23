// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLoadingGate } from "./useLoadingGate";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function gate(isLoading: boolean) {
  return renderHook(({ busy }) => useLoadingGate(busy), {
    initialProps: { busy: isLoading },
  });
}

describe("useLoadingGate", () => {
  it("holds the content back from the first moment, before drawing anything", () => {
    const { result } = gate(true);

    expect(result.current).toEqual({ waiting: true, drawn: false, arriving: true });
  });

  it("draws the placeholder once the load is taking a while", () => {
    const { result } = gate(true);

    act(() => void vi.advanceTimersByTime(120));

    expect(result.current.drawn).toBe(true);
    expect(result.current.waiting).toBe(true);
  });

  // The load is over, but the placeholder is held to be read. Anything that
  // says the section is empty has to hold with it, or it lands on top of the
  // rows standing in for the ones that are not there.
  it("keeps waiting for as long as the placeholder is held", () => {
    const { result, rerender } = gate(true);

    act(() => void vi.advanceTimersByTime(120));
    rerender({ busy: false });

    expect(result.current.waiting).toBe(true);

    act(() => void vi.advanceTimersByTime(300));
    expect(result.current).toEqual({ waiting: false, drawn: false, arriving: true });
  });

  it("lets a quick load through with nothing drawn, and says it arrived", () => {
    const { result, rerender } = gate(true);

    act(() => void vi.advanceTimersByTime(40));
    rerender({ busy: false });

    expect(result.current).toEqual({ waiting: false, drawn: false, arriving: true });
  });

  // Coming back to a screen whose data is already here is not an arrival:
  // fading every section in again would make each click wait on it.
  it("does not call content that was already here an arrival", () => {
    const { result } = gate(false);

    expect(result.current).toEqual({ waiting: false, drawn: false, arriving: false });
  });
});
