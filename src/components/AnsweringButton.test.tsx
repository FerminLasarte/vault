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

// The face the button is showing, as opposed to the one it keeps drawn but
// hidden so that its width never changes.
function shown(container: HTMLElement) {
  const face = container.querySelector("[data-slot=answering-face]:not([aria-hidden])");

  if (!face) throw new Error("No face is showing");

  return face;
}

describe("AnsweringButton", () => {
  it("is an ordinary button until it has something to report", () => {
    const { container } = renderButton(() => true);

    expect(screen.getByRole("button")).toHaveAccessibleName("Copiar alias");
    expect(shown(container).querySelector(".lucide-copy")).toBeInTheDocument();
    expect(shown(container).querySelector(".lucide-check")).not.toBeInTheDocument();
  });

  it("answers in place once the work lands", async () => {
    const { container } = renderButton(() => true);

    await press();

    expect(screen.getByRole("button")).toHaveAccessibleName("¡Copiado!");
    expect(shown(container).querySelector(".lucide-check")).toBeInTheDocument();
    expect(shown(container).querySelector(".lucide-copy")).not.toBeInTheDocument();
  });

  it("waits for an action that takes a moment", async () => {
    let land = (_: boolean) => {};
    const pending = new Promise<boolean>((resolve) => (land = resolve));
    renderButton(() => pending);

    await press();
    expect(screen.getByRole("button")).toHaveAccessibleName("Copiar alias");

    land(true);
    await act(async () => {});

    expect(screen.getByRole("button")).toHaveAccessibleName("¡Copiado!");
  });

  it("goes back to being a button", async () => {
    renderButton(() => true);

    await press();
    act(() => void vi.advanceTimersByTime(1500));

    expect(screen.getByRole("button")).toHaveAccessibleName("Copiar alias");
  });

  it("says nothing when the action did not happen", async () => {
    // Every action here can end without doing anything — a save dialog the
    // user cancelled, a clipboard that refused — and a button that reports
    // success anyway is worse than one that reports nothing.
    const { container } = renderButton(() => false);

    await press();

    expect(screen.getByRole("button")).toHaveAccessibleName("Copiar alias");
    expect(shown(container).querySelector(".lucide-check")).not.toBeInTheDocument();
  });

  // The button sits in a row of others. If its width followed the label, the
  // buttons beside it would slide under the pointer that just clicked, and
  // slide back when the answer goes.
  it("keeps both faces in one cell so its width never changes", async () => {
    const { container } = renderButton(() => true);
    const faces = () => [...container.querySelectorAll("[data-slot=answering-face]")];

    expect(faces()).toHaveLength(2);
    expect(faces().map((face) => face.textContent)).toEqual([
      "Copiar alias",
      "¡Copiado!",
    ]);
    for (const face of faces()) {
      expect(face).toHaveClass("col-start-1", "row-start-1");
    }
    expect(faces()[1]).toHaveAttribute("aria-hidden", "true");
    expect(faces()[1]).toHaveClass("invisible");

    await press();

    expect(faces()[0]).toHaveAttribute("aria-hidden", "true");
    expect(faces()[0]).toHaveClass("invisible");
    expect(faces()[1]).not.toHaveClass("invisible");
  });

  // "Animated rather than swapped": the face that takes over fades in, both
  // ways. What the button was first drawn with is not a change, and fading it
  // in would make every visit to the screen flicker.
  it("fades in the face it changes to, and not the one it was drawn with", async () => {
    const { container } = renderButton(() => true);

    expect(shown(container)).not.toHaveClass("animate-in");

    await press();
    expect(shown(container)).toHaveClass("animate-in", "fade-in");
    expect(shown(container)).toHaveTextContent("¡Copiado!");

    act(() => void vi.advanceTimersByTime(1500));
    expect(shown(container)).toHaveClass("animate-in", "fade-in");
    expect(shown(container)).toHaveTextContent("Copiar alias");
  });
});
