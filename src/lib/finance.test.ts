import { describe, expect, it } from "vitest";
import type {
  BudgetWithCategory,
  PaymentMethod,
  Transaction,
  TransactionWithCategory,
} from "@/db/schema";
import {
  applyTransactionFilters,
  buildMonthlyTrend,
  calculateSummary,
  currentMonthKey,
  filterByAmountRange,
  filterByCategory,
  filterByCurrency,
  filterBySearch,
  filterByTag,
  filterByDateRange,
  filterByMonth,
  getMonthKeysBetween,
  getRecentMonthKeys,
  groupByCategory,
  sumByType,
  calculateAccountBalances,
  totalBalanceByCurrency,
  convertAmount,
  consolidateByCurrency,
  calculateBudgetProgress,
  exceededBudgets,
  availableYears,
  buildRateLookup,
  convertAtDate,
  yearFromRange,
  recentMonthsRange,
  getNextMonthKeys,
  yearRange,
  summaryInCurrency,
} from "@/lib/finance";

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 1,
    amount: 0,
    type: "expense",
    category_id: null,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "",
    date: "2026-01-01",
    currency: "ARS",
    ...overrides,
  };
}

function makeTransactionWithCategory(
  overrides: Partial<TransactionWithCategory>,
): TransactionWithCategory {
  return {
    ...makeTransaction(overrides),
    category_name: null,
    category_color: null,
    category_icon: null,
    payment_method_name: null,
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  };
}

describe("calculateSummary", () => {
  it("returns zeros for an empty list", () => {
    expect(calculateSummary([])).toEqual({ balance: 0, income: 0, expenses: 0 });
  });

  it("sums income only", () => {
    const transactions = [
      makeTransaction({ id: 1, type: "income", amount: 100 }),
      makeTransaction({ id: 2, type: "income", amount: 50 }),
    ];
    expect(calculateSummary(transactions)).toEqual({
      balance: 150,
      income: 150,
      expenses: 0,
    });
  });

  it("sums expenses only", () => {
    const transactions = [
      makeTransaction({ id: 1, type: "expense", amount: 30 }),
      makeTransaction({ id: 2, type: "expense", amount: 20 }),
    ];
    expect(calculateSummary(transactions)).toEqual({
      balance: -50,
      income: 0,
      expenses: 50,
    });
  });

  it("computes balance as income minus expenses for a mixed list", () => {
    const transactions = [
      makeTransaction({ id: 1, type: "income", amount: 1000 }),
      makeTransaction({ id: 2, type: "expense", amount: 250 }),
      makeTransaction({ id: 3, type: "expense", amount: 150 }),
      makeTransaction({ id: 4, type: "income", amount: 75.5 }),
    ];
    expect(calculateSummary(transactions)).toEqual({
      balance: 675.5,
      income: 1075.5,
      expenses: 400,
    });
  });

  it("handles decimal amounts without accumulating floating point drift beyond cents", () => {
    const transactions = [
      makeTransaction({ id: 1, type: "income", amount: 0.1 }),
      makeTransaction({ id: 2, type: "income", amount: 0.2 }),
    ];
    expect(calculateSummary(transactions).income).toBeCloseTo(0.3, 10);
  });

  it("treats a negative balance correctly when expenses exceed income", () => {
    const transactions = [
      makeTransaction({ id: 1, type: "income", amount: 10 }),
      makeTransaction({ id: 2, type: "expense", amount: 40 }),
    ];
    expect(calculateSummary(transactions).balance).toBe(-30);
  });
});

describe("sumByType", () => {
  it("returns 0 when no transaction matches the type", () => {
    const transactions = [makeTransaction({ type: "expense", amount: 20 })];
    expect(sumByType(transactions, "income")).toBe(0);
  });

  it("ignores transactions of the other type", () => {
    const transactions = [
      makeTransaction({ id: 1, type: "income", amount: 500 }),
      makeTransaction({ id: 2, type: "expense", amount: 500 }),
    ];
    expect(sumByType(transactions, "income")).toBe(500);
    expect(sumByType(transactions, "expense")).toBe(500);
  });
});

describe("currentMonthKey", () => {
  it("formats a reference date as YYYY-MM", () => {
    expect(currentMonthKey(new Date(2026, 6, 24))).toBe("2026-07");
  });

  it("pads single-digit months", () => {
    expect(currentMonthKey(new Date(2026, 0, 5))).toBe("2026-01");
  });
});

