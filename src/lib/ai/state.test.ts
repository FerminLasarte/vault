import { describe, expect, it } from "vitest";
import { DEFAULT_AI_STATE, parseAiState } from "./state";

describe("parseAiState", () => {
  // Nobody has chosen anything yet, and the AI is something to turn off rather
  // than something to discover.
  it("starts switched on", () => {
    expect(parseAiState(null)).toEqual(DEFAULT_AI_STATE);
    expect(DEFAULT_AI_STATE.enabled).toBe(true);
  });

  it("reads back what was stored", () => {
    expect(parseAiState(JSON.stringify({ enabled: false }))).toEqual({ enabled: false });
  });

  it("falls back to the defaults on anything it cannot read", () => {
    expect(parseAiState("not json")).toEqual(DEFAULT_AI_STATE);
    expect(parseAiState(JSON.stringify({ enabled: "no" }))).toEqual(DEFAULT_AI_STATE);
    expect(parseAiState(JSON.stringify([]))).toEqual(DEFAULT_AI_STATE);
  });
});
