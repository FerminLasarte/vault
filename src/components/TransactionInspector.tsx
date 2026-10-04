import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ActionButton } from "@/components/ActionButton";
import { Button } from "@/components/ui/button";
import { TransactionAttachments } from "@/components/TransactionAttachments";
import { TransactionFields } from "@/components/TransactionFields";
import { useAppActions, useAppData } from "@/hooks/useAppData";
import { useDialogForm } from "@/hooks/useDialogForm";
import { useMerchantName } from "@/hooks/useMerchantName";
import { useTransactionFields } from "@/hooks/useTransactionFields";
import { matchCategoryRuleForType } from "@/lib/categoryRules";
import { isMacOS } from "@/lib/platform";
import { isReported } from "@/lib/reportedError";
import {
  differsFromSaved,
  formToTransaction,
  transactionFormSchema,
  transactionToForm,
  type TransactionFormInput,
  type TransactionFormValues,
} from "@/lib/transactionForm";
import { cn } from "@/lib/utils";
import type { TransactionWithCategory } from "@/db";

// How long the inspector waits after the last keystroke before saving: long
// enough not to write "2", "25" and "250" on the way to "2500", short enough
// that a change is kept before anyone thinks to wonder.
const SAVE_DELAY_MS = 600;

type SaveStatus = "idle" | "saving" | "saved" | "invalid" | "failed";

const STATUS_LABELS: Record<SaveStatus, string> = {
  idle: "Los cambios se guardan solos",
  saving: "Guardando…",
  saved: "Guardado",
  invalid: "Sin guardar hasta completar lo que falta",
  failed: "No se pudo guardar",
};

interface TransactionInspectorProps {
  // The saved transaction, fresh from the list. The inspector is keyed by its
  // id, so moving to another row starts it over.
  transaction: TransactionWithCategory;
  onClose: () => void;
}

