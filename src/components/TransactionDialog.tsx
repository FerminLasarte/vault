import { useDialogForm } from "@/hooks/useDialogForm";
import { useTransactionFields } from "@/hooks/useTransactionFields";
import { FormDialog } from "@/components/FormDialog";
import { TransactionFields } from "@/components/TransactionFields";
import type { CategoryModel } from "@/lib/ai/categoryModel";
import type { MerchantHistory } from "@/lib/ai/merchantHistory";
import {
  blankTransactionForm,
  draftToForm,
  formToTransaction,
  transactionFormSchema,
  type TransactionFormInput,
  type TransactionFormValues,
} from "@/lib/transactionForm";
import type {
  Category,
  CategoryRuleWithCategory,
  Tag,
  NewTransaction,
  PaymentMethod,
} from "@/db";

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  categoryRules: CategoryRuleWithCategory[];
  tags: Tag[];
  paymentMethods: PaymentMethod[];
  // The currency a new transaction starts in: whichever one the list is
  // showing when the dialog opens.
  defaultCurrency: string;
  // What a new transaction starts with instead of a blank form: the line typed
  // into the quick entry, when the user asked for the whole form to finish it.
  draft?: NewTransaction | null;
  aiEnabled: boolean;
  // What the local AI learned; null with it switched off.
  categoryModel: CategoryModel | null;
  // The merchants offered as the description is typed; null with the local AI
  // switched off.
  merchantHistory: MerchantHistory | null;
  onSubmitTransaction: (transaction: NewTransaction, tags: string[]) => Promise<void>;
}

// Where a transaction is created. Editing one happens in the inspector, beside
// the list, with the same fields and the same rules (see TransactionFields).
export function TransactionDialog({
  open,
  onOpenChange,
  categories,
  categoryRules,
  tags,
  paymentMethods,
  defaultCurrency,
  draft = null,
  aiEnabled,
  categoryModel,
  merchantHistory,
  onSubmitTransaction,
}: TransactionDialogProps) {
  const form = useDialogForm<TransactionFormInput, TransactionFormValues>({
    schema: transactionFormSchema,
    open,
    defaultValues: blankTransactionForm(defaultCurrency),
    values: draft ? draftToForm(draft) : blankTransactionForm(defaultCurrency),
  });

  // After useDialogForm, so that its reset runs before the checks inside.
  const fields = useTransactionFields({
    form,
    categories,
    categoryRules,
    categoryModel,
    paymentMethods,
    isEditing: false,
    loadKey: open,
    merchantHistory,
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  // One transaction per opening. There is no "save and add another": the
  // dialog closes, and the next one starts from a blank form when it reopens.
  async function onSubmit(values: TransactionFormValues) {
    await onSubmitTransaction(formToTransaction(values), values.tags);
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nueva transacción"
      description="Una transferencia mueve plata entre tus cuentas: no cuenta como ingreso ni como gasto."
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
      submitLabel={fields.isTransfer ? "Registrar transferencia" : "Agregar transacción"}
      className="sm:max-w-lg"
      layout="grid"
    >
      <TransactionFields
        form={form}
        fields={fields}
        tags={tags}
        idPrefix="transaction"
        aiEnabled={aiEnabled}
      />
    </FormDialog>
  );
}
