import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RATE_TYPE,
  fetchRate,
  fetchRateHistory,
  isRateType,
  RATE_TYPE_DESCRIPTIONS,
  RATE_TYPE_LABELS,
  RATE_TYPES,
  rateSourceFor,
} from "./exchangeRate";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as Response;
}

function mockFetch(body: unknown, ok = true) {
  const spy = vi.fn((url: string | URL | Request) => {
    void url;
    return Promise.resolve(jsonResponse(body, ok));
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rate types", () => {
  it("labels and describes every rate it offers", () => {
    // A rate with no label would render as an empty option the user cannot
    // tell apart from the others.
    for (const type of RATE_TYPES) {
      expect(RATE_TYPE_LABELS[type]).toBeTruthy();
      expect(RATE_TYPE_DESCRIPTIONS[type]).toBeTruthy();
    }
  });

  it("recognises its own rates and rejects anything else", () => {
    expect(isRateType("blue")).toBe(true);
    expect(isRateType(DEFAULT_RATE_TYPE)).toBe(true);
    expect(isRateType("mep")).toBe(false);
    expect(isRateType(null)).toBe(false);
    expect(isRateType(7)).toBe(false);
  });

  it("keeps the source distinct per rate", () => {
    // The source is what stops a download from overwriting a manual
    // correction, and what says which series a cached row belongs to.
    expect(rateSourceFor("blue")).not.toBe(rateSourceFor("oficial"));
    expect(rateSourceFor("blue")).not.toBe("manual");
  });
});

describe("fetchRate and the calendar day", () => {
  // dolarapi stamps quotes in UTC. From 21:00 in Argentina that is already the
  // next day, so slicing the timestamp keyed the quote to tomorrow — and the
  // latest row is picked by date, so it then beat today's manual correction.
  const LATE_EVENING = "2026-09-15T02:30:00.000Z"; // 23:30 on the 14th in Buenos Aires

  it("keys the quote to the local day it was published on", async () => {
    vi.stubEnv("TZ", "America/Argentina/Buenos_Aires");
    try {
      // Guards the test itself: if the zone did not take, it proves nothing.
      expect(new Date(LATE_EVENING).getDate()).toBe(14);
      mockFetch({ compra: 1000, venta: 1100, fechaActualizacion: LATE_EVENING });

      const rate = await fetchRate("bolsa");

      expect(rate.date).toBe("2026-09-14");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("falls back to the local day when the quote carries no timestamp", async () => {
    vi.stubEnv("TZ", "America/Argentina/Buenos_Aires");
    vi.useFakeTimers({ now: new Date(LATE_EVENING), toFake: ["Date"] });
    try {
      mockFetch({ compra: 1000, venta: 1100 });

      const rate = await fetchRate("bolsa");

      expect(rate.date).toBe("2026-09-14");
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });
});

describe("fetchRate", () => {
  it("requests the rate that was asked for", async () => {
    const spy = mockFetch({
      compra: 1000,
      venta: 1100,
      fechaActualizacion: "2026-08-23",
    });

    await fetchRate("tarjeta");

    // Asking for one rate and fetching another is the failure that would be
    // invisible: the figures would look perfectly plausible.
    const requested = spy.mock.calls[0]?.[0];
    expect(typeof requested).toBe("string");
    expect(requested as string).toContain("/tarjeta");
  });

  it("tags the quote with its own rate", async () => {
    mockFetch({ compra: 1000, venta: 1100, fechaActualizacion: "2026-08-23" });

    const rate = await fetchRate("cripto");

    expect(rate.rate_type).toBe("cripto");
    expect(rate.sell).toBe(1100);
    expect(rate.date).toBe("2026-08-23");
  });

  it("rejects a payload whose figures are unusable", async () => {
    // The provider returning a string, a zero or nothing at all must fail here
    // rather than turn into NaN inside a conversion later.
    mockFetch({ compra: "1000", venta: 1100 });
    await expect(fetchRate("blue")).rejects.toThrow();

    mockFetch({ compra: 1000, venta: 0 });
    await expect(fetchRate("blue")).rejects.toThrow();

    mockFetch({});
    await expect(fetchRate("blue")).rejects.toThrow();
  });

  it("fails on a non-ok response", async () => {
    mockFetch({ compra: 1000, venta: 1100 }, false);
    await expect(fetchRate("blue")).rejects.toThrow();
  });

  it("falls back to today when the provider omits the date", async () => {
    mockFetch({ compra: 1000, venta: 1100 });

    const rate = await fetchRate("oficial");

    expect(rate.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("fetchRateHistory", () => {
  it("stamps every entry with the requested rate", async () => {
    mockFetch([
      { fecha: "2026-08-21", compra: 1000, venta: 1100 },
      { fecha: "2026-08-22", compra: 1010, venta: 1110 },
    ]);

    const history = await fetchRateHistory("blue");

    expect(history).toHaveLength(2);
    // Nothing here may carry another rate's tag: a blue quote filed as MEP
    // would silently misvalue every movement on that day.
    expect(history.every((entry) => entry.rate_type === "blue")).toBe(true);
  });

  it("skips malformed days instead of losing the whole series", async () => {
    mockFetch([
      { fecha: "2026-08-21", compra: 1000, venta: 1100 },
      { fecha: "no es una fecha", compra: 1010, venta: 1110 },
      { fecha: "2026-08-23", compra: 0, venta: 1110 },
      { fecha: "2026-08-24", compra: 1020, venta: 1120 },
    ]);

    const history = await fetchRateHistory("bolsa");

    expect(history.map((entry) => entry.date)).toEqual(["2026-08-21", "2026-08-24"]);
  });

  it("fails when the response is not a list", async () => {
    mockFetch({ error: "nope" });
    await expect(fetchRateHistory("bolsa")).rejects.toThrow();
  });
});
