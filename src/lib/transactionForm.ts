import { z } from "zod";
import type { NewTransaction, TransactionType, TransactionWithCategory } from "@/db";
import { todayIsoDate } from "@/lib/format";
import { splitTagNames } from "@/lib/text";

// What makes a transaction valid, in one place for the two places it is
// written from: the form that creates one and the inspector that edits it. Two
// copies of these rules could only ever drift apart, and a transfer accepted by
// one and refused by the other is the kind of disagreement nobody notices.
export const transactionFormSchema = z
  .object({
    type: z.enum(["income", "expense", "transfer"]),
    amount: z.coerce.number().positive("El monto debe ser mayor que 0"),
    currency: z.string().min(1, "Seleccioná una moneda"),
    paymentMethodId: z.coerce.number().int().positive("Seleccioná un método de pago"),
    destinationPaymentMethodId: z.coerce.number().int().positive().nullable(),
    destinationAmount: z.coerce.number().positive().nullable(),
    categoryId: z.coerce.number().int().positive().nullable(),
    description: z.string().trim().min(1, "La descripción es obligatoria"),
    date: z
      .string()
      .min(1, "Seleccioná una fecha")
      .refine((value) => value <= todayIsoDate(), {
        message: "La fecha no puede ser posterior a hoy",
      }),
    // A field like any other, even though tags are saved to their own table:
    // that way they are loaded and cleared with the rest of the form, instead
    // of by hand beside it.
    tags: z.array(z.string()),
  })
  // Which fields are required depends on the type: a transfer needs a
  // destination account and cannot have a category, while income and expenses
  // need a category and have no destination.
  .superRefine((values, ctx) => {
    if (values.type === "transfer") {
      if (values.destinationPaymentMethodId === null) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationPaymentMethodId"],
          message: "Seleccioná la cuenta de destino",
        });
      } else if (values.destinationPaymentMethodId === values.paymentMethodId) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationPaymentMethodId"],
          message: "La cuenta de destino debe ser distinta de la de origen",
        });
      }
      if (values.destinationAmount === null) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationAmount"],
          message: "Indicá cuánto llega a la cuenta de destino",
        });
      }
      return;
    }

    if (values.categoryId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Seleccioná una categoría",
      });
    }
  });

export type TransactionFormInput = z.input<typeof transactionFormSchema>;
export type TransactionFormValues = z.output<typeof transactionFormSchema>;

// A transfer moves money between two accounts of the user's own, so it is
// neither income nor an expense and takes no category at all.
export function transactionCategoryType(type: TransactionType) {
  return type === "transfer" ? null : type;
}

export function blankTransactionForm(currency: string): TransactionFormInput {
  return {
    type: "expense",
    amount: 0,
    currency,
    paymentMethodId: undefined,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    categoryId: null,
    description: "",
    date: todayIsoDate(),
    tags: [],
  };
}

// A saved transaction, as the form holds it.
export function transactionToForm(
  transaction: TransactionWithCategory,
): TransactionFormInput {
  return {
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    paymentMethodId: transaction.payment_method_id ?? undefined,
    destinationPaymentMethodId: transaction.destination_payment_method_id,
    destinationAmount: transaction.destination_amount,
    categoryId: transaction.category_id,
    description: transaction.description,
    date: transaction.date,
    tags: splitTagNames(transaction.tag_names),
  };
}

// A transaction started elsewhere — the quick entry — as the form holds it.
export function draftToForm(draft: NewTransaction): TransactionFormInput {
  return {
    ...blankTransactionForm(draft.currency),
    type: draft.type,
    amount: draft.amount,
    paymentMethodId: draft.paymentMethodId ?? undefined,
    categoryId: draft.categoryId,
    description: draft.description,
    date: draft.date,
  };
}

// What gets written. Whatever does not apply to the type is dropped here rather
// than trusted to have been cleared on screen: a category left over on a
// transfer, or a destination on an expense, would be saved otherwise.
export function formToTransaction(values: TransactionFormValues): NewTransaction {
  const transfer = values.type === "transfer";

  return {
    amount: values.amount,
    type: values.type,
    currency: values.currency,
    categoryId: transfer ? null : values.categoryId,
    paymentMethodId: values.paymentMethodId,
    destinationPaymentMethodId: transfer ? values.destinationPaymentMethodId : null,
    destinationAmount: transfer ? values.destinationAmount : null,
    description: values.description,
    date: values.date,
  };
}

// Whether the values on screen say anything the saved transaction does not.
// Tags are compared as a set, since their order means nothing.
export function differsFromSaved(
  values: TransactionFormValues,
  saved: TransactionWithCategory,
): boolean {
  const next = formToTransaction(values);
  const savedTags = splitTagNames(saved.tag_names);
  const nextTags = [...values.tags].sort((a, b) => a.localeCompare(b, "es"));

  return (
    next.amount !== saved.amount ||
    next.type !== saved.type ||
    next.currency !== saved.currency ||
    next.categoryId !== saved.category_id ||
    next.paymentMethodId !== saved.payment_method_id ||
    next.destinationPaymentMethodId !== saved.destination_payment_method_id ||
    next.destinationAmount !== saved.destination_amount ||
    next.description.trim() !== saved.description.trim() ||
    next.date !== saved.date ||
    nextTags.join(",") !== savedTags.join(",")
  );
}
