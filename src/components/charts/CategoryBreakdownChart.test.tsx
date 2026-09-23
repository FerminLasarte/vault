// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryBreakdownChart } from "./CategoryBreakdownChart";
import { allSkeletons, drawnSkeletons } from "@/test/loading";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function chart(isLoading: boolean) {
  return <CategoryBreakdownChart data={[]} currency="ARS" isLoading={isLoading} />;
}

describe("CategoryBreakdownChart", () => {
  // A dash is what the app writes for a total it cannot work out. One that is
  // merely late is a placeholder, like every other late figure on the screen.
  it("does not show a late total as one that cannot be worked out", () => {
    render(chart(true));

    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("stands the total in with the chart, through the same gate", () => {
    const { container } = render(chart(true));

    // The total and the chart, both held and neither drawn yet.
    expect(allSkeletons(container)).toHaveLength(2);
    expect(drawnSkeletons(container)).toHaveLength(0);

    act(() => void vi.advanceTimersByTime(120));

    expect(drawnSkeletons(container)).toHaveLength(2);
  });

  it("keeps the dash for a period with nothing to add up", () => {
    render(chart(false));

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
