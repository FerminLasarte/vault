// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMenuRequest, usePendingMenuRequest } from "./useMenuRequest";
import type { MenuRequest } from "@/lib/menu";

describe("usePendingMenuRequest", () => {
  it("numbers each request and clears it once handled", () => {
    const { result } = renderHook(() => usePendingMenuRequest());

    act(() => result.current.issue("backup"));
    expect(result.current.request).toEqual({ action: "backup", seq: 1 });

    act(() => result.current.markHandled(1));
    expect(result.current.request).toBeNull();
  });

  it("keeps counting after a request was cleared", () => {
    // A view that stays mounted remembers the last number it handled; starting
    // again from 1 would make it ignore the next click as already done.
    const { result } = renderHook(() => usePendingMenuRequest());

    act(() => result.current.issue("backup"));
    act(() => result.current.markHandled(1));
    act(() => result.current.issue("backup"));

    expect(result.current.request).toEqual({ action: "backup", seq: 2 });
  });

  it("does not clear a newer request when an older one is reported", () => {
    const { result } = renderHook(() => usePendingMenuRequest());

    act(() => result.current.issue("backup"));
    act(() => result.current.issue("export-csv"));
    act(() => result.current.markHandled(1));

    expect(result.current.request).toEqual({ action: "export-csv", seq: 2 });
  });
});

describe("useMenuRequest", () => {
  function mount(request: MenuRequest | null) {
    const handle = vi.fn();
    const onRequestHandled = vi.fn();
    const hook = renderHook(
      ({ current }: { current: MenuRequest | null }) =>
        useMenuRequest(current, onRequestHandled, handle),
      { initialProps: { current: request } },
    );
    return { handle, onRequestHandled, ...hook };
  }

  it("runs a request that was already pending when the view mounted", () => {
    // The menu switches to the owning view and hands it the request in the
    // same render, so this is the ordinary case, not an edge one.
    const { handle, onRequestHandled } = mount({ action: "backup", seq: 1 });

    expect(handle).toHaveBeenCalledOnce();
    expect(handle).toHaveBeenCalledWith("backup");
    expect(onRequestHandled).toHaveBeenCalledWith(1);
  });

  it("runs each request once, however often the view renders", () => {
    const { handle, rerender } = mount({ action: "backup", seq: 1 });

    rerender({ current: { action: "backup", seq: 1 } });

    expect(handle).toHaveBeenCalledOnce();
  });

  it("runs the same entry again when it is chosen again", () => {
    const { handle, rerender } = mount({ action: "backup", seq: 1 });

    rerender({ current: null });
    rerender({ current: { action: "backup", seq: 2 } });

    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a request", () => {
    const { handle, onRequestHandled } = mount(null);

    expect(handle).not.toHaveBeenCalled();
    expect(onRequestHandled).not.toHaveBeenCalled();
  });
});
