import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { ReportedError } from "@/lib/reportedError";
import { transactionCount } from "@/lib/transactionCounts";
import {
  deleteAttachment,
  deleteBudget,
  deleteCategory,
  deleteInstallmentPlan,
  deleteLoan,
  deleteSavingsContribution,
  deleteSavingsGoal,
  deleteRecurringTransaction,
  deleteCategoryRule,
  deletePaymentMethod,
  deleteTransaction,
  EXCHANGE_RATE_TYPE,
  NOTIFICATIONS_ENABLED,
  getSetting,
  LAST_BACKUP_AT,
  LAST_SEEN_CLOSE,
  initDatabase,
  insertAttachment,
  insertBudget,
  insertCategory,
  insertInstallmentPlan,
  insertLoan,
  insertSavingsContribution,
  insertSavingsGoal,
  insertRecurringTransaction,
  insertCategoryRule,
  insertPaymentMethod,
  insertTransactionWithTags,
  insertTransactions,
  listBudgets,
  listCategories,
  listInstallmentPlans,
  listLoans,
  listSavingsContributions,
  listSavingsGoals,
  listExchangeRates,
  listExpectedMovements,
  insertExpectedMovement,
  updateExpectedMovement,
  deleteExpectedMovement,
  confirmExpectedMovement,
  dismissExpectedMovement,
  listRecurringTransactions,
  listCategoryRules,
  listPaymentMethods,
  listTags,
  listTransactionsWithCategory,
  updateCategory,
  setSetting,
  dismissRecurringOccurrence,
  recordInstallment,
  recordLoanPayment,
  recordRecurringOccurrence,
  recordSteps,
  updateBudget,
  updateInstallmentPlan,
  updateLoan,
  updateSavingsGoal,
  updateCategoryRule,
  updateRecurringTransaction,
  updatePaymentMethod,
  updateTransactionWithTags,
  upsertExchangeRate,
  upsertExchangeRates,
  type BudgetWithCategory,
  type CommitmentStep,
  type Category,
  type CategoryRuleWithCategory,
  type ExchangeRate,
  type ExpectedMovementWithNames,
  type NewAttachment,
  type InstallmentPlanWithNames,
  type LoanWithNames,
  type NewBudget,
  type NewInstallmentPlan,
  type NewLoan,
  type NewSavingsGoal,
  type SavingsContribution,
  type SavingsGoalWithNames,
  type NewCategoryRule,
  type NewRecurringTransaction,
  type NewCategory,
  type NewPaymentMethod,
  type NewExpectedMovement,
  type NewTransaction,
  type PaymentMethod,
  type RecurringTransactionWithNames,
  type Tag,
  type TransactionWithCategory,
  type Undo,
} from "@/db";
import {
  DEFAULT_RATE_TYPE,
  fetchRate,
  fetchRateHistory,
  isRateType,
  MANUAL_RATE_SOURCE,
  withRate,
} from "@/lib/exchangeRate";
import type { RateType } from "@/lib/exchangeRate";
import { todayIsoDate } from "@/lib/format";
import { useNotifications } from "@/hooks/useNotifications";
import { useToday } from "@/hooks/useToday";
import { collectPendingCommitments } from "@/lib/pendingCommitments";
import type { PendingCommitments } from "@/lib/pendingCommitments";

// How long a toast that can undo stays up. Longer than a plain one: it has to
// be read and decided on, not just noticed.
const UNDO_TOAST_DURATION = 8000;

// The parts of the data a write can change, so that it reads back only those.
// Reading everything after every write re-sent the whole ledger over IPC to
// create a budget, and gave every list a new identity, which re-ran every memo
// in every mounted view.
type Domain =
  // With the tags, which exist only on transactions.
  | "transactions"
  | "categories"
  | "paymentMethods"
  | "categoryRules"
  | "budgets"
  | "recurring"
  | "installments"
  | "loans"
  | "expected"
  // Goals and their contributions.
  | "savings";

// What a step of "Registrar todas" moves on, besides the ledger it writes to.
const STEP_DOMAIN = {
  installment: "installments",
  loan: "loans",
  recurring: "recurring",
} as const satisfies Record<CommitmentStep["kind"], Domain>;

// What registering any commitment writes to besides the commitment itself: the
// ledger, and the accounts, since a commitment with no account files its
// movement under a «Sin asignar» account the write may have just created.
const LEDGER_FROM_COMMITMENT = [
  "transactions",
  "paymentMethods",
] as const satisfies readonly Domain[];