describe("filterByMonth", () => {
  it("keeps only transactions whose date falls in the given month", () => {
    const transactions = [
      makeTransaction({ id: 1, date: "2026-07-01" }),
      makeTransaction({ id: 2, date: "2026-07-31" }),
      makeTransaction({ id: 3, date: "2026-06-30" }),
      makeTransaction({ id: 4, date: "2026-08-01" }),
    ];
    const result = filterByMonth(transactions, "2026-07");
    expect(result.map((transaction) => transaction.id)).toEqual([1, 2]);
  });

  it("defaults to the current month when no key is given", () => {
    const transactions = [
      makeTransaction({ id: 1, date: currentMonthKey() + "-15" }),
      makeTransaction({ id: 2, date: "1999-01-01" }),
    ];
    const result = filterByMonth(transactions);
    expect(result.map((transaction) => transaction.id)).toEqual([1]);
  });

  it("returns an empty array when no transaction matches the month", () => {
    const transactions = [makeTransaction({ date: "2026-01-01" })];
    expect(filterByMonth(transactions, "2026-07")).toEqual([]);
  });
});

describe("filterByCurrency", () => {
  it("keeps only transactions in the given currency", () => {
    const transactions = [
      makeTransaction({ id: 1, currency: "ARS" }),
      makeTransaction({ id: 2, currency: "USD" }),
      makeTransaction({ id: 3, currency: "ARS" }),
    ];
    expect(filterByCurrency(transactions, "ARS").map((t) => t.id)).toEqual([1, 3]);
  });

  it("returns an empty array when no transaction matches the currency", () => {
    const transactions = [makeTransaction({ currency: "USD" })];
    expect(filterByCurrency(transactions, "ARS")).toEqual([]);
  });
});

describe("groupByCategory", () => {
  it("sums expense amounts per category and ignores income", () => {
    const transactions = [
      makeTransactionWithCategory({
        id: 1,
        type: "expense",
        amount: 30,
        category_id: 1,
        category_name: "Comida",
        category_color: "#f97316",
      }),
      makeTransactionWithCategory({
        id: 2,
        type: "expense",
        amount: 20,
        category_id: 1,
        category_name: "Comida",
        category_color: "#f97316",
      }),
      makeTransactionWithCategory({
        id: 3,
        type: "income",
        amount: 1000,
        category_id: 2,
        category_name: "Salario",
        category_color: "#10b981",
      }),
    ];
    expect(groupByCategory(transactions, "expense")).toEqual([
      { categoryId: 1, name: "Comida", color: "#f97316", total: 50 },
    ]);
  });

  it("sorts categories by total descending", () => {
    const transactions = [
      makeTransactionWithCategory({
        id: 1,
        type: "expense",
        amount: 10,
        category_id: 1,
        category_name: "Ocio",
        category_color: "#a855f7",
      }),
      makeTransactionWithCategory({
        id: 2,
        type: "expense",
        amount: 90,
        category_id: 2,
        category_name: "Transporte",
        category_color: "#3b82f6",
      }),
    ];
    expect(groupByCategory(transactions, "expense").map((entry) => entry.name)).toEqual([
      "Transporte",
      "Ocio",
    ]);
  });

  it("falls back to a neutral label and color for uncategorized expenses", () => {
    const transactions = [
      makeTransactionWithCategory({
        id: 1,
        type: "expense",
        amount: 15,
        category_id: null,
        category_name: null,
        category_color: null,
      }),
    ];
    expect(groupByCategory(transactions, "expense")).toEqual([
      { categoryId: null, name: "Sin categoría", color: "#94a3b8", total: 15 },
    ]);
  });

  it("returns an empty array when there are no expenses", () => {
    const transactions = [
      makeTransactionWithCategory({ id: 1, type: "income", amount: 100 }),
    ];
    expect(groupByCategory(transactions, "expense")).toEqual([]);
  });
});

