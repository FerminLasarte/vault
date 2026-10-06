// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiCard } from "./AiCard";

const app = vi.hoisted(() => ({
  aiEnabled: true,
  aiDismissed: {},
  setAiEnabled: vi.fn((_enabled: boolean) => Promise.resolve()),
  resetAiDismissals: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => app,
  useAppActions: () => app,
}));

beforeEach(() => {
  app.aiEnabled = true;
  app.aiDismissed = {};
  app.setAiEnabled.mockClear();
  app.resetAiDismissals.mockClear();
});

describe("AiCard", () => {
  // The promise the whole feature rests on, said where it is switched.
  it("says that nothing leaves the machine", () => {
    render(<AiCard />);

    expect(screen.getByText(/nada sale de él/)).toBeInTheDocument();
  });

  it("shows whether the local AI is on", () => {
    app.aiEnabled = false;
    render(<AiCard />);

    expect(screen.getByRole("tab", { name: "Desactivada" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switches it off", async () => {
    render(<AiCard />);

    await userEvent.click(screen.getByRole("tab", { name: "Desactivada" }));
    expect(app.setAiEnabled).toHaveBeenLastCalledWith(false);
  });

  // Nothing else brings a dismissed suggestion back.
  it("brings back what was dismissed", async () => {
    app.aiDismissed = { "rule:rappi:3": null, "rule-unused:4:netflix:5": null };
    render(<AiCard />);

    expect(screen.getByText(/Descartaste 2 sugerencias/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Volver a mostrarlas" }));
    expect(app.resetAiDismissals).toHaveBeenCalledOnce();
  });

  it("offers nothing to bring back when nothing was dismissed", () => {
    render(<AiCard />);

    expect(screen.queryByText(/Descartaste/)).not.toBeInTheDocument();
  });
});
