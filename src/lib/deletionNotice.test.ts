import { describe, expect, it } from "vitest";
import {
  accountCommitmentsNotice,
  accountGoalsNotice,
  categoryDeletionNotice,
} from "./deletionNotice";

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

describe("accountCommitmentsNotice", () => {
  it("says nothing when no commitment uses the account", () => {
    expect(accountCommitmentsNotice(0, "ARS")).toBeNull();
  });

  it("names the unassigned account of the account's currency", () => {
    expect(accountCommitmentsNotice(1, "USD")).toBe(
      "Su compromiso (recurrente, compra en cuotas, préstamo o previsto) pasa a «Sin asignar (USD)»; lo que registres con él va a esa cuenta.",
    );
    expect(accountCommitmentsNotice(3, "ARS")).toBe(
      "Sus 3 compromisos (recurrentes, compras en cuotas, préstamos o previstos) pasan a «Sin asignar (ARS)»; lo que registres con ellos va a esa cuenta.",
    );
  });
});
