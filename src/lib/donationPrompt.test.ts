import { describe, expect, it } from "vitest";
import {
  DONATION_FIRST_DAYS,
  DONATION_INTERVAL_DAYS,
  DONATION_MIN_LAUNCHES,
  launchDonationPrompt,
  parseDonationPromptState,
  stopDonationPrompt,
  type DonationPromptState,
} from "@/lib/donationPrompt";

const NOW = new Date("2026-09-15T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

// A state as it stands before this launch is counted.
function state(overrides: Partial<DonationPromptState> = {}): DonationPromptState {
  return {
    firstLaunchAt: daysAgo(DONATION_FIRST_DAYS),
    launches: DONATION_MIN_LAUNCHES - 1,
    lastShownAt: null,
    stopped: false,
    ...overrides,
  };
}

describe("launchDonationPrompt", () => {
  it("starts counting on the first launch and stays quiet", () => {
    expect(launchDonationPrompt(null, NOW)).toEqual({
      state: {
        firstLaunchAt: NOW.toISOString(),
        launches: 1,
        lastShownAt: null,
        stopped: false,
      },
      show: false,
    });
  });

  it("asks once both thresholds are reached", () => {
    const result = launchDonationPrompt(state(), NOW);

    expect(result.show).toBe(true);
    expect(result.state.launches).toBe(DONATION_MIN_LAUNCHES);
  });

  it("records the launch it asked on", () => {
    expect(launchDonationPrompt(state(), NOW).state.lastShownAt).toBe(NOW.toISOString());
  });

  it("waits for enough launches however long it has been", () => {
    const result = launchDonationPrompt(
      state({ firstLaunchAt: daysAgo(400), launches: DONATION_MIN_LAUNCHES - 2 }),
      NOW,
    );

    expect(result.show).toBe(false);
    expect(result.state.lastShownAt).toBeNull();
  });

  it("waits for enough days however many launches there were", () => {
    const result = launchDonationPrompt(
      state({ firstLaunchAt: daysAgo(DONATION_FIRST_DAYS - 1), launches: 500 }),
      NOW,
    );

    expect(result.show).toBe(false);
  });

  it("does not ask again before the interval has passed", () => {
    const shown = state({
      launches: 40,
      lastShownAt: daysAgo(DONATION_INTERVAL_DAYS - 1),
    });

    expect(launchDonationPrompt(shown, NOW).show).toBe(false);
  });

  it("asks again once the interval has passed", () => {
    const shown = state({ launches: 40, lastShownAt: daysAgo(DONATION_INTERVAL_DAYS) });

    expect(launchDonationPrompt(shown, NOW).show).toBe(true);
  });

  it("never asks again once stopped, but keeps counting", () => {
    const result = launchDonationPrompt(
      state({ launches: 90, firstLaunchAt: daysAgo(400), stopped: true }),
      NOW,
    );

    expect(result.show).toBe(false);
    expect(result.state.launches).toBe(91);
  });

  // A clock that moved backwards reads as zero days, never as a long time.
  it("does not ask when the first launch looks like it is in the future", () => {
    const result = launchDonationPrompt(state({ firstLaunchAt: daysAgo(-30) }), NOW);

    expect(result.show).toBe(false);
  });

  it("does not mutate the state it was given", () => {
    const before = state();
    launchDonationPrompt(before, NOW);

    expect(before).toEqual(state());
  });
});

describe("stopDonationPrompt", () => {
  it("stops asking and keeps the rest", () => {
    const before = state({ lastShownAt: NOW.toISOString() });

    expect(stopDonationPrompt(before)).toEqual({ ...before, stopped: true });
  });
});

describe("parseDonationPromptState", () => {
  it("reads back what was stored", () => {
    const stored = state({ lastShownAt: daysAgo(3), stopped: true });

    expect(parseDonationPromptState(JSON.stringify(stored))).toEqual(stored);
  });

  it("is null when nothing was stored", () => {
    expect(parseDonationPromptState(null)).toBeNull();
  });

  // Anything unreadable starts the count over, so a damaged value can delay
  // the invitation but never bring it forward.
  it.each([
    ["not JSON", "{"],
    ["not an object", "[]"],
    [
      "a missing field",
      JSON.stringify({ launches: 3, lastShownAt: null, stopped: false }),
    ],
    ["an unparseable date", JSON.stringify(state({ firstLaunchAt: "ayer" }))],
    ["a negative count", JSON.stringify(state({ launches: -1 }))],
    ["a fractional count", JSON.stringify(state({ launches: 2.5 }))],
    ["a bad last-shown date", JSON.stringify(state({ lastShownAt: "nunca" }))],
    ["a non-boolean flag", JSON.stringify({ ...state(), stopped: "true" })],
  ])("is null for %s", (_, raw) => {
    expect(parseDonationPromptState(raw)).toBeNull();
  });
});
