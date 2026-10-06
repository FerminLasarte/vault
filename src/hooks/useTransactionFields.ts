import { useEffect, useMemo, useRef, type ChangeEvent } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useAccountCurrencySync } from "@/hooks/useAccountCurrencySync";
import { useCategoryTypeSync } from "@/hooks/useCategoryTypeSync";
import type { CategoryModel } from "@/lib/ai/categoryModel";
import { suggestCategory } from "@/lib/ai/categorySuggestion";
import {
  descriptionSuggestions,
  type MerchantEntry,
  type MerchantHistory,
} from "@/lib/ai/merchantHistory";
import {
  transactionCategoryType,
  type TransactionFormInput,
  type TransactionFormValues,
} from "@/lib/transactionForm";
import type { Category, CategoryRuleWithCategory, PaymentMethod } from "@/db";

export type TransactionForm = UseFormReturn<
  TransactionFormInput,
  unknown,
  TransactionFormValues
>;

interface TransactionFieldsOptions {
  form: TransactionForm;
  categories: Category[];
  categoryRules: CategoryRuleWithCategory[];
  // What the local AI learned; null with it switched off.
  categoryModel: CategoryModel | null;
  paymentMethods: PaymentMethod[];
  // Whether the form holds a saved transaction rather than a new one, which
  // changes when the category rules may step in (see below).
  isEditing: boolean;
  // Changes whenever a different transaction is loaded — the dialog opening,
  // the inspector moving to another row — and starts the rules over.
  loadKey: unknown;
  // Past merchants to offer as the description is typed. Only the dialog that
  // creates a movement passes them: one being edited already is something,
  // and picking a past merchant would replace its amount and account.
  merchantHistory?: MerchantHistory | null;
}

// A past merchant offered under the description, with what picking it would
// fill in.
export interface DescriptionOption {
  entry: MerchantEntry;
  category: Category | null;
  account: PaymentMethod | null;
}

