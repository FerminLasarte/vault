import { describe, expect, it } from "vitest";
import { decideNotifications, pendingNotifications } from "./notifications";
import type { NotificationSources } from "./notifications";
import type {
  BudgetWithCategory,
  ExpectedMovementWithNames,
  InstallmentPlanWithNames,
  LoanWithNames,
  RecurringTransactionWithNames,
  Transaction,
} from "@/db/schema";

const TODAY = "2026-08-23";

function anExpenseOn(date: string, currency = "ARS"): Transaction {
  return {
    id: Math.random(),
    amount: 100,
    type: "expense",
    category_id: null,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Gasto",
    date,
    currency,
  };
}

function anExpected(
  overrides: Partial<ExpectedMovementWithNames> = {},
): ExpectedMovementWithNames {
  return {
    id: 1,
    description: "Casamiento",
    amount: 50_000,
    type: "expense",
    currency: "ARS",
    category_id: null,
    payment_method_id: null,
    due_date: "2026-08-20",
    status: "pending",
    transaction_id: null,
    created_at: "2026-08-01T00:00:00.000Z",
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

function sources(overrides: Partial<NotificationSources> = {}): NotificationSources {
  return {
    installmentPlans: [],
    loans: [],
    recurring: [],
    expectedMovements: [],
    budgets: [],
    transactions: [],
    ...overrides,
  };
}

function aPlan(
  overrides: Partial<InstallmentPlanWithNames> = {},
): InstallmentPlanWithNames {
  return {
    id: 1,
    description: "Notebook",
    total_amount: 120000,
    installment_count: 12,
    currency: "ARS",
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-06-10",
    confirmed_count: 0,
    created_at: "2026-06-01T00:00:00Z",
    cash_price: null,
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

function aLoan(overrides: Partial<LoanWithNames> = {}): LoanWithNames {
  return {
    id: 1,
    direction: "borrowed",
    counterparty: "Banco",
    description: "Préstamo personal",
    principal: 1_000_000,
    currency: "ARS",
    annual_rate: 0,
    installment_count: 12,
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-06-10",
    confirmed_count: 0,
    created_at: "2026-06-01T00:00:00Z",
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

function aRecurring(
  overrides: Partial<RecurringTransactionWithNames> = {},
): RecurringTransactionWithNames {
  return {
    id: 1,
    description: "Alquiler",
    amount: 500000,
    type: "expense",
    category_id: null,
    payment_method_id: null,
    currency: "ARS",
    frequency: "monthly",
    start_date: "2026-08-01",
    last_confirmed_date: null,
    is_active: 1,
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

function aBudget(overrides: Partial<BudgetWithCategory> = {}): BudgetWithCategory {
  return {
    id: 1,
    category_id: 7,
    currency: "ARS",
    amount: 100000,
    period: "monthly",
    category_name: "Salida",
    category_icon: "🍺",
    category_color: "#f00",
    ...overrides,
  };
}

function anExpense(amount: number, date = "2026-08-05"): Transaction {
  return {
    id: Math.random(),
    amount,
    type: "expense",
    category_id: 7,
    payment_method_id: null,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "Gasto",
    date,
    currency: "ARS",
  };
}

describe("budget warnings", () => {
  it("says nothing below the threshold", () => {
    // 79% is just spending. Warning here would train the user to ignore it.
    const result = pendingNotifications(
      sources({ budgets: [aBudget()], transactions: [anExpense(79_000)] }),
      TODAY,
    );

    expect(result).toHaveLength(0);
  });

  it("warns once the threshold is crossed", () => {
    const result = pendingNotifications(
      sources({ budgets: [aBudget()], transactions: [anExpense(81_000)] }),
      TODAY,
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Presupuesto al límite");
    expect(result[0].body).toContain("81%");
  });

  it("reports an exceeded budget as exceeded, not as near the limit", () => {
    const result = pendingNotifications(
      sources({ budgets: [aBudget()], transactions: [anExpense(150_000)] }),
      TODAY,
    );

    expect(result[0].title).toBe("Presupuesto excedido");
    expect(result[0].body).toContain("150%");
  });

  it("treats crossing from warning to exceeded as a new fact", () => {
    const warning = pendingNotifications(
      sources({ budgets: [aBudget()], transactions: [anExpense(85_000)] }),
      TODAY,
    );
    const exceeded = pendingNotifications(
      sources({ budgets: [aBudget()], transactions: [anExpense(150_000)] }),
      TODAY,
    );

    // Otherwise going over the cap would be silent, because the "at the limit"
    // warning had already been announced for the same budget and month.
    expect(warning[0].id).not.toBe(exceeded[0].id);
  });

  it("separates one period from the next", () => {
    const august = pendingNotifications(
      sources({ budgets: [aBudget()], transactions: [anExpense(90_000, "2026-08-05")] }),
      "2026-08-23",
    );
    const september = pendingNotifications(
      sources({ budgets: [aBudget()], transactions: [anExpense(90_000, "2026-09-05")] }),
      "2026-09-23",
    );

    expect(august[0].id).not.toBe(september[0].id);
  });

  it("ignores spending in another currency", () => {
    const result = pendingNotifications(
      sources({
        budgets: [aBudget({ currency: "USD", amount: 100 })],
        transactions: [anExpense(90_000)],
      }),
      TODAY,
    );

    expect(result).toHaveLength(0);
  });
});

describe("commitments", () => {
  it("announces each overdue instalment separately", () => {
    const result = pendingNotifications(
      sources({ installmentPlans: [aPlan({ first_due_date: "2026-06-10" })] }),
      TODAY,
    );

    // June, July and August have all come due.
    expect(result).toHaveLength(3);
    expect(new Set(result.map((entry) => entry.id)).size).toBe(3);
  });

  it("says nothing about an instalment that is not due yet", () => {
    const result = pendingNotifications(
      sources({ installmentPlans: [aPlan({ first_due_date: "2026-12-10" })] }),
      TODAY,
    );

    expect(result).toHaveLength(0);
  });

  it("calls money owed to the user a collection, not a bill", () => {
    const result = pendingNotifications(
      sources({ loans: [aLoan({ direction: "lent", counterparty: "Martín" })] }),
      TODAY,
    );

    expect(result[0].title).toBe("Cobro pendiente");
    expect(result[0].body).toContain("Martín");
  });

  it("skips a paused recurring template", () => {
    const result = pendingNotifications(
      sources({ recurring: [aRecurring({ is_active: 0 })] }),
      TODAY,
    );

    expect(result).toHaveLength(0);
  });
});

describe("the monthly close", () => {
  it("announces the month that just ended", () => {
    const [notification] = pendingNotifications(
      sources({ transactions: [anExpenseOn("2026-07-12")] }),
      TODAY,
    );

    expect(notification.id).toBe("monthly-close:2026-07");
    expect(notification.title).toBe("Tu cierre de mes está listo");
    expect(notification.body).toContain("Julio de 2026");
  });

  it("says nothing when the month that ended was empty", () => {
    // Otherwise it would be telling the user their report on nothing is ready.
    expect(
      pendingNotifications(sources({ transactions: [anExpenseOn("2026-08-02")] }), TODAY),
    ).toEqual([]);
  });

  it("never announces the month still being lived in", () => {
    expect(
      pendingNotifications(sources({ transactions: [anExpenseOn("2026-08-23")] }), TODAY),
    ).toEqual([]);
  });

  it("gives each month its own id, so one is never mistaken for the next", () => {
    const [july] = pendingNotifications(
      sources({ transactions: [anExpenseOn("2026-07-12")] }),
      "2026-08-23",
    );
    const [august] = pendingNotifications(
      sources({ transactions: [anExpenseOn("2026-08-12")] }),
      "2026-09-02",
    );

    expect(july.id).not.toBe(august.id);
  });

  it("says nothing when the month that ended only moved money between accounts", () => {
    const transfer: Transaction = {
      ...anExpenseOn("2026-07-12"),
      type: "transfer",
      destination_payment_method_id: 2,
    };
    expect(pendingNotifications(sources({ transactions: [transfer] }), TODAY)).toEqual(
      [],
    );
  });

  it("counts a movement in any currency, since the close is read in the app", () => {
    const [notification] = pendingNotifications(
      sources({ transactions: [anExpenseOn("2026-07-12", "USD")] }),
      TODAY,
    );

    expect(notification.id).toBe("monthly-close:2026-07");
  });
});

describe("expected movements", () => {
  it("announces one whose date has arrived", () => {
    const [notification] = pendingNotifications(
      sources({ expectedMovements: [anExpected()] }),
      TODAY,
    );

    // Worded as a reminder, not as a bill: nothing here is owed to anyone.
    expect(notification.title).toBe("Llegó algo que tenías previsto");
    expect(notification.body).toContain("Casamiento");
  });

  it("says nothing about one that is still ahead", () => {
    expect(
      pendingNotifications(
        sources({ expectedMovements: [anExpected({ due_date: "2026-12-01" })] }),
        TODAY,
      ),
    ).toEqual([]);
  });

  it("says nothing about one already confirmed or dismissed", () => {
    const settled = [
      anExpected({ id: 1, status: "confirmed" }),
      anExpected({ id: 2, status: "dismissed" }),
    ];

    expect(pendingNotifications(sources({ expectedMovements: settled }), TODAY)).toEqual(
      [],
    );
  });

  it("treats a moved date as a new fact worth announcing again", () => {
    // The id carries the due date for the same reason an instalment's carries
    // its number: rescheduling makes it a different thing to be told about.
    const [first] = pendingNotifications(
      sources({ expectedMovements: [anExpected({ due_date: "2026-08-10" })] }),
      TODAY,
    );
    const [second] = pendingNotifications(
      sources({ expectedMovements: [anExpected({ due_date: "2026-08-20" })] }),
      TODAY,
    );

    expect(first.id).not.toBe(second.id);
  });
});

describe("decideNotifications", () => {
  const a = { id: "a", title: "A", body: "" };
  const b = { id: "b", title: "B", body: "" };

  it("sends everything the first time", () => {
    const { toSend } = decideNotifications([a, b], []);
    expect(toSend.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("does not repeat what was already announced", () => {
    // The whole point: opening the app twice must not announce the same
    // overdue instalment twice.
    const { toSend } = decideNotifications([a, b], ["a"]);
    expect(toSend.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("forgets facts that stopped being true", () => {
    // "a" was announced and has since been dealt with, so it must not be
    // remembered forever — the stored set would grow without bound.
    const { nextSeen } = decideNotifications([b], ["a"]);
    expect(nextSeen).toEqual(["b"]);
  });

  it("announces a fact again if it comes back after being resolved", () => {
    const resolved = decideNotifications([], ["a"]);
    expect(resolved.nextSeen).toEqual([]);

    const returned = decideNotifications([a], resolved.nextSeen);
    expect(returned.toSend.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("sends nothing when there is nothing pending", () => {
    expect(decideNotifications([], ["a", "b"]).toSend).toEqual([]);
  });
});
