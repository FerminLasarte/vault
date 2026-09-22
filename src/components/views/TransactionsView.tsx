import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ActionButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { CurrencyFilter } from "@/components/CurrencyFilter";
import { CategorySelect } from "@/components/filters/CategorySelect";
import { DateRangePicker } from "@/components/DateRangePicker";
import { TransactionDialog } from "@/components/TransactionDialog";
import { AttachmentsDialog } from "@/components/AttachmentsDialog";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import { applyTransactionFilters, EMPTY_DATE_RANGE, filterByTag } from "@/lib/finance";
import { formatCurrency, formatDate } from "@/lib/format";
import { splitTagNames } from "@/lib/text";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { TransactionWithCategory } from "@/db";
import type { ViewProps } from "@/lib/menu";

// Rendering thousands of rows at once is what makes the table crawl; a page
// worth of them is plenty for scanning and keeps the DOM small.
const PAGE_SIZE = 50;

// Sentinel for "no tag filter": the Select needs a concrete value, and a tag
// can never be an empty string.
const ALL_TAGS = "__all__";

// An empty amount input should mean "no bound", not zero.
function parseAmountBound(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// A cross-currency transfer has two different figures (pesos out, dollars in),
// so showing only one of them would misrepresent the movement.
function TransferAmount({ transaction }: { transaction: TransactionWithCategory }) {
  const destinationAmount = transaction.destination_amount;
  const destinationCurrency = transaction.destination_currency ?? transaction.currency;

  const sent = formatCurrency(transaction.amount, transaction.currency);

  // Same currency and same figure means both legs read identically, so showing
  // the arrow twice would only add noise.
  if (
    destinationAmount === null ||
    (destinationAmount === transaction.amount &&
      destinationCurrency === transaction.currency)
  ) {
    return <span className="text-muted-foreground">{sent}</span>;
  }

  // One leg per line. On a single line the pair made this the widest column,
  // and it pushed the row actions of every row off to the right.
  return (
    <span className="flex flex-col items-end text-muted-foreground">
      <span>{sent}</span>
      <span>→ {formatCurrency(destinationAmount, destinationCurrency)}</span>
    </span>
  );
}

export function TransactionsView({ request, onRequestHandled }: ViewProps) {
  const { transactions, categories, categoryRules, tags, paymentMethods, isLoading } =
    useAppData();
  const { isMutating } = useAppStatus();
  const { addTransaction, editTransaction, removeTransaction } = useAppActions();

  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState(EMPTY_DATE_RANGE);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionWithCategory | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<TransactionWithCategory | null>(
    null,
  );
  const [attaching, setAttaching] = useState<TransactionWithCategory | null>(null);

  const filtered = useMemo(() => {
    const matching = applyTransactionFilters(transactions, {
      currency,
      search,
      categoryId,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      minAmount: parseAmountBound(minAmount),
      maxAmount: parseAmountBound(maxAmount),
    });
    return tag === null ? matching : filterByTag(matching, tag);
  }, [transactions, currency, search, tag, categoryId, dateRange, minAmount, maxAmount]);

  // Any change to the filters starts the listing over at the first page.
  //
  // Adjusted during render rather than from an effect: an effect runs after the
  // browser has already painted, so the user would see one frame of page 7 of
  // the old results before it snapped back. Re-rendering from here happens
  // before anything is committed, so nothing flickers.
  const filterSignature = JSON.stringify([
    currency,
    search,
    tag,
    categoryId,
    dateRange,
    minAmount,
    maxAmount,
  ]);
  const [lastFilterSignature, setLastFilterSignature] = useState(filterSignature);
  if (filterSignature !== lastFilterSignature) {
    setLastFilterSignature(filterSignature);
    setPage(0);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Narrowing the filters can leave the current page past the end of the
  // results, which would show an empty table over a non-empty result set.
  const safePage = Math.min(page, pageCount - 1);

  const visible = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage],
  );

  function openCreateDialog() {
    setEditing(null);
    setIsFormOpen(true);
  }

  // "Nueva transacción" in the Archivo menu. Handled during render rather than
  // from an effect because opening a dialog is pure state: an effect would let
  // the view paint once without it and then pop it in a frame later.
  //
  // Starts at 0, so a request the view mounts with counts as new — which is
  // the usual case, since choosing the entry from another screen switches here
  // and hands over the request in the same render.
  const [lastRequestSeq, setLastRequestSeq] = useState(0);
  if (request !== null && request.seq !== lastRequestSeq) {
    setLastRequestSeq(request.seq);
    if (request.action === "new-transaction") openCreateDialog();
  }

  // Telling App happens after the render: it clears the request there, which
  // is another component's state and cannot be set while rendering this one.
  useEffect(() => {
    if (request !== null) onRequestHandled(request.seq);
  }, [request, onRequestHandled]);

  function openEditDialog(transaction: TransactionWithCategory) {
    setEditing(transaction);
    setIsFormOpen(true);
  }

  async function handleSubmitTransaction(
    values: Parameters<typeof addTransaction>[0],
    transactionTags: string[],
  ) {
    if (editing) {
      await editTransaction(editing.id, values, transactionTags);
    } else {
      await addTransaction(values, transactionTags);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeTransaction(pendingDeletion.id);
    setPendingDeletion(null);
  }

  function resetFilters() {
    setSearch("");
    setTag(null);
    setCategoryId(null);
    setDateRange(EMPTY_DATE_RANGE);
    setMinAmount("");
    setMaxAmount("");
  }

  const hasActiveFilters =
    search !== "" ||
    tag !== null ||
    categoryId !== null ||
    dateRange.from !== null ||
    dateRange.to !== null ||
    minAmount !== "" ||
    maxAmount !== "";

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Transacciones"
        description="Historial completo de tus movimientos."
        actions={
          <Button type="button" onClick={openCreateDialog}>
            <Plus />
            Nueva transacción
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Moneda</Label>
            <CurrencyFilter value={currency} onChange={setCurrency} />
          </div>

          <div className="flex min-w-56 flex-col gap-1.5">
            <Label htmlFor="transactions-search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="transactions-search"
                placeholder="Descripción..."
                className="pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="flex min-w-52 flex-col gap-1.5">
            <Label htmlFor="transactions-category">Categoría</Label>
            <CategorySelect
              id="transactions-category"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              className="w-full"
            />
          </div>

          {tags.length > 0 && (
            <div className="flex min-w-44 flex-col gap-1.5">
              <Label htmlFor="transactions-tag">Etiqueta</Label>
              <Select
                items={{
                  [ALL_TAGS]: "Todas",
                  ...Object.fromEntries(tags.map((entry) => [entry.name, entry.name])),
                }}
                value={tag ?? ALL_TAGS}
                onValueChange={(value) =>
                  setTag(String(value) === ALL_TAGS ? null : String(value))
                }
              >
                <SelectTrigger id="transactions-tag" className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TAGS}>Todas</SelectItem>
                  {tags.map((entry) => (
                    <SelectItem key={entry.id} value={entry.name}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transactions-dates">Rango de fechas</Label>
            <DateRangePicker
              id="transactions-dates"
              value={dateRange}
              onChange={setDateRange}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transactions-min-amount">Monto mínimo</Label>
            <Input
              id="transactions-min-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="Sin mínimo"
              className="w-32"
              value={minAmount}
              onChange={(event) => setMinAmount(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transactions-max-amount">Monto máximo</Label>
            <Input
              id="transactions-max-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="Sin máximo"
              className="w-32"
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value)}
            />
          </div>

          {hasActiveFilters && (
            <Button type="button" variant="ghost" onClick={resetFilters}>
              Limpiar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">Cargando...</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No hay transacciones que coincidan con los filtros.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="w-28">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(transaction.date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span>{transaction.description}</span>
                            {splitTagNames(transaction.tag_names).length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {splitTagNames(transaction.tag_names).map((name) => (
                                  <Badge
                                    key={name}
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    {name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {transaction.type === "transfer"
                            ? "—"
                            : transaction.category_name
                              ? `${transaction.category_icon ?? ""} ${transaction.category_name}`.trim()
                              : "Sin categoría"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {transaction.payment_method_name ? (
                              <Badge variant="secondary">
                                {transaction.payment_method_name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {transaction.type === "transfer" && (
                              <>
                                <ArrowRight className="size-3 text-muted-foreground" />
                                {transaction.destination_payment_method_name ? (
                                  <Badge variant="secondary">
                                    {transaction.destination_payment_method_name}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{TRANSACTION_TYPE_LABELS[transaction.type]}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium whitespace-nowrap",
                            transaction.type === "income" && "text-positive",
                            transaction.type === "expense" && "text-negative",
                          )}
                        >
                          {transaction.type === "transfer" ? (
                            <TransferAmount transaction={transaction} />
                          ) : (
                            <>
                              {transaction.type === "income" ? "+" : "-"}
                              {formatCurrency(transaction.amount, transaction.currency)}
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <ActionButton
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              label={
                                transaction.attachment_count > 0
                                  ? `${transaction.attachment_count} comprobante(s)`
                                  : "Adjuntar comprobante"
                              }
                              className={cn(
                                transaction.attachment_count === 0 &&
                                  "text-muted-foreground/50",
                              )}
                              onClick={() => setAttaching(transaction)}
                            >
                              <Paperclip />
                              <span className="sr-only">
                                Comprobantes de {transaction.description}
                              </span>
                            </ActionButton>
                            <ActionButton
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              label="Editar"
                              onClick={() => openEditDialog(transaction)}
                            >
                              <Pencil />
                              <span className="sr-only">
                                Editar {transaction.description}
                              </span>
                            </ActionButton>
                            <ActionButton
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              label="Eliminar"
                              onClick={() => setPendingDeletion(transaction)}
                            >
                              <Trash2 />
                              <span className="sr-only">
                                Eliminar {transaction.description}
                              </span>
                            </ActionButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
                <p className="text-xs text-muted-foreground">
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "transacción" : "transacciones"}
                  {pageCount > 1 &&
                    ` · mostrando ${safePage * PAGE_SIZE + 1}-${
                      safePage * PAGE_SIZE + visible.length
                    }`}
                </p>

                {pageCount > 1 && (
                  <div className="flex items-center gap-2">
                    <ActionButton
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      label="Página anterior"
                      disabled={safePage === 0}
                      onClick={() => setPage(safePage - 1)}
                    >
                      <ChevronLeft />
                      <span className="sr-only">Página anterior</span>
                    </ActionButton>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {safePage + 1} / {pageCount}
                    </span>
                    <ActionButton
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      label="Página siguiente"
                      disabled={safePage >= pageCount - 1}
                      onClick={() => setPage(safePage + 1)}
                    >
                      <ChevronRight />
                      <span className="sr-only">Página siguiente</span>
                    </ActionButton>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AttachmentsDialog
        transaction={attaching}
        onOpenChange={(open) => {
          if (!open) setAttaching(null);
        }}
      />

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar esta transacción?"
        description={
          <>
            Se eliminará «{pendingDeletion?.description}» del{" "}
            {pendingDeletion ? formatDate(pendingDeletion.date) : ""}. Esta acción no se
            puede deshacer.
          </>
        }
        onConfirm={handleConfirmDelete}
        isMutating={isMutating}
      />

      <TransactionDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        categories={categories}
        categoryRules={categoryRules}
        tags={tags}
        paymentMethods={paymentMethods}
        defaultCurrency={currency}
        onSubmitTransaction={handleSubmitTransaction}
      />
    </div>
  );
}
