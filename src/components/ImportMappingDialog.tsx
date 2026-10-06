import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildMappedImportPlan,
  columnLabel,
  isMappingComplete,
  withFittingAccount,
} from "@/lib/importMapping";
import { CURRENCIES } from "@/lib/currency";
import { formatCurrency, formatDate } from "@/lib/format";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { AiMark } from "@/components/AiMark";
import { idSelectProps } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { guessReason } from "@/lib/ai/columnGuess";
import type { AmountLayout, ColumnMapping } from "@/lib/importMapping";
import type { ColumnGuess, GuessedField } from "@/lib/ai/columnGuess";
import { InstallmentPlanDialog } from "@/components/InstallmentPlanDialog";
import { StatementInstallments } from "@/components/StatementInstallments";
import type { ImportContext } from "@/lib/csv";
import type { StatementPlan } from "@/lib/importMapping";
import type { InstallmentPlanDraft } from "@/lib/ai/statementInstallments";
import type { NewInstallmentPlan, PaymentMethod } from "@/db";
import type { PickedStatement } from "@/lib/files";

// Enough rows to recognise the shape of the file without turning the dialog
// into a spreadsheet viewer.
const PREVIEW_ROWS = 6;
const PREVIEW_RESULTS = 5;

// Sentinel for "this column is not used": a Select needs a concrete value and
// no real column index can collide with it.
const NONE = "__none__";

const NO_LINES: ReadonlySet<number> = new Set();

interface ImportMappingDialogProps {
  statement: PickedStatement | null;
  onOpenChange: (open: boolean) => void;
  mapping: ColumnMapping;
  // The columns the AI worked out for a format never seen before, marked while
  // they still hold what it chose.
  guess: ColumnGuess | null;
  onMappingChange: (mapping: ColumnMapping) => void;
  paymentMethods: PaymentMethod[];
  context: ImportContext;
  onConfirm: (plan: StatementPlan) => Promise<void>;
  // Adds a plan for an instalment that has none, with the instalments before
  // it already paid.
  onCreatePlan: (plan: NewInstallmentPlan, paidCount: number) => Promise<void>;
}

