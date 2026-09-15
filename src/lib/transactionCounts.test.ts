import { describe, expect, it } from "vitest";
import { duplicatesSkipped, transactionCount } from "./transactionCounts";

describe("transactionCount", () => {
  it("uses the singular for exactly one", () => {
    expect(transactionCount(1, "importada")).toBe("1 transacción importada");
    expect(transactionCount(1, "exportada")).toBe("1 transacción exportada");
  });

  it("uses the plural for none and for several", () => {
    expect(transactionCount(0, "importada")).toBe("0 transacciones importadas");
    expect(transactionCount(3, "exportada")).toBe("3 transacciones exportadas");
  });
});

describe("duplicatesSkipped", () => {
  it("uses the singular for exactly one", () => {
    expect(duplicatesSkipped(1)).toBe("1 ya existía y se omitió.");
  });

  it("uses the plural for several", () => {
    expect(duplicatesSkipped(2)).toBe("2 ya existían y se omitieron.");
  });
});
