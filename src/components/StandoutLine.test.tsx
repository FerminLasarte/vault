// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StandoutLine } from "./StandoutLine";

const TITLE = "Este mes Salidas viene un 80% arriba de lo habitual";
const REASON = "Si el resto del mes va como siempre, llegás a $ 36.000,00.";

describe("StandoutLine", () => {
  it("says what stands out, with its reason for a screen reader too", () => {
    render(
      <ul>
        <StandoutLine title={TITLE} reason={REASON} onDismiss={() => {}} />
      </ul>,
    );

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(`. ${REASON}`)).toHaveClass("sr-only");
    expect(screen.getByText("IA")).toBeInTheDocument();
  });

  it("is a row of the notices list", () => {
    render(
      <ul>
        <StandoutLine title={TITLE} reason={REASON} onDismiss={() => {}} />
      </ul>,
    );

    expect(screen.getByRole("listitem").textContent).toContain(TITLE);
  });

  it("is waved away from the line itself", () => {
    const onDismiss = vi.fn();
    render(
      <ul>
        <StandoutLine title={TITLE} reason={REASON} onDismiss={onDismiss} />
      </ul>,
    );

    fireEvent.click(screen.getByRole("button", { name: `Descartar ${TITLE}` }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