export function ImportMappingDialog({
  statement,
  onOpenChange,
  mapping,
  guess,
  onMappingChange,
  paymentMethods,
  context,
  onConfirm,
  onCreatePlan,
}: ImportMappingDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  // Instalment rows the user said are not their plan's, for the statement
  // they were said about: a new file starts with none.
  const [separated, setSeparated] = useState<{
    statement: PickedStatement | null;
    lines: ReadonlySet<number>;
  }>({ statement: null, lines: NO_LINES });
  const separate = separated.statement === statement ? separated.lines : NO_LINES;
  // Kept while the plan dialog closes, so it does not empty as it fades.
  const [planDraft, setPlanDraft] = useState<InstallmentPlanDraft | null>(null);
  const [isPlanOpen, setIsPlanOpen] = useState(false);

  // Memoised because both are read by the memos below: recomputed inline they
  // would be a new array on every render, and nothing downstream would ever
  // actually memoise.
  const rows = useMemo(() => statement?.rows ?? [], [statement]);
  const header = useMemo(() => rows[mapping.headerRow] ?? [], [rows, mapping.headerRow]);

  const columns = useMemo(
    () => header.map((name, index) => ({ index, label: columnLabel(name, index) })),
    [header],
  );

  const columnItems = useMemo<Record<string, string>>(
    () => ({
      [NONE]: "Sin usar",
      ...Object.fromEntries(
        columns.map((column) => [String(column.index), column.label]),
      ),
    }),
    [columns],
  );

  // Recomputed as the mapping changes, so the consequence of every choice is
  // visible before anything is written.
  const plan = useMemo(() => {
    if (!isMappingComplete(mapping) || rows.length === 0) return null;
    return buildMappedImportPlan(rows, mapping, context, separate);
  }, [rows, mapping, context, separate]);

  const importCount = plan === null ? 0 : plan.ready.length + plan.steps.length;

  function setSeparate(line: number, isSeparate: boolean) {
    const lines = new Set(separate);
    if (isSeparate) lines.add(line);
    else lines.delete(line);
    setSeparated({ statement, lines });
  }

  const categoryNames = useMemo(
    () => new Map(context.categories.map((category) => [category.id, category.name])),
    [context.categories],
  );

  const availableAccounts = useMemo(
    () => paymentMethods.filter((method) => method.currency === mapping.currency),
    [paymentMethods, mapping.currency],
  );

  function set<K extends keyof ColumnMapping>(key: K, value: ColumnMapping[K]) {
    onMappingChange({ ...mapping, [key]: value });
  }

  // A field's label, with the AI's mark while the field holds its guess.
  function fieldLabel(field: GuessedField, label: string, htmlFor?: string) {
    const reason = guessReason(guess, mapping, field);
    return (
      <div className="flex items-center gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {reason !== null && <AiMark reason={reason} />}
      </div>
    );
  }

  function columnSelect(
    field: "date" | "description" | "amount" | "debit" | "credit",
    id: string,
    label: string,
    value: number | null,
    onPick: (index: number | null) => void,
  ) {
    return (
      <div className="flex flex-col gap-1.5">
        {fieldLabel(field, label, id)}
        <Select
          items={columnItems}
          value={value === null || value < 0 ? NONE : String(value)}
          onValueChange={(next) => onPick(next === NONE ? null : Number(next))}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Sin usar" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(columnItems).map(([key, name]) => (
              <SelectItem key={key} value={key}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  async function handleConfirm() {
    if (plan === null) return;
    setIsImporting(true);
    try {
      await onConfirm(plan);
      onOpenChange(false);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Dialog open={statement !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar resumen</DialogTitle>
          <DialogDescription>
            {statement?.fileName} · indicá qué columna es cada cosa. Nada se guarda hasta
            que confirmes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
          <section className="flex flex-col gap-2">
            <Label>Primeras filas del archivo</Label>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableBody>
                  {rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
                    <TableRow
                      key={rowIndex}
                      className={cn(
                        rowIndex === mapping.headerRow && "bg-secondary font-medium",
                      )}
                    >
                      <TableCell className="w-10 text-xs text-muted-foreground">
                        {rowIndex + 1}
                      </TableCell>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex} className="text-xs whitespace-nowrap">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col gap-1.5">
              {fieldLabel("headerRow", "Fila de encabezados", "import-header-row")}
              <Select
                items={Object.fromEntries(
                  rows
                    .slice(0, PREVIEW_ROWS)
                    .map((_, index) => [String(index), `Fila ${index + 1}`]),
                )}
                value={String(mapping.headerRow)}
                onValueChange={(next) => next && set("headerRow", Number(next))}
              >
                <SelectTrigger id="import-header-row" className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rows.slice(0, PREVIEW_ROWS).map((_, index) => (
                    <SelectItem key={index} value={String(index)}>
                      Fila {index + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {columnSelect("date", "import-date", "Fecha", mapping.date, (index) =>
              set("date", index ?? -1),
            )}
            {columnSelect(
              "description",
              "import-description",
              "Descripción",
              mapping.description,
              (index) => set("description", index ?? -1),
            )}

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              {fieldLabel("amountLayout", "Cómo viene el importe")}
              <Tabs
                value={mapping.amountLayout}
                onValueChange={(next) =>
                  set("amountLayout", String(next) as AmountLayout)
                }
              >
                <TabsList>
                  <TabsTrigger value="single">Una columna con signo</TabsTrigger>
                  <TabsTrigger value="debit-credit">Débito y crédito</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {mapping.amountLayout === "single" ? (
              <>
                {columnSelect(
                  "amount",
                  "import-amount",
                  "Importe",
                  mapping.amount,
                  (index) => set("amount", index),
                )}
                <div className="flex flex-col gap-1.5">
                  {fieldLabel("negativeIsExpense", "Qué significa un número negativo")}
                  <Tabs
                    value={mapping.negativeIsExpense ? "expense" : "income"}
                    onValueChange={(next) =>
                      set("negativeIsExpense", String(next) === "expense")
                    }
                  >
                    <TabsList>
                      <TabsTrigger value="expense">Gasto</TabsTrigger>
                      <TabsTrigger value="income">Ingreso</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </>
            ) : (
              <>
                {columnSelect(
                  "debit",
                  "import-debit",
                  "Débito (sale)",
                  mapping.debit,
                  (index) => set("debit", index),
                )}
                {columnSelect(
                  "credit",
                  "import-credit",
                  "Crédito (entra)",
                  mapping.credit,
                  (index) => set("credit", index),
                )}
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-currency">Moneda</Label>
              <Select
                items={Object.fromEntries(
                  CURRENCIES.map((currency) => [currency.code, currency.label]),
                )}
                value={mapping.currency}
                onValueChange={(next) =>
                  next &&
                  onMappingChange(
                    withFittingAccount(
                      { ...mapping, currency: String(next) },
                      paymentMethods,
                    ),
                  )
                }
              >
                <SelectTrigger id="import-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-account">Cuenta</Label>
              <Select
                {...idSelectProps(
                  Object.fromEntries(
                    availableAccounts.map((method) => [String(method.id), method.name]),
                  ),
                  mapping.paymentMethodId,
                  (id) => set("paymentMethodId", id),
                )}
                disabled={availableAccounts.length === 0}
              >
                <SelectTrigger id="import-account" className="w-full">
                  <SelectValue placeholder="Sin cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {availableAccounts.map((method) => (
                    <SelectItem key={method.id} value={String(method.id)}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Label>Resultado</Label>
            {plan === null ? (
              <p className="text-sm text-muted-foreground">
                Elegí al menos fecha, descripción e importe para ver qué se va a importar.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  {plan.ready.length}{" "}
                  {plan.ready.length === 1 ? "movimiento" : "movimientos"} a importar
                  {plan.steps.length > 0 &&
                    ` · ${plan.steps.length} ${plan.steps.length === 1 ? "cuota" : "cuotas"} a registrar en sus planes`}
                  {plan.duplicates > 0 && ` · ${plan.duplicates} ya existían`}
                  {plan.skipped.length > 0 && ` · ${plan.skipped.length} sin poder leer`}
                </p>

                {plan.ready.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plan.ready.slice(0, PREVIEW_RESULTS).map((entry, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-xs">
                              {formatDate(entry.transaction.date)}
                            </TableCell>
                            <TableCell className="max-w-64 truncate text-xs">
                              {entry.transaction.description}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {entry.transaction.categoryId === null ? (
                                <span className="text-muted-foreground">
                                  Sin categoría
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  {categoryNames.get(entry.transaction.categoryId)}
                                  {entry.transaction.categorySuggested && (
                                    <AiMark reason="Sugerida por IA. Queda marcada hasta que la confirmes o la cambies." />
                                  )}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {TRANSACTION_TYPE_LABELS[entry.transaction.type]}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {formatCurrency(
                                entry.transaction.amount,
                                entry.transaction.currency,
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {plan.installments.length > 0 && (
                  <StatementInstallments
                    lines={plan.installments}
                    dates={mapping.installmentDates}
                    onDatesChange={(dates) => set("installmentDates", dates)}
                    onSeparate={setSeparate}
                    onCreatePlan={(draft) => {
                      setPlanDraft(draft);
                      setIsPlanOpen(true);
                    }}
                  />
                )}

                {plan.skipped.length > 0 && (
                  <ul className="flex max-h-24 flex-col gap-1 overflow-y-auto">
                    {plan.skipped.slice(0, 10).map((entry) => (
                      <li key={entry.line} className="text-xs text-muted-foreground">
                        Línea {entry.line}: {entry.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={
              plan === null ||
              importCount === 0 ||
              plan.needsInstallmentDates ||
              isImporting
            }
            onClick={() => void handleConfirm()}
          >
            {isImporting ? "Importando..." : `Importar ${importCount}`}
          </Button>
        </DialogFooter>

        <InstallmentPlanDialog
          open={isPlanOpen}
          onOpenChange={setIsPlanOpen}
          editing={null}
          draft={planDraft}
          categories={context.categories}
          paymentMethods={paymentMethods}
          onSubmitPlan={(newPlan) => onCreatePlan(newPlan, planDraft?.paidCount ?? 0)}
        />
      </DialogContent>
    </Dialog>
  );
}
