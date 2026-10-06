import { describe, expect, it } from "vitest";
import { MIN_RISE, RISE_BASELINE, priceRises } from "./priceRises";
import {
  MONTHLY,
  NOTHING_DECLARED,
  chargesOf,
  datesEvery,
  detect,
  recurringTemplate,
} from "./testing/series";

const nothingDismissed = () => false;
const FOUR_MONTHS = ["2026-06-10", ...MONTHLY];

describe("priceRises", () => {
  it(`compares the latest charge with the median of the ${RISE_BASELINE} before it`, () => {
    const [rise, ...rest] = priceRises(
      detect(chargesOf("DLO*NETFLIX", FOUR_MONTHS, [4800, 5000, 5100, 5900])),
      nothingDismissed,
    );

    expect(rest).toEqual([]);
    expect(rise).toMatchObject({
      id: "rise:expense:ARS:netflix:monthly:5900",
      previous: 5000,
      latest: 5900,
      recurring: null,
    });
    expect(rise.rise).toBeCloseTo(0.18);
  });

  it(`takes a rise of ${MIN_RISE * 100}% and not less`, () => {
    expect(
      priceRises(
        detect(chargesOf("Netflix", FOUR_MONTHS, [5000, 5000, 5000, 5500])),
        nothingDismissed,
      ),
    ).toHaveLength(1);
    expect(
      priceRises(
        detect(chargesOf("Netflix", FOUR_MONTHS, [5000, 5000, 5000, 5499])),
        nothingDismissed,
      ),
    ).toEqual([]);
  });

  it(`needs ${RISE_BASELINE} charges before the latest`, () => {
    expect(
      priceRises(
        detect(chargesOf("Netflix", MONTHLY, [5000, 5000, 5900])),
        nothingDismissed,
      ),
    ).toEqual([]);
  });

  it("is only about monthly expenses", () => {
    const series = detect([
      ...chargesOf("Sueldo", FOUR_MONTHS, [100, 100, 100, 150], { type: "income" }),
      ...chargesOf("Clase de yoga", datesEvery(7, 4, "2026-10-01"), [100, 100, 100, 150]),
    ]);

    expect(series).toHaveLength(2);
    expect(priceRises(series, nothingDismissed)).toEqual([]);
  });

  it("leaves out a dismissed one", () => {
    const series = detect(chargesOf("Netflix", FOUR_MONTHS, [5000, 5000, 5000, 5900]));

    expect(
      priceRises(series, (id) => id === "rise:expense:ARS:netflix:monthly:5900"),
    ).toEqual([]);
  });

  describe("a declared recurring movement", () => {
    const transactions = chargesOf("Netflix", FOUR_MONTHS, [5000, 5000, 5000, 5900]);

    it("is offered the new amount while it still has the old one", () => {
      const template = recurringTemplate({ amount: 5000 });
      const [rise] = priceRises(
        detect(transactions, { ...NOTHING_DECLARED, recurring: [template] }),
        nothingDismissed,
      );

      expect(rise.recurring).toBe(template);
    });

    it("has nothing to say once it was updated", () => {
      const template = recurringTemplate({ amount: 5900 });

      expect(
        priceRises(
          detect(transactions, { ...NOTHING_DECLARED, recurring: [template] }),
          nothingDismissed,
        ),
      ).toEqual([]);
    });
  });
});
