import { describe, expect, it, vi } from "vitest";
import { onIdPicked } from "./forms";

describe("onIdPicked", () => {
  it("hands on the id that was picked, as a number", () => {
    const onChange = vi.fn();

    onIdPicked(onChange)("7");

    expect(onChange).toHaveBeenCalledWith(7);
  });

  // The Select reports a null of its own when its value drops out of its
  // items. Read as a number, that was id 0, recorded as the user's change.
  it("ignores the null the Select reports on its own", () => {
    const onChange = vi.fn();

    onIdPicked(onChange)(null);

    expect(onChange).not.toHaveBeenCalled();
  });
});
