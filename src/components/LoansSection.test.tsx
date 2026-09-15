// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoansSection } from "./LoansSection";
import type { AppActions, AppData, AppStatus } from "@/context/AppDataContext";

// The provider's three halves, read here from one object.
type AppContext = AppData & AppActions & AppStatus;
import type { LoanWithNames } from "@/db";
import { collectPendingCommitments } from "@/lib/pendingCommitments";

// Every loan below falls due between January and March.
const TODAY = "2026-09-15";

// The section reads everything through this one hook, so replacing it is enough
// to drive the component without a database or a Tauri runtime behind it.
const appData = vi.hoisted(() => ({ current: {} as AppContext }));

vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
  useAppActions: () => appData.current,
  useAppStatus: () => appData.current,
}));

function aLoan(overrides: Partial<LoanWithNames> = {}): LoanWithNames {
  return {
    id: 1,
    direction: "borrowed",
    counterparty: "Martín",
    description: "Préstamo personal",
    principal: 100000,
    currency: "ARS",
    annual_rate: 0,
    installment_count: 1,
    category_id: null,
    payment_method_id: null,
    first_due_date: "2026-01-10",
    confirmed_count: 0,
    created_at: "2026-01-01",
    category_name: null,
    category_icon: null,
    payment_method_name: null,
    ...overrides,
  };
}

function renderSection(loans: LoanWithNames[]) {
  appData.current = {
    loans,
    today: TODAY,
    pending: collectPendingCommitments(
      { recurring: [], installmentPlans: [], loans, expectedMovements: [] },
      TODAY,
    ),
    categories: [],
    paymentMethods: [],
    isLoading: false,
    isMutating: false,
    addLoan: vi.fn(),
    editLoan: vi.fn(),
    removeLoan: vi.fn(),
    confirmLoanPayment: vi.fn(),
    registerAll: vi.fn(),
  } as unknown as AppContext;

  return render(<LoansSection />);
}

describe("LoansSection", () => {
  // One badge sits on the overdue payment and one on the loan itself. JSX drops
  // the line break between two expressions, so a separator written at the end
  // of a line ends up glued to both words.
  it("separates the direction from the counterparty in every badge", () => {
    renderSection([aLoan()]);

    const badges = screen.getAllByText(
      (_, node) =>
        node !== null &&
        node.children.length === 0 &&
        (node.textContent ?? "").includes("Martín"),
    );

    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge.textContent).toBe("Debo · Martín");
    }
  });

  it("registers every overdue payment in one go", () => {
    renderSection([aLoan({ installment_count: 3 })]);

    fireEvent.click(screen.getByRole("button", { name: "Registrar todas" }));

    // In order, as one call: the payments of one loan follow each other.
    const registerAll = appData.current.registerAll;
    expect(registerAll).toHaveBeenCalledOnce();
    expect(vi.mocked(registerAll).mock.calls[0][0]).toEqual([
      expect.objectContaining({ kind: "loan", id: 1, index: 0 }),
      expect.objectContaining({ kind: "loan", id: 1, index: 1 }),
      expect.objectContaining({ kind: "loan", id: 1, index: 2 }),
    ]);
  });
});