// For a write whose effects reach every list: the lists show category and
// account names through joins, so editing or deleting one touches them all.
// The exchange rates are not a domain: no write here changes them.
const EVERY_DOMAIN: readonly Domain[] = [
  "transactions",
  "categories",
  "paymentMethods",
  "categoryRules",
  "budgets",
  "recurring",
  "installments",
  "loans",
  "expected",
  "savings",
];

export interface AppData {
  transactions: TransactionWithCategory[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  categoryRules: CategoryRuleWithCategory[];
  tags: Tag[];
  budgets: BudgetWithCategory[];
  recurring: RecurringTransactionWithNames[];
  installmentPlans: InstallmentPlanWithNames[];
  loans: LoanWithNames[];
  expectedMovements: ExpectedMovementWithNames[];
  savingsGoals: SavingsGoalWithNames[];
  savingsContributions: SavingsContribution[];
  // Latest known MEP quote, or null before the very first successful fetch.
  // Which dollar the app values foreign movements at. Persisted, because a
  // conversion that silently changes meaning between launches is worse than no
  // conversion at all.
  rateType: RateType;
  exchangeRate: ExchangeRate | null;
  // Every cached quote, used to value each movement at the rate of its own
  // date instead of restating the past at today's.
  exchangeRateHistory: ExchangeRate[];
  // When the last backup was taken, or null if there has never been one.
  lastBackupAt: string | null;
  // The last month whose close the user acted on, so the notice can stop
  // asking about it. Null until they deal with their first one.
  lastSeenClose: string | null;
  // Whether the app may raise system notifications. Persisted, so turning them
  // off is a decision and not something that resets on the next launch.
  notificationsEnabled: boolean;
  // Today's date, moving on at midnight with the app left open (see useToday).
  // What depends on the date reads it from here, so it re-renders when the
  // day changes instead of keeping the day it was first drawn on.
  today: string;
  // What is waiting to be registered or dismissed as of `today`, worked out
  // once for every screen that shows it (see collectPendingCommitments).
  pending: PendingCommitments;
  isLoading: boolean;
}

// Whether work is in progress. Kept apart from the data: it flips twice for
// every write and every download, and a component that only shows the data
// has no reason to render on either.
export interface AppStatus {
  isMutating: boolean;
  isRefreshingRate: boolean;
}

// Everything the app can do to its data. The same functions for the life of
// the provider, so reading them never causes a render.
export interface AppActions {
  addTransaction: (transaction: NewTransaction, tags: string[]) => Promise<void>;
  editTransaction: (
    id: number,
    transaction: NewTransaction,
    tags: string[],
  ) => Promise<void>;
  removeTransaction: (id: number) => Promise<void>;
  importTransactions: (
    entries: { transaction: NewTransaction; tags: string[] }[],
  ) => Promise<void>;

  addSavingsGoal: (goal: NewSavingsGoal) => Promise<void>;
  editSavingsGoal: (id: number, goal: NewSavingsGoal) => Promise<void>;
  removeSavingsGoal: (id: number) => Promise<void>;
  addSavingsContribution: (
    goalId: number,
    amount: number,
    date: string,
    note: string | null,
  ) => Promise<void>;
  removeSavingsContribution: (id: number) => Promise<void>;

  addLoan: (loan: NewLoan) => Promise<void>;
  editLoan: (id: number, loan: NewLoan) => Promise<void>;
  removeLoan: (id: number) => Promise<void>;
  // Records the payment as a real movement and advances the loan by one, as a
  // single write: neither can land without the other.
  confirmLoanPayment: (
    id: number,
    index: number,
    date: string,
    amount: number,
  ) => Promise<void>;

  addInstallmentPlan: (plan: NewInstallmentPlan) => Promise<void>;
  editInstallmentPlan: (id: number, plan: NewInstallmentPlan) => Promise<void>;
  removeInstallmentPlan: (id: number) => Promise<void>;
  // Records one instalment as paid: writes the movement and advances the plan.
  confirmInstallment: (
    id: number,
    index: number,
    date: string,
    amount: number,
  ) => Promise<void>;

  addRecurring: (recurring: NewRecurringTransaction) => Promise<void>;
  editRecurring: (id: number, recurring: NewRecurringTransaction) => Promise<void>;
  removeRecurring: (id: number) => Promise<void>;
  // Turns one proposed occurrence into a real transaction and moves the series
  // past it, so it is never proposed twice.
  confirmRecurring: (id: number, date: string) => Promise<void>;
  // Decides against an occurrence without recording anything, moving the series
  // past it just the same.
  dismissRecurring: (id: number, date: string) => Promise<void>;
  // Records every step as one write, all of them or none (see recordSteps),
  // with one toast whose \"Deshacer\" takes the lot back.
  registerAll: (steps: CommitmentStep[]) => Promise<void>;

