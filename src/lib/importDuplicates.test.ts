import { describe, expect, it } from "vitest";
import { heldCopies, type DuplicateIdentity } from "./importDuplicates";

function movement(overrides: Partial<DuplicateIdentity> = {}): DuplicateIdentity {
  return {
    date: "2026-10-01",
    type: "expense",
    amount: 1500,
    currency: "ARS",
    description: "SUBE",
    ...overrides,
  };
}

describe("heldCopies", () => {
  it("recognises a movement already held, whatever the case and accents", () => {
    const isHeld = heldCopies([movement({ description: "Café Martínez" })]);

    expect(isHeld(movement({ description: "CAFE MARTINEZ" }))).toBe(true);
  });

  // Two identical fares on the same day are two fares.
  it("hands each held movement out once", () => {
    const isHeld = heldCopies([movement()]);

    expect(isHeld(movement())).toBe(true);
    expect(isHeld(movement())).toBe(false);
  });

  it("tells apart a different day, kind, amount or currency", () => {
    const isHeld = heldCopies([movement()]);

    expect(isHeld(movement({ date: "2026-10-02" }))).toBe(false);
    expect(isHeld(movement({ type: "income" }))).toBe(false);
    expect(isHeld(movement({ amount: 1501 }))).toBe(false);
    expect(isHeld(movement({ currency: "USD" }))).toBe(false);
  });
});
