import { describe, expect, it, vi } from "vitest";
import { idSelectProps } from "./forms";

const ACCOUNTS = { "1": "Efectivo", "2": "Banco" };

describe("idSelectProps", () => {
  it("shows the id the form holds when it is one of the items", () => {
    expect(idSelectProps(ACCOUNTS, 2, vi.fn()).value).toBe("2");
  });

  // Handed an id that is not listed, the Select goes back to the value it held
  // when it mounted, an earlier row's, and reports it as if it were a pick.
  // It leaves a null alone.
  it("shows nothing selected for an id that is not among the items", () => {
    expect(idSelectProps(ACCOUNTS, 3, vi.fn()).value).toBeNull();
    expect(idSelectProps(ACCOUNTS, null, vi.fn()).value).toBeNull();
    expect(idSelectProps(ACCOUNTS, undefined, vi.fn()).value).toBeNull();
  });

  it("hands on the id that was picked, as a number", () => {
    const onChange = vi.fn();

    idSelectProps(ACCOUNTS, null, onChange).onValueChange("1");

    expect(onChange).toHaveBeenCalledWith(1);
  });

  // Read as a number, the Select's own null was id 0, recorded as the user's
  // change.
  it("ignores a null the Select reports on its own", () => {
    const onChange = vi.fn();

    idSelectProps(ACCOUNTS, 1, onChange).onValueChange(null);

    expect(onChange).not.toHaveBeenCalled();
  });
});