  // Attachments are not held in context: only their count travels with the
  // transaction list, and the bytes are fetched by the dialog that shows them.
  addAttachment: (attachment: NewAttachment) => Promise<void>;
  removeAttachment: (id: number) => Promise<void>;

  addExpected: (movement: NewExpectedMovement) => Promise<void>;
  editExpected: (id: number, movement: NewExpectedMovement) => Promise<void>;
  removeExpected: (id: number) => Promise<void>;
  // Records the movement as having happened: writes the real transaction and
  // keeps its id, so the two never drift and a mistaken confirmation can be
  // traced back.
  confirmExpected: (id: number) => Promise<void>;
  // Decides against it. Nothing is recorded, and it stops being proposed —
  // which is the same gesture `dismissRecurring` offers, for the same reason.
  dismissExpected: (id: number) => Promise<void>;

  addBudget: (budget: NewBudget) => Promise<void>;
  editBudget: (id: number, budget: NewBudget) => Promise<void>;
  removeBudget: (id: number) => Promise<void>;

  addCategoryRule: (rule: NewCategoryRule) => Promise<void>;
  editCategoryRule: (id: number, rule: NewCategoryRule) => Promise<void>;
  removeCategoryRule: (id: number) => Promise<void>;

  addCategory: (category: NewCategory) => Promise<void>;
  editCategory: (id: number, category: NewCategory) => Promise<void>;
  removeCategory: (id: number) => Promise<void>;

  addPaymentMethod: (method: NewPaymentMethod) => Promise<void>;
  editPaymentMethod: (id: number, method: NewPaymentMethod) => Promise<void>;
  removePaymentMethod: (id: number) => Promise<void>;

  setRateType: (type: RateType) => Promise<void>;
  refreshExchangeRate: (options?: { silent?: boolean }) => Promise<void>;
  saveManualExchangeRate: (buy: number, sell: number) => Promise<void>;
  // Downloads the whole historical series. Explicit rather than automatic:
  // it is a few thousand records and only needs doing once.
  backfillExchangeRates: () => Promise<number>;
  // Called after a backup actually lands on disk, so the reminder measures
  // real copies rather than attempts.
  recordBackup: () => Promise<void>;
  // Records that a month's close has been dealt with. Takes the month rather
  // than assuming the latest, so acting on an older one still settles it.
  markCloseSeen: (monthKey: string) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AppDataContext = createContext<AppData | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export const AppActionsContext = createContext<AppActions | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export const AppStatusContext = createContext<AppStatus | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [categoryRules, setCategoryRules] = useState<CategoryRuleWithCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithCategory[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransactionWithNames[]>([]);
  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlanWithNames[]>(
    [],
  );
  const [loans, setLoans] = useState<LoanWithNames[]>([]);
  const [expectedMovements, setExpectedMovements] = useState<ExpectedMovementWithNames[]>(
    [],
  );
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoalWithNames[]>([]);
  const [savingsContributions, setSavingsContributions] = useState<SavingsContribution[]>(
    [],
  );
  const [rateType, setRateTypeState] = useState<RateType>(DEFAULT_RATE_TYPE);
  const [exchangeRateHistory, setExchangeRateHistory] = useState<ExchangeRate[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastSeenClose, setLastSeenClose] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isRefreshingRate, setIsRefreshingRate] = useState(false);
  // The type in force right now, readable from inside a fetch that started
  // under a previous one (see refreshExchangeRate). State alone cannot do that:
  // a callback only ever sees the render it was created in.
  const currentRateType = useRef<RateType>(DEFAULT_RATE_TYPE);
  // The toast currently offering "Deshacer", if any.
  const undoToast = useRef<string | number | null>(null);