// A transaction, edited in place beside the list rather than in a dialog over
// it.
//
// The same fields and rules as the form that creates one (TransactionFields),
// with no "Guardar" to press: a change the user makes is saved on its own once
// they pause, and whatever is pending is saved on closing. A change that leaves
// the transaction invalid — turning an expense into a transfer, before saying
// where the money went — is held on screen and saved once it is complete, so
// nothing half-made ever reaches the list.
//
// Only what the user changes is saved. The form also adjusts itself on opening
// (an account that no longer exists, say), and saving that unasked would edit
// a row the user only looked at.
export function TransactionInspector({
  transaction,
  onClose,
}: TransactionInspectorProps) {
  const { categories, categoryRules, tags, paymentMethods, aiEnabled } = useAppData();
  const { editTransaction } = useAppActions();
  const merchantName = useMerchantName();

  const loaded = transactionToForm(transaction);
  const form = useDialogForm<TransactionFormInput, TransactionFormValues>({
    schema: transactionFormSchema,
    open: true,
    defaultValues: loaded,
    values: loaded,
  });

  // After useDialogForm, so that its reset runs before the checks inside.
  const fields = useTransactionFields({
    form,
    categories,
    categoryRules,
    paymentMethods,
    isEditing: true,
    loadKey: transaction.id,
  });

  const [status, setStatus] = useState<SaveStatus>("idle");

  // What the list last said, for telling a real change from one already saved.
  const saved = useRef(transaction);
  useEffect(() => {
    saved.current = transaction;
  }, [transaction]);

  // What was last sent, so a second pause before the list has been read back
  // does not write the same thing twice.
  const lastSent = useRef<string | null>(null);

  const persist = useCallback(
    async (values: TransactionFormValues) => {
      if (!differsFromSaved(values, saved.current)) {
        setStatus((current) => (current === "invalid" ? "idle" : current));
        return;
      }

      const next = formToTransaction(values);
      const signature = JSON.stringify([next, [...values.tags].sort()]);
      if (signature === lastSent.current) return;
      lastSent.current = signature;

      setStatus("saving");
      try {
        await editTransaction(transaction.id, next, values.tags);
        setStatus("saved");
      } catch (error) {
        lastSent.current = null;
        setStatus("failed");
        // A failed write has said so already (see ReportedError).
        if (!isReported(error)) throw error;
      }
    },
    [editTransaction, transaction.id],
  );

  const { handleSubmit, watch, setValue } = form;

  const saveNow = useCallback(
    () => handleSubmit(persist, () => setStatus("invalid"))(),
    [handleSubmit, persist],
  );

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void saveNow();
    }, SAVE_DELAY_MS);
  }, [saveNow]);

  // Only changes the user makes: react-hook-form marks those as "change", and
  // leaves unmarked the ones the form makes to itself.
  useEffect(() => {
    const subscription = watch((_, { type }) => {
      if (type === "change") scheduleSave();
    });
    return () => subscription.unsubscribe();
  }, [watch, scheduleSave]);

  // Closing, or moving to another row, saves whatever was still waiting.
  const latestSaveNow = useRef(saveNow);
  useEffect(() => {
    latestSaveNow.current = saveNow;
  });
  useEffect(
    () => () => {
      if (timer.current === null) return;
      clearTimeout(timer.current);
      void latestSaveNow.current();
    },
    [],
  );

  // Which rule matches the description now. Nothing records which rule chose a
  // saved category, so this says what a rule would do, never what one did.
  const type = watch("type");
  const description = watch("description");
  const categoryId = watch("categoryId");
  const rule =
    type === "transfer"
      ? null
      : matchCategoryRuleForType(description ?? "", categoryRules, categories, type);
  const ruleCategory = categories.find((category) => category.id === rule?.category_id);

  function applyRule() {
    if (rule === null) return;
    fields.markCategoryChosen();
    setValue("categoryId", rule.category_id, { shouldDirty: true });
    scheduleSave();
  }

  const categoryHint =
    rule === null || ruleCategory === undefined ? null : rule.category_id ===
      categoryId ? (
      <p className="text-xs text-muted-foreground">
        Coincide con la regla «{rule.pattern}».
      </p>
    ) : (
      <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
        La regla «{rule.pattern}» la pondría en {ruleCategory.name}.
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto px-0 text-foreground underline decoration-muted-foreground/50"
          onClick={applyRule}
        >
          Aplicarla
        </Button>
      </p>
    );

  return (
    <aside
      aria-labelledby="inspector-title"
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-background shadow-lg animate-in fade-in slide-in-from-right-4 duration-(--duration-base) sm:w-96"
    >
      {/* The top of the window is its title bar on macOS, where this panel
          covers the strip the window is dragged by; the header takes the job
          over, and starts below the traffic lights' height like the sidebar. */}
      <header
        data-tauri-drag-region
        className={cn(
          "flex items-start justify-between gap-3 border-b border-border px-5 pb-3",
          isMacOS() ? "pt-10" : "pt-4",
        )}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id="inspector-title"
            className="truncate font-heading text-base font-semibold"
          >
            {merchantName(transaction.description) ?? transaction.description}
          </h2>
          <p
            role="status"
            className={cn(
              "text-xs",
              status === "invalid" || status === "failed"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {STATUS_LABELS[status]}
          </p>
        </div>
        <ActionButton
          type="button"
          variant="ghost"
          size="icon-sm"
          label="Cerrar"
          side="left"
          onClick={onClose}
        >
          <X />
          <span className="sr-only">Cerrar</span>
        </ActionButton>
      </header>

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-5 py-5">
        {/* A form so Enter in a field behaves like everywhere else, but it has
            nothing to submit: Enter saves now instead of after the pause. */}
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = null;
            void saveNow();
          }}
        >
          <TransactionFields
            form={form}
            fields={fields}
            tags={tags}
            idPrefix="inspector"
            categoryHint={categoryHint}
            aiEnabled={aiEnabled}
          />
        </form>

        <TransactionAttachments transaction={transaction} />
      </div>
    </aside>
  );
}