describe("getRecentMonthKeys", () => {
  it("returns the requested count of months ending at the reference month", () => {
    expect(getRecentMonthKeys(6, "2026-07")).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });

  it("crosses year boundaries correctly", () => {
    expect(getRecentMonthKeys(3, "2026-01")).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("buildMonthlyTrend", () => {
  it("computes income and expenses for each requested month", () => {
    const transactions = [
      makeTransaction({ id: 1, type: "income", amount: 100, date: "2026-06-01" }),
      makeTransaction({ id: 2, type: "expense", amount: 40, date: "2026-06-15" }),
      makeTransaction({ id: 3, type: "income", amount: 200, date: "2026-07-01" }),
    ];
    expect(buildMonthlyTrend(transactions, ["2026-06", "2026-07"])).toEqual([
      { monthKey: "2026-06", income: 100, expenses: 40 },
      { monthKey: "2026-07", income: 200, expenses: 0 },
    ]);
  });

  it("returns zeros for months with no transactions", () => {
    expect(buildMonthlyTrend([], ["2026-05"])).toEqual([
      { monthKey: "2026-05", income: 0, expenses: 0 },
    ]);
  });
});

describe("filterByDateRange", () => {
  const transactions = [
    makeTransaction({ id: 1, date: "2026-01-10" }),
    makeTransaction({ id: 2, date: "2026-02-15" }),
    makeTransaction({ id: 3, date: "2026-03-20" }),
  ];

  it("includes both bounds", () => {
    expect(
      filterByDateRange(transactions, "2026-01-10", "2026-02-15").map((t) => t.id),
    ).toEqual([1, 2]);
  });

  it("treats a null lower bound as unbounded", () => {
    expect(filterByDateRange(transactions, null, "2026-02-01").map((t) => t.id)).toEqual([
      1,
    ]);
  });

  it("treats a null upper bound as unbounded", () => {
    expect(filterByDateRange(transactions, "2026-02-01", null).map((t) => t.id)).toEqual([
      2, 3,
    ]);
  });

  it("returns everything when both bounds are null", () => {
    expect(filterByDateRange(transactions, null, null)).toHaveLength(3);
  });
});

describe("filterByCategory", () => {
  it("keeps only transactions in the given category", () => {
    const transactions = [
      makeTransaction({ id: 1, category_id: 3 }),
      makeTransaction({ id: 2, category_id: 4 }),
      makeTransaction({ id: 3, category_id: 3 }),
    ];
    expect(filterByCategory(transactions, 3).map((t) => t.id)).toEqual([1, 3]);
  });
});

describe("filterByAmountRange", () => {
  const transactions = [
    makeTransaction({ id: 1, amount: 10 }),
    makeTransaction({ id: 2, amount: 50 }),
    makeTransaction({ id: 3, amount: 100 }),
  ];

  it("includes both bounds", () => {
    expect(filterByAmountRange(transactions, 10, 50).map((t) => t.id)).toEqual([1, 2]);
  });

  it("treats null bounds as unbounded", () => {
    expect(filterByAmountRange(transactions, 50, null).map((t) => t.id)).toEqual([2, 3]);
    expect(filterByAmountRange(transactions, null, 50).map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("getMonthKeysBetween", () => {
  it("returns an inclusive ascending range", () => {
    expect(getMonthKeysBetween("2026-05", "2026-08")).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("crosses year boundaries", () => {
    expect(getMonthKeysBetween("2025-12", "2026-02")).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("keeps the most recent months when the span exceeds the cap", () => {
    expect(getMonthKeysBetween("2020-01", "2026-01", 3)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });

  it("returns an empty array when the range is inverted", () => {
    expect(getMonthKeysBetween("2026-05", "2026-01")).toEqual([]);
  });
});

describe("applyTransactionFilters", () => {
  const transactions = [
    makeTransaction({
      id: 1,
      currency: "ARS",
      category_id: 1,
      amount: 100,
      date: "2026-03-01",
    }),
    makeTransaction({
      id: 2,
      currency: "USD",
      category_id: 1,
      amount: 200,
      date: "2026-03-05",
    }),
    makeTransaction({
      id: 3,
      currency: "ARS",
      category_id: 2,
      amount: 300,
      date: "2026-04-01",
    }),
    makeTransaction({
      id: 4,
      currency: "ARS",
      category_id: 1,
      amount: 400,
      date: "2026-05-01",
    }),
  ];

  it("returns everything when no filter is given", () => {
    expect(applyTransactionFilters(transactions, {})).toHaveLength(4);
  });

  it("ignores null and undefined filter fields", () => {
    expect(
      applyTransactionFilters(transactions, {
        currency: null,
        categoryId: null,
        dateFrom: null,
        dateTo: null,
        minAmount: null,
        maxAmount: null,
      }),
    ).toHaveLength(4);
  });

  it("combines currency, category, date and amount constraints", () => {
    const result = applyTransactionFilters(transactions, {
      currency: "ARS",
      categoryId: 1,
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      minAmount: 50,
      maxAmount: 150,
    });
    expect(result.map((t) => t.id)).toEqual([1]);
  });

  it("returns an empty array when constraints exclude everything", () => {
    expect(
      applyTransactionFilters(transactions, { currency: "ARS", minAmount: 10_000 }),
    ).toEqual([]);
  });
});

function makeAccount(overrides: Partial<PaymentMethod>): PaymentMethod {
  return {
    id: 1,
    name: "Cuenta",
    type: "bank",
    currency: "ARS",
    initial_balance: 0,
    ...overrides,
  };
}

describe("calculateAccountBalances", () => {
  it("starts every account at its initial balance", () => {
    const accounts = [makeAccount({ id: 1, initial_balance: 500 })];
    expect(calculateAccountBalances(accounts, []).get(1)).toBe(500);
  });

  it("adds income and subtracts expenses on the owning account", () => {
    const accounts = [makeAccount({ id: 1, initial_balance: 100 })];
    const transactions = [
      makeTransaction({ id: 1, type: "income", amount: 50, payment_method_id: 1 }),
      makeTransaction({ id: 2, type: "expense", amount: 30, payment_method_id: 1 }),
    ];
    expect(calculateAccountBalances(accounts, transactions).get(1)).toBe(120);
  });

  it("leaves other accounts untouched", () => {
    const accounts = [
      makeAccount({ id: 1, initial_balance: 100 }),
      makeAccount({ id: 2, initial_balance: 100 }),
    ];
    const transactions = [
      makeTransaction({ id: 1, type: "expense", amount: 40, payment_method_id: 1 }),
    ];
    const balances = calculateAccountBalances(accounts, transactions);
    expect(balances.get(1)).toBe(60);
    expect(balances.get(2)).toBe(100);
  });

  it("moves money from the origin to the destination on a transfer", () => {
    const accounts = [
      makeAccount({ id: 1, initial_balance: 1000 }),
      makeAccount({ id: 2, initial_balance: 0 }),
    ];
    const transactions = [
      makeTransaction({
        id: 1,
        type: "transfer",
        amount: 300,
        payment_method_id: 1,
        destination_payment_method_id: 2,
        destination_amount: 300,
      }),
    ];
    const balances = calculateAccountBalances(accounts, transactions);
    expect(balances.get(1)).toBe(700);
    expect(balances.get(2)).toBe(300);
  });

  it("credits the destination its own amount on a cross-currency transfer", () => {
    const accounts = [
      makeAccount({ id: 1, currency: "ARS", initial_balance: 200_000 }),
      makeAccount({ id: 2, currency: "USD", initial_balance: 0 }),
    ];
    const transactions = [
      makeTransaction({
        id: 1,
        type: "transfer",
        amount: 145_000,
        currency: "ARS",
        payment_method_id: 1,
        destination_payment_method_id: 2,
        destination_amount: 100,
      }),
    ];
    const balances = calculateAccountBalances(accounts, transactions);
    expect(balances.get(1)).toBe(55_000);
    expect(balances.get(2)).toBe(100);
  });

  it("leaves a transfer out of the income and expense totals", () => {
    const transactions = [
      makeTransaction({ id: 1, type: "income", amount: 100 }),
      makeTransaction({ id: 2, type: "expense", amount: 40 }),
      makeTransaction({ id: 3, type: "transfer", amount: 1000 }),
    ];
    expect(calculateSummary(transactions)).toEqual({
      balance: 60,
      income: 100,
      expenses: 40,
    });
  });

  it("ignores movements whose account no longer exists", () => {
    const accounts = [makeAccount({ id: 1, initial_balance: 100 })];
    const transactions = [
      makeTransaction({ id: 1, type: "expense", amount: 50, payment_method_id: 99 }),
      makeTransaction({ id: 2, type: "expense", amount: 50, payment_method_id: null }),
    ];
    const balances = calculateAccountBalances(accounts, transactions);
    expect(balances.get(1)).toBe(100);
    expect(balances.has(99)).toBe(false);
  });

  it("still debits the origin when the destination account was deleted", () => {
    const accounts = [makeAccount({ id: 1, initial_balance: 500 })];
    const transactions = [
      makeTransaction({
        id: 1,
        type: "transfer",
        amount: 200,
        payment_method_id: 1,
        destination_payment_method_id: 99,
        destination_amount: 200,
      }),
    ];
    expect(calculateAccountBalances(accounts, transactions).get(1)).toBe(300);
  });
});

describe("totalBalanceByCurrency", () => {
  it("sums the accounts of each currency separately", () => {
    const accounts = [
      makeAccount({ id: 1, currency: "ARS" }),
      makeAccount({ id: 2, currency: "ARS" }),
      makeAccount({ id: 3, currency: "USD" }),
    ];
    const balances = new Map([
      [1, 100],
      [2, 250],
      [3, 40],
    ]);
    const totals = totalBalanceByCurrency(accounts, balances);
    expect(totals.get("ARS")).toBe(350);
    expect(totals.get("USD")).toBe(40);
  });

  it("returns no entries when there are no accounts", () => {
    expect(totalBalanceByCurrency([], new Map()).size).toBe(0);
  });
});

describe("convertAmount", () => {
  it("returns the amount untouched when both currencies match", () => {
    expect(convertAmount(100, "ARS", "ARS", 1500)).toBe(100);
  });

  it("divides by the rate going from ARS to USD", () => {
    expect(convertAmount(150_000, "ARS", "USD", 1500)).toBe(100);
  });

  it("multiplies by the rate going from USD to ARS", () => {
    expect(convertAmount(100, "USD", "ARS", 1500)).toBe(150_000);
  });

  it("round trips back to the original amount", () => {
    const converted = convertAmount(1234, "ARS", "USD", 1545.3) as number;
    expect(convertAmount(converted, "USD", "ARS", 1545.3)).toBeCloseTo(1234, 6);
  });

  it("refuses to convert with a missing or nonsensical rate", () => {
    expect(convertAmount(100, "ARS", "USD", 0)).toBeNull();
    expect(convertAmount(100, "ARS", "USD", -5)).toBeNull();
    expect(convertAmount(100, "ARS", "USD", Number.NaN)).toBeNull();
  });

  it("refuses to convert an unsupported currency", () => {
    expect(convertAmount(100, "EUR", "USD", 1500)).toBeNull();
  });
});

describe("consolidateByCurrency", () => {
  it("adds every currency once converted to the target", () => {
    const totals = new Map([
      ["ARS", 150_000],
      ["USD", 50],
    ]);
    expect(consolidateByCurrency(totals, "USD", 1500)).toBe(150);
  });

  it("returns zero when there is nothing to consolidate", () => {
    expect(consolidateByCurrency(new Map(), "USD", 1500)).toBe(0);
  });

  it("returns null rather than under-reporting when a rate is unusable", () => {
    const totals = new Map([
      ["ARS", 150_000],
      ["USD", 50],
    ]);
    expect(consolidateByCurrency(totals, "USD", 0)).toBeNull();
  });
});

describe("filterBySearch", () => {
  const transactions = [
    makeTransaction({ id: 1, description: "Nómina de agosto" }),
    makeTransaction({ id: 2, description: "Supermercado Coto" }),
    makeTransaction({ id: 3, description: "Cena fuera" }),
  ];

  it("matches a plain substring", () => {
    expect(filterBySearch(transactions, "super").map((t) => t.id)).toEqual([2]);
  });

  it("ignores case", () => {
    expect(filterBySearch(transactions, "COTO").map((t) => t.id)).toEqual([2]);
  });

  it("matches an accented description typed without accents", () => {
    expect(filterBySearch(transactions, "nomina").map((t) => t.id)).toEqual([1]);
  });

  it("matches an unaccented description typed with accents", () => {
    expect(filterBySearch(transactions, "cená").map((t) => t.id)).toEqual([3]);
  });

  it("treats an empty or blank query as no constraint", () => {
    expect(filterBySearch(transactions, "")).toHaveLength(3);
    expect(filterBySearch(transactions, "   ")).toHaveLength(3);
  });

  it("returns nothing when there is no match", () => {
    expect(filterBySearch(transactions, "zzz")).toEqual([]);
  });

  it("combines with the other filters", () => {
    const mixed = [
      makeTransaction({ id: 1, description: "Cena fuera", currency: "ARS" }),
      makeTransaction({ id: 2, description: "Cena fuera", currency: "USD" }),
    ];
    expect(
      applyTransactionFilters(mixed, { search: "cena", currency: "USD" }).map(
        (t) => t.id,
      ),
    ).toEqual([2]);
  });
});

describe("filterByTag", () => {
  const tagged = [
    makeTransactionWithCategory({ id: 1, tag_names: "viaje,comida" }),
    makeTransactionWithCategory({ id: 2, tag_names: "Viaje" }),
    makeTransactionWithCategory({ id: 3, tag_names: null }),
    makeTransactionWithCategory({ id: 4, tag_names: "trabajo" }),
  ];

  it("keeps only the transactions carrying the tag", () => {
    expect(filterByTag(tagged, "viaje").map((t) => t.id)).toEqual([1, 2]);
  });

  it("ignores case and accents", () => {
    const accented = [makeTransactionWithCategory({ id: 1, tag_names: "Bariloche" })];
    expect(filterByTag(accented, "bariloche")).toHaveLength(1);
  });

  it("matches whole tags, not fragments", () => {
    expect(filterByTag(tagged, "via")).toEqual([]);
  });

  it("treats an empty tag as no constraint", () => {
    expect(filterByTag(tagged, "")).toHaveLength(4);
  });

  it("excludes transactions with no tags at all", () => {
    expect(filterByTag(tagged, "trabajo").map((t) => t.id)).toEqual([4]);
  });
});

describe("calculateBudgetProgress", () => {
  function makeBudget(overrides: Partial<BudgetWithCategory> = {}): BudgetWithCategory {
    return {
      id: 1,
      category_id: 3,
      currency: "ARS",
      amount: 1000,
      period: "monthly",
      category_name: "Comida",
      category_icon: "🍽️",
      category_color: "#f97316",
      ...overrides,
    };
  }

  const reference = new Date(2026, 7, 15); // agosto de 2026

  it("adds up the expenses of the current month", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "expense",
        amount: 300,
        category_id: 3,
        date: "2026-08-02",
      }),
      makeTransaction({
        id: 2,
        type: "expense",
        amount: 200,
        category_id: 3,
        date: "2026-08-20",
      }),
    ];
    const [progress] = calculateBudgetProgress([makeBudget()], transactions, reference);
    expect(progress.spent).toBe(500);
    expect(progress.remaining).toBe(500);
    expect(progress.ratio).toBe(0.5);
    expect(progress.isExceeded).toBe(false);
  });

  it("ignores expenses from another month", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "expense",
        amount: 900,
        category_id: 3,
        date: "2026-07-31",
      }),
    ];
    const [progress] = calculateBudgetProgress([makeBudget()], transactions, reference);
    expect(progress.spent).toBe(0);
  });

  it("counts the whole year for an annual budget", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "expense",
        amount: 400,
        category_id: 3,
        date: "2026-01-10",
      }),
      makeTransaction({
        id: 2,
        type: "expense",
        amount: 400,
        category_id: 3,
        date: "2026-08-10",
      }),
      makeTransaction({
        id: 3,
        type: "expense",
        amount: 400,
        category_id: 3,
        date: "2025-08-10",
      }),
    ];
    const [progress] = calculateBudgetProgress(
      [makeBudget({ period: "annual", amount: 5000 })],
      transactions,
      reference,
    );
    expect(progress.spent).toBe(800);
  });

  it("ignores another category and another currency", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "expense",
        amount: 500,
        category_id: 4,
        date: "2026-08-02",
      }),
      makeTransaction({
        id: 2,
        type: "expense",
        amount: 500,
        category_id: 3,
        currency: "USD",
        date: "2026-08-02",
      }),
    ];
    const [progress] = calculateBudgetProgress([makeBudget()], transactions, reference);
    expect(progress.spent).toBe(0);
  });

  it("does not let income refund the budget", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "expense",
        amount: 600,
        category_id: 3,
        date: "2026-08-02",
      }),
      makeTransaction({
        id: 2,
        type: "income",
        amount: 600,
        category_id: 3,
        date: "2026-08-03",
      }),
    ];
    const [progress] = calculateBudgetProgress([makeBudget()], transactions, reference);
    expect(progress.spent).toBe(600);
  });

  it("ignores transfers entirely", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "transfer",
        amount: 5000,
        category_id: 3,
        date: "2026-08-02",
      }),
    ];
    const [progress] = calculateBudgetProgress([makeBudget()], transactions, reference);
    expect(progress.spent).toBe(0);
  });

  it("reports a ratio above one when the cap is passed", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "expense",
        amount: 1800,
        category_id: 3,
        date: "2026-08-02",
      }),
    ];
    const [progress] = calculateBudgetProgress([makeBudget()], transactions, reference);
    expect(progress.ratio).toBeCloseTo(1.8);
    expect(progress.remaining).toBe(-800);
    expect(progress.isExceeded).toBe(true);
  });

  it("treats spending exactly the cap as not exceeded", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "expense",
        amount: 1000,
        category_id: 3,
        date: "2026-08-02",
      }),
    ];
    const [progress] = calculateBudgetProgress([makeBudget()], transactions, reference);
    expect(progress.isExceeded).toBe(false);
  });

  it("does not divide by zero on a cap of zero", () => {
    const [progress] = calculateBudgetProgress(
      [makeBudget({ amount: 0 })],
      [],
      reference,
    );
    expect(Number.isFinite(progress.ratio)).toBe(true);
    expect(progress.ratio).toBe(1);
  });

  it("picks out only the exceeded ones", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "expense",
        amount: 1800,
        category_id: 3,
        date: "2026-08-02",
      }),
      makeTransaction({
        id: 2,
        type: "expense",
        amount: 100,
        category_id: 4,
        date: "2026-08-02",
      }),
    ];
    const progress = calculateBudgetProgress(
      [makeBudget(), makeBudget({ id: 2, category_id: 4 })],
      transactions,
      reference,
    );
    expect(exceededBudgets(progress).map((entry) => entry.budget.id)).toEqual([1]);
  });
});