// Everything a transaction form does on its own while the user fills it in:
// keeping the category and the accounts valid for the type and the currency,
// mirroring a same-currency transfer, and filling in the category from the
// rules, or else the local AI, as the description is typed.
//
// A hook the form's owner calls rather than something the fields do by
// themselves: effects run children first, and these have to run after the
// owner's form hook has loaded the transaction, never before (see
// useCategoryTypeSync). Shared by the dialog that creates a transaction and the
// inspector that edits one, so both keep the same rules.
export function useTransactionFields({
  form,
  categories,
  categoryRules,
  categoryModel,
  paymentMethods,
  isEditing,
  loadKey,
  merchantHistory = null,
}: TransactionFieldsOptions) {
  const { register, watch, setValue, setFocus } = form;

  // Once the user picks a category by hand, the rules stop second-guessing them
  // until they edit the description again — an autocomplete that keeps
  // overriding a deliberate choice is worse than no autocomplete.
  const categoryTouchedRef = useRef(false);

  // Whether the description has been typed in since the transaction was
  // loaded. A saved transaction already has the category it was saved with — as
  // deliberate a choice as one picked by hand — so the rules leave it alone
  // until its description changes. Running them over the saved description on
  // loading replaced the category, and saving then reassigned it unasked.
  const descriptionEditedRef = useRef(false);

  useEffect(() => {
    categoryTouchedRef.current = false;
    descriptionEditedRef.current = false;
  }, [loadKey]);

  // Registered here so the input can mark the description as typed in from its
  // own change handler, before handing the event on to the form.
  const registeredDescription = register("description");
  const descriptionField = {
    ...registeredDescription,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      descriptionEditedRef.current = true;
      return registeredDescription.onChange(event);
    },
  };

  const selectedType = watch("type");
  const typedDescription = watch("description");
  const selectedCurrency = watch("currency");
  const selectedPaymentMethodId = watch("paymentMethodId");
  const selectedDestinationId = watch("destinationPaymentMethodId");
  const selectedAmount = watch("amount");

  const isTransfer = selectedType === "transfer";

  // Called after the owner's form hook, so that its reset runs before the check
  // inside; see the hook.
  const filteredCategories = useCategoryTypeSync({
    form,
    categories,
    typeField: "type",
    categoryField: "categoryId",
    categoryTypeFor: transactionCategoryType,
  });

  // Only accounts held in the transaction's own currency can pay for it. For a
  // transfer this is the origin side. An account the currency leaves behind is
  // emptied rather than swapped for another, the way every other form does it.
  const originAccounts = useAccountCurrencySync({
    form,
    paymentMethods,
    currencyField: "currency",
    accountField: "paymentMethodId",
  });

  // The destination is deliberately not filtered by currency: moving pesos into
  // a dollar account is the whole point of supporting cross-currency transfers.
  const destinationAccounts = useMemo(
    () => paymentMethods.filter((method) => method.id !== selectedPaymentMethodId),
    [paymentMethods, selectedPaymentMethodId],
  );

  const destinationAccount = useMemo(
    () => paymentMethods.find((method) => method.id === selectedDestinationId) ?? null,
    [paymentMethods, selectedDestinationId],
  );

  // When both sides hold the same currency the arriving figure is simply the
  // amount sent, so the field is hidden and kept in sync behind the scenes.
  const isSameCurrencyTransfer =
    isTransfer &&
    destinationAccount !== null &&
    destinationAccount.currency === selectedCurrency;

  const isCrossCurrency =
    isTransfer &&
    destinationAccount !== null &&
    destinationAccount.currency !== selectedCurrency;

  // Drop a destination that stopped being selectable (it became the origin, or
  // the type went back to income/expense).
  useEffect(() => {
    if (!isTransfer) {
      setValue("destinationPaymentMethodId", null, { shouldValidate: false });
      setValue("destinationAmount", null, { shouldValidate: false });
      return;
    }
    if (
      selectedDestinationId !== null &&
      !destinationAccounts.some((method) => method.id === selectedDestinationId)
    ) {
      setValue("destinationPaymentMethodId", null, { shouldValidate: false });
    }
  }, [isTransfer, destinationAccounts, selectedDestinationId, setValue]);

  // Mirror the sent amount into the received one for same-currency transfers,
  // so the user never has to type the same figure twice. Deliberately keyed on
  // "both sides are known to match" rather than "not cross-currency": while the
  // destination is still unresolved the field must be left alone, or loading a
  // saved cross-currency transfer would overwrite its received amount with the
  // sent one.
  useEffect(() => {
    if (!isSameCurrencyTransfer) return;
    setValue("destinationAmount", selectedAmount, { shouldValidate: false });
  }, [isSameCurrencyTransfer, selectedAmount, setValue]);

  // Where the description says the movement belongs: a rule's category, or
  // else the local AI's. Only of the form's own kind: an expense rule while the
  // form is on income is left alone rather than silently switching the type.
  const suggestion = useMemo(
    () =>
      selectedType === "transfer"
        ? null
        : suggestCategory(
            { description: typedDescription ?? "", type: selectedType },
            { rules: categoryRules, categories, model: categoryModel },
          ),
    [selectedType, typedDescription, categoryRules, categories, categoryModel],
  );

  // Filled in as the description is typed.
  useEffect(() => {
    if (suggestion === null || categoryTouchedRef.current) return;
    if (isEditing && !descriptionEditedRef.current) return;

    setValue("categoryId", suggestion.categoryId, { shouldValidate: false });
  }, [suggestion, isEditing, setValue]);

  // Past merchants the description could be, each with the category the rules
  // or the AI would give it — the same one picking it ends up with — and its
  // usual account, when it still exists. Null when the form offers none at
  // all, which is a plain field rather than an empty list.
  const descriptionOptions = useMemo((): DescriptionOption[] | null => {
    if (merchantHistory === null) return null;
    const suggestions = { rules: categoryRules, categories, model: categoryModel };
    return descriptionSuggestions(typedDescription ?? "", merchantHistory).map(
      (entry) => {
        const categoryId = suggestCategory(
          { description: entry.label, type: entry.type },
          suggestions,
        )?.categoryId;
        return {
          entry,
          category: categories.find((category) => category.id === categoryId) ?? null,
          account:
            paymentMethods.find(
              (method) => method.id === entry.account?.paymentMethodId,
            ) ?? null,
        };
      },
    );
  }, [
    merchantHistory,
    typedDescription,
    categoryRules,
    categories,
    categoryModel,
    paymentMethods,
  ]);

  // Fills the movement in like the merchant's usual one: its kind, currency and
  // account, and its typical amount, left selected since it is the figure most
  // likely to differ. The category follows from the description, through the
  // rules and the AI like any other, so it is decided in one place.
  function pickDescription({ entry, account }: DescriptionOption) {
    descriptionEditedRef.current = true;
    categoryTouchedRef.current = false;
    setValue("type", entry.type);
    setValue("currency", entry.currency);
    if (account !== null) setValue("paymentMethodId", account.id);
    if (entry.typicalAmount !== null) setValue("amount", entry.typicalAmount);
    setValue("description", entry.label, { shouldValidate: true });
    setFocus("amount", { shouldSelect: true });
  }

  return {
    isTransfer,
    isCrossCurrency,
    selectedCurrency,
    filteredCategories,
    originAccounts,
    destinationAccounts,
    destinationAccount,
    descriptionField,
    descriptionOptions,
    pickDescription,
    suggestion,
    // A category chosen by the user, from the list or from a rule offered to
    // them, stops the rules from choosing another one.
    markCategoryChosen: () => {
      categoryTouchedRef.current = true;
    },
  };
}

export type TransactionFieldsState = ReturnType<typeof useTransactionFields>;
