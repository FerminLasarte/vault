import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SignedAmount } from "@/components/SignedAmount";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ActionButton";
import { AiMark } from "@/components/AiMark";
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
import { RemovableBadge } from "@/components/RemovableBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { CurrencyFilter } from "@/components/CurrencyFilter";
import { CategorySelect } from "@/components/filters/CategorySelect";
import { DateRangePicker } from "@/components/DateRangePicker";
import { TransactionDialog } from "@/components/TransactionDialog";
import { QuickEntry } from "@/components/QuickEntry";
import { TransactionInspector } from "@/components/TransactionInspector";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import { useBriefly } from "@/hooks/useBriefly";
import { useMerchantName } from "@/hooks/useMerchantName";
import { useViewState } from "@/hooks/useViewState";
import { parseSearchQuery, withoutChips } from "@/lib/ai/searchQuery";
import {
  applyTransactionFilters,
  EMPTY_DATE_RANGE,
  filterByTag,
  type DateRange,
} from "@/lib/finance";
import { formatCurrency, formatDate } from "@/lib/format";
import { splitTagNames } from "@/lib/text";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { useShortcuts } from "@/hooks/useShortcuts";
import { cn } from "@/lib/utils";
import type { NewTransaction, TransactionWithCategory } from "@/db";
import type { ViewProps } from "@/lib/menu";
import { Loading, LoadingRows } from "@/components/Loading";

// Rendering thousands of rows at once is what makes the table crawl; a page
// worth of them is plenty for scanning and keeps the DOM small.
const PAGE_SIZE = 50;

// Sentinel for "no tag filter": the Select needs a concrete value, and a tag
// can never be an empty string.
const ALL_TAGS = "__all__";

// What the filter bar narrows the table by. The currency is kept apart: there
// is always one, so it is not something "Limpiar filtros" can clear.
interface Filters {
  search: string;
  tag: string | null;
  categoryId: number | null;
  dateRange: DateRange;
  // As typed, so a half-written bound stays in the box.
  minAmount: string;
  maxAmount: string;
  // Only movements whose category the local AI chose and nobody confirmed.
  suggestedOnly: boolean;
}

const NO_FILTERS: Filters = {
  search: "",
  tag: null,
  categoryId: null,
  dateRange: EMPTY_DATE_RANGE,
  minAmount: "",
  maxAmount: "",
  suggestedOnly: false,
};

