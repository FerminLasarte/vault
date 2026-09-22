// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Copy } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnsweringButton } from "./AnsweringButton";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// `fireEvent` rather than `userEvent`: the latter waits on real timers, which
// these tests have replaced. The extra `act` lets the action's promise settle
// before anything is asserted.
async function press() {
  fireEvent.click(screen.getByRole("button"));
  await act(async () => {});
}

function renderButton(onAction: () => boolean | Promise<boolean>) {
  return render(
    <AnsweringButton icon={Copy} answer="¡Copiado!" onAction={onAction}>
      Copiar alias
    </AnsweringButton>,
  );
}

describe("AnsweringButton", () => {
  it("is an ordinary button until it has something to report", () => {
    const { container } = renderButton(() => true);

    expect(screen.getByRole("button")).toHaveTextContent("Copiar alias");
    expect(container.querySelector(".lucide-copy")).toBeInTheDocument();
    expect(container.querySelector(".lucide-check")).not.toBeInTheDocument();
  });

  it("answers in place once the work lands", async () => {
    const { container } = renderButton(() => true);

    await press();

    expect(screen.getByRole("button")).toHaveTextContent("¡Copiado!");
    expect(container.querySelector(".lucide-check")).toBeInTheDocument();
    expect(container.querySelector(".lucide-copy")).not.toBeInTheDocument();
  });

  it("waits for an action that takes a moment", async () => {
    let land = (_: boolean) => {};
    const pending = new Promise<boolean>((resolve) => (land = resolve));
    renderButton(() => pending);

    await press();
    expect(screen.getByRole("button")).toHaveTextContent("Copiar alias");

    land(true);
    await act(async () => {});

    expect(screen.getByRole("button")).toHaveTextContent("¡Copiado!");
  });

  it("goes back to being a button", async () => {
    renderButton(() => true);

    await press();
    act(() => void vi.advanceTimersByTime(1500));

    expect(screen.getByRole("button")).toHaveTextContent("Copiar alias");
  });

  it("says nothing when the action did not happen", async () => {
    // Every action here can end without doing anything — a save dialog the
    // user cancelled, a clipboard that refused — and a button that reports
    // success anyway is worse than one that reports nothing.
    const { container } = renderButton(() => false);

    await press();

    expect(screen.getByRole("button")).toHaveTextContent("Copiar alias");
    expect(container.querySelector(".lucide-check")).not.toBeInTheDocument();
  });
});
