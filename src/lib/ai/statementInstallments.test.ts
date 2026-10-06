import { describe, expect, it } from "vitest";
import {
  AMOUNT_TOLERANCE,
  installmentRowDate,
  matchInstallments,
  type StatementInstallmentRow,
} from "./statementInstallments";
import { readInstallment } from "./installmentText";
import { installmentPlan } from "./testing/series";
import { formatCurrency } from "@/lib/format";
import type { InstallmentPlan } from "@/db/schema";

// Fravega, 12 instalments of $ 10.000, three of them paid.
const FRAVEGA = installmentPlan({
  id: 1,
  description: "Fravega",
  total_amount: 120000,
  installment_count: 12,
  first_due_date: "2026-06-10",
  confirmed_count: 3,
});

let nextLine = 2;

function row(
  description: string,
  amount = 10000,
  date = "2026-09-10",
  overrides: Partial<StatementInstallmentRow["transaction"]> = {},
): StatementInstallmentRow {
  return {
    line: nextLine++,
    writtenDate: date,
    installment: readInstallment(description)!,
    transaction: {
      amount,
      type: "expense",
      currency: "ARS",
      categoryId: 4,
      paymentMethodId: 2,
      destinationPaymentMethodId: null,
      destinationAmount: null,
      description,
      date,
      categorySuggested: false,
      ...overrides,
    },
  };
}

function match(
  rows: StatementInstallmentRow[],
  plans: InstallmentPlan[] = [FRAVEGA],
  dates: "charge" | "purchase" = "charge",
  separate: ReadonlySet<number> = new Set(),
) {
  return matchInstallments(rows, plans, dates, separate);
}

describe("matchInstallments", () => {
  describe("a row with a plan", () => {
    it("is registered in the plan when it is the instalment it is waiting for", () => {
      const fourth = row("FRAVEGA C.04/12");

      expect(match([fourth])).toEqual([
        {
          kind: "registers",
          line: fourth.line,
          description: "FRAVEGA C.04/12",
          number: 4,
          count: 12,
          plan: FRAVEGA,
          step: {
            kind: "installment",
            id: 1,
            index: 3,
            date: "2026-09-10",
            amount: 10000,
          },
          reason: `Mismo comercio que «Fravega», 12 cuotas de ${formatCurrency(10000)} y le toca la 4.`,
        },
      ]);
    });

    it("registers two instalments of one plan in order, whatever the file's", () => {
      const lines = match([row("FRAVEGA C.05/12"), row("FRAVEGA C.04/12")]);

      expect(lines.map((line) => line.kind === "registers" && line.step.index)).toEqual([
        4, 3,
      ]);
    });

    it("is left as already registered when the plan has it", () => {
      const [line] = match([row("FRAVEGA C.03/12")]);

      expect(line).toMatchObject({
        kind: "registered",
        reason: "«Fravega» ya tiene registrada la cuota 3 de 12.",
      });
    });

    it("is imported on its own when an instalment before it is missing", () => {
      const [line] = match([row("FRAVEGA C.06/12")]);

      expect(line).toMatchObject({ kind: "outOfOrder", expected: 4 });
    });

    it("is imported on its own when the user says it is not the plan's", () => {
      const fourth = row("FRAVEGA C.04/12");

      const lines = match(
        [fourth, row("FRAVEGA C.05/12")],
        [FRAVEGA],
        "charge",
        new Set([fourth.line]),
      );

      expect(lines.map((line) => line.kind)).toEqual(["separate", "outOfOrder"]);
    });

    describe(`an amount within ${AMOUNT_TOLERANCE * 100}% of the instalment`, () => {
      it("is the plan's at exactly that difference", () => {
        expect(match([row("FRAVEGA C.04/12", 10200)])[0].kind).toBe("registers");
      });

      it("is another purchase just past it", () => {
        expect(match([row("FRAVEGA C.04/12", 10201)])[0].kind).toBe("unplanned");
      });
    });

    it("is another purchase in another currency or with another count", () => {
      expect(
        match([row("FRAVEGA C.04/12", 10000, "2026-09-10", { currency: "USD" })])[0].kind,
      ).toBe("unplanned");
      expect(match([row("FRAVEGA C.04/06", 20000)])[0].kind).toBe("unplanned");
    });
  });

  // A plan the user named after the thing bought, not the shop.
  describe("a plan under another name", () => {
    const HELADERA = { ...FRAVEGA, id: 2, description: "Heladera" };

    it("takes the row when it is the only plan that fits", () => {
      const [line] = match([row("FRAVEGA C.04/12")], [HELADERA]);

      expect(line).toMatchObject({
        kind: "registers",
        plan: HELADERA,
        reason: `Es la única compra en 12 cuotas de ${formatCurrency(10000)} a la que le toca la 4.`,
      });
    });

    it("does not take it when two plans fit", () => {
      const [line] = match([row("FRAVEGA C.04/12")], [HELADERA, { ...HELADERA, id: 3 }]);

      expect(line.kind).toBe("unplanned");
    });

    // Skipping a row on a guess would lose a movement.
    it("never leaves a row out as already registered", () => {
      const [line] = match([row("FRAVEGA C.03/12")], [HELADERA]);

      expect(line.kind).toBe("unplanned");
    });
  });

  describe("a row with no plan", () => {
    it("offers a plan paid up to the instalment before it", () => {
      const [line] = match([row("MERPAGO*TIENDA LUNA C.04/12", 2500, "2026-09-10")], []);

      expect(line).toMatchObject({
        kind: "unplanned",
        draft: {
          paidCount: 3,
          plan: {
            description: "Tienda Luna",
            totalAmount: 30000,
            installmentCount: 12,
            currency: "ARS",
            categoryId: 4,
            paymentMethodId: 2,
            firstDueDate: "2026-06-10",
            cashPrice: null,
          },
        },
      });
    });

    it("keeps typed text as the plan's name, without the instalment", () => {
      const [line] = match([row("Tienda luna cuota 4 de 12", 2500)], []);

      expect(line.kind === "unplanned" && line.draft.plan.description).toBe(
        "Tienda luna",
      );
    });
  });

  describe("when the statement dates instalments by the purchase", () => {
    it("registers the instalment on the plan's own date for it", () => {
      const [line] = match(
        [row("FRAVEGA C.04/12", 10000, "2026-06-02")],
        [FRAVEGA],
        "purchase",
      );

      expect(line.kind === "registers" && line.step.date).toBe("2026-09-10");
    });

    it("starts an offered plan on the purchase date", () => {
      const [line] = match(
        [row("TIENDA LUNA C.04/12", 2500, "2026-06-02")],
        [],
        "purchase",
      );

      expect(line.kind === "unplanned" && line.draft.plan.firstDueDate).toBe(
        "2026-06-02",
      );
    });
  });
});

describe("installmentRowDate", () => {
  it("is the date the statement wrote when it is the charge's", () => {
    expect(installmentRowDate("2026-09-10", 4, "charge")).toBe("2026-09-10");
  });

  it("moves a purchase date on to the month of the instalment", () => {
    expect(installmentRowDate("2026-06-02", 4, "purchase")).toBe("2026-09-02");
  });
});
