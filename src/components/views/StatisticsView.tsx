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
import { TotalBalanceCard } from "@/components/TotalBalanceCard";
import { MonthOverviewCards } from "@/components/MonthOverviewCards";
import { AttentionNotice } from "@/components/AttentionNotice";
import { RecentTransactions } from "@/components/RecentTransactions";
import { UpcomingMonths } from "@/components/UpcomingMonths";
import { ExchangeRateBar } from "@/components/ExchangeRateBar";
import { CategoryBreakdownChart } from "@/components/charts/CategoryBreakdownChart";
import { IncomeVsExpenseChart } from "@/components/charts/IncomeVsExpenseChart";
import { useAppData } from "@/hooks/useAppData";
import { usePrintRequest } from "@/hooks/usePrintRequest";
import { Printer } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMenuRequest } from "@/hooks/useMenuRequest";
import { useRequestedTab } from "@/hooks/useRequestedTab";
import { DEFAULT_STATISTICS_TAB, STATISTICS_TABS } from "@/lib/navigation";
import type { StatisticsTab } from "@/lib/navigation";
import {
  applyTransactionFilters,
  availableYears,
  calculateAccountBalances,
  consolidateByCurrency,
  filterByCurrency,
  recentMonthsRange,
  totalBalanceByCurrency,
  buildMonthlyTrend,
  buildRateLookup,
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
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { buildAttentionItems } from "@/lib/attention";
import type { AttentionKind } from "@/lib/attention";
import { buildMonthOverview } from "@/lib/monthOverview";
import { buildMonthlyClose, hasClose, lastClosedMonthKey } from "@/lib/monthlyClose";
import { projectCommitments, projectExpected, withoutEmptyTail } from "@/lib/projection";
import { calculateSavingsProgress } from "@/lib/savings";
import { collectPendingRecurrences } from "@/lib/pendingRecurring";
import { collectPendingInstallments } from "@/lib/pendingInstallments";
import { collectPendingExpected } from "@/lib/expected";
import { collectPendingLoanPayments } from "@/lib/pendingLoans";
import { backupStatus } from "@/lib/backupReminder";
import { todayIsoDate } from "@/lib/format";

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

export function StatisticsView({ request, tab, onRequestHandled }: ViewProps) {
  const [currentTab, setCurrentTab] = useRequestedTab<StatisticsTab>(
    tab,
    STATISTICS_TABS,
    DEFAULT_STATISTICS_TAB,
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
    markCloseSeen,
    isLoading,
  } = useAppData();

  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  // Computed once, on mount: the analysis opens on a real period rather than on
  // the whole history.
  const [dateRange, setDateRange] = useState(recentMonthsRange);

  // Deliberately computed from the unfiltered list: a budget is about the real
  // period total, not about whatever slice the user is currently looking at.
  const overspent = useMemo(
    () => exceededBudgets(calculateBudgetProgress(budgets, transactions)),
    [budgets, transactions],
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
        todayIsoDate(),
      ),
    [savingsGoals, paymentMethods, transactions, savingsContributions],
  );

  // Everything the user holds, in one figure.
  //
  // Taken from the account balances rather than from the transaction totals, so
  // it counts each account's opening balance too and can never disagree with
  // the accounts screen. Consolidated into the selected currency, because a
  // "total" that left out the dollar accounts would not be one — and null
  // rather than approximate when there is no quote to consolidate with.
  const totalBalance = useMemo(() => {
    const perCurrency = totalBalanceByCurrency(
      paymentMethods,
      calculateAccountBalances(paymentMethods, transactions),
    );
    const rate = exchangeRate?.sell ?? 0;

    return {
      perCurrency,
      unified: consolidateByCurrency(perCurrency, currency, rate),
      unifiedConverted: consolidateByCurrency(
        perCurrency,
        currency === "ARS" ? "USD" : "ARS",
        rate,
      ),
    };
  }, [paymentMethods, transactions, currency, exchangeRate]);

  // Like `overspent` above, built from the unfiltered list: this block is about
  // the month the user is in, not about the slice the filters select. The
  // currency is the exception — totals in two currencies cannot be added.
  const monthOverview = useMemo(
    () =>
      buildMonthOverview({ transactions, budgets, savings: savingsProgress }, currency),
    [transactions, budgets, savingsProgress, currency],
  );

  // What the months ahead already owe. Read from the same schedules the
  // pending notices are read from, only forwards.
  const projection = useMemo(
    () =>
      projectCommitments(
        { recurring, installmentPlans, loans },
        getNextMonthKeys(PROJECTED_MONTHS, currentMonthKey()),
        currency,
      ),
    [recurring, installmentPlans, loans, currency],
  );

  // Deliberately a second projection rather than more fields on the first: see
  // the note on `projectExpected`. The two totals reach the card apart and are
  // never summed on the way.
  const expectedProjection = useMemo(
    () =>
      projectExpected(
        expectedMovements,
        getNextMonthKeys(PROJECTED_MONTHS, currentMonthKey()),
        currency,
      ),
    [expectedMovements, currency],
  );

  // Every kind of pending commitment is surfaced together: separate notices
  // would make it easy to act on one and never notice the others.
  const pendingCount = useMemo(
    () =>
      collectPendingRecurrences(recurring, todayIsoDate()).length +
      collectPendingInstallments(installmentPlans, todayIsoDate()).length +
      collectPendingLoanPayments(loans, todayIsoDate()).length +
      collectPendingExpected(expectedMovements, todayIsoDate()).length,
    [recurring, installmentPlans, loans, expectedMovements],
  );

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

  // The summary has no filters beyond the currency, so its list of recent
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
  const closedMonthKey = lastClosedMonthKey();

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
  const attention = useMemo(
    () => buildAttentionItems({ overspent, backup, pendingCount, pendingClose }),
    [overspent, backup, pendingCount, pendingClose],
  );

  // Which of the two documents is visible to the print engine. It takes the
  // whole window, so leaving both printable would staple them together.
  // Two documents share one sheet here: the filtered report the toolbar prints,
  // and the close the notice offers. Which one is mounted follows the request.
  const { request: printRequest, requestPrint } = usePrintRequest<"report" | "close">();

  async function handleAttentionAction(kind: AttentionKind) {
    if (kind !== "close") return;
    // Marked as dealt with before printing rather than after: the print dialog
    // never reports whether the user went through with it, and a notice that
    // reappears because they cancelled once would have no way to ever stop.
    await markCloseSeen(closedMonthKey);
    requestPrint("close");
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

  // The same reasoning for the rolling window, and for admitting that the range
  // came from the date picker instead of from this list.
  const defaultRange = recentMonthsRange();
  const isRecentPeriod =
    dateRange.from === defaultRange.from && dateRange.to === defaultRange.to;
  const isCustomPeriod = !isRecentPeriod && selectedYear === null;

  const summary = useMemo(() => calculateSummary(filtered), [filtered]);

  // Built from the cached series so each movement is valued at the rate that
  // was in force on its own date. Falls back to today's quote when no history
  // has been downloaded yet, which is the previous behaviour.
  const rateAt = useMemo(
    () =>
      exchangeRateHistory.length > 0
        ? buildRateLookup(exchangeRateHistory)
        : buildRateLookup(exchangeRate ? [exchangeRate] : []),
    [exchangeRateHistory, exchangeRate],
  );

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
    if ((dateRange.to ?? "") < todayIsoDate()) return monthlyTrend;

    return [
      ...monthlyTrend,
      ...withoutEmptyTail(projection).map((month) => ({ ...month, isProjected: true })),
    ];
  }, [monthlyTrend, projection, dateRange]);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Estadísticas"
        description="Cómo venís este mes, y qué pasó a lo largo del tiempo."
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
        onValueChange={(next) => setCurrentTab(String(next) as StatisticsTab)}
      >
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="analysis">Análisis</TabsTrigger>
        </TabsList>

        {/* Where the user stands right now: what they have, how the month is
            going, and what they last did. No period to choose, because every
            figure here already answers to one. */}
        <TabsContent value="summary" className="flex flex-col gap-6 pt-6">
          <AttentionNotice
            items={attention}
            onAction={(kind) => void handleAttentionAction(kind)}
          />

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Balance</h2>
            <TotalBalanceCard
              perCurrency={totalBalance.perCurrency}
              unified={totalBalance.unified}
              unifiedConverted={totalBalance.unifiedConverted}
              currency={currency}
              convertedCurrency={otherCurrency}
              isLoading={isLoading}
              footer={<ExchangeRateBar />}
            />
          </div>

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
            <Label htmlFor="statistics-category" className="sr-only">
              Categoría
            </Label>
            <CategorySelect
              id="statistics-category"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              className="min-w-52"
            />

            <Label htmlFor="statistics-period" className="sr-only">
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
                setDateRange(
                  String(value) === RECENT_PERIOD
                    ? recentMonthsRange()
                    : yearRange(Number(value)),
                )
              }
            >
              <SelectTrigger id="statistics-period" className="min-w-44">
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

            <Label htmlFor="statistics-dates" className="sr-only">
              Rango de fechas
            </Label>
            <DateRangePicker
              id="statistics-dates"
              value={dateRange}
              onChange={(range) =>
                // Clearing the dates means "back to the default window", not
                // "no period at all": the figures below are flows and an
                // unbounded one says nothing.
                setDateRange(
                  range.from === null && range.to === null ? recentMonthsRange() : range,
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
            footer={<ExchangeRateBar />}
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
    </div>
  );
}