  // Reads the lists of these domains, and only once every one has arrived puts
  // them in state, together: no render sees one list moved on and another,
  // changed by the same write, not yet.
  const reload = useCallback(async (domains: readonly Domain[]) => {
    const updates = await Promise.all(
      domains.map(async (domain): Promise<() => void> => {
        switch (domain) {
          case "transactions": {
            const [rows, tagRows] = await Promise.all([
              listTransactionsWithCategory(),
              listTags(),
            ]);
            return () => {
              setTransactions(rows);
              setTags(tagRows);
            };
          }
          case "categories": {
            const rows = await listCategories();
            return () => setCategories(rows);
          }
          case "paymentMethods": {
            const rows = await listPaymentMethods();
            return () => setPaymentMethods(rows);
          }
          case "categoryRules": {
            const rows = await listCategoryRules();
            return () => setCategoryRules(rows);
          }
          case "budgets": {
            const rows = await listBudgets();
            return () => setBudgets(rows);
          }
          case "recurring": {
            const rows = await listRecurringTransactions();
            return () => setRecurring(rows);
          }
          case "installments": {
            const rows = await listInstallmentPlans();
            return () => setInstallmentPlans(rows);
          }
          case "loans": {
            const rows = await listLoans();
            return () => setLoans(rows);
          }
          case "expected": {
            const rows = await listExpectedMovements();
            return () => setExpectedMovements(rows);
          }
          case "savings": {
            const [goals, contributions] = await Promise.all([
              listSavingsGoals(),
              listSavingsContributions(),
            ]);
            return () => {
              setSavingsGoals(goals);
              setSavingsContributions(contributions);
            };
          }
        }
      }),
    );
    for (const update of updates) update();
  }, []);

  // Everything, once, at start-up. The settings and the rate history are read
  // only here: each is changed afterwards by its own setter, which puts the
  // new value in state itself.
  const load = useCallback(async () => {
    await initDatabase();

    // Which series to load has to be known before the queries go out, so this
    // one setting is read on its own rather than inside the batch below.
    const storedRateType = await getSetting(EXCHANGE_RATE_TYPE);
    const activeRateType = isRateType(storedRateType)
      ? storedRateType
      : DEFAULT_RATE_TYPE;

    const [cachedHistory, storedLastBackup, storedSeenClose, storedNotifications] =
      await Promise.all([
        listExchangeRates(activeRateType),
        getSetting(LAST_BACKUP_AT),
        getSetting(LAST_SEEN_CLOSE),
        getSetting(NOTIFICATIONS_ENABLED),
        reload(EVERY_DOMAIN),
      ]);
    currentRateType.current = activeRateType;
    setRateTypeState(activeRateType);
    setExchangeRateHistory(cachedHistory);
    setLastBackupAt(storedLastBackup);
    setLastSeenClose(storedSeenClose);
    // Absent means "never chosen", and the useful default is on.
    setNotificationsEnabledState(storedNotifications !== "false");
  }, [reload]);

  // The quote on screen is the last of the series rather than a copy kept
  // beside it: two copies were two things to keep in step, and one of them
  // was a query of its own on every reload.
  const today = useToday();
  const pending = useMemo(
    () =>
      collectPendingCommitments(
        { recurring, installmentPlans, loans, expectedMovements },
        today,
      ),
    [recurring, installmentPlans, loans, expectedMovements, today],
  );

  const exchangeRate = useMemo(
    () => exchangeRateHistory.at(-1) ?? null,
    [exchangeRateHistory],
  );

