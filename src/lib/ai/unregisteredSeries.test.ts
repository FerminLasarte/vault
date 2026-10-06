import { describe, expect, it } from "vitest";
import { unregisteredSeries } from "./unregisteredSeries";
import {
  MONTHLY,
  NOTHING_DECLARED,
  charges,
  chargesOf,
  datesEvery,
  detect,
  movement,
  recurringTemplate,
} from "./testing/series";

const nothingDismissed = () => false;

describe("unregisteredSeries", () => {
  it("offers each series nobody declared, by an id that outlives a restart", () => {
    const [offer] = unregisteredSeries(
      detect(charges("DLO*NETFLIX 4471", MONTHLY)),
      nothingDismissed,
    );

    expect(offer.id).toBe("series:expense:ARS:netflix:monthly");
  });

  it("leaves out one already declared as recurring", () => {
    const series = detect(charges("Netflix", MONTHLY), {
      ...NOTHING_DECLARED,
      recurring: [recurringTemplate()],
    });

    expect(unregisteredSeries(series, nothingDismissed)).toEqual([]);
  });

  it("leaves out a dismissed one", () => {
    const series = detect(charges("Netflix", MONTHLY));

    expect(
      unregisteredSeries(series, (id) => id === "series:expense:ARS:netflix:monthly"),
    ).toEqual([]);
  });

  it("puts the series seen the most times first", () => {
    const offers = unregisteredSeries(
      detect([
        ...charges("Spotify", MONTHLY),
        ...charges("Clase de yoga", datesEvery(7, 5, "2026-10-01")),
      ]),
      nothingDismissed,
    );

    expect(offers.map((offer) => offer.series.merchant.label)).toEqual([
      "Clase de yoga",
      "Spotify",
    ]);
  });

  describe("the recurring movement it drafts", () => {
    it("is named, priced and timed as the series is now", () => {
      const [{ draft }] = unregisteredSeries(
        detect(chargesOf("DLO*NETFLIX 4471", MONTHLY, [5000, 5000, 5900])),
        nothingDismissed,
      );

      expect(draft).toMatchObject({
        description: "Netflix",
        amount: 5900,
        type: "expense",
        currency: "ARS",
        frequency: "monthly",
        isActive: true,
      });
    });

    it("takes the latest category given and the usual account", () => {
      const [{ draft }] = unregisteredSeries(
        detect([
          movement("Spotify", "2026-07-10", { category_id: 3, payment_method_id: 2 }),
          movement("Spotify", "2026-08-10", { category_id: 4, payment_method_id: 2 }),
          movement("Spotify", "2026-09-10", { category_id: null, payment_method_id: 1 }),
        ]),
        nothingDismissed,
      );

      expect(draft).toMatchObject({ categoryId: 4, paymentMethodId: 2 });
    });

    it("starts at the next occurrence, so none already recorded comes back as due", () => {
      const [{ draft }] = unregisteredSeries(
        detect(charges("Netflix", ["2026-07-31", "2026-08-31", "2026-09-30"])),
        nothingDismissed,
      );

      expect(draft.startDate).toBe("2026-10-30");
    });
  });
});