describe("buildRateLookup", () => {
  const rates = [
    { date: "2026-08-03", sell: 1500 },
    { date: "2026-08-01", sell: 1400 },
    { date: "2026-08-05", sell: 1600 },
  ];

  it("returns the quote of that exact day", () => {
    expect(buildRateLookup(rates)("2026-08-03")).toBe(1500);
  });

  it("falls back to the last quote before a day with none", () => {
    // The 4th is a day the market did not quote.
    expect(buildRateLookup(rates)("2026-08-04")).toBe(1500);
  });

  it("uses the latest quote for a date after the series", () => {
    expect(buildRateLookup(rates)("2026-12-31")).toBe(1600);
  });

  it("uses the first quote for a date before the series", () => {
    expect(buildRateLookup(rates)("2017-01-01")).toBe(1400);
  });

  it("returns null when there is no history at all", () => {
    expect(buildRateLookup([])("2026-08-03")).toBeNull();
  });

  it("does not care what order the rates arrive in", () => {
    const shuffled = [...rates].reverse();
    expect(buildRateLookup(shuffled)("2026-08-04")).toBe(1500);
  });
});

describe("convertAtDate", () => {
  const rateAt = buildRateLookup([
    { date: "2024-01-01", sell: 800 },
    { date: "2026-08-01", sell: 1600 },
  ]);

  it("leaves the amount alone when the currency matches", () => {
    expect(convertAtDate(100, "ARS", "ARS", "2024-06-01", rateAt)).toBe(100);
  });

  it("values an old movement at the rate of its own time", () => {
    expect(convertAtDate(8000, "ARS", "USD", "2024-06-01", rateAt)).toBe(10);
  });

  it("values a recent one at the recent rate", () => {
    expect(convertAtDate(8000, "ARS", "USD", "2026-08-10", rateAt)).toBe(5);
  });

  it("returns null without any history", () => {
    expect(
      convertAtDate(100, "ARS", "USD", "2026-08-10", buildRateLookup([])),
    ).toBeNull();
  });
});

