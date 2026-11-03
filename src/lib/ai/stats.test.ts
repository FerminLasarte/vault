import { describe, expect, it } from "vitest";
import { mad, median, quantile } from "./stats";

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

describe("mad", () => {
  it("is nothing for no values", () => {
    expect(mad([])).toBeNull();
  });

  it("is how far the values sit from their median, typically", () => {
    // Median 1200; distances 200, 0, 200, 800 → their median is 200.
    expect(mad([1000, 1200, 1400, 2000])).toBe(200);
  });

  it("is not moved by one value far from the rest", () => {
    expect(mad([5000, 5000, 5000, 50000])).toBe(0);
  });
});

describe("quantile", () => {
  it("is nothing for no values", () => {
    expect(quantile([], 0.75)).toBeNull();
  });

  it("is the value that share of the others sits below, whatever the order", () => {
    expect(quantile([5, 1, 4, 2, 3], 0.75)).toBe(4);
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
  });

  it("reads between the two values around it", () => {
    expect(quantile([10, 20], 0.75)).toBe(17.5);
  });
});
