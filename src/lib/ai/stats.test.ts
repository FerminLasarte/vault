import { describe, expect, it } from "vitest";
import { median } from "./stats";

describe("median", () => {
  it("is nothing for no values", () => {
    expect(median([])).toBeNull();
  });

  it("is the middle value of an odd count, whatever the order", () => {
    expect(median([9000, 1000, 1200])).toBe(1200);
  });

  it("is the mean of the two middle values of an even count", () => {
    expect(median([1000, 1400, 1200, 50000])).toBe(1300);
  });
});
