import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "./testing/database";
import {
  advanceLoan,
  countTransactionsForPaymentMethod,
  deletePaymentMethod,
  deleteTransaction,
  dismissRecurringOccurrence,
  EXCHANGE_RATE_TYPE,
  getLatestExchangeRate,
  getSetting,
  insertAttachment,
  insertCategory,
  insertInstallmentPlan,
  insertLoan,
  insertPaymentMethod,
  insertRecurringTransaction,
  insertTransaction,
  insertTransactions,
  listAttachments,
  listCategories,
  listExchangeRates,
  listInstallmentPlans,
  listLoans,
  listRecurringTransactions,
  listTags,
  listTransactionsWithCategory,
  recordInstallment,
  recordLoanPayment,
  recordRecurringOccurrence,
  setDatabaseForTesting,
  setSetting,
  setTransactionTags,
  updateLoan,
  updateTransaction,
  upsertExchangeRate,
  upsertExchangeRates,
} from "./index";
import type { ExchangeRate, NewLoan, NewTransaction } from "./index";

let db: ReturnType<typeof createTestDatabase>;

beforeEach(() => {
  db = createTestDatabase();
  setDatabaseForTesting(db);
});

afterEach(() => {
  setDatabaseForTesting(null);
  db.close();
});

async function anExpenseCategory(name = "Comida") {
  await insertCategory({ name, type: "expense", icon: "🍽️", color: "#ff0000" });
  const categories = await listCategories();
  return categories.find((category) => category.name === name)!;
}

async function anAccount(name = "Efectivo", currency = "ARS") {
  await insertPaymentMethod({ name, type: "cash", currency, initialBalance: 0 });
  const accounts = await db.select<{ id: number; name: string }[]>(
    "SELECT id, name FROM payment_methods WHERE name = $1",
    [name],
  );
  return accounts[0];
}

function anExpense(overrides: Partial<NewTransaction> = {}): NewTransaction {
  return {
    amount: 1000,
    type: "expense",
    categoryId: null,
    paymentMethodId: null,
    destinationPaymentMethodId: null,
    destinationAmount: null,
    description: "Un gasto",
    date: "2026-08-01",
    currency: "ARS",
    ...overrides,
  };
}

describe("seed data", () => {
  it("ships default categories, so a fresh install is usable", () => {
    // A brand new database with no categories means the transaction form opens
    // with an empty required field and nothing can be recorded at all.
    return expect(listCategories()).resolves.not.toHaveLength(0);
  });
});

describe("transactions", () => {
  it("reads back what it wrote, joined to its category and account", async () => {
    const category = await anExpenseCategory();
    const account = await anAccount();

    await insertTransaction(
      anExpense({
        categoryId: category.id,
        paymentMethodId: account.id,
        description: "Supermercado",
        amount: 12345.67,
      }),
    );

    const [row] = await listTransactionsWithCategory();

    expect(row.description).toBe("Supermercado");
    expect(row.amount).toBeCloseTo(12345.67, 2);
    expect(row.category_name).toBe("Comida");
    expect(row.category_icon).toBe("🍽️");
    expect(row.payment_method_name).toBe("Efectivo");
    expect(row.attachment_count).toBe(0);
  });

  it("keeps both legs of a cross-currency transfer", async () => {
    const pesos = await anAccount("Pesos", "ARS");
    const dollars = await anAccount("Dólares", "USD");

    // $145.000 leaves one account and US$100 arrives in the other. Storing one
    // figure and deriving the other would need a rate and would drift.
    await insertTransaction(
      anExpense({
        type: "transfer",
        amount: 145000,
        currency: "ARS",
        paymentMethodId: pesos.id,
        destinationPaymentMethodId: dollars.id,
        destinationAmount: 100,
        description: "Compra de dólares",
      }),
    );

    const [row] = await listTransactionsWithCategory();

    expect(row.amount).toBe(145000);
    expect(row.currency).toBe("ARS");
    expect(row.destination_amount).toBe(100);
    expect(row.destination_currency).toBe("USD");
    expect(row.destination_payment_method_name).toBe("Dólares");
    expect(row.category_id).toBeNull();
  });

  it("orders the listing newest first", async () => {
    for (const date of ["2026-01-15", "2026-08-01", "2026-04-10"]) {
      await insertTransaction(anExpense({ date, description: date }));
    }

    const rows = await listTransactionsWithCategory();

    expect(rows.map((row) => row.date)).toEqual([
      "2026-08-01",
      "2026-04-10",
      "2026-01-15",
    ]);
  });

  it("updates in place rather than inserting a second row", async () => {
    await insertTransaction(anExpense({ description: "Antes", amount: 100 }));
    const [before] = await listTransactionsWithCategory();

    await updateTransaction(
      before.id,
      anExpense({ description: "Después", amount: 250 }),
    );

    const rows = await listTransactionsWithCategory();
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Después");
    expect(rows[0].amount).toBe(250);
  });

  it("imports a batch along with each row's tags", async () => {
    await insertTransactions([
      { transaction: anExpense({ description: "Uno" }), tags: ["viaje"] },
      { transaction: anExpense({ description: "Dos" }), tags: [] },
      { transaction: anExpense({ description: "Tres" }), tags: ["viaje", "auto"] },
    ]);

    const rows = await listTransactionsWithCategory();
    expect(rows).toHaveLength(3);

    const tagged = rows.find((row) => row.description === "Tres");
    expect(tagged?.tag_names?.split(",").sort()).toEqual(["auto", "viaje"]);
    expect(rows.find((row) => row.description === "Dos")?.tag_names).toBeNull();
  });
});