  // Fetches the current quote and caches it. A failure is not exceptional —
  // the app is local-first and expected to run offline — so the cached rate is
  // kept and only an explicit, user-triggered refresh reports the problem.
  //
  // The type is read from the ref rather than from state, here and in the two
  // callbacks below, so that none of them changes when the type does: an
  // action that changed identity would re-render everything holding it.
  const refreshExchangeRate = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      setIsRefreshingRate(true);
      try {
        const rate = await fetchRate(currentRateType.current);
        await upsertExchangeRate(rate);
        // The user may have switched types while this was on the wire. The
        // quote is still worth caching, but showing it now would put the old
        // type's figure under the new type's name.
        if (rate.rate_type !== currentRateType.current) return;
        setExchangeRateHistory((history) => withRate(history, rate));
        if (!silent) toast.success("Cotización actualizada");
      } catch (error) {
        console.error("Failed to refresh the exchange rate:", error);
        if (!silent) {
          toast.error("No se pudo obtener la cotización", { id: "exchange-rate" });
        }
      } finally {
        setIsRefreshingRate(false);
      }
    },
    [],
  );

  // Switching rates keeps whatever was already downloaded for the new one and
  // shows it immediately. Nothing is deleted: the old series stays cached, so
  // changing back is instant rather than another multi-thousand-record
  // download.
  //
  // The network is left to the effect below that refreshes the rate: it runs
  // again on a change of type, so changing the type already fetches once. Fetching
  // here as well downloaded and wrote every switch twice.
  const setRateType = useCallback(async (type: RateType) => {
    await setSetting(EXCHANGE_RATE_TYPE, type);

    const cachedHistory = await listExchangeRates(type);

    // Switched only once the cache is in hand, all in one render: the switch is
    // what starts the fetch, and a cached read landing after it would replace
    // the fresh quote with an older one.
    currentRateType.current = type;
    setRateTypeState(type);
    setExchangeRateHistory(cachedHistory);
  }, []);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    await setSetting(NOTIFICATIONS_ENABLED, enabled ? "true" : "false");
    setNotificationsEnabledState(enabled);
  }, []);

  const markCloseSeen = useCallback(async (monthKey: string) => {
    await setSetting(LAST_SEEN_CLOSE, monthKey);
    setLastSeenClose(monthKey);
  }, []);

  const recordBackup = useCallback(async () => {
    const takenAt = new Date().toISOString();
    await setSetting(LAST_BACKUP_AT, takenAt);
    setLastBackupAt(takenAt);
  }, []);

  const backfillExchangeRates = useCallback(async () => {
    const type = currentRateType.current;
    setIsRefreshingRate(true);
    try {
      const history = await fetchRateHistory(type);
      const written = await upsertExchangeRates(history);
      const stored = await listExchangeRates(type);
      // The same guard as refreshExchangeRate: a switch while this was on the
      // wire leaves the series stored, but not shown under the new type.
      if (type === currentRateType.current) setExchangeRateHistory(stored);
      toast.success(`${written} cotizaciones guardadas`);
      return written;
    } catch (error) {
      console.error("Failed to back-fill the exchange rate history:", error);
      toast.error("No se pudo traer el histórico de cotizaciones");
      return 0;
    } finally {
      setIsRefreshingRate(false);
    }
  }, []);

  // A manual correction is stored under today's date, overwriting whatever was
  // fetched for today, and is marked as such so the UI can say so.
  const saveManualExchangeRate = useCallback(async (buy: number, sell: number) => {
    const rate: ExchangeRate = {
      date: todayIsoDate(),
      rate_type: currentRateType.current,
      buy,
      sell,
      source: MANUAL_RATE_SOURCE,
      fetched_at: new Date().toISOString(),
    };
    try {
      await upsertExchangeRate(rate);
      setExchangeRateHistory((history) => withRate(history, rate));
      toast.success("Cotización guardada");
    } catch (error) {
      console.error("Failed to save the manual exchange rate:", error);
      toast.error("No se pudo guardar la cotización");
      throw new ReportedError(error);
    }
  }, []);

  useEffect(() => {
    // Loading the database on mount is what an effect is for. The rule fires
    // because `refresh` eventually sets state, but it does so after an await:
    // this reads an external system, it does not derive state from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .catch((error) => {
        console.error("Failed to load application data:", error);
        // Stable id so a retry (or StrictMode's double effect in dev) replaces
        // the toast instead of stacking duplicates.
        toast.error("No se pudieron cargar los datos", { id: "app-data-load" });
      })
      .finally(() => setIsLoading(false));
  }, [load]);

  // Deliberately waits for the initial load: `load` reads the cached rate
  // from the database, and starting the network fetch in parallel would let a
  // slow read overwrite the fresher figure the fetch just stored.
  //
  // Runs again whenever the type changes, which is what downloads the new
  // type's quote. `refreshExchangeRate` reads the type from a ref and never
  // changes, so the type has to be named here for the effect to see it.
  useEffect(() => {
    if (isLoading) return;
    // Same reason as above: a network fetch whose result arrives long after
    // this effect has returned.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshExchangeRate({ silent: true });
  }, [isLoading, rateType, refreshExchangeRate]);

  // Every mutation reads back what it touched, so a change made in one view is
  // immediately reflected in the statistics and in every other view — and
  // only what it touched, so the rest keep their identity and their memos.
  //
  // The write and the reload are reported separately. A reload that fails after
  // the write went through is not a failed mutation: saying "No se pudo…" there
  // invited a retry that wrote the same thing twice.
  //
  // A step that hands back how to take it back gets a "Deshacer" in its toast,
  // when asked to offer one: undo instead of a confirmation in front of every
  // "Registrar" and "Descartar".
  const runMutation = useCallback(
    async function run(
      mutation: () => Promise<Undo | null | void>,
      touches: readonly Domain[],
      successMessage: string,
      errorMessage: string,
      { offerUndo = false }: { offerUndo?: boolean } = {},
    ): Promise<void> {
      // "Deshacer" takes back the last thing done, and only that. Once anything
      // else is written the offer goes, rather than staying up to fail its
      // compare-and-set when clicked.
      if (undoToast.current !== null) {
        toast.dismiss(undoToast.current);
        undoToast.current = null;
      }

      setIsMutating(true);
      try {
        let undo: Undo | null | void;
        try {
          undo = await mutation();
        } catch (error) {
          console.error(`${errorMessage}:`, error);
          toast.error(errorMessage);
          // Rethrown so whatever awaited it stops — a dialog stays open with
          // what was typed — but marked, so nothing adds a second message.
          throw new ReportedError(error);
        }

        if (offerUndo && typeof undo === "function") {
          const takeBack = undo;
          undoToast.current = toast.success(successMessage, {
            duration: UNDO_TOAST_DURATION,
            action: {
              label: "Deshacer",
              onClick: () => {
                // Nothing waits on the undo, and a failure has already been
                // told to the user by `run` itself. It touches what the step
                // touched.
                run(takeBack, touches, "Se deshizo", "No se pudo deshacer").catch(
                  () => {},
                );
              },
            },
          });
        } else {
          toast.success(successMessage);
        }

        try {
          await reload(touches);
        } catch (error) {
          console.error("Failed to reload the data after a mutation:", error);
          toast.error("No se pudieron recargar los datos", { id: "app-data-reload" });
        }
      } finally {
        setIsMutating(false);
      }
    },
    [reload],
  );

  const data = useMemo<AppData>(
    () => ({
      transactions,
      categories,
      paymentMethods,
      categoryRules,
      tags,
      budgets,
      recurring,
      installmentPlans,
      loans,
      expectedMovements,
      savingsGoals,
      savingsContributions,
      rateType,
      exchangeRate,
      exchangeRateHistory,
      lastBackupAt,
      lastSeenClose,
      notificationsEnabled,
      today,
      pending,
      isLoading,
    }),
    [
      transactions,
      categories,
      paymentMethods,
      categoryRules,
      tags,
      budgets,
      recurring,
      installmentPlans,
      loans,
      expectedMovements,
      savingsGoals,
      savingsContributions,
      rateType,
      exchangeRate,
      exchangeRateHistory,
      lastBackupAt,
      lastSeenClose,
      notificationsEnabled,
      today,
      pending,
      isLoading,
    ],
  );

  const status = useMemo<AppStatus>(
    () => ({ isMutating, isRefreshingRate }),
    [isMutating, isRefreshingRate],
  );

  // Built from callbacks that never change, so this object never does either.
  const actions = useMemo<AppActions>(
    () => ({
      setRateType,
      refreshExchangeRate,
      saveManualExchangeRate,
      backfillExchangeRates,
      recordBackup,
      markCloseSeen,
      setNotificationsEnabled,

      addTransaction: (transaction, transactionTags) =>
        runMutation(
          async () => {
            await insertTransactionWithTags(transaction, transactionTags);
          },
          ["transactions"],
          "Transacción agregada",
          "No se pudo agregar la transacción",
        ),
      editTransaction: (id, transaction, transactionTags) =>
        runMutation(
          () => updateTransactionWithTags(id, transaction, transactionTags),
          ["transactions"],
          "Transacción actualizada",
          "No se pudo actualizar la transacción",
        ),
      removeTransaction: (id) =>
        runMutation(
          () => deleteTransaction(id),
          ["transactions", "expected"],
          "Transacción eliminada",
          "No se pudo eliminar la transacción",
        ),
      importTransactions: (imported) =>
        runMutation(
          () => insertTransactions(imported),
          ["transactions"],
          transactionCount(imported.length, "importada"),
          "No se pudieron importar las transacciones",
        ),

      addSavingsGoal: (goal) =>
        runMutation(
          () => insertSavingsGoal(goal),
          ["savings"],
          "Objetivo creado",
          "No se pudo crear el objetivo",
        ),
      editSavingsGoal: (id, goal) =>
        runMutation(
          () => updateSavingsGoal(id, goal),
          ["savings"],
          "Objetivo actualizado",
          "No se pudo actualizar el objetivo",
        ),
      removeSavingsGoal: (id) =>
        runMutation(
          () => deleteSavingsGoal(id),
          ["savings"],
          "Objetivo eliminado",
          "No se pudo eliminar el objetivo",
        ),
      addSavingsContribution: (goalId, amount, date, note) =>
        runMutation(
          () => insertSavingsContribution(goalId, amount, date, note),
          ["savings"],
          "Aporte registrado",
          "No se pudo registrar el aporte",
        ),
      removeSavingsContribution: (id) =>
        runMutation(
          () => deleteSavingsContribution(id),
          ["savings"],
          "Aporte eliminado",
          "No se pudo eliminar el aporte",
        ),

      addLoan: (loan) =>
        runMutation(
          () => insertLoan(loan),
          ["loans"],
          "Préstamo creado",
          "No se pudo crear el préstamo",
        ),
      editLoan: (id, loan) =>
        runMutation(
          () => updateLoan(id, loan),
          ["loans"],
          "Préstamo actualizado",
          "No se pudo actualizar el préstamo",
        ),
      removeLoan: (id) =>
        runMutation(
          () => deleteLoan(id),
          ["loans"],
          "Préstamo eliminado",
          "No se pudo eliminar el préstamo",
        ),
      confirmLoanPayment: (id, index, date, amount) =>
        runMutation(
          () => recordLoanPayment(id, index, date, amount),
          ["loans", ...LEDGER_FROM_COMMITMENT],
          "Cuota registrada",
          "No se pudo registrar la cuota",
          { offerUndo: true },
        ),

      addInstallmentPlan: (plan) =>
        runMutation(
          () => insertInstallmentPlan(plan),
          ["installments"],
          "Compra en cuotas creada",
          "No se pudo crear la compra en cuotas",
        ),
      editInstallmentPlan: (id, plan) =>
        runMutation(
          () => updateInstallmentPlan(id, plan),
          ["installments"],
          "Compra en cuotas actualizada",
          "No se pudo actualizar la compra en cuotas",
        ),
      removeInstallmentPlan: (id) =>
        runMutation(
          () => deleteInstallmentPlan(id),
          ["installments"],
          "Compra en cuotas eliminada",
          "No se pudo eliminar la compra en cuotas",
        ),
      confirmInstallment: (id, index, date, amount) =>
        runMutation(
          () => recordInstallment(id, index, date, amount),
          ["installments", ...LEDGER_FROM_COMMITMENT],
          "Cuota registrada",
          "No se pudo registrar la cuota",
          { offerUndo: true },
        ),

      addRecurring: (entry) =>
        runMutation(
          () => insertRecurringTransaction(entry),
          ["recurring"],
          "Recurrente creada",
          "No se pudo crear la recurrente",
        ),
      editRecurring: (id, entry) =>
        runMutation(
          () => updateRecurringTransaction(id, entry),
          ["recurring"],
          "Recurrente actualizada",
          "No se pudo actualizar la recurrente",
        ),
      removeRecurring: (id) =>
        runMutation(
          () => deleteRecurringTransaction(id),
          ["recurring"],
          "Recurrente eliminada",
          "No se pudo eliminar la recurrente",
        ),
      confirmRecurring: (id, date) =>
        runMutation(
          () => recordRecurringOccurrence(id, date),
          ["recurring", ...LEDGER_FROM_COMMITMENT],
          "Movimiento registrado",
          "No se pudo registrar el movimiento",
          { offerUndo: true },
        ),
      dismissRecurring: (id, date) =>
        runMutation(
          () => dismissRecurringOccurrence(id, date),
          ["recurring"],
          "Ocurrencia descartada",
          "No se pudo descartar la ocurrencia",
          { offerUndo: true },
        ),

      registerAll: (steps) => {
        const movements = steps.every((step) => step.kind === "recurring");
        const count = steps.length;
        return runMutation(
          () => recordSteps(steps),
          [
            ...LEDGER_FROM_COMMITMENT,
            ...new Set(steps.map((step) => STEP_DOMAIN[step.kind])),
          ],
          movements
            ? count === 1
              ? "1 movimiento registrado"
              : `${count} movimientos registrados`
            : count === 1
              ? "1 cuota registrada"
              : `${count} cuotas registradas`,
          // One write: when it fails, nothing of it went in.
          movements
            ? "No se pudo registrar ningún movimiento"
            : "No se pudo registrar ninguna cuota",
          { offerUndo: true },
        );
      },

      addAttachment: (attachment) =>
        runMutation(
          () => insertAttachment(attachment),
          ["transactions"],
          "Comprobante adjuntado",
          "No se pudo adjuntar el comprobante",
        ),
      removeAttachment: (id) =>
        runMutation(
          () => deleteAttachment(id),
          ["transactions"],
          "Comprobante eliminado",
          "No se pudo eliminar el comprobante",
        ),

      addExpected: (movement) =>
        runMutation(
          () => insertExpectedMovement(movement),
          ["expected"],
          "Movimiento previsto creado",
          "No se pudo crear el movimiento previsto",
        ),
      editExpected: (id, movement) =>
        runMutation(
          () => updateExpectedMovement(id, movement),
          ["expected"],
          "Movimiento previsto actualizado",
          "No se pudo actualizar el movimiento previsto",
        ),
      removeExpected: (id) =>
        runMutation(
          () => deleteExpectedMovement(id),
          ["expected"],
          "Movimiento previsto eliminado",
          "No se pudo eliminar el movimiento previsto",
        ),
      confirmExpected: (id) =>
        runMutation(
          () => confirmExpectedMovement(id),
          ["expected", ...LEDGER_FROM_COMMITMENT],
          "Movimiento registrado",
          "No se pudo registrar el movimiento",
          { offerUndo: true },
        ),
      dismissExpected: (id) =>
        runMutation(
          () => dismissExpectedMovement(id),
          ["expected"],
          "Movimiento descartado",
          "No se pudo descartar el movimiento",
          { offerUndo: true },
        ),

      addBudget: (budget) =>
        runMutation(
          () => insertBudget(budget),
          ["budgets"],
          "Presupuesto creado",
          "No se pudo crear el presupuesto",
        ),
      editBudget: (id, budget) =>
        runMutation(
          () => updateBudget(id, budget),
          ["budgets"],
          "Presupuesto actualizado",
          "No se pudo actualizar el presupuesto",
        ),
      removeBudget: (id) =>
        runMutation(
          () => deleteBudget(id),
          ["budgets"],
          "Presupuesto eliminado",
          "No se pudo eliminar el presupuesto",
        ),

      addCategoryRule: (rule) =>
        runMutation(
          () => insertCategoryRule(rule),
          ["categoryRules"],
          "Regla creada",
          "No se pudo crear la regla",
        ),
      editCategoryRule: (id, rule) =>
        runMutation(
          () => updateCategoryRule(id, rule),
          ["categoryRules"],
          "Regla actualizada",
          "No se pudo actualizar la regla",
        ),
      removeCategoryRule: (id) =>
        runMutation(
          () => deleteCategoryRule(id),
          ["categoryRules"],
          "Regla eliminada",
          "No se pudo eliminar la regla",
        ),

      addCategory: (category) =>
        runMutation(
          () => insertCategory(category),
          ["categories"],
          "Categoría creada",
          "No se pudo crear la categoría",
        ),
      editCategory: (id, category) =>
        runMutation(
          () => updateCategory(id, category),
          EVERY_DOMAIN,
          "Categoría actualizada",
          "No se pudo actualizar la categoría",
        ),
      removeCategory: (id) =>
        runMutation(
          () => deleteCategory(id),
          EVERY_DOMAIN,
          "Categoría eliminada",
          "No se pudo eliminar la categoría",
        ),

      addPaymentMethod: (method) =>
        runMutation(
          () => insertPaymentMethod(method),
          ["paymentMethods"],
          "Cuenta creada",
          "No se pudo crear la cuenta",
        ),
      editPaymentMethod: (id, method) =>
        runMutation(
          () => updatePaymentMethod(id, method),
          EVERY_DOMAIN,
          "Cuenta actualizada",
          "No se pudo actualizar la cuenta",
        ),
      removePaymentMethod: (id) =>
        runMutation(
          () => deletePaymentMethod(id),
          EVERY_DOMAIN,
          "Cuenta eliminada",
          "No se pudo eliminar la cuenta",
        ),
    }),
    [
      setRateType,
      refreshExchangeRate,
      saveManualExchangeRate,
      backfillExchangeRates,
      recordBackup,
      markCloseSeen,
      setNotificationsEnabled,
      runMutation,
    ],
  );

  // Mounted here rather than in a view: the check has to happen whatever screen
  // the user happens to be on, and this is the one place that holds all of the
  // data it needs. Deliberately waits for the initial load — checking against
  // empty arrays would announce nothing and then record that as "seen".
  useNotifications({
    enabled: notificationsEnabled,
    ready: !isLoading,
    sources: { pending, budgets, transactions },
  });

  return (
    <AppActionsContext.Provider value={actions}>
      <AppDataContext.Provider value={data}>
        <AppStatusContext.Provider value={status}>{children}</AppStatusContext.Provider>
      </AppDataContext.Provider>
    </AppActionsContext.Provider>
  );
}
