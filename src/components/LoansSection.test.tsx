// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoansSection } from "./LoansSection";
import type { AppData } from "@/context/AppDataContext";
import type { LoanWithNames } from "@/db";

// The section reads everything through this one hook, so replacing it is enough
// to drive the component without a database or a Tauri runtime behind it.
const appData = vi.hoisted(() => ({ current: {} as AppData }));

vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
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
    categories: [],
    paymentMethods: [],
    isLoading: false,
    isMutating: false,
    addLoan: vi.fn(),
    editLoan: vi.fn(),
    removeLoan: vi.fn(),
    confirmLoanPayment: vi.fn(),
  } as unknown as AppData;

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
});
