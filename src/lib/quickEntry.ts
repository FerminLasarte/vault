import type { Category, CategoryRule, NewTransaction, PaymentMethod } from "@/db";
import type { CategoryModel } from "@/lib/ai/categoryModel";
import { suggestCategory, type CategorySuggestion } from "@/lib/ai/categorySuggestion";
import {
  findMerchant,
  usualAccountReason,
  type MerchantHistory,
} from "@/lib/ai/merchantHistory";
import {
  readAccount,
  readAmount,
  readCurrency,
  readDate,
  type AmountToken,
} from "@/lib/typedText";

// A movement typed as one line — "café 2500 mp ayer" — read into the fields
// the form would have asked for.
//
// The grammar is the order people already say it in: what it was, how much,
// and then, optionally, with what and when. The amount is the last figure on
// the line, so a number inside the description ("cuota 3 de 12") stays there.
// The account is only looked for after the amount, so "mercado libre" is a
// description and not the Mercado Pago account. Dates and currencies are
// distinctive enough to be read anywhere.
//
// Nothing here guesses silently: every field says where it came from, and
// whatever could not be read is a gap the screen shows before anything is
// saved.

export interface QuickEntryContext {
  today: string;
  paymentMethods: PaymentMethod[];
  categories: Category[];
  rules: CategoryRule[];
  // What the local AI learned; null with it switched off.
  model: CategoryModel | null;
  // What the history says about each merchant, for the account it is usually
  // paid with; null with the local AI switched off.
  merchants: MerchantHistory | null;
  // The account each currency's latest movement went through, for when the
  // line names none and the merchant has no usual one. See
  // lastUsedAccountByCurrency.
  lastUsedAccounts: Map<string, number>;
  // The currency to assume when neither an account nor a currency is typed:
  // whichever one the list is showing.
  defaultCurrency: string;
}

export interface QuickEntry {
  type: "income" | "expense";
  description: string;
  amount: number | null;
  currency: string;
  paymentMethodId: number | null;
  // Whether the account was assumed rather than typed, so the screen can say
  // so instead of presenting a guess as something the user wrote.
  accountAssumed: boolean;
  // Why, when the local AI assumed it from the merchant's usual account.
  accountReason: string | null;
  categoryId: number | null;
  // Who chose the category, a rule or the local AI, when one did.
  suggestion: CategorySuggestion | null;
  date: string;
}

// What still has to be filled in before the entry can be saved, in the order
// the line is typed.
export type QuickEntryGap = "description" | "amount" | "account" | "category" | "date";

export function parseQuickEntry(text: string, context: QuickEntryContext): QuickEntry {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");
  const used = new Set<number>();

  // The amount first, from the end, since it is what the rest is read around.
  let amount: AmountToken | null = null;
  let amountIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index--) {
    amount = readAmount(tokens[index]);
    if (amount !== null) {
      amountIndex = index;
      used.add(index);
      break;
    }
  }

  let date: string | null = null;
  let typedCurrency = amount?.currency ?? null;
  tokens.forEach((token, index) => {
    if (used.has(index)) return;

    const currency = readCurrency(token);
    if (currency !== null && typedCurrency === null) {
      typedCurrency = currency;
      used.add(index);
      return;
    }

    const read = date === null ? readDate(token, context.today) : null;
    if (read !== null) {
      date = read;
      used.add(index);
    }
  });

  let typedAccount: PaymentMethod | null = null;
  if (amountIndex !== -1) {
    for (
      let index = amountIndex + 1;
      index < tokens.length && typedAccount === null;
      index++
    ) {
      if (used.has(index)) continue;
      typedAccount = readAccount(
        tokens[index],
        context.paymentMethods,
        typedCurrency ?? context.defaultCurrency,
      );
      if (typedAccount !== null) used.add(index);
    }
  }

  const description = tokens.filter((_, index) => !used.has(index)).join(" ");

  // The account named wins over a currency typed beside it: the money left
  // that account, in whatever it holds.
  const currency = typedAccount?.currency ?? typedCurrency ?? context.defaultCurrency;

  // A sign decides the kind outright. Without one, the suggestions do: an
  // expense first, since most of what gets typed is spending, then an income.
  const suggestions = {
    rules: context.rules,
    categories: context.categories,
    model: context.model,
  };
  let type: QuickEntry["type"] = amount?.sign === "+" ? "income" : "expense";
  let suggestion = suggestCategory({ description, type }, suggestions);
  if ((amount?.sign ?? null) === null && suggestion === null) {
    const income = suggestCategory({ description, type: "income" }, suggestions);
    if (income !== null) {
      type = "income";
      suggestion = income;
    }
  }

  // With no account typed: the one this merchant is usually paid with, then
  // the last one used in the currency, then any in it. After the type, since
  // what is spent at a place and what comes in from it are two habits.
  const usual =
    typedAccount === null && context.merchants !== null
      ? findMerchant(context.merchants, { description, type, currency })
      : null;
  const usualAccount = context.paymentMethods.find(
    (method) =>
      method.id === usual?.account?.paymentMethodId && method.currency === currency,
  );
  const lastUsed = context.lastUsedAccounts.get(currency);
  const account =
    typedAccount ??
    usualAccount ??
    context.paymentMethods.find(
      (method) => method.id === lastUsed && method.currency === currency,
    ) ??
    context.paymentMethods.find((method) => method.currency === currency) ??
    null;

  return {
    type,
    description,
    amount: amount?.amount ?? null,
    currency,
    paymentMethodId: account?.id ?? null,
    accountAssumed: typedAccount === null,
    accountReason:
      usual !== null && usualAccount !== undefined
        ? usualAccountReason(usual, usualAccount.name)
        : null,
    categoryId: suggestion?.categoryId ?? null,
    suggestion,
    date: date ?? context.today,
  };
}

export function quickEntryGaps(entry: QuickEntry, today: string): QuickEntryGap[] {
  const gaps: QuickEntryGap[] = [];
  if (entry.description === "") gaps.push("description");
  if (entry.amount === null) gaps.push("amount");
  if (entry.paymentMethodId === null) gaps.push("account");
  if (entry.categoryId === null) gaps.push("category");
  if (entry.date > today) gaps.push("date");
  return gaps;
}

// Only meaningful once quickEntryGaps has nothing left to ask for.
export function quickEntryToTransaction(entry: QuickEntry): NewTransaction {
  return {
    amount: entry.amount ?? 0,
    type: entry.type,
    categoryId: entry.categoryId,
    paymentMethodId: entry.paymentMethodId,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    description: entry.description,
    date: entry.date,
    currency: entry.currency,
  };
}

// Per currency, the account the latest movement went through: where a line
// that names no account most likely came from. Ties on a date go to the later
// row, which is the one entered last.
export function lastUsedAccountByCurrency(
  transactions: {
    id: number;
    date: string;
    currency: string;
    payment_method_id: number | null;
  }[],
): Map<string, number> {
  const latest = new Map<string, { date: string; id: number; accountId: number }>();

  for (const transaction of transactions) {
    if (transaction.payment_method_id === null) continue;
    const current = latest.get(transaction.currency);
    if (
      current === undefined ||
      transaction.date > current.date ||
      (transaction.date === current.date && transaction.id > current.id)
    ) {
      latest.set(transaction.currency, {
        date: transaction.date,
        id: transaction.id,
        accountId: transaction.payment_method_id,
      });
    }
  }

  return new Map(Array.from(latest, ([currency, entry]) => [currency, entry.accountId]));
}
