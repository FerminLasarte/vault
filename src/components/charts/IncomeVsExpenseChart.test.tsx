// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHART_HEIGHT, IncomeVsExpenseChart } from "./IncomeVsExpenseChart";
import { allSkeletons } from "@/test/loading";

// Recharts measures its container, which jsdom cannot do.
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const data = [
  { monthKey: "2026-09", income: 1000, expenses: 500 },
  { monthKey: "2026-10", income: 0, expenses: 300, isProjected: true },
];

const CAPTION = /Los meses claros/;

function chart(isLoading: boolean) {
  return <IncomeVsExpenseChart data={data} currency="ARS" isLoading={isLoading} />;
}

describe("IncomeVsExpenseChart", () => {
  it("stands in for the chart with a block of the chart's own height", () => {
    const { container } = render(chart(true));

    const [placeholder] = allSkeletons(container);
    expect(placeholder).toHaveStyle({ height: `${CHART_HEIGHT}px` });
  });

  // The caption explains the faded bars. Under a placeholder that is still
  // being held, there are no bars for it to explain.
  it("holds the caption back with the chart it belongs to", () => {
    const { rerender } = render(chart(true));

    act(() => void vi.advanceTimersByTime(120));
    rerender(chart(false));

    expect(screen.queryByText(CAPTION)).not.toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(300));

    expect(screen.getByText(CAPTION)).toBeInTheDocument();
  });
});
