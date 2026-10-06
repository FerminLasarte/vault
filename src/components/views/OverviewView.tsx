import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { PrintableReport } from "@/components/reports/PrintableReport";
import { PrintableClose } from "@/components/reports/PrintableClose";
import { PrintableSheet } from "@/components/reports/PrintableSheet";
import { buildReport } from "@/lib/report";
import type { ViewProps } from "@/lib/menu";
import { CurrencyFilter } from "@/components/CurrencyFilter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "@/components/filters/CategorySelect";
import { DateRangePicker } from "@/components/DateRangePicker";
import { SummaryBar } from "@/components/SummaryBar";
import { NetWorthBar } from "@/components/NetWorthBar";
import { MonthOverviewCards } from "@/components/MonthOverviewCards";
import { AttentionNotice } from "@/components/AttentionNotice";
import { UncategorisedDialog } from "@/components/UncategorisedDialog";
import { DuplicateDialog } from "@/components/DuplicateDialog";
import { RecurringDialog } from "@/components/RecurringDialog";
import { RecentTransactions } from "@/components/RecentTransactions";
import { UpcomingMonths } from "@/components/UpcomingMonths";
import { CategoryBreakdownChart } from "@/components/charts/CategoryBreakdownChart";
import { IncomeVsExpenseChart } from "@/components/charts/IncomeVsExpenseChart";
import { useAppActions, useAppData } from "@/hooks/useAppData";
import { usePrintRequest } from "@/hooks/usePrintRequest";
import { closeDocumentTitle } from "@/lib/monthlyClose";
import { Printer } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMenuRequest } from "@/hooks/useMenuRequest";
import { useRequestedTab } from "@/hooks/useRequestedTab";
import { useViewState } from "@/hooks/useViewState";
import { DEFAULT_OVERVIEW_TAB, OVERVIEW_TABS } from "@/lib/navigation";
import type { OverviewTab } from "@/lib/navigation";
import {
  applyTransactionFilters,
  availableYears,
  calculateAccountBalances,
  filterByCurrency,
  periodRange,
  totalBalanceByCurrency,
  buildMonthlyTrend,
  calculateBudgetProgress,
  calculateSummary,
  currentMonthKey,
  exceededBudgets,
  getMonthKeysBetween,
  getNextMonthKeys,
  groupByCategory,
  summaryInCurrency,
  yearFromRange,
  yearRange,
} from "@/lib/finance";
import type { AnalysisPeriod } from "@/lib/finance";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { buildAttentionItems } from "@/lib/attention";
import type { AttentionItem } from "@/lib/attention";
import { isDismissed } from "@/lib/ai/state";
import { groupUncategorised } from "@/lib/ai/uncategorised";
import { lateIncome } from "@/lib/ai/lateIncome";
import { priceRises } from "@/lib/ai/priceRises";
import { unregisteredSeries } from "@/lib/ai/unregisteredSeries";
import { nearDuplicates } from "@/lib/ai/nearDuplicates";
import { splitTransfers } from "@/lib/ai/splitTransfers";
import { recurringFromTemplate } from "@/lib/recurring";
import type { NewRecurringTransaction, RecurringTransactionWithNames } from "@/db";
import { buildMonthOverview } from "@/lib/monthOverview";
import { buildMonthlyClose, hasClose, lastClosedMonthKey } from "@/lib/monthlyClose";
import { projectCommitments, projectExpected, withoutEmptyTail } from "@/lib/projection";
import { calculateSavingsProgress } from "@/lib/savings";
import { backupStatus } from "@/lib/backupReminder";
import { parseIsoDate } from "@/lib/format";
import { countPending } from "@/lib/pendingCommitments";
import { consolidateNetWorth, netWorthAdjustments } from "@/lib/netWorth";

// How far ahead the commitments are read. Three months is the horizon a
// monthly schedule makes meaningful: far enough to see an instalment plan
// ending, close enough that nothing in it is guesswork.
const PROJECTED_MONTHS = 3;

