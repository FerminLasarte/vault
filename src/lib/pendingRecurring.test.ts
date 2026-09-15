import { describe, expect, it } from "vitest";
import type { RecurringTransactionWithNames } from "@/db/schema";
import { collectPendingRecurrences } from "@/lib/pendingRecurring";

function template(
  overrides: Partial<RecurringTransactionWithNames> = {},
): RecurringTransactionWithNames {
  return {
    id: 1,
    description: "Alquiler",
    amount: 100,
    type: "expense",
    category_id: 3,
    payment_method_id: 1,
    currency: "ARS",
    frequency: "monthly",
    start_date: "2026-06-01",
    last_confirmed_date: null,
    is_active: 1,
    category_name: "Otros",
    category_icon: "📦",
    payment_method_name: "Efectivo ARS",
    ...overrides,
  };
}

describe("collectPendingRecurrences ordering", () => {
  it("lets only the oldest occurrence of each series be decided on", () => {
    const pending = collectPendingRecurrences(
      [
        template({ id: 1, start_date: "2026-07-08" }),
        template({ id: 2, start_date: "2026-08-01" }),
      ],
      "2026-09-10",
    );
    expect(
      pending.map((entry) => [entry.template.id, entry.date, entry.waitingFor]),
    ).toEqual([
      [1, "2026-07-08", null],
      [2, "2026-08-01", null],
      [1, "2026-08-08", "2026-07-08"],
      [2, "2026-09-01", "2026-08-01"],
      [1, "2026-09-08", "2026-07-08"],
    ]);
  });
});

describe("collectPendingRecurrences", () => {
  it("lists every occurrence still awaiting a decision", () => {
    const pending = collectPendingRecurrences([template()], "2026-08-22");
    expect(pending.map((entry) => entry.date)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ]);
  });

  it("skips paused templates rather than banking a backlog", () => {
    expect(collectPendingRecurrences([template({ is_active: 0 })], "2026-08-22")).toEqual(
      [],
    );
  });

  it("returns nothing when everything is confirmed", () => {
    const pending = collectPendingRecurrences(
      [template({ last_confirmed_date: "2026-08-01" })],
      "2026-08-22",
    );
    expect(pending).toEqual([]);
  });

  it("interleaves several templates in date order", () => {
    const pending = collectPendingRecurrences(
      [
        template({ id: 1, start_date: "2026-08-05", description: "Alquiler" }),
        template({ id: 2, start_date: "2026-08-01", description: "Sueldo" }),
      ],
      "2026-08-22",
    );
    expect(pending.map((entry) => [entry.date, entry.template.description])).toEqual([
      ["2026-08-01", "Sueldo"],
      ["2026-08-05", "Alquiler"],
    ]);
  });

  it("proposes nothing for a series that has not started", () => {
    expect(
      collectPendingRecurrences([template({ start_date: "2026-12-01" })], "2026-08-22"),
    ).toEqual([]);
  });

  it("returns nothing when there are no templates", () => {
    expect(collectPendingRecurrences([], "2026-08-22")).toEqual([]);
  });
});
