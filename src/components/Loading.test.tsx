// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Loading } from "./Loading";
import { allSkeletons, drawnSkeletons } from "@/test/loading";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function renderLoading(when: boolean) {
  const view = render(
    <Loading when={when}>
      <p>Contenido</p>
    </Loading>,
  );

  return {
    ...view,
    finish: () =>
      view.rerender(
        <Loading when={false}>
          <p>Contenido</p>
        </Loading>,
      ),
  };
}

describe("Loading", () => {
  // Drawn or not, the placeholder is there from the start, so the section
  // keeps its height and nothing moves when the placeholder is drawn.
  it("holds the placeholder's space before it is worth drawing", () => {
    const { container } = renderLoading(true);

    expect(allSkeletons(container).length).toBeGreaterThan(0);
    expect(drawnSkeletons(container)).toHaveLength(0);
    expect(screen.queryByText("Contenido")).not.toBeInTheDocument();
  });

  it("draws it once the load is taking a while", () => {
    const { container } = renderLoading(true);

    act(() => void vi.advanceTimersByTime(120));

    expect(drawnSkeletons(container).length).toBeGreaterThan(0);
  });

  // What was waited for fades into place rather than cutting in, the same way
  // everywhere it happens.
  it("fades in content that arrives after a wait", () => {
    const { finish } = renderLoading(true);

    act(() => void vi.advanceTimersByTime(40));
    finish();

    expect(screen.getByText("Contenido").parentElement).toHaveClass("arrive");
  });

  it("fades in content that replaces a drawn placeholder", () => {
    const { finish } = renderLoading(true);

    act(() => void vi.advanceTimersByTime(120));
    finish();
    act(() => void vi.advanceTimersByTime(300));

    expect(screen.getByText("Contenido").parentElement).toHaveClass("arrive");
  });

  it("shows content that was already here as it is", () => {
    renderLoading(false);

    expect(screen.getByText("Contenido").parentElement).not.toHaveClass("arrive");
  });
});
