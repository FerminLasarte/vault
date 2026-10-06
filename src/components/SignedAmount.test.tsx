// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignedAmount } from "./SignedAmount";
import { formatCurrency } from "@/lib/format";

const AMOUNT = formatCurrency(1500, "ARS");

// What was drawn, and its text as read.
function drawn(ui: React.ReactElement) {
  const amount = render(ui).container.firstElementChild as HTMLElement;
  return { amount, text: amount.textContent };
}

describe("SignedAmount", () => {
  it("shows money coming in with a plus, in green", () => {
    const { amount, text } = drawn(
      <SignedAmount amount={1500} currency="ARS" type="income" />,
    );

    expect(text).toBe(`+${AMOUNT}`);
    expect(amount).toHaveClass("text-positive");
  });

  it("shows money going out with a minus, in red", () => {
    const { amount, text } = drawn(
      <SignedAmount amount={1500} currency="ARS" type="expense" />,
    );

    expect(text).toBe(`-${AMOUNT}`);
    expect(amount).toHaveClass("text-negative");
  });

  // The user's own money changing hands: neither a gain nor a loss.
  it("gives a transfer no sign and no colour", () => {
    const { amount, text } = drawn(
      <SignedAmount amount={1500} currency="ARS" type="transfer" />,
    );

    expect(text).toBe(AMOUNT);
    expect(amount).not.toHaveClass("text-positive");
    expect(amount).not.toHaveClass("text-negative");
  });

  it("keeps the sign but drops the colour when muted", () => {
    const { amount, text } = drawn(
      <SignedAmount amount={1500} currency="ARS" type="income" muted />,
    );

    expect(text).toBe(`+${AMOUNT}`);
    expect(amount).toHaveClass("text-muted-foreground");
    expect(amount).not.toHaveClass("text-positive");
  });
});
