// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListCard } from "./ListCard";
import { drawnSkeletons } from "@/test/loading";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const empty = {
  message: "Todavía no hay reglas.",
  actionLabel: "Agregar la primera",
  onAction: () => {},
};

function card(isLoading: boolean, isEmpty = true) {
  return (
    <ListCard title="Reglas" isLoading={isLoading} isEmpty={isEmpty} empty={empty}>
      <p>Una regla</p>
    </ListCard>
  );
}

describe("ListCard", () => {
  // The load is over but the placeholder is still held so it can be read. The
  // empty message and the way out of an empty section land after it, not on
  // top of three rows standing in for the ones that turned out not to exist.
  it("holds the empty state back while the placeholder is still held", () => {
    const { container, rerender } = render(card(true));

    act(() => void vi.advanceTimersByTime(120));
    rerender(card(false));

    expect(drawnSkeletons(container).length).toBeGreaterThan(0);
    expect(screen.queryByText(empty.message)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: empty.actionLabel }),
    ).not.toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(300));

    expect(drawnSkeletons(container)).toHaveLength(0);
    expect(screen.getByText(empty.message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: empty.actionLabel })).toBeInTheDocument();
  });

  it("fades in the rows that arrive after a wait", () => {
    const { rerender } = render(card(true, false));

    act(() => void vi.advanceTimersByTime(40));
    rerender(card(false, false));

    expect(screen.getByText("Una regla").parentElement).toHaveClass("arrive");
  });

  it("fades in the empty state that arrives after a wait", () => {
    const { rerender } = render(card(true));

    act(() => void vi.advanceTimersByTime(40));
    rerender(card(false));

    expect(screen.getByText(empty.message)).toHaveClass("arrive");
    expect(
      screen
        .getByRole("button", { name: empty.actionLabel })
        .closest('[data-slot="card-footer"]'),
    ).toHaveClass("arrive");
  });

  it("shows rows that were already here as they are", () => {
    render(card(false, false));

    expect(screen.getByText("Una regla").parentElement).not.toHaveClass("arrive");
  });
});