// A row that was just saved, while the table brings it on screen. It is looked
// for once the list holds it, and is then either shown, on whichever page it
// landed, or hidden by the filters, which the toast that announces it says.
// `message` is that toast, and is null once it has been shown.
type Arrival =
  | { id: number; message: string | null; status: "seeking" | "shown" }
  | { id: number; message: string | null; status: "hidden"; currency: string };

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
  const {
    transactions,
    categories,
    categoryRules,
    tags,
    paymentMethods,
    aiEnabled,
    categoryModel,
    merchantHistory,
    today,
    isLoading,
  } = useAppData();
  const { isMutating } = useAppStatus();
  const { addTransaction, removeTransaction, confirmSuggestedCategories } =
    useAppActions();

  // Remembered, so coming back from another screen finds the same rows.
  const [currency, setCurrency] = useViewState("transactions.currency", DEFAULT_CURRENCY);
  const [filters, setFilters] = useViewState("transactions.filters", NO_FILTERS);
  const [page, setPage] = useViewState("transactions.page", 0);
  const { search, tag, categoryId, dateRange, minAmount, maxAmount } = filters;
  // Ignored with the AI off, which shows no suggestions to review.
  const suggestedOnly = aiEnabled && filters.suggestedOnly;
  const [arrival, setArrival] = useState<Arrival | null>(null);
  // Long enough to find the row on a screen the user is only now looking at,
  // short enough to be gone before it turns into decoration.
  const { current: justWritten, remember: markWritten } = useBriefly<number>(1200);
  const [isFormOpen, setIsFormOpen] = useState(false);
  // What the quick entry handed over when it asked for the whole form.
  const [draft, setDraft] = useState<NewTransaction | null>(null);
  // Bumped once a handed-over line is saved from the form, which starts the
  // quick entry over with an empty line.
  const [quickEntryKey, setQuickEntryKey] = useState(0);
  const [pendingDeletion, setPendingDeletion] = useState<TransactionWithCategory | null>(
    null,
  );
  // The row open in the inspector, by id: the row itself is read from the list
  // on every render, so the panel always shows what was last saved, and closes
  // on its own when the row is deleted.
  const [inspectedId, setInspectedId] = useState<number | null>(null);
  // What had the keyboard when the inspector opened, to give it back on closing.
  const inspectorOpener = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const merchantName = useMerchantName();
  // What a row is called on screen: the merchant, when the AI recognises one in
  // what the bank wrote.
  const labelOf = (transaction: TransactionWithCategory) =>
    merchantName(transaction.description) ?? transaction.description;
  const tableBody = useRef<HTMLTableSectionElement>(null);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  // The search read as filters — "comida en agosto más de 5000" — with the AI
  // on. Off, it is the text it always was.
  const understood = useMemo(
    () =>
      aiEnabled
        ? parseSearchQuery(search, { today, categories, paymentMethods, tags, currency })
        : null,
    [aiEnabled, search, today, categories, paymentMethods, tags, currency],
  );
  // A currency named in the search is the one on screen while it is there.
  const shownCurrency = understood?.filters.currency ?? currency;

  function chooseCurrency(value: string) {
    setCurrency(value);
    // Choosing one on screen overrides one named in the search, which goes.
    const naming = understood?.chips.filter((chip) => chip.setsCurrency) ?? [];
    if (naming.length > 0) setFilter("search", withoutChips(search, naming));
  }

  const filtered = useMemo(() => {
    const matching = applyTransactionFilters(transactions, {
      currency: shownCurrency,
      search: understood?.rest ?? filters.search,
      categoryId: filters.categoryId,
      dateFrom: filters.dateRange.from,
      dateTo: filters.dateRange.to,
      minAmount: parseAmountBound(filters.minAmount),
      maxAmount: parseAmountBound(filters.maxAmount),
    });
    // What the search says narrows what the controls already chose: both apply.
    const searched =
      understood === null
        ? matching
        : applyTransactionFilters(matching, understood.filters);
    const tagged = [filters.tag, understood?.filters.tag ?? null].reduce(
      (rows, name) => (name === null ? rows : filterByTag(rows, name)),
      searched,
    );
    return suggestedOnly
      ? tagged.filter((transaction) => transaction.category_suggested === 1)
      : tagged;
  }, [transactions, shownCurrency, understood, filters, suggestedOnly]);

  // Categories the AI chose on import and nobody has looked at yet, in the
  // currency on screen.
  const suggestedCount = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          transaction.category_suggested === 1 && transaction.currency === shownCurrency,
      ).length,
    [transactions, shownCurrency],
  );

  async function confirmShown() {
    await confirmSuggestedCategories(filtered.map((transaction) => transaction.id));
    setFilter("suggestedOnly", false);
  }

  // Any change to the filters starts the listing over at the first page.
  //
  // Adjusted during render rather than from an effect: an effect runs after the
  // browser has already painted, so the user would see one frame of page 7 of
  // the old results before it snapped back. Re-rendering from here happens
  // before anything is committed, so nothing flickers.
  const filterSignature = JSON.stringify([shownCurrency, filters]);
  const [lastFilterSignature, setLastFilterSignature] = useState(filterSignature);
  if (filterSignature !== lastFilterSignature) {
    setLastFilterSignature(filterSignature);
    setPage(0);
  }

  // A row just saved goes to the page it landed on. After the filters above,
  // so that clearing them on the toast's request ends up here rather than on
  // the first page.
  if (arrival?.status === "seeking") {
    const index = filtered.findIndex((transaction) => transaction.id === arrival.id);
    const written =
      index === -1
        ? transactions.find((transaction) => transaction.id === arrival.id)
        : undefined;

    if (written !== undefined) {
      setArrival({ ...arrival, status: "hidden", currency: written.currency });
    } else {
      // Also where a row the list could not be read back lands: it was
      // written, the failed reload has said so already, and there is nothing
      // to go to.
      if (index !== -1) setPage(Math.floor(index / PAGE_SIZE));
      setArrival({ ...arrival, status: "shown" });
    }
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Narrowing the filters can leave the current page past the end of the
  // results, which would show an empty table over a non-empty result set.
  const safePage = Math.min(page, pageCount - 1);

  const visible = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage],
  );

  // Read from the whole list rather than the page, so narrowing the filters
  // while a row is open does not close it under the user.
  const inspected = useMemo(
    () => transactions.find((transaction) => transaction.id === inspectedId) ?? null,
    [transactions, inspectedId],
  );

  function openInspector(transaction: TransactionWithCategory) {
    inspectorOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInspectedId(transaction.id);
  }

  function closeInspector() {
    setInspectedId(null);
    if (inspectorOpener.current?.isConnected) inspectorOpener.current.focus();
    inspectorOpener.current = null;
  }

  function openCreateDialog() {
    setDraft(null);
    setIsFormOpen(true);
  }

  function openDraftDialog(started: NewTransaction) {
    setDraft(started);
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

  // Saving answers "where did it go": the table sorts by date, so the row can
  // land on any page, and the filters can leave it out altogether. The action
  // resolves once the list holds the row, so it is there to be looked for.
  function announce(arrived: Arrival) {
    markWritten(arrived.id);
    setArrival(arrived);
  }

  //
  // Only for a new row. An edit happens in the inspector, where the row stays
  // open beside the list: sending the table to another page on every pause in
  // the typing would move the list out from under the user.
  async function createTransaction(values: NewTransaction, transactionTags: string[]) {
    const id = await addTransaction(values, transactionTags);
    announce({ id, message: "Transacción agregada", status: "seeking" });
  }

  async function handleSubmitTransaction(
    values: NewTransaction,
    transactionTags: string[],
  ) {
    await createTransaction(values, transactionTags);
    if (draft !== null) {
      setDraft(null);
      setQuickEntryKey((key) => key + 1);
    }
  }

  // After the page holding the row has been drawn and before it is painted, so
  // the table is never seen at the old position first.
  useLayoutEffect(() => {
    if (arrival === null || arrival.status === "seeking") return;

    if (arrival.status === "shown") {
      tableBody.current
        ?.querySelector(`[data-transaction-id="${arrival.id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }

    if (arrival.message === null) return;

    toast.success(
      arrival.message,
      arrival.status === "hidden"
        ? {
            description: "Los filtros activos la ocultan.",
            action: {
              label: "Limpiar filtros",
              // And the row's currency, which hides it just the same.
              onClick: () => {
                setFilters(NO_FILTERS);
                setCurrency(arrival.currency);
                markWritten(arrival.id);
                setArrival({ id: arrival.id, message: null, status: "seeking" });
              },
            },
          }
        : undefined,
    );
  }, [arrival, setFilters, setCurrency, markWritten]);

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeTransaction(pendingDeletion.id);
    setPendingDeletion(null);
  }

  function resetFilters() {
    setFilters(NO_FILTERS);
  }

  const hasActiveFilters =
    search !== "" ||
    tag !== null ||
    categoryId !== null ||
    dateRange.from !== null ||
    dateRange.to !== null ||
    minAmount !== "" ||
    maxAmount !== "" ||
    suggestedOnly;

  // The two keys this screen answers. "/" is where every list with a search
  // box puts it, and Escape undoes the filtering without having to find the
  // button that does it — or, with a row open, closes the inspector first,
  // since that is what is in front.
  useShortcuts({
    "/": () => searchRef.current?.focus(),
    Escape: () => {
      if (inspected !== null) closeInspector();
      else if (hasActiveFilters) resetFilters();
    },
  });

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

      <QuickEntry
        key={quickEntryKey}
        defaultCurrency={currency}
        onSave={(transaction) => createTransaction(transaction, [])}
        onExpand={openDraftDialog}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Moneda</Label>
            <CurrencyFilter value={shownCurrency} onChange={chooseCurrency} />
          </div>

          <div
            className={cn("flex flex-col gap-1.5", aiEnabled ? "min-w-72" : "min-w-56")}
          >
            <Label htmlFor="transactions-search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                id="transactions-search"
                placeholder={
                  aiEnabled ? "Ej. comida en agosto más de 5000" : "Descripción..."
                }
                className="pl-8"
                value={search}
                onChange={(event) => setFilter("search", event.target.value)}
              />
            </div>
          </div>

          <div className="flex min-w-52 flex-col gap-1.5">
            <Label htmlFor="transactions-category">Categoría</Label>
            <CategorySelect
              id="transactions-category"
              categories={categories}
              value={categoryId}
              onChange={(value) => setFilter("categoryId", value)}
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
                  setFilter("tag", String(value) === ALL_TAGS ? null : String(value))
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
              onChange={(value) => setFilter("dateRange", value)}
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
              onChange={(event) => setFilter("minAmount", event.target.value)}
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
              onChange={(event) => setFilter("maxAmount", event.target.value)}
            />
          </div>

          {aiEnabled && (suggestedCount > 0 || suggestedOnly) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm leading-none font-medium">Revisar</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={suggestedOnly ? "secondary" : "outline"}
                  aria-pressed={suggestedOnly}
                  onClick={() => setFilter("suggestedOnly", !suggestedOnly)}
                >
                  <Sparkles />
                  Sugeridas por IA ({suggestedCount})
                </Button>
                {suggestedOnly && filtered.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void confirmShown()}
                  >
                    Confirmar {filtered.length === 1 ? "la sugerencia" : "todas"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <Button type="button" variant="ghost" onClick={resetFilters}>
              Limpiar filtros
            </Button>
          )}

          {understood !== null && understood.chips.length > 0 && (
            <div
              aria-label="Lo que se entendió de la búsqueda"
              className="arrive flex basis-full flex-wrap items-center gap-2"
            >
              <AiMark reason="Lo que la IA entendió de tu búsqueda, aplicado como filtros. Lo demás se busca como texto." />
              {understood.chips.map((chip) => (
                <RemovableBadge
                  key={chip.tokens.join(",")}
                  removeLabel={`Quitar ${chip.label}`}
                  onRemove={() => setFilter("search", withoutChips(search, [chip]))}
                >
                  {chip.label}
                </RemovableBadge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Loading
            when={isLoading}
            placeholder={<LoadingRows rows={6} className="py-2" />}
          >
            {filtered.length === 0 ? (
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
                    <TableBody ref={tableBody}>
                      {visible.map((transaction) => (
                        <TableRow
                          key={transaction.id}
                          data-transaction-id={transaction.id}
                          // Room above and below when a saved row is brought
                          // into view, so it does not land under the toast
                          // that announces it.
                          // A click anywhere on the row opens it in the
                          // inspector. The pencil does the same from the
                          // keyboard, which cannot reach a row.
                          onClick={() => openInspector(transaction)}
                          data-selected={transaction.id === inspectedId || undefined}
                          className={cn(
                            "scroll-my-24 cursor-pointer",
                            transaction.id === justWritten && "just-written",
                            transaction.id === inspectedId && "bg-muted",
                          )}
                        >
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDate(transaction.date)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span>{labelOf(transaction)}</span>
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
                            {aiEnabled && transaction.category_suggested === 1 && (
                              <AiMark className="ml-2 align-middle" />
                            )}
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
                          <TableCell>
                            {TRANSACTION_TYPE_LABELS[transaction.type]}
                          </TableCell>
                          <TableCell className="text-right font-medium whitespace-nowrap">
                            {transaction.type === "transfer" ? (
                              <TransferAmount transaction={transaction} />
                            ) : (
                              <SignedAmount
                                amount={transaction.amount}
                                currency={transaction.currency}
                                type={transaction.type}
                              />
                            )}
                          </TableCell>
                          {/* Its own buttons, not a click on the row: deleting
                              a row should not also open it. */}
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <div className="row-actions flex items-center gap-1">
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
                                    "text-muted-foreground",
                                )}
                                onClick={() => openInspector(transaction)}
                              >
                                <Paperclip />
                                <span className="sr-only">
                                  Comprobantes de {labelOf(transaction)}
                                </span>
                              </ActionButton>
                              <ActionButton
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                label="Editar"
                                onClick={() => openInspector(transaction)}
                              >
                                <Pencil />
                                <span className="sr-only">
                                  Editar {labelOf(transaction)}
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
                                  Eliminar {labelOf(transaction)}
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
          </Loading>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar esta transacción?"
        description={
          <>
            Se eliminará «{pendingDeletion ? labelOf(pendingDeletion) : ""}» del{" "}
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
        categories={categories}
        categoryRules={categoryRules}
        tags={tags}
        paymentMethods={paymentMethods}
        defaultCurrency={currency}
        draft={draft}
        aiEnabled={aiEnabled}
        categoryModel={categoryModel}
        merchantHistory={merchantHistory}
        onSubmitTransaction={handleSubmitTransaction}
      />

      {inspected !== null && (
        <TransactionInspector
          key={inspected.id}
          transaction={inspected}
          onClose={closeInspector}
        />
      )}
    </div>
  );
}