describe("tags", () => {
  it("aggregates a transaction's tags into one sorted column", async () => {
    await insertTransaction(anExpense());
    const [transaction] = await listTransactionsWithCategory();

    await setTransactionTags(transaction.id, ["viaje", "auto"]);

    const [row] = await listTransactionsWithCategory();
    // The listing aggregates in SQL, and `splitTagNames` relies on the comma
    // separator being unambiguous.
    expect(row.tag_names?.split(",").sort()).toEqual(["auto", "viaje"]);
  });

  it("reuses an existing tag instead of creating a duplicate", async () => {
    await insertTransaction(anExpense({ description: "Uno" }));
    await insertTransaction(anExpense({ description: "Dos" }));
    const [first, second] = await listTransactionsWithCategory();

    await setTransactionTags(first.id, ["viaje"]);
    await setTransactionTags(second.id, ["viaje"]);

    expect(await listTags()).toHaveLength(1);
  });

  it("replaces the whole set when tags are saved again", async () => {
    await insertTransaction(anExpense());
    const [transaction] = await listTransactionsWithCategory();

    await setTransactionTags(transaction.id, ["viaje", "auto"]);
    await setTransactionTags(transaction.id, ["auto"]);

    const [row] = await listTransactionsWithCategory();
    expect(row.tag_names).toBe("auto");
  });
});

describe("deleting", () => {
  it("takes a transaction's attachments and tags with it", async () => {
    await insertTransaction(anExpense());
    const [transaction] = await listTransactionsWithCategory();

    await setTransactionTags(transaction.id, ["viaje"]);
    await insertAttachment({
      transactionId: transaction.id,
      fileName: "ticket.png",
      mimeType: "image/png",
      byteSize: 10,
      contentBase64: "AAAA",
    });

    await deleteTransaction(transaction.id);

    // Cascades only fire with foreign keys enforced, which is how the app runs
    // and how the test harness is configured.
    expect(await listAttachments(transaction.id)).toHaveLength(0);
    const links = await db.select<unknown[]>("SELECT * FROM transaction_tags");
    expect(links).toHaveLength(0);
  });

  it("counts what an account would take with it before deleting", async () => {
    const account = await anAccount();
    await insertTransaction(anExpense({ paymentMethodId: account.id }));
    await insertTransaction(anExpense({ paymentMethodId: account.id }));

    expect(await countTransactionsForPaymentMethod(account.id)).toBe(2);
  });

  it("keeps the history when its account is deleted", async () => {
    const account = await anAccount("A borrar");
    await insertTransaction(anExpense({ paymentMethodId: account.id }));

    await deletePaymentMethod(account.id);

    // Losing the movements along with the account would silently rewrite the
    // user's past. The rows survive, orphaned or reassigned.
    expect(await listTransactionsWithCategory()).toHaveLength(1);
  });
});