describe("summaryInCurrency", () => {
  const rateAt = buildRateLookup([
    { date: "2024-01-01", sell: 800 },
    { date: "2026-08-01", sell: 1600 },
  ]);

  it("values each movement at its own date", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "income",
        amount: 8000,
        currency: "ARS",
        date: "2024-06-01",
      }),
      makeTransaction({
        id: 2,
        type: "expense",
        amount: 8000,
        currency: "ARS",
        date: "2026-08-10",
      }),
    ];
    // 8000 pesos was 10 dollars then and 5 dollars now.
    expect(summaryInCurrency(transactions, "USD", rateAt)).toEqual({
      income: 10,
      expenses: 5,
      balance: 5,
    });
  });

  it("mixes currencies without double converting", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "income",
        amount: 1600,
        currency: "ARS",
        date: "2026-08-10",
      }),
      makeTransaction({
        id: 2,
        type: "income",
        amount: 5,
        currency: "USD",
        date: "2026-08-10",
      }),
    ];
    expect(summaryInCurrency(transactions, "USD", rateAt)?.income).toBe(6);
  });

  it("leaves transfers out, as the other summaries do", () => {
    const transactions = [
      makeTransaction({
        id: 1,
        type: "transfer",
        amount: 100000,
        currency: "ARS",
        date: "2026-08-10",
      }),
    ];
    expect(summaryInCurrency(transactions, "USD", rateAt)).toEqual({
      income: 0,
      expenses: 0,
      balance: 0,
    });
  });

  it("returns null without any history", () => {
    const transactions = [
      makeTransaction({ id: 1, type: "income", amount: 100, currency: "ARS" }),
    ];
    expect(summaryInCurrency(transactions, "USD", buildRateLookup([]))).toBeNull();
  });
});

