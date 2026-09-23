// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthOverviewCards } from "./MonthOverviewCards";
import type { MonthOverview } from "@/lib/monthOverview";
import { allSkeletons, drawnSkeletons } from "@/test/loading";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const overview: MonthOverview = {
  monthKey: "2026-09",
  expenses: {
    total: 1500,
    previousTotal: 0,
    previousMonthKey: "2026-08",
    changeRatio: null,
  },
  budget: null,
  savings: null,
};

// Each card holds its figure and what sits under it, so none of them grows when
// the month lands: the comparison's line under the expenses, and a bar with its
// line under the budget and the savings.
const PLACEHOLDERS = 3 + 1 + 2 * 2;

function cards(isLoading: boolean) {
  return <MonthOverviewCards overview={overview} currency="ARS" isLoading={isLoading} />;
}

describe("MonthOverviewCards", () => {
  // Same screen as the balance bar, same gate: nothing drawn for a load that
  // may still be quick, but the heading's height kept so the card does not
  // grow when the figure lands.
  it("holds the three figures without drawing them while the load may be quick", () => {
    const { container } = render(cards(true));

    expect(allSkeletons(container)).toHaveLength(PLACEHOLDERS);
    expect(drawnSkeletons(container)).toHaveLength(0);
  });

  it("draws them once the load is taking a while", () => {
    const { container } = render(cards(true));

    act(() => void vi.advanceTimersByTime(120));

    expect(drawnSkeletons(container)).toHaveLength(PLACEHOLDERS);
  });

  it("fades in the figures and their captions when they arrive", () => {
    const { rerender } = render(cards(true));

    act(() => void vi.advanceTimersByTime(40));
    rerender(cards(false));

    expect(screen.getByText(/1\.500/).closest(".arrive")).not.toBeNull();
    expect(screen.getByText(/Sin gastos en/).closest(".arrive")).not.toBeNull();
  });
});
