import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chartAnimation } from "./chartMotion";

// From the project root, which is where vitest runs.
const INDEX_CSS = readFileSync("src/index.css", "utf8");

function token(name: string): string {
  const value = INDEX_CSS.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1];

  if (!value) throw new Error(`index.css defines no ${name}`);

  return value.replace(/\s+/g, "");
}

describe("chartAnimation", () => {
  // Recharts animates in JavaScript, where the tokens cannot reach, so the
  // charts carry a copy of them. A copy is only safe while something checks
  // it: retune the app's speed or curve in index.css and this is what says
  // the charts were left behind.
  it("moves on the same duration and curve as the rest of the app", () => {
    expect(`${chartAnimation.animationDuration}ms`).toBe(token("--duration-base"));
    expect(chartAnimation.animationEasing).toBe(token("--ease-standard"));
  });
});
