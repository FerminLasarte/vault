import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ActionButton } from "@/components/ActionButton";
import { InlineAction } from "@/components/InlineAction";
import { AiNote } from "@/components/AiMark";
import type { CategorySuggestion } from "@/lib/ai/categorySuggestion";
import { TransactionAttachments } from "@/components/TransactionAttachments";
import { TransactionFields } from "@/components/TransactionFields";
import { useAppActions, useAppData } from "@/hooks/useAppData";
import { useDialogForm } from "@/hooks/useDialogForm";
import { useMerchantName } from "@/hooks/useMerchantName";
import { useTransactionFields } from "@/hooks/useTransactionFields";
import { isMacOS } from "@/lib/platform";
import { isReported } from "@/lib/reportedError";
import {
  differsFromSaved,
  formToTransaction,
  stillSuggested,
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
  const { categories, categoryRules, categoryModel, tags, paymentMethods, aiEnabled } =
    useAppData();
  const { editTransaction, confirmSuggestedCategories } = useAppActions();
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
    categoryModel,
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

      const next = {
        ...formToTransaction(values),
        categorySuggested: stillSuggested(saved.current, values.categoryId),
      };
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

  // Which rule — or else what the local AI — would place the description now.
  // Nothing records who chose a saved category, so this says what they would
  // do, never what they did; the one exception is a category the AI chose on
  // import, which stays flagged until the user confirms or changes it.
  const categoryId = watch("categoryId");
  const { suggestion } = fields;
  const suggestedCategory = categories.find(
    (category) => category.id === suggestion?.categoryId,
  );
  const awaitsConfirmation =
    aiEnabled &&
    stillSuggested(transaction, typeof categoryId === "number" ? categoryId : null);

  function applySuggestion() {
    if (suggestion === null) return;
    fields.markCategoryChosen();
    setValue("categoryId", suggestion.categoryId, { shouldDirty: true });
    scheduleSave();
  }

  const categoryHint = (
    <CategoryHint
      hint={describeCategory(
        awaitsConfirmation,
        suggestion,
        suggestedCategory?.name,
        categoryId,
      )}
      onApply={applySuggestion}
      onConfirm={() => void confirmSuggestedCategories([transaction.id])}
    />
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

// What the line under the category says, in order: a category the AI chose on
// import waits to be confirmed; otherwise what a rule, or else the AI, would
// put there, and whether the category already agrees with it.
type CategoryHintState =
  | { kind: "confirm" }
  | { kind: "matches-rule"; pattern: string }
  | { kind: "rule-differs"; pattern: string; categoryName: string }
  | { kind: "matches-ai"; reason: string }
  | { kind: "ai-differs"; reason: string; categoryName: string };

function describeCategory(
  awaitsConfirmation: boolean,
  suggestion: CategorySuggestion | null,
  categoryName: string | undefined,
  categoryId: unknown,
): CategoryHintState | null {
  if (awaitsConfirmation) return { kind: "confirm" };
  if (suggestion === null || categoryName === undefined) return null;
  const matches = suggestion.categoryId === categoryId;
  if (suggestion.source === "rule") {
    return matches
      ? { kind: "matches-rule", pattern: suggestion.rule.pattern }
      : { kind: "rule-differs", pattern: suggestion.rule.pattern, categoryName };
  }
  return matches
    ? { kind: "matches-ai", reason: suggestion.reason }
    : { kind: "ai-differs", reason: suggestion.reason, categoryName };
}

function CategoryHint({
  hint,
  onApply,
  onConfirm,
}: {
  hint: CategoryHintState | null;
  onApply: () => void;
  onConfirm: () => void;
}) {
  switch (hint?.kind) {
    case undefined:
      return null;
    case "confirm":
      return (
        <AiNote reason="La IA eligió esta categoría al importar el movimiento. Confirmala si es la correcta, o elegí otra.">
          Sugerida por IA al importar.
          <InlineAction onClick={onConfirm}>Confirmar</InlineAction>
        </AiNote>
      );
    case "matches-rule":
      return (
        <p className="text-xs text-muted-foreground">
          Coincide con la regla «{hint.pattern}».
        </p>
      );
    case "rule-differs":
      return (
        <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          La regla «{hint.pattern}» la pondría en {hint.categoryName}.
          <InlineAction onClick={onApply}>Aplicarla</InlineAction>
        </p>
      );
    case "matches-ai":
      return <AiNote reason={hint.reason}>Coincide con lo que sugiere la IA.</AiNote>;
    case "ai-differs":
      return (
        <AiNote reason={hint.reason}>
          La IA la pondría en {hint.categoryName}.
          <InlineAction onClick={onApply}>Aplicarla</InlineAction>
        </AiNote>
      );
  }
}
