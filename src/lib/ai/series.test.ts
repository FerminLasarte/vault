import { describe, expect, it } from "vitest";
import type { InstallmentPlan, Loan } from "@/db/schema";
import {
  ACTIVE_PERIODS,
  MAX_AMOUNT_SPREAD,
  MIN_OCCURRENCES,
  PERIODS,
  RECENT_OCCURRENCES,
} from "./series";
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

describe("detectSeries", () => {
  it("finds a charge that comes back every month", () => {
    const [series, ...rest] = detect(charges("DLO*NETFLIX 4471", MONTHLY));

    expect(rest).toEqual([]);
    expect(series).toMatchObject({
      id: "expense:ARS:netflix:monthly",
      frequency: "monthly",
      typicalAmount: 5000,
      lastDate: "2026-09-10",
      recurring: null,
    });
    expect(series.merchant.label).toBe("Netflix");
    expect(series.movements.map((entry) => entry.date)).toEqual(MONTHLY);
  });

  it("finds weekly and yearly ones too", () => {
    const found = detect([
      ...charges("Clase de yoga", datesEvery(7, 4, "2026-10-01")),
      ...charges("Seguro del auto", ["2023-11-02", "2024-11-01", "2025-11-03"], {
        amount: 90000,
      }),
    ]);

    expect(found.map((series) => series.frequency).sort()).toEqual(["weekly", "yearly"]);
  });

  it(`needs ${MIN_OCCURRENCES} occurrences`, () => {
    expect(detect(charges("Netflix", MONTHLY.slice(1)))).toEqual([]);
    expect(detect(charges("Netflix", MONTHLY))).toHaveLength(1);
  });

  it(`accepts a month ${PERIODS.monthly.tolerance} days off, and no more`, () => {
    const { days, tolerance } = PERIODS.monthly;

    expect(
      detect(charges("Netflix", datesEvery(days + tolerance, 3, "2026-09-20"))),
    ).toHaveLength(1);
    expect(
      detect(charges("Netflix", datesEvery(days + tolerance + 1, 3, "2026-09-20"))),
    ).toEqual([]);
    expect(
      detect(charges("Netflix", datesEvery(days - tolerance, 3, "2026-09-20"))),
    ).toHaveLength(1);
    expect(
      detect(charges("Netflix", datesEvery(days - tolerance - 1, 3, "2026-09-20"))),
    ).toEqual([]);
  });

  it("is the run that repeats up to the latest, whatever came before it", () => {
    const [series] = detect([
      movement("Netflix", "2025-02-17"),
      movement("Netflix", "2025-03-01"),
      ...charges("Netflix", MONTHLY),
    ]);

    expect(series.movements.map((entry) => entry.date)).toEqual(MONTHLY);
  });

  it("is not spending that merely happens often", () => {
    // Weekly, but never the same amount twice: the supermarket, not a fee.
    const shopping = chargesOf(
      "COTO SUC 123",
      datesEvery(7, 5, "2026-10-01"),
      [8000, 21000, 4500, 15000, 30000],
    );

    expect(detect(shopping)).toEqual([]);
  });

  it(`takes amounts up to ${MAX_AMOUNT_SPREAD * 100}% apart from their median, typically`, () => {
    // Median 5000, and two of three amounts 1250 from it: exactly the limit.
    const atTheLimit = chargesOf("Netflix", MONTHLY, [3750, 5000, 6250]);
    const pastIt = chargesOf("Netflix", MONTHLY, [3700, 5000, 6300]);

    expect(detect(atTheLimit)).toHaveLength(1);
    expect(detect(pastIt)).toEqual([]);
  });

  it("survives a price rise", () => {
    const [series] = detect(
      chargesOf("Netflix", ["2026-06-10", ...MONTHLY], [5000, 5000, 5000, 5900]),
    );

    expect(series.movements).toHaveLength(4);
    expect(series.typicalAmount).toBe(5000);
  });

  it(`reads the typical amount from the last ${RECENT_OCCURRENCES} occurrences`, () => {
    const dates = datesEvery(30, RECENT_OCCURRENCES + 2, "2026-09-20");
    const [series] = detect(
      dates.map((date, index) =>
        movement("Alquiler", date, { amount: index < 2 ? 100 : 200000 }),
      ),
    );

    expect(series.movements).toHaveLength(RECENT_OCCURRENCES + 2);
    expect(series.typicalAmount).toBe(200000);
  });

  it(`is over once ${ACTIVE_PERIODS} periods go by without it`, () => {
    // 45 days after the last one is still within a month and a half.
    expect(
      detect(charges("Netflix", ["2026-06-22", "2026-07-22", "2026-08-22"])),
    ).toHaveLength(1);
    expect(
      detect(charges("Netflix", ["2026-06-21", "2026-07-21", "2026-08-21"])),
    ).toEqual([]);
  });

  it("keeps currencies and kinds of movement apart", () => {
    const found = detect([
      ...charges("Spotify", MONTHLY),
      ...charges("Spotify", MONTHLY, { currency: "USD", amount: 5 }),
      ...charges("Spotify", MONTHLY.slice(0, 2), { type: "income" }),
    ]);

    expect(found.map((series) => series.id).sort()).toEqual([
      "expense:ARS:spotify:monthly",
      "expense:USD:spotify:monthly",
    ]);
  });

  describe("what the user already declared", () => {
    const recurring = recurringTemplate();

    it("knows which recurring movement a series is", () => {
      const [series] = detect(charges("DLO*NETFLIX", MONTHLY), {
        ...NOTHING_DECLARED,
        recurring: [recurring],
      });

      expect(series.recurring).toBe(recurring);
    });

    it("does not take a recurring movement in another currency for it", () => {
      const [series] = detect(charges("Netflix", MONTHLY), {
        ...NOTHING_DECLARED,
        recurring: [{ ...recurring, currency: "USD" }],
      });

      expect(series.recurring).toBeNull();
    });

    it("leaves out what an instalment plan or a loan already accounts for", () => {
      const plan: InstallmentPlan = {
        id: 1,
        description: "Heladera",
        total_amount: 60000,
        installment_count: 12,
        currency: "ARS",
        category_id: null,
        payment_method_id: 1,
        first_due_date: "2026-01-10",
        confirmed_count: 9,
        created_at: "2026-01-01",
        cash_price: null,
      };
      const loan: Loan = {
        id: 1,
        direction: "lent",
        counterparty: "Juan",
        description: "Préstamo a Juan",
        principal: 100000,
        currency: "ARS",
        annual_rate: 0,
        installment_count: 10,
        category_id: null,
        payment_method_id: 1,
        first_due_date: "2026-01-10",
        confirmed_count: 9,
        created_at: "2026-01-01",
      };

      expect(
        detect(
          [
            ...charges("Heladera", MONTHLY),
            ...charges("Préstamo a Juan", MONTHLY, { type: "income" }),
          ],
          { recurring: [], installmentPlans: [plan], loans: [loan] },
        ),
      ).toEqual([]);
    });
  });
});
