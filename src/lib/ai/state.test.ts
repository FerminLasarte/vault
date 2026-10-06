import { describe, expect, it } from "vitest";
import { DEFAULT_AI_STATE, isDismissed, parseAiState, withDismissed } from "./state";

describe("parseAiState", () => {
  // Nobody has chosen anything yet, and the AI is something to turn off rather
  // than something to discover.
  it("starts switched on, with nothing dismissed", () => {
    expect(parseAiState(null)).toEqual(DEFAULT_AI_STATE);
    expect(DEFAULT_AI_STATE).toEqual({ enabled: true, dismissed: {} });
  });

  it("reads back what was stored", () => {
    const stored = { enabled: false, dismissed: { "rule:rappi:12": null } };
    expect(parseAiState(JSON.stringify(stored))).toEqual(stored);
  });

  // Written by the first version, which only had the switch: the switch must
  // survive the upgrade.
  it("reads a state stored before dismissals existed", () => {
    expect(parseAiState(JSON.stringify({ enabled: false }))).toEqual({
      enabled: false,
      dismissed: {},
    });
  });

  it("falls back to the defaults on anything it cannot read", () => {
    expect(parseAiState("not json")).toEqual(DEFAULT_AI_STATE);
    expect(parseAiState(JSON.stringify({ enabled: "no" }))).toEqual(DEFAULT_AI_STATE);
    expect(parseAiState(JSON.stringify([]))).toEqual(DEFAULT_AI_STATE);
    expect(parseAiState(JSON.stringify({ enabled: true, dismissed: { a: 1 } }))).toEqual(
      DEFAULT_AI_STATE,
    );
  });
});

describe("dismissals", () => {
  it("keeps a suggestion dismissed for good", () => {
    const state = withDismissed(DEFAULT_AI_STATE, ["rule:rappi:12"]);

    expect(isDismissed(state.dismissed, "rule:rappi:12", "2030-01-01")).toBe(true);
    expect(isDismissed(state.dismissed, "rule:uber:3", "2030-01-01")).toBe(false);
  });

  it("brings a snoozed suggestion back on the day it was snoozed until", () => {
    const dismissed = { "series:netflix:monthly": "2026-11-01" };

    expect(isDismissed(dismissed, "series:netflix:monthly", "2026-10-31")).toBe(true);
    expect(isDismissed(dismissed, "series:netflix:monthly", "2026-11-01")).toBe(false);
  });

  it("adds to what was dismissed before and leaves the switch alone", () => {
    const once = withDismissed({ enabled: false, dismissed: {} }, ["a"]);
    const twice = withDismissed(once, ["b", "c"]);

    expect(twice).toEqual({ enabled: false, dismissed: { a: null, b: null, c: null } });
  });

  // An id named like a property every object has is still just an id.
  it("is not fooled by inherited property names", () => {
    expect(isDismissed({}, "toString", "2026-10-06")).toBe(false);
  });
});
