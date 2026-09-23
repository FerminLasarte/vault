// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { ViewStateContext } from "@/context/ViewStateContext";
import { STATISTICS_TABS, type StatisticsTab, type TabRequest } from "@/lib/navigation";
import { useRequestedTab } from "./useRequestedTab";

function aSession() {
  const memory = new Map<string, unknown>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ViewStateContext.Provider value={memory}>{children}</ViewStateContext.Provider>
  );

  return function mountView(request: TabRequest | null) {
    return renderHook(
      ({ tab }) =>
        useRequestedTab<StatisticsTab>("statistics.tab", tab, STATISTICS_TABS, "summary"),
      { wrapper, initialProps: { tab: request } },
    );
  };
}

describe("useRequestedTab", () => {
  it("opens on the fallback", () => {
    expect(aSession()(null).result.current[0]).toBe("summary");
  });

  it("opens on the tab a request names", () => {
    expect(aSession()({ value: "analysis", seq: 1 }).result.current[0]).toBe("analysis");
  });

  it("ignores a request for another view's tab", () => {
    expect(aSession()({ value: "loans", seq: 1 }).result.current[0]).toBe("summary");
  });

  it("comes back on the tab it was left on", () => {
    const mountView = aSession();
    const first = mountView(null);

    act(() => first.result.current[1]("analysis"));
    first.unmount();

    expect(mountView(null).result.current[0]).toBe("analysis");
  });

  it("does not answer a request twice when the view comes back", () => {
    // App keeps the last request after it has been answered. Answering it
    // again on every return would undo whatever tab was picked since.
    const mountView = aSession();
    const request = { value: "analysis", seq: 1 } as const;
    const first = mountView(request);

    act(() => first.result.current[1]("summary"));
    first.unmount();

    expect(mountView(request).result.current[0]).toBe("summary");
  });

  it("answers a new request for the tab it is already on", () => {
    const mountView = aSession();
    const view = mountView({ value: "analysis", seq: 1 });

    act(() => view.result.current[1]("summary"));
    view.rerender({ tab: { value: "analysis", seq: 2 } });

    expect(view.result.current[0]).toBe("analysis");
  });
});