describe("yearRange and yearFromRange", () => {
  it("spans the whole calendar year", () => {
    expect(yearRange(2026)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("recognises a range that is exactly one year", () => {
    expect(yearFromRange(yearRange(2026))).toBe(2026);
  });

  it("does not recognise a partial year", () => {
    expect(yearFromRange({ from: "2026-01-01", to: "2026-06-30" })).toBeNull();
  });

  it("does not recognise a range spanning two years", () => {
    expect(yearFromRange({ from: "2026-01-01", to: "2027-12-31" })).toBeNull();
  });

  it("returns null for an open range", () => {
    expect(yearFromRange({ from: null, to: null })).toBeNull();
    expect(yearFromRange({ from: "2026-01-01", to: null })).toBeNull();
  });

  it("round trips every year it produces", () => {
    for (const year of [2019, 2024, 2026]) {
      expect(yearFromRange(yearRange(year))).toBe(year);
    }
  });
});

describe("availableYears", () => {
  it("lists the years that have movements, newest first", () => {
    const transactions = [
      makeTransaction({ id: 1, date: "2024-03-01" }),
      makeTransaction({ id: 2, date: "2026-08-01" }),
      makeTransaction({ id: 3, date: "2026-01-01" }),
    ];
    expect(availableYears(transactions)).toEqual([2026, 2024]);
  });

  it("returns nothing when there are no transactions", () => {
    expect(availableYears([])).toEqual([]);
  });
});

describe("recentMonthsRange", () => {
  it("spans a whole year back, from the first day of the earliest month", () => {
    // A flow needs a period; this is the one the analysis opens on.
    expect(recentMonthsRange(12, new Date(2026, 7, 26))).toEqual({
      from: "2025-09-01",
      to: "2026-08-26",
    });
  });

  it("crosses the year boundary", () => {
    expect(recentMonthsRange(6, new Date(2026, 1, 15))).toEqual({
      from: "2025-09-01",
      to: "2026-02-15",
    });
  });

  it("covers only the current month when asked for one", () => {
    expect(recentMonthsRange(1, new Date(2026, 7, 26))).toEqual({
      from: "2026-08-01",
      to: "2026-08-26",
    });
  });

  it("is not one whole calendar year, so the year selector does not claim one", () => {
    expect(yearFromRange(recentMonthsRange(12, new Date(2026, 7, 26)))).toBeNull();
  });
});

describe("amounts added up to the cent", () => {
  // Amounts are stored as REAL, so 0.1 + 0.2 comes out as 0.30000000000000004.
  // The formatting hid it; comparisons at the boundary did not.

  it("totals income and expenses without floating-point residue", () => {
    const summary = calculateSummary([
      makeTransaction({ amount: 0.1, type: "expense" }),
      makeTransaction({ amount: 0.2, type: "expense" }),
      makeTransaction({ amount: 0.3, type: "income" }),
    ]);
    expect(summary).toEqual({ income: 0.3, expenses: 0.3, balance: 0 });
  });

  it("groups a category's spending to the cent", () => {
    const [entry] = groupByCategory(
      [0.1, 0.2].map((amount) =>
        makeTransactionWithCategory({ amount, category_id: 5, category_name: "Comida" }),
      ),
      "expense",
    );
    expect(entry.total).toBe(0.3);
  });

  it("keeps account balances to the cent", () => {
    const accounts: PaymentMethod[] = [
      { id: 1, name: "Efectivo", type: "cash", currency: "ARS", initial_balance: 0.1 },
    ];
    const balances = calculateAccountBalances(accounts, [
      makeTransaction({ amount: 0.2, type: "income", payment_method_id: 1 }),
    ]);
    expect(balances.get(1)).toBe(0.3);
  });

  it("does not call a budget spent exactly to its cap exceeded", () => {
    const budget: BudgetWithCategory = {
      id: 1,
      category_id: 5,
      currency: "ARS",
      amount: 0.3,
      period: "monthly",
      category_name: "Comida",
      category_icon: "🍽️",
      category_color: "#f00",
    };
    const [progress] = calculateBudgetProgress(
      [budget],
      [0.1, 0.2].map((amount) =>
        makeTransaction({ amount, category_id: 5, date: "2026-08-10" }),
      ),
      new Date(2026, 7, 15),
    );
    expect(progress.isExceeded).toBe(false);
    expect(progress.remaining).toBe(0);
  });
});

describe("getNextMonthKeys", () => {
  it("lists the months ahead, leaving out the one in progress", () => {
    expect(getNextMonthKeys(3, "2026-08")).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("crosses the year boundary", () => {
    expect(getNextMonthKeys(3, "2026-11")).toEqual(["2026-12", "2027-01", "2027-02"]);
  });

  it("returns nothing when asked for nothing", () => {
    expect(getNextMonthKeys(0, "2026-08")).toEqual([]);
  });
});