// Sentinels for the period selector: the Select needs concrete values, and no
// real year can collide with these.
//
// There is deliberately no "todo el histórico" any more. Income and expenses
// are flows, and a flow summed over every year at once is not a big number but
// a meaningless one — see `recentMonthsRange`. A period is always in force; the
// only question is which.
const RECENT_PERIOD = "__recent__";
const RECENT_PERIOD_LABEL = "Últimos 12 meses";

// Shown, never chosen: it is what the selector reads when the range came from
// the date picker instead of from this list.
const CUSTOM_PERIOD = "__custom__";
const CUSTOM_PERIOD_LABEL = "Personalizado";

// What the AI read from repeating movements, with it switched off.
const NOTHING_REPEATING = { lateIncome: [], rises: [], unregistered: [] };
const NOTHING_IN_THE_LEDGER = { duplicates: [], transfers: [] };

export function OverviewView({ request, tab, onRequestHandled }: ViewProps) {
  const [currentTab, setCurrentTab] = useRequestedTab<OverviewTab>(
    "overview.tab",
    tab,
    OVERVIEW_TABS,
    DEFAULT_OVERVIEW_TAB,
  );

  const {
    transactions,
    categories,
    budgets,
    recurring,
    installmentPlans,
    loans,
    expectedMovements,
    savingsGoals,
    savingsContributions,
    paymentMethods,
    exchangeRate,
    exchangeRateHistory,
    lastBackupAt,
    lastSeenClose,
    today,
    pending,
    aiEnabled,
    aiDismissed,
    categoryRules,
    categoryModel,
    series,
    ledger,
    rateAt,
    isLoading,
  } = useAppData();

  const {
    markCloseSeen,
    addRecurring,
    editRecurring,
    dismissAiSuggestions,
    joinTransfer,
  } = useAppActions();

  const [currency, setCurrency] = useViewState("overview.currency", DEFAULT_CURRENCY);
  const [categoryId, setCategoryId] = useViewState<number | null>(
    "overview.categoryId",
    null,
  );
  // The analysis opens on a real period rather than on the whole history. Held
  // as the choice rather than as its dates, so "Últimos 12 meses" follows
  // today (see periodRange).
  const [period, setPeriod] = useViewState<AnalysisPeriod>("overview.period", {
    kind: "recent",
  });
  const dateRange = useMemo(() => periodRange(period, today), [period, today]);
  // Every figure below that depends on the date reads this rather than the
  // clock, so it moves on at midnight with the rest.
  const reference = useMemo(() => parseIsoDate(today), [today]);

  // Deliberately computed from the unfiltered list: a budget is about the real
  // period total, not about whatever slice the user is currently looking at.
  const overspent = useMemo(
    () => exceededBudgets(calculateBudgetProgress(budgets, transactions, reference)),
    [budgets, transactions, reference],
  );

  // The same figures the savings screen shows, so the card above can only ever
  // agree with it.
  const savingsProgress = useMemo(
    () =>
      calculateSavingsProgress(
        savingsGoals,
        {
          accounts: paymentMethods,
          transactions,
          contributions: savingsContributions,
        },
        today,
      ),
    [savingsGoals, paymentMethods, transactions, savingsContributions, today],
  );

  // What the user is worth, and what that is made of.
  //
  // Taken from the account balances rather than from the transaction totals, so
  // it counts each account's opening balance too, and consolidated by the same
  // function as the accounts screen, so the two can never disagree. In the
  // selected currency, with the other one alongside.
  const netWorth = useMemo(() => {
    const holdings = totalBalanceByCurrency(
      paymentMethods,
      calculateAccountBalances(paymentMethods, transactions),
    );
    const adjustments = netWorthAdjustments(installmentPlans, loans);
    const rate = exchangeRate?.sell ?? 0;

    return {
      holdings,
      worth: consolidateNetWorth(holdings, adjustments, currency, rate),
      convertedNet: consolidateNetWorth(
        holdings,
        adjustments,
        currency === "ARS" ? "USD" : "ARS",
        rate,
      ).net,
    };
  }, [paymentMethods, transactions, installmentPlans, loans, currency, exchangeRate]);

  // Like `overspent` above, built from the unfiltered list: this block is about
  // the month the user is in, not about the slice the filters select. The
  // currency is the exception — totals in two currencies cannot be added.
  const monthOverview = useMemo(
    () =>
      buildMonthOverview(
        { transactions, budgets, savings: savingsProgress },
        currency,
        reference,
      ),
    [transactions, budgets, savingsProgress, currency, reference],
  );

  // What the months ahead already owe. Read from the same schedules the
  // pending notices are read from, only forwards.
  const projection = useMemo(
    () =>
      projectCommitments(
        { recurring, installmentPlans, loans },
        getNextMonthKeys(PROJECTED_MONTHS, currentMonthKey(reference)),
        currency,
      ),
    [recurring, installmentPlans, loans, currency, reference],
  );

  // Deliberately a second projection rather than more fields on the first: see
  // the note on `projectExpected`. The two totals reach the card apart and are
  // never summed on the way.
  const expectedProjection = useMemo(
    () =>
      projectExpected(
        expectedMovements,
        getNextMonthKeys(PROJECTED_MONTHS, currentMonthKey(reference)),
        currency,
      ),
    [expectedMovements, currency, reference],
  );

  // Every kind of pending commitment is surfaced together: separate notices
  // would make it easy to act on one and never notice the others.
  // The same count the sidebar badge shows, from the same list.
  const pendingCount = countPending(pending);

  // Every chart and KPI below reads from this single filtered list, so the
  // three filters combine naturally and recalculate on any change.
  const filtered = useMemo(
    () =>
      applyTransactionFilters(transactions, {
        currency,
        categoryId,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
      }),
    [transactions, currency, categoryId, dateRange],
  );

  // The general tab has no filters beyond the currency, so its list of recent
  // movements follows that alone rather than the analysis filters.
  const recentInCurrency = useMemo(
    () => filterByCurrency(transactions, currency),
    [transactions, currency],
  );

  const backup = useMemo(
    () => backupStatus(lastBackupAt, transactions.length),
    [lastBackupAt, transactions.length],
  );

  // The month that just ended. Always built, whether or not the notice is
  // showing: the printable document has to exist in the DOM before the print
  // dialog opens, and building it costs one pass over the history.
  const closedMonthKey = lastClosedMonthKey(reference);

  const close = useMemo(
    () => buildMonthlyClose(transactions, closedMonthKey),
    [transactions, closedMonthKey],
  );

  // Waiting only while it has something in it and the user has not dealt with
  // it. Announcing an empty month would be telling them their report on nothing
  // is ready.
  // Deliberately independent of the currency the screen is showing: the close
  // covers every currency, so toggling ARS and USD up there must not make the
  // notice come and go.
  const pendingClose =
    hasClose(transactions, closedMonthKey) && lastSeenClose !== closedMonthKey
      ? closedMonthKey
      : null;

  // One list rather than four independent conditions in the markup: what to
  // raise, and in what order, is a decision worth testing on its own.
  // Every currency, like the close: the review happens in Transacciones, where
  // each currency is looked at in turn.
  const suggestedCount = useMemo(
    () =>
      aiEnabled
        ? transactions.filter((transaction) => transaction.category_suggested === 1)
            .length
        : 0,
    [aiEnabled, transactions],
  );

  // Movements nobody categorised that the AI can place, by category. Only with
  // it on, which is when there is a model.
  const uncategorised = useMemo(
    () =>
      categoryModel === null
        ? []
        : groupUncategorised(
            transactions,
            { rules: categoryRules, categories, model: categoryModel },
            (id) => isDismissed(aiDismissed, id, today),
          ),
    [transactions, categoryRules, categories, categoryModel, aiDismissed, today],
  );

  // The group whose dialog is open. Held by id and looked up, so applying it
  // closes the dialog by itself once the group is gone from the list.
  const [reviewing, setReviewing] = useState<string | null>(null);
  const reviewedGroup = uncategorised.find((group) => group.id === reviewing) ?? null;

  // Income that is late, charges that went up and series nobody declared, read
  // from the series the context worked out once.
  const repeating = useMemo(() => {
    if (series === null) return NOTHING_REPEATING;
    const dismissed = (id: string) => isDismissed(aiDismissed, id, today);
    return {
      lateIncome: lateIncome(series, today, dismissed),
      rises: priceRises(series, dismissed),
      unregistered: unregisteredSeries(series, dismissed),
    };
  }, [series, aiDismissed, today]);

  // Movements recorded twice, and transfers that came in as an expense and an
  // income, in the recent history.
  const ledgerProblems = useMemo(
    () =>
      ledger === null
        ? NOTHING_IN_THE_LEDGER
        : {
            duplicates: nearDuplicates(transactions, ledger, today),
            transfers: splitTransfers(transactions, ledger, today),
          },
    [transactions, ledger, today],
  );

  // The pair whose dialog is open, held by id like the group above, so
  // deleting one of them closes it by itself.
  const [comparing, setComparing] = useState<string | null>(null);
  const comparedPair =
    ledgerProblems.duplicates.find((pair) => pair.id === comparing) ?? null;

  // The recurring movement a notice offers to add, or to bring up to a new
  // amount: what the dialog opens with, and the template it edits, if any.
  const [recurringOffer, setRecurringOffer] = useState<{
    editing: RecurringTransactionWithNames | null;
    draft: NewRecurringTransaction;
  } | null>(null);
  // Apart from the offer, so the dialog keeps its title while it closes.
  const [isOfferOpen, setIsOfferOpen] = useState(false);

  function openRecurringOffer(offer: NonNullable<typeof recurringOffer>) {
    setRecurringOffer(offer);
    setIsOfferOpen(true);
  }

  const attention = useMemo(
    () =>
      buildAttentionItems({
        overspent,
        backup,
        pendingCount,
        suggestedCount,
        uncategorised: uncategorised.map((group) => ({
          id: group.id,
          size: group.rows.length,
          categoryName: group.categoryName,
        })),
        ...repeating,
        ...ledgerProblems,
        pendingClose,
      }),
    [
      overspent,
      backup,
      pendingCount,
      suggestedCount,
      uncategorised,
      repeating,
      ledgerProblems,
      pendingClose,
    ],
  );

  // Which of the two documents is visible to the print engine. It takes the
  // whole window, so leaving both printable would staple them together.
  // Two documents share one sheet here: the filtered report the toolbar prints,
  // and the close the notice offers. Which one is mounted follows the request.
  const { request: printRequest, requestPrint } = usePrintRequest<"report" | "close">();

  async function handleAttentionAction(item: AttentionItem) {
    if (item.kind === "uncategorised") {
      setReviewing(item.key);
      return;
    }
    if (item.kind === "duplicate") {
      setComparing(item.key);
      return;
    }
    if (item.kind === "transfer") {
      const offer = ledgerProblems.transfers.find((entry) => entry.id === item.key);
      if (offer) await joinTransfer(offer.join, offer.removed);
      return;
    }
    if (item.kind === "unregistered") {
      const offer = repeating.unregistered.find((entry) => entry.id === item.key);
      if (offer) openRecurringOffer({ editing: null, draft: offer.draft });
      return;
    }
    if (item.kind === "rise") {
      const rise = repeating.rises.find((entry) => entry.id === item.key);
      const template = recurring.find((entry) => entry.id === rise?.recurring?.id);
      if (rise && template) {
        openRecurringOffer({
          editing: template,
          draft: { ...recurringFromTemplate(template), amount: rise.latest },
        });
        return;
      }
      // Nobody declared it: the rise carries the series' own offer to add it.
      const offer = repeating.unregistered.find(
        (entry) => entry.series.id === rise?.series.id,
      );
      if (offer) openRecurringOffer({ editing: null, draft: offer.draft });
      return;
    }
    if (item.kind !== "close") return;
    // Marked as dealt with before printing rather than after: the print dialog
    // never reports whether the user went through with it, and a notice that
    // reappears because they cancelled once would have no way to ever stop.
    await markCloseSeen(closedMonthKey);
    requestPrint("close", closeDocumentTitle(closedMonthKey));
  }

  const report = useMemo(
    () =>
      buildReport(
        { transactions, categories, budgets },
        { currency, categoryId, dateRange },
      ),
    [transactions, categories, budgets, currency, categoryId, dateRange],
  );

  // "Imprimir informe" from the Archivo menu.
  useMenuRequest(request, onRequestHandled, (action) => {
    // Goes through the same request the toolbar button uses rather than calling
    // `printWindow` directly: the sheet holds whichever document was last asked
    // for, so printing without naming one would print the close to a menu entry
    // that says "Imprimir informe".
    if (action === "print-report") requestPrint("report");
  });

  const years = useMemo(() => availableYears(transactions), [transactions]);

  // Derived from the range rather than held separately: with its own state the
  // selector could end up naming a year the charts are no longer showing.
  const selectedYear = yearFromRange(dateRange);

  // The same reasoning for admitting that the range came from the date picker
  // instead of from this list.
  const isRecentPeriod = period.kind === "recent";
  const isCustomPeriod = !isRecentPeriod && selectedYear === null;

  const summary = useMemo(() => calculateSummary(filtered), [filtered]);

  const otherCurrency = currency === "ARS" ? "USD" : "ARS";

  const convertedSummary = useMemo(
    () => summaryInCurrency(filtered, otherCurrency, rateAt),
    [filtered, otherCurrency, rateAt],
  );
  const categoryBreakdown = useMemo(
    () => groupByCategory(filtered, "expense"),
    [filtered],
  );

  // The trend spans the selected period, which is always set — so there is no
  // "no range" case left to invent a default for.
  const monthKeys = useMemo(() => {
    const from = (dateRange.from ?? dateRange.to ?? "").slice(0, 7);
    const to = (dateRange.to ?? dateRange.from ?? "").slice(0, 7);
    return getMonthKeysBetween(from, to);
  }, [dateRange]);

  const monthlyTrend = useMemo(
    () => buildMonthlyTrend(filtered, monthKeys),
    [filtered, monthKeys],
  );

  // The projection is only appended when the period on screen runs up to today.
  // Tacking three future months onto a chart of 2025 would put a gap in the
  // axis and answer a question nobody asked.
  const trendWithProjection = useMemo(() => {
    if ((dateRange.to ?? "") < today) return monthlyTrend;

    return [
      ...monthlyTrend,
      ...withoutEmptyTail(projection).map((month) => ({ ...month, isProjected: true })),
    ];
  }, [monthlyTrend, projection, dateRange, today]);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Resumen"
        description="Cuánto tenés, cómo venís este mes y qué pasó a lo largo del tiempo."
        actions={
          <>
            {/* The currency belongs to the whole screen rather than to either
                tab: both read figures in it, and duplicating the switch inside
                each one would let the two drift apart. */}
            <CurrencyFilter value={currency} onChange={setCurrency} />
            <Button
              type="button"
              variant="outline"
              onClick={() => requestPrint("report")}
            >
              <Printer />
              Imprimir informe
            </Button>
          </>
        }
      />

      {/* Built from the same figures the user is looking at rather than from a
          second set they would have to keep in sync. */}
      <PrintableSheet>
        {printRequest?.target === "close" ? (
          <PrintableClose close={close} generatedAt={report.generatedAt} />
        ) : (
          <PrintableReport report={report} />
        )}
      </PrintableSheet>

      <Tabs
        value={currentTab}
        onValueChange={(next) => setCurrentTab(String(next) as OverviewTab)}
      >
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="analysis">Análisis</TabsTrigger>
        </TabsList>

        {/* Where the user stands right now: what they are worth, how the
            month is going, and what they last did. No period to choose, because every
            figure here already answers to one. */}
        <TabsContent value="general" className="flex flex-col gap-6 pt-6">
          <AttentionNotice
            items={attention}
            onAction={(item) => void handleAttentionAction(item)}
            onDismiss={(item) => {
              if (item.dismissalId !== undefined) {
                void dismissAiSuggestions([item.dismissalId]);
              }
            }}
          />

          <NetWorthBar
            holdings={netWorth.holdings}
            worth={netWorth.worth}
            convertedNet={netWorth.convertedNet}
            currency={currency}
            convertedCurrency={otherCurrency}
            isLoading={isLoading}
          />

          <MonthOverviewCards
            overview={monthOverview}
            currency={currency}
            isLoading={isLoading}
          />

          <UpcomingMonths
            committed={projection}
            expected={expectedProjection}
            currency={currency}
            isLoading={isLoading}
          />

          <RecentTransactions
            transactions={recentInCurrency}
            currency={currency}
            isLoading={isLoading}
          />
        </TabsContent>

        {/* What happened over a stretch of time. Everything here is a flow, so
            everything here is bounded by the period above it. */}
        <TabsContent value="analysis" className="flex flex-col gap-6 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="analysis-category" className="sr-only">
              Categoría
            </Label>
            <CategorySelect
              id="analysis-category"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              className="min-w-52"
            />

            <Label htmlFor="analysis-period" className="sr-only">
              Período
            </Label>
            <Select
              items={{
                [RECENT_PERIOD]: RECENT_PERIOD_LABEL,
                ...(isCustomPeriod ? { [CUSTOM_PERIOD]: CUSTOM_PERIOD_LABEL } : {}),
                ...Object.fromEntries(years.map((year) => [String(year), String(year)])),
              }}
              value={
                isRecentPeriod
                  ? RECENT_PERIOD
                  : isCustomPeriod
                    ? CUSTOM_PERIOD
                    : String(selectedYear)
              }
              onValueChange={(value) =>
                setPeriod(
                  String(value) === RECENT_PERIOD
                    ? { kind: "recent" }
                    : { kind: "range", range: yearRange(Number(value)) },
                )
              }
            >
              <SelectTrigger id="analysis-period" className="min-w-44">
                <SelectValue placeholder={RECENT_PERIOD_LABEL} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={RECENT_PERIOD}>{RECENT_PERIOD_LABEL}</SelectItem>
                {/* Only listed while it is what the range actually is: picking
                    "Personalizado" from a list would mean nothing. */}
                {isCustomPeriod && (
                  <SelectItem value={CUSTOM_PERIOD}>{CUSTOM_PERIOD_LABEL}</SelectItem>
                )}
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label htmlFor="analysis-dates" className="sr-only">
              Rango de fechas
            </Label>
            <DateRangePicker
              id="analysis-dates"
              value={dateRange}
              onChange={(range) =>
                // Clearing the dates means "back to the default window", not
                // "no period at all": the figures below are flows and an
                // unbounded one says nothing.
                setPeriod(
                  range.from === null && range.to === null
                    ? { kind: "recent" }
                    : { kind: "range", range },
                )
              }
            />
          </div>

          <SummaryBar
            summary={summary}
            convertedSummary={convertedSummary}
            convertedCurrency={otherCurrency}
            currency={currency}
            isLoading={isLoading}
            usesHistoricalRates={exchangeRateHistory.length > 0}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategoryBreakdownChart
              data={categoryBreakdown}
              currency={currency}
              isLoading={isLoading}
            />
            <IncomeVsExpenseChart
              data={trendWithProjection}
              currency={currency}
              isLoading={isLoading}
            />
          </div>
        </TabsContent>
      </Tabs>

      <UncategorisedDialog
        key={reviewedGroup?.id}
        group={reviewedGroup}
        onClose={() => setReviewing(null)}
      />

      <DuplicateDialog pair={comparedPair} onClose={() => setComparing(null)} />

      <RecurringDialog
        open={isOfferOpen}
        onOpenChange={setIsOfferOpen}
        editing={recurringOffer?.editing ?? null}
        draft={recurringOffer?.draft}
        categories={categories}
        paymentMethods={paymentMethods}
        onSubmitRecurring={(values) =>
          recurringOffer?.editing
            ? editRecurring(recurringOffer.editing.id, values)
            : addRecurring(values)
        }
      />
    </div>
  );
}
