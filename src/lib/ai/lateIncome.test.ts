import { describe, expect, it } from "vitest";
import {
  LATE_TOLERANCE_DAYS,
  MAX_DAY_SPREAD,
  MIN_INCOME_OCCURRENCES,
  lateIncome,
} from "./lateIncome";
import { NOTHING_DECLARED, charges, detect, recurringTemplate } from "./testing/series";

const nothingDismissed = () => false;

// Days 4, 3, 5 and 4: usually around the 4th.
const SALARY = ["2026-06-04", "2026-07-03", "2026-08-05", "2026-09-04"];

function salary(dates: string[]) {
  return charges("Sueldo", dates, { type: "income", amount: 900000 });
}

function late(dates: string[], today: string, commitments = NOTHING_DECLARED) {
  return lateIncome(detect(salary(dates), commitments, today), today, nothingDismissed);
}

describe("lateIncome", () => {
  it("says when monthly income is later than usual", () => {
    const [notice, ...rest] = late(SALARY, "2026-10-08");

    expect(rest).toEqual([]);
    expect(notice).toMatchObject({
      id: "late:income:ARS:sueldo:monthly:2026-10",
      usualDay: 4,
      earliestDay: 3,
      latestDay: 5,
      months: 4,
    });
  });

  it(`waits ${LATE_TOLERANCE_DAYS} days past the usual one`, () => {
    expect(late(SALARY, "2026-10-07")).toEqual([]);
    expect(late(SALARY, "2026-10-08")).toHaveLength(1);
  });

  it("is quiet once this month's came in", () => {
    expect(late([...SALARY, "2026-10-02"], "2026-10-08")).toEqual([]);
  });

  it("is quiet when this month's came in early, at the end of the last one", () => {
    expect(late([...SALARY, "2026-09-30"], "2026-10-08")).toEqual([]);
  });

  it(`needs ${MIN_INCOME_OCCURRENCES} occurrences`, () => {
    expect(late(SALARY.slice(1), "2026-10-08")).toEqual([]);
  });

  it(`needs the days it came in within ${MAX_DAY_SPREAD} of each other`, () => {
    // Days 2, 6, 9 and 4, then 2, 6, 10 and 4; usually around the 5th.
    expect(
      late(["2026-06-02", "2026-07-06", "2026-08-09", "2026-09-04"], "2026-10-09"),
    ).toHaveLength(1);
    expect(
      late(["2026-06-02", "2026-07-06", "2026-08-10", "2026-09-04"], "2026-10-09"),
    ).toEqual([]);
  });

  it("leaves a declared recurring income to Compromisos, which already asks for it", () => {
    const template = recurringTemplate({ description: "Sueldo", type: "income" });

    expect(
      late(SALARY, "2026-10-08", { ...NOTHING_DECLARED, recurring: [template] }),
    ).toEqual([]);
  });

  it("is only about income", () => {
    const series = detect(charges("Alquiler", SALARY), NOTHING_DECLARED, "2026-10-08");

    expect(series).toHaveLength(1);
    expect(lateIncome(series, "2026-10-08", nothingDismissed)).toEqual([]);
  });

  it("leaves out a dismissed one, for that month", () => {
    const series = detect(salary(SALARY), NOTHING_DECLARED, "2026-10-08");

    expect(
      lateIncome(
        series,
        "2026-10-08",
        (id) => id === "late:income:ARS:sueldo:monthly:2026-10",
      ),
    ).toEqual([]);
  });
});
