import { describe, expect, it } from "vitest";
import {
  occurrenceAt,
  occurrencesBetween,
  pendingOccurrences,
  recurringFromTemplate,
} from "@/lib/recurring";

describe("occurrenceAt", () => {
  it("returns the start date itself at index 0", () => {
    expect(occurrenceAt("2026-08-10", "monthly", 0)).toBe("2026-08-10");
  });

  it("steps a week at a time", () => {
    expect(occurrenceAt("2026-08-10", "weekly", 1)).toBe("2026-08-17");
    expect(occurrenceAt("2026-08-10", "weekly", 4)).toBe("2026-09-07");
  });

  it("steps a month at a time", () => {
    expect(occurrenceAt("2026-08-10", "monthly", 1)).toBe("2026-09-10");
    expect(occurrenceAt("2026-08-10", "monthly", 5)).toBe("2027-01-10");
  });

  it("steps a year at a time", () => {
    expect(occurrenceAt("2026-08-10", "yearly", 2)).toBe("2028-08-10");
  });

  it("borrows the last day of a short month", () => {
    expect(occurrenceAt("2026-01-31", "monthly", 1)).toBe("2026-02-28");
  });

  // The reason occurrences are derived from the start date rather than from the
  // previous one: stepping would leave this series stuck on the 28th.
  it("returns to the anchor day after a short month", () => {
    expect(occurrenceAt("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceAt("2026-01-31", "monthly", 3)).toBe("2026-04-30");
    expect(occurrenceAt("2026-01-31", "monthly", 4)).toBe("2026-05-31");
  });

  it("handles a leap day anchor", () => {
    expect(occurrenceAt("2024-02-29", "yearly", 1)).toBe("2025-02-28");
    expect(occurrenceAt("2024-02-29", "yearly", 4)).toBe("2028-02-29");
  });

  it("crosses the year boundary going forward", () => {
    expect(occurrenceAt("2026-12-15", "monthly", 1)).toBe("2027-01-15");
  });
});

describe("pendingOccurrences", () => {
  it("proposes nothing before the series starts", () => {
    expect(pendingOccurrences("2026-09-01", "monthly", null, "2026-08-22")).toEqual([]);
  });

  it("proposes the first occurrence once it is due", () => {
    expect(pendingOccurrences("2026-08-01", "monthly", null, "2026-08-22")).toEqual([
      "2026-08-01",
    ]);
  });

  it("includes an occurrence falling exactly today", () => {
    expect(pendingOccurrences("2026-08-22", "monthly", null, "2026-08-22")).toEqual([
      "2026-08-22",
    ]);
  });

  it("catches up every period missed while the app was closed", () => {
    expect(pendingOccurrences("2026-05-10", "monthly", null, "2026-08-22")).toEqual([
      "2026-05-10",
      "2026-06-10",
      "2026-07-10",
      "2026-08-10",
    ]);
  });

  it("skips what was already confirmed", () => {
    expect(
      pendingOccurrences("2026-05-10", "monthly", "2026-06-10", "2026-08-22"),
    ).toEqual(["2026-07-10", "2026-08-10"]);
  });

  it("proposes nothing when everything is up to date", () => {
    expect(
      pendingOccurrences("2026-05-10", "monthly", "2026-08-10", "2026-08-22"),
    ).toEqual([]);
  });

  it("caps how many it will propose at once", () => {
    const pending = pendingOccurrences("2000-01-01", "monthly", null, "2026-08-22", 5);
    expect(pending).toHaveLength(5);
    expect(pending[0]).toBe("2000-01-01");
  });

  it("handles a weekly series", () => {
    expect(pendingOccurrences("2026-08-01", "weekly", null, "2026-08-22")).toEqual([
      "2026-08-01",
      "2026-08-08",
      "2026-08-15",
      "2026-08-22",
    ]);
  });

  it("keeps the anchor day across a short month when catching up", () => {
    expect(pendingOccurrences("2026-01-31", "monthly", null, "2026-04-15")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
});

describe("occurrencesBetween", () => {
  it("lists the monthly occurrences inside the window", () => {
    expect(
      occurrencesBetween("2026-01-10", "monthly", "2026-09-01", "2026-09-30"),
    ).toEqual(["2026-09-10"]);
  });

  it("finds every weekly occurrence of a month", () => {
    const dates = occurrencesBetween("2026-08-07", "weekly", "2026-09-01", "2026-09-30");
    expect(dates).toEqual(["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"]);
  });

  it("returns nothing when the series has not started yet", () => {
    expect(
      occurrencesBetween("2027-01-10", "monthly", "2026-09-01", "2026-09-30"),
    ).toEqual([]);
  });

  it("keeps a yearly series out of the months it does not fall in", () => {
    expect(
      occurrencesBetween("2020-03-05", "yearly", "2026-09-01", "2026-09-30"),
    ).toEqual([]);
    expect(
      occurrencesBetween("2020-03-05", "yearly", "2027-03-01", "2027-03-31"),
    ).toEqual(["2027-03-05"]);
  });

  it("borrows the last day of a short month, like the rest of the series math", () => {
    expect(
      occurrencesBetween("2026-01-31", "monthly", "2027-02-01", "2027-02-28"),
    ).toEqual(["2027-02-28"]);
  });
});

describe("recurringFromTemplate", () => {
  it("is the template as it would be written back, paused or not", () => {
    expect(
      recurringFromTemplate({
        id: 4,
        description: "Alquiler",
        amount: 300000,
        type: "expense",
        category_id: 1,
        payment_method_id: 2,
        currency: "ARS",
        frequency: "monthly",
        start_date: "2026-01-01",
        last_confirmed_date: "2026-09-01",
        is_active: 0,
      }),
    ).toEqual({
      description: "Alquiler",
      amount: 300000,
      type: "expense",
      categoryId: 1,
      paymentMethodId: 2,
      currency: "ARS",
      frequency: "monthly",
      startDate: "2026-01-01",
      isActive: false,
    });
  });
});
