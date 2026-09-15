import { describe, expect, it } from "vitest";
import { CATEGORY_PALETTE, nextCategoryColor } from "@/lib/categoryColors";

// The grey every category used to be saved with, and the one the seeded
// "Otros" still has.
const GREY = "#64748b";

describe("nextCategoryColor", () => {
  it("offers distinct colours rather than one grey for every category", () => {
    expect(new Set(CATEGORY_PALETTE).size).toBe(CATEGORY_PALETTE.length);
    expect(CATEGORY_PALETTE).not.toContain(GREY);
  });

  it("starts with the first colour when nothing is taken", () => {
    expect(nextCategoryColor([])).toBe(CATEGORY_PALETTE[0]);
  });

  it("skips the colours already in use", () => {
    const used = [CATEGORY_PALETTE[0], CATEGORY_PALETTE[1], GREY];
    expect(nextCategoryColor(used)).toBe(CATEGORY_PALETTE[2]);
  });

  it("compares colours regardless of case", () => {
    expect(nextCategoryColor([CATEGORY_PALETTE[0].toUpperCase()])).toBe(
      CATEGORY_PALETTE[1],
    );
  });

  it("reuses the least used colour once every one is taken", () => {
    // Every colour twice, and all but the fourth a third time.
    const used = [...CATEGORY_PALETTE, ...CATEGORY_PALETTE];
    const repeated = CATEGORY_PALETTE.filter((_, index) => index !== 3);
    expect(nextCategoryColor([...used, ...repeated])).toBe(CATEGORY_PALETTE[3]);
  });
});
