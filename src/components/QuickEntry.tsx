import { useMemo, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { useAppData } from "@/hooks/useAppData";
import { formatCurrency, formatDate } from "@/lib/format";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import {
  lastUsedAccountByCurrency,
  parseQuickEntry,
  quickEntryGaps,
  quickEntryToTransaction,
} from "@/lib/quickEntry";
import { cn } from "@/lib/utils";
import type { NewTransaction } from "@/db";

interface QuickEntryProps {
  // The currency a line that names neither an account nor a currency is in:
  // whichever one the list is showing.
  defaultCurrency: string;
  // Saves a complete line. Rejects when the write fails, which leaves the line
  // where it is to try again; the failure has been reported already.
  onSave: (transaction: NewTransaction) => Promise<void>;
  // Opens the whole form, filled in with what the line said.
  onExpand: (draft: NewTransaction) => void;
}

interface Part {
  key: string;
  text: string;
  // Still to be filled in, so it reads apart from what was understood.
  missing?: boolean;
}

// A movement typed as one line, above the list: "café 2500 mp ayer".
//
// The form asks for seven things one field at a time, which is right for a
// transfer between currencies and far too much for a coffee. Here the line is
// read as it is typed (see quickEntry.ts), and what was understood is shown
// under it before anything is saved — the type, the amount, the category and
// the rule that chose it, the account and the date. Enter saves it; Tab opens
// the whole form with all of that filled in. A line with something missing
// goes to the form on either key, since the form is where that gets filled.
export function QuickEntry({ defaultCurrency, onSave, onExpand }: QuickEntryProps) {
  const { paymentMethods, categories, categoryRules, transactions, today } = useAppData();
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const lastUsedAccounts = useMemo(
    () => lastUsedAccountByCurrency(transactions),
    [transactions],
  );

  const entry = useMemo(
    () =>
      text.trim() === ""
        ? null
        : parseQuickEntry(text, {
            today,
            paymentMethods,
            categories,
            rules: categoryRules,
            lastUsedAccounts,
            defaultCurrency,
          }),
    [
      text,
      today,
      paymentMethods,
      categories,
      categoryRules,
      lastUsedAccounts,
      defaultCurrency,
    ],
  );

  const gaps = entry === null ? [] : quickEntryGaps(entry, today);

  const parts = useMemo((): Part[] => {
    if (entry === null) return [];

    const category = categories.find((item) => item.id === entry.categoryId);
    const account = paymentMethods.find((item) => item.id === entry.paymentMethodId);

    return [
      { key: "type", text: TRANSACTION_TYPE_LABELS[entry.type] },
      entry.amount === null
        ? { key: "amount", text: "Sin monto", missing: true }
        : { key: "amount", text: formatCurrency(entry.amount, entry.currency) },
      entry.description === ""
        ? { key: "description", text: "Sin descripción", missing: true }
        : { key: "description", text: `«${entry.description}»` },
      category === undefined
        ? { key: "category", text: "Sin categoría", missing: true }
        : {
            key: "category",
            text:
              entry.rule === null
                ? category.name
                : `${category.name}, por la regla «${entry.rule.pattern}»`,
          },
      account === undefined
        ? { key: "account", text: "Sin cuenta", missing: true }
        : {
            key: "account",
            text: entry.accountAssumed ? `${account.name}, por defecto` : account.name,
          },
      entry.date > today
        ? { key: "date", text: `${formatDate(entry.date)}, es futura`, missing: true }
        : { key: "date", text: formatDate(entry.date) },
    ];
  }, [entry, categories, paymentMethods, today]);

  async function save(transaction: NewTransaction) {
    setIsSaving(true);
    try {
      await onSave(transaction);
      setText("");
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (entry === null || isSaving) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setText("");
      return;
    }

    const isTab = event.key === "Tab" && !event.shiftKey;
    if (event.key !== "Enter" && !isTab) return;

    event.preventDefault();
    const transaction = quickEntryToTransaction(entry);
    if (event.key === "Enter" && gaps.length === 0) void save(transaction);
    else onExpand(transaction);
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-label="Carga rápida"
        aria-describedby={entry === null ? undefined : "quick-entry-reading"}
        placeholder="Cargá un movimiento escribiendo, por ejemplo: café 2500 mp ayer"
        value={text}
        // Read-only rather than disabled while it saves: a disabled input drops
        // the focus, and the next line is typed straight after this one.
        readOnly={isSaving}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      {entry !== null && (
        <div
          id="quick-entry-reading"
          className="arrive flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1 text-sm"
        >
          <p className="flex flex-wrap gap-x-2 text-muted-foreground">
            {parts.map((part, index) => (
              <span key={part.key}>
                <span className={cn(part.missing && "text-destructive")}>
                  {part.text}
                </span>
                {index < parts.length - 1 && <span aria-hidden> ·</span>}
              </span>
            ))}
          </p>
          <p className="ml-auto text-xs text-muted-foreground">
            {gaps.length === 0
              ? "Enter guarda · Tab abre el formulario"
              : "Enter o Tab para completarlo en el formulario"}
          </p>
        </div>
      )}
    </div>
  );
}