describe("attachments", () => {
  it("reports how many a transaction has without loading them", async () => {
    await insertTransaction(anExpense());
    const [transaction] = await listTransactionsWithCategory();

    await insertAttachment({
      transactionId: transaction.id,
      fileName: "ticket.png",
      mimeType: "image/png",
      byteSize: 2048,
      contentBase64: "AAAA",
    });

    const [row] = await listTransactionsWithCategory();
    expect(row.attachment_count).toBe(1);

    const metas = await listAttachments(transaction.id);
    // The listing carries metadata only; the base64 payload is fetched
    // separately and on demand.
    expect(metas[0]).not.toHaveProperty("content_base64");
    expect(metas[0].byte_size).toBe(2048);
  });
});

describe("settings", () => {
  it("returns null for a key that was never written", async () => {
    expect(await getSetting(EXCHANGE_RATE_TYPE)).toBeNull();
  });

  it("overwrites rather than accumulating rows", async () => {
    await setSetting(EXCHANGE_RATE_TYPE, "blue");
    await setSetting(EXCHANGE_RATE_TYPE, "bolsa");

    expect(await getSetting(EXCHANGE_RATE_TYPE)).toBe("bolsa");
    const rows = await db.select<unknown[]>("SELECT * FROM app_settings WHERE key = $1", [
      EXCHANGE_RATE_TYPE,
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe("exchange rates", () => {
  function aRate(overrides: Partial<ExchangeRate> = {}): ExchangeRate {
    return {
      date: "2026-08-01",
      rate_type: "bolsa",
      buy: 1000,
      sell: 1100,
      source: "dolarapi:bolsa",
      fetched_at: "2026-08-01T12:00:00.000Z",
      ...overrides,
    };
  }

  it("keeps one row per day and rate", async () => {
    await upsertExchangeRate(aRate());
    await upsertExchangeRate(aRate({ sell: 1200 }));

    const rates = await listExchangeRates("bolsa");
    expect(rates).toHaveLength(1);
    expect(rates[0].sell).toBe(1200);
  });

  it("keeps two rates for the same day apart", async () => {
    await upsertExchangeRate(aRate());
    await upsertExchangeRate(aRate({ rate_type: "blue", sell: 1500 }));

    // The whole point of the widened primary key: switching rates must not
    // discard the series already downloaded for the other one.
    expect(await listExchangeRates("bolsa")).toHaveLength(1);
    expect((await listExchangeRates("blue"))[0].sell).toBe(1500);
  });

  it("does not let a download overwrite a manual correction", async () => {
    await upsertExchangeRate(aRate({ sell: 9999, source: "manual" }));

    await upsertExchangeRates([aRate({ sell: 1100 })]);

    expect((await listExchangeRates("bolsa"))[0].sell).toBe(9999);
  });

  it("writes a series larger than one parameter batch", async () => {
    // The batching exists because SQLite caps bound parameters per statement;
    // a series of a few thousand days is the normal case, not an edge one.
    const many = Array.from({ length: 400 }, (_, index) =>
      aRate({ date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}` }),
    );
    const unique = Array.from(new Map(many.map((r) => [r.date, r])).values());

    const written = await upsertExchangeRates(unique);

    expect(written).toBe(unique.length);
    expect(await listExchangeRates("bolsa")).toHaveLength(unique.length);
  });

  it("returns the most recent quote for the rate asked for", async () => {
    await upsertExchangeRates([
      aRate({ date: "2026-08-01", sell: 1100 }),
      aRate({ date: "2026-08-20", sell: 1300 }),
      aRate({ date: "2026-08-20", rate_type: "blue", sell: 1500 }),
    ]);

    expect((await getLatestExchangeRate("bolsa"))?.sell).toBe(1300);
    expect((await getLatestExchangeRate("blue"))?.sell).toBe(1500);
    expect(await getLatestExchangeRate("cripto")).toBeNull();
  });
});

describe("confirming commitments out of order", () => {
  // Each pending occurrence has its own button, but what is stored is a
  // position: registering instalment 2 while 1 is still due used to set the
  // plan to "2 paid", and instalment 1 vanished with no movement behind it.

  async function aPlanWithTwoDue() {
    await insertInstallmentPlan({
      description: "Heladera",
      totalAmount: 1200,
      installmentCount: 12,
      currency: "ARS",
      categoryId: null,
      paymentMethodId: null,
      firstDueDate: "2026-07-10",
      cashPrice: null,
    });
    return (await listInstallmentPlans())[0];
  }

  async function aLoanWithTwoDue() {
    await insertLoan({
      direction: "borrowed",
      counterparty: "Banco",
      description: "Préstamo personal",
      principal: 1200,
      currency: "ARS",
      annualRate: 0,
      installmentCount: 12,
      categoryId: null,
      paymentMethodId: null,
      firstDueDate: "2026-07-10",
    });
    return (await listLoans())[0];
  }

  async function aSeriesWithTwoDue() {
    await insertRecurringTransaction({
      description: "Alquiler",
      amount: 500,
      type: "expense",
      categoryId: null,
      paymentMethodId: null,
      currency: "ARS",
      frequency: "monthly",
      startDate: "2026-08-08",
      isActive: true,
    });
    return (await listRecurringTransactions())[0];
  }

  it("refuses a later instalment while an earlier one is still due", async () => {
    const plan = await aPlanWithTwoDue();

    await expect(recordInstallment(plan.id, 1, "2026-08-10", 100)).rejects.toThrow();

    expect((await listInstallmentPlans())[0].confirmed_count).toBe(0);
    expect(await listTransactionsWithCategory()).toHaveLength(0);
  });

  it("registers instalments one after the other", async () => {
    const plan = await aPlanWithTwoDue();

    // What "Registrar todas" does, with the data it read before the first one.
    await recordInstallment(plan.id, 0, "2026-07-10", 100);
    await recordInstallment(plan.id, 1, "2026-08-10", 100);

    expect((await listInstallmentPlans())[0].confirmed_count).toBe(2);
    const descriptions = (await listTransactionsWithCategory()).map((t) => t.description);
    expect(descriptions.sort()).toEqual(["Heladera (1/12)", "Heladera (2/12)"]);
  });

  it("refuses the same instalment twice", async () => {
    const plan = await aPlanWithTwoDue();
    await recordInstallment(plan.id, 0, "2026-07-10", 100);

    await expect(recordInstallment(plan.id, 0, "2026-07-10", 100)).rejects.toThrow();

    expect(await listTransactionsWithCategory()).toHaveLength(1);
  });

  it("refuses a later loan payment while an earlier one is still due", async () => {
    const loan = await aLoanWithTwoDue();

    await expect(recordLoanPayment(loan.id, 1, "2026-08-10", 100)).rejects.toThrow();

    expect((await listLoans())[0].confirmed_count).toBe(0);
    expect(await listTransactionsWithCategory()).toHaveLength(0);
  });

  it("registers loan payments one after the other", async () => {
    const loan = await aLoanWithTwoDue();

    await recordLoanPayment(loan.id, 0, "2026-07-10", 100);
    await recordLoanPayment(loan.id, 1, "2026-08-10", 100);

    expect((await listLoans())[0].confirmed_count).toBe(2);
    expect(await listTransactionsWithCategory()).toHaveLength(2);
  });

  it("refuses a later recurring occurrence while an earlier one is pending", async () => {
    const series = await aSeriesWithTwoDue();

    await expect(recordRecurringOccurrence(series.id, "2026-09-08")).rejects.toThrow();

    expect((await listRecurringTransactions())[0].last_confirmed_date).toBeNull();
    expect(await listTransactionsWithCategory()).toHaveLength(0);
  });

  it("refuses to dismiss a later occurrence while an earlier one is pending", async () => {
    const series = await aSeriesWithTwoDue();

    await expect(dismissRecurringOccurrence(series.id, "2026-09-08")).rejects.toThrow();

    expect((await listRecurringTransactions())[0].last_confirmed_date).toBeNull();
  });

  it("refuses a date that is not an occurrence of the series", async () => {
    const series = await aSeriesWithTwoDue();

    await expect(recordRecurringOccurrence(series.id, "2026-08-09")).rejects.toThrow();
    await expect(dismissRecurringOccurrence(series.id, "2026-08-09")).rejects.toThrow();

    expect((await listRecurringTransactions())[0].last_confirmed_date).toBeNull();
  });

  it("works through a series in order, registering and dismissing", async () => {
    const series = await aSeriesWithTwoDue();

    await dismissRecurringOccurrence(series.id, "2026-08-08");
    await recordRecurringOccurrence(series.id, "2026-09-08");

    expect((await listRecurringTransactions())[0].last_confirmed_date).toBe("2026-09-08");
    const transactions = await listTransactionsWithCategory();
    expect(transactions.map((t) => t.date)).toEqual(["2026-09-08"]);
  });
});

describe("loans", () => {
  function aLoan(overrides: Partial<NewLoan> = {}): NewLoan {
    return {
      direction: "borrowed",
      counterparty: "Banco",
      description: "Préstamo personal",
      principal: 1_000_000,
      currency: "ARS",
      annualRate: 60,
      installmentCount: 12,
      categoryId: null,
      paymentMethodId: null,
      firstDueDate: "2026-09-10",
      ...overrides,
    };
  }

  it("reads back a loan with its category and account", async () => {
    const category = await anExpenseCategory("Créditos");
    const account = await anAccount();

    await insertLoan(aLoan({ categoryId: category.id, paymentMethodId: account.id }));

    const [loan] = await listLoans();
    expect(loan.counterparty).toBe("Banco");
    expect(loan.annual_rate).toBe(60);
    expect(loan.confirmed_count).toBe(0);
    expect(loan.category_name).toBe("Créditos");
    expect(loan.payment_method_name).toBe("Efectivo");
  });

  it("accepts an interest-free loan", async () => {
    // The schema must not force a rate: a loan between two people usually has
    // none, and rejecting it would push the user into faking one.
    await insertLoan(aLoan({ annualRate: 0, direction: "lent", counterparty: "Martín" }));

    const [loan] = await listLoans();
    expect(loan.annual_rate).toBe(0);
    expect(loan.direction).toBe("lent");
  });

  it("refuses a direction that means nothing", async () => {
    await expect(
      insertLoan(aLoan({ direction: "sideways" as NewLoan["direction"] })),
    ).rejects.toThrow();
  });

  it("refuses a loan with no money or no payments", async () => {
    await expect(insertLoan(aLoan({ principal: 0 }))).rejects.toThrow();
    await expect(insertLoan(aLoan({ installmentCount: 0 }))).rejects.toThrow();
  });

  it("keeps the payments already recorded when the terms are edited", async () => {
    await insertLoan(aLoan());
    const [created] = await listLoans();
    await advanceLoan(created.id, 3);

    await updateLoan(created.id, aLoan({ principal: 2_000_000 }));

    const [updated] = await listLoans();
    // Editing the terms must not silently undo three payments that happened.
    expect(updated.principal).toBe(2_000_000);
    expect(updated.confirmed_count).toBe(3);
  });

  it("will not advance past the end of the schedule", async () => {
    await insertLoan(aLoan({ installmentCount: 12 }));
    const [loan] = await listLoans();

    await advanceLoan(loan.id, 13);

    expect((await listLoans())[0].confirmed_count).toBe(0);
  });

  it("keeps the loan when its account is deleted", async () => {
    const account = await anAccount("A borrar");
    await insertLoan(aLoan({ paymentMethodId: account.id }));

    await deletePaymentMethod(account.id);

    const [loan] = await listLoans();
    expect(loan.payment_method_id).toBeNull();
  });
});
