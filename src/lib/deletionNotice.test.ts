import { describe, expect, it } from "vitest";
import { accountGoalsNotice, categoryDeletionNotice } from "./deletionNotice";

describe("categoryDeletionNotice", () => {
  it("says nothing when the category has neither budgets nor rules", () => {
    expect(categoryDeletionNotice(0, 0)).toBeNull();
  });

  it("names a single budget", () => {
    expect(categoryDeletionNotice(1, 0)).toBe("También se elimina su presupuesto.");
  });

  it("counts several rules", () => {
    expect(categoryDeletionNotice(0, 3)).toBe(
      "También se eliminan sus 3 reglas de categorización.",
    );
  });

  it("names both, with the verb in plural", () => {
    expect(categoryDeletionNotice(1, 1)).toBe(
      "También se eliminan su presupuesto y su regla de categorización.",
    );
    expect(categoryDeletionNotice(2, 1)).toBe(
      "También se eliminan sus 2 presupuestos y su regla de categorización.",
    );
  });
});

describe("accountGoalsNotice", () => {
  it("says nothing when no goal follows the account", () => {
    expect(accountGoalsNotice(0)).toBeNull();
  });

  it("speaks of one goal in singular and of several in plural", () => {
    expect(accountGoalsNotice(1)).toMatch(/^El objetivo de ahorro que la sigue queda/);
    expect(accountGoalsNotice(2)).toMatch(
      /^Los 2 objetivos de ahorro que la siguen quedan/,
    );
  });
});
