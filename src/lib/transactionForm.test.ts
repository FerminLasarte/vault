import { describe, expect, it } from "vitest";
import {
  differsFromSaved,
  formToTransaction,
  transactionFormSchema,
  transactionToForm,
  type TransactionFormValues,
} from "./transactionForm";
import type { TransactionWithCategory } from "@/db";

function aTransaction(
  overrides: Partial<TransactionWithCategory> = {},
): TransactionWithCategory {
  return {
    id: 10,
    amount: 2500,
    type: "expense",
    category_id: 3,
    payment_method_id: 1,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Café",
    date: "2026-09-20",
    currency: "ARS",
    category_name: "Comida",
    category_color: "#000",
    category_icon: "☕",
    payment_method_name: "Efectivo",
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: "trabajo,mañana",
    attachment_count: 0,
    ...overrides,
  };
}

// What the form holds for a saved transaction, once it has been through the
// schema — the shape every save starts from.
function valuesOf(transaction: TransactionWithCategory): TransactionFormValues {
  return transactionFormSchema.parse(transactionToForm(transaction));
}

describe("transactionFormSchema", () => {
  it("accepts a saved expense as it is", () => {
    expect(
      transactionFormSchema.safeParse(transactionToForm(aTransaction())).success,
    ).toBe(true);
  });

  it("asks an expense for its category", () => {
    const result = transactionFormSchema.safeParse(
      transactionToForm(aTransaction({ category_id: null })),
    );

    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "categoryId",
    ]);
  });

  // An expense turned into a transfer is not valid until it says where the
  // money went, which is what keeps it from being saved half-way.
  it("asks a transfer for where the money went and how much arrived", () => {
    const result = transactionFormSchema.safeParse({
      ...transactionToForm(aTransaction()),
      type: "transfer",
    });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Seleccioná la cuenta de destino",
      "Indicá cuánto llega a la cuenta de destino",
    ]);
  });
});

describe("formToTransaction", () => {
  it("drops the category of a transfer", () => {
    const transaction = formToTransaction({
      ...valuesOf(aTransaction()),
      type: "transfer",
      destinationPaymentMethodId: 2,
      destinationAmount: 2500,
    });

    expect(transaction.categoryId).toBeNull();
    expect(transaction.destinationPaymentMethodId).toBe(2);
  });

  it("drops the destination of anything that is not a transfer", () => {
    const transaction = formToTransaction({
      ...valuesOf(aTransaction()),
      destinationPaymentMethodId: 2,
      destinationAmount: 2500,
    });

    expect(transaction.destinationPaymentMethodId).toBeNull();
    expect(transaction.destinationAmount).toBeNull();
  });
});

describe("differsFromSaved", () => {
  it("finds nothing new in a transaction loaded and left alone", () => {
    const saved = aTransaction();

    expect(differsFromSaved(valuesOf(saved), saved)).toBe(false);
  });

  it("notices a change in any field", () => {
    const saved = aTransaction();

    expect(differsFromSaved({ ...valuesOf(saved), description: "Té" }, saved)).toBe(true);
    expect(differsFromSaved({ ...valuesOf(saved), amount: 3000 }, saved)).toBe(true);
    expect(differsFromSaved({ ...valuesOf(saved), categoryId: 4 }, saved)).toBe(true);
    expect(differsFromSaved({ ...valuesOf(saved), date: "2026-09-21" }, saved)).toBe(
      true,
    );
    expect(differsFromSaved({ ...valuesOf(saved), tags: ["trabajo"] }, saved)).toBe(true);
  });

  it("does not count the order of the tags as a change", () => {
    const saved = aTransaction();

    expect(
      differsFromSaved({ ...valuesOf(saved), tags: ["trabajo", "mañana"] }, saved),
    ).toBe(false);
  });
});
