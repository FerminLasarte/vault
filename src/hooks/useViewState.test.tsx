// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { ViewStateContext } from "@/context/ViewStateContext";
import { useViewState } from "./useViewState";

// One memory for the whole test, as App holds one for the whole session: a
// view comes and goes, and the memory is what outlives it.
function aSession() {
  const memory = new Map<string, unknown>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ViewStateContext.Provider value={memory}>{children}</ViewStateContext.Provider>
  );

  return function mountView() {
    return renderHook(() => useViewState("transactions.search", ""), { wrapper });
  };
}

describe("useViewState", () => {
  it("starts from the initial value", () => {
    const { result } = aSession()();

    expect(result.current[0]).toBe("");
  });

  it("gives a view back what it held when it left", () => {
    const mountView = aSession();
    const first = mountView();

    act(() => first.result.current[1]("super"));
    first.unmount();

    expect(mountView().result.current[0]).toBe("super");
  });

  it("remembers each session on its own", () => {
    // Closing the app is the one thing that forgets: a new provider starts
    // empty.
    const first = aSession()();

    act(() => first.result.current[1]("super"));
    first.unmount();

    expect(aSession()().result.current[0]).toBe("");
  });
});
