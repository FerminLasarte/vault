// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountsView } from "./AccountsView";
import type { AppActions, AppData, AppStatus } from "@/context/AppDataContext";

// The provider's three halves, read here from one object.
type AppContext = AppData & AppActions & AppStatus;
import type { InstallmentPlanWithNames, LoanWithNames, PaymentMethod } from "@/db";

// The view reads everything through this one hook, so replacing it is enough to
// drive the component without a database or a Tauri runtime behind it.
const appData = vi.hoisted(() => ({ current: {} as AppContext }));

vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
  useAppActions: () => appData.current,
  useAppStatus: () => appData.current,
}));

const ACCOUNT: PaymentMethod = {
  id: 1,
  name: "Banco",
  type: "bank",
  currency: "ARS",
  initial_balance: 500000,
};

function aLoan(overrides: Partial<LoanWithNames> = {}): LoanWithNames {
  return {
    id: 1,
    direction: "borrowed",
    counterparty: "Martín",
    description: "Préstamo personal",
    principal: 120000,
    currency: "ARS",
    // A real rate, so any future interest counted as debt would show.
    annual_rate: 60,
    installment_count: 12,
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-10-10",
    confirmed_count: 0,
    created_at: "2026-09-01",
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

function renderView({
  loans = [],
  installmentPlans = [],
}: {
  loans?: LoanWithNames[];
  installmentPlans?: InstallmentPlanWithNames[];
}) {
  appData.current = {
    paymentMethods: [ACCOUNT],
    transactions: [],
    recurring: [],
    installmentPlans,
    loans,
    expectedMovements: [],
    savingsGoals: [],
    rateType: "blue",
    exchangeRate: {
      date: "2026-09-15",
      rate_type: "blue",
      buy: 1480,
      sell: 1500,
      source: "dolarapi",
      fetched_at: "2026-09-15T12:00:00Z",
    },
    isLoading: false,
    isMutating: false,
    isRefreshingRate: false,
  } as unknown as AppContext;

  return render(<AccountsView />);
}

// The card's figure and subtitle, read together from its header. Intl separates
// the figure from the currency with a non-breaking space, invisible in a diff.
function card(label: string): string {
  const header = screen.getByText(label).parentElement!;
  return header.textContent!.replace(/\u00a0/g, " ");
}

describe("AccountsView", () => {
  it("subtracts the capital of a loan taken from the net worth", () => {
    renderView({ loans: [aLoan()] });

    // The capital only: the interest of payments not yet due is not owed today.
    expect(card("Deuda pendiente")).toContain("$ 120.000,00");
    expect(card("Deuda pendiente")).toContain("préstamos");
    expect(card("Patrimonio neto")).toContain("$ 380.000,00");
  });

  it("adds the capital of a loan given to the net worth", () => {
    renderView({ loans: [aLoan({ direction: "lent", principal: 30000 })] });

    // Nothing is owed, so there is no debt to show.
    expect(screen.queryByText("Deuda pendiente")).not.toBeInTheDocument();
    expect(card("Patrimonio neto")).toContain("$ 530.000,00");
  });

  it("nets instalments and loans in both directions together", () => {
    renderView({
      installmentPlans: [
        {
          id: 1,
          description: "Heladera",
          total_amount: 60000,
          installment_count: 6,
          currency: "ARS",
          category_id: null,
          payment_method_id: null,
          first_due_date: "2026-10-10",
          confirmed_count: 0,
          created_at: "2026-09-01",
          cash_price: null,
          category_name: null,
          category_icon: null,
          payment_method_name: null,
        },
      ],
      loans: [aLoan(), aLoan({ id: 2, direction: "lent", principal: 30000 })],
    });

    expect(card("Deuda pendiente")).toContain("$ 180.000,00");
    // 500.000 - 60.000 - 120.000 + 30.000
    expect(card("Patrimonio neto")).toContain("$ 350.000,00");
  });
});
