// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttentionNotice } from "./AttentionNotice";
import type { AttentionItem } from "@/lib/attention";

const BACKUP: AttentionItem = {
  kind: "backup",
  tone: "critical",
  title: "Nunca guardaste una copia de seguridad",
  detail: "Tus datos viven solo en este equipo. Guardá una desde Ajustes.",
};

const CLOSE: AttentionItem = {
  kind: "close",
  tone: "neutral",
  title: "El cierre de agosto de 2026 está listo",
  detail: "Ingresos, gastos y la comparación con el mes anterior y el año pasado.",
  actionLabel: "Guardar como PDF",
};

describe("AttentionNotice", () => {
  it("draws nothing when there is nothing to raise", () => {
    const { container } = render(<AttentionNotice items={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it("puts every notice on the same line, headline first", () => {
    render(<AttentionNotice items={[BACKUP, CLOSE]} />);

    const notices = screen.getAllByRole("listitem");
    expect(notices).toHaveLength(2);
    expect(notices[0].textContent).toContain(BACKUP.title);
    expect(notices[1].textContent).toContain(CLOSE.title);
  });

  // The detail moved into a hint to fit one line, and a hint needs a pointer.
  it("keeps the detail in the text for anyone who cannot hover", () => {
    render(<AttentionNotice items={[BACKUP]} />);

    expect(screen.getByRole("listitem").textContent).toContain(BACKUP.detail);
  });

  it("marks a critical headline, and leaves a neutral one alone", () => {
    render(<AttentionNotice items={[BACKUP, CLOSE]} />);

    expect(screen.getByText(BACKUP.title).className).toContain("text-destructive");
    expect(screen.getByText(CLOSE.title).className).not.toContain("text-destructive");
  });

  it("offers the action beside its notice and reports which one was asked for", () => {
    const onAction = vi.fn();
    render(<AttentionNotice items={[BACKUP, CLOSE]} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Guardar como PDF" }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith("close");
  });

  it("offers no action when the screen has nothing to do with it", () => {
    render(<AttentionNotice items={[CLOSE]} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
