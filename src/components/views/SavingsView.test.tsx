// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SavingsView } from "./SavingsView";
import type { AppData } from "@/context/AppDataContext";
import type { SavingsGoalWithNames } from "@/db";

// The view reads everything through this one hook, so replacing it is enough to
// drive the component without a database or a Tauri runtime behind it.
const appData = vi.hoisted(() => ({ current: {} as AppData }));

vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
}));

function aGoal(
  id: number,
  overrides: Partial<SavingsGoalWithNames> = {},
): SavingsGoalWithNames {
  return {
    id,
    name: `Objetivo ${id}`,
    target_amount: 100000,
    currency: "ARS",
    tracking_mode: "contributions",
    payment_method_id: null,
    target_date: null,
    created_at: "2026-01-01",
    payment_method_name: null,
    ...overrides,
  };
}

function renderView(savingsGoals: SavingsGoalWithNames[]) {
  appData.current = {
    savingsGoals,
    savingsContributions: [],
    paymentMethods: [],
    transactions: [],
    isLoading: false,
    isMutating: false,
    addSavingsGoal: vi.fn(),
    editSavingsGoal: vi.fn(),
    removeSavingsGoal: vi.fn(),
    addSavingsContribution: vi.fn(),
  } as unknown as AppData;

  return render(<SavingsView />);
}

describe("SavingsView contribution input", () => {
  // A placeholder is not a name: a screen reader announces the field as an
  // unnamed text box, and with two goals there is no telling them apart.
  it("names each goal's input after its goal", () => {
    renderView([aGoal(1, { name: "Viaje a Japón" }), aGoal(2, { name: "Auto" })]);

    expect(
      screen.getByRole("spinbutton", { name: "Aporte para Viaje a Japón" }),
    ).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Aporte para Auto" })).toBeTruthy();
  });
});
