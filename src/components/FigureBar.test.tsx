// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FigureBar } from "./FigureBar";
import { allSkeletons, drawnSkeletons } from "@/test/loading";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const figures = [
  { key: "ars", label: "Pesos", value: "$ 1.000" },
  { key: "usd", label: "Dólares", value: "US$ 10" },
];

describe("FigureBar", () => {
  // Estadísticas is the screen the app opens on. Drawing a skeleton for a load
  // that is over in a few milliseconds is the flash the slow-loading gate
  // exists to prevent, and the lists beside this bar already go through it.
  it("holds each figure's line without drawing it while the load may be quick", () => {
    const { container } = render(<FigureBar figures={figures} isLoading />);

    expect(allSkeletons(container)).toHaveLength(2);
    expect(drawnSkeletons(container)).toHaveLength(0);
  });

  it("draws the figures' placeholders once the load is taking a while", () => {
    const { container } = render(<FigureBar figures={figures} isLoading />);

    act(() => void vi.advanceTimersByTime(120));

    expect(drawnSkeletons(container)).toHaveLength(2);
  });

  // The line under a figure lands with it. Without a place held for it, the
  // bar grew by that line the moment the figures arrived.
  it("holds the line under a figure that has one", () => {
    const withSub = [
      ...figures,
      { key: "total", label: "Total", value: "$ 2.000", sub: <span>≈ US$ 20</span> },
    ];
    const { container } = render(<FigureBar figures={withSub} isLoading />);

    // Three figures and the one line underneath.
    expect(allSkeletons(container)).toHaveLength(4);

    act(() => void vi.advanceTimersByTime(120));

    expect(drawnSkeletons(container)).toHaveLength(4);
  });

  it("fades each figure in over the same time as everything else that arrives", () => {
    render(<FigureBar figures={figures} />);

    expect(screen.getByText("$ 1.000")).toHaveClass("arrive");
  });
});
