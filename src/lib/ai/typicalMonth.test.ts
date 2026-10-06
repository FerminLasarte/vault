import { describe, expect, it } from "vitest";
import {
  MIN_TYPICAL_MONTHS,
  TYPICAL_MONTHS,
  monthCurves,
  monthTotals,
  typicalBetween,
  typicalMonthKeys,
  typicalTotal,
} from "./typicalMonth";
import { TODAY, chargesOf } from "./testing/series";

const since = (date: string) => [{ date }];

describe("typicalMonthKeys", () => {
  it(`reads the last ${TYPICAL_MONTHS} complete months, oldest first`, () => {
    expect(typicalMonthKeys(since("2025-01-15"), TODAY)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("leaves out a month the history does not cover from its first day", () => {
    expect(typicalMonthKeys(since("2026-06-01"), TODAY)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(typicalMonthKeys(since("2026-06-02"), TODAY)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it(`needs ${MIN_TYPICAL_MONTHS} of them`, () => {
    expect(typicalMonthKeys(since("2026-07-02"), TODAY)).toBeNull();
    expect(typicalMonthKeys([], TODAY)).toBeNull();
  });
});

describe("monthCurves", () => {
  const curves = monthCurves(
    [
      ...chargesOf("Coto", ["2026-07-02", "2026-07-20"], [100, 50]),
      ...chargesOf("Coto", ["2026-08-05"], [300]),
      ...chargesOf("Coto", ["2026-09-25", "2026-10-01"], [80, 999]),
    ],
    ["2026-07", "2026-08", "2026-09"],
  );

  it("adds each month up day by day, and ignores other months", () => {
    expect(curves[0][1]).toBe(0);
    expect(curves[0][2]).toBe(100);
    expect(curves[0][31]).toBe(150);
    expect(monthTotals(curves)).toEqual([150, 300, 80]);
  });

  it("takes the median of a stretch over the months", () => {
    // After the 3rd: 50, 300 and 80.
    expect(typicalBetween(curves, 3, 31)).toBe(80);
    expect(typicalTotal(curves)).toBe(150);
  });

  it("reads a day past a short month's end as its last", () => {
    const [february] = monthCurves(chargesOf("Coto", ["2026-02-28"], [40]), ["2026-02"]);
    expect(february).toHaveLength(29);
    expect(typicalBetween([february], 0, 31)).toBe(40);
  });
});
