// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RecurringDialog } from "./RecurringDialog";
import type {
  Category,
  NewRecurringTransaction,
  PaymentMethod,
  RecurringTransactionWithNames,
} from "@/db";

beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
  });
});

const CATEGORIES: Category[] = [
  { id: 1, name: "Alquiler", type: "expense", color: "#000", icon: "🏠" },
];

// Two in pesos and one in dollars on purpose: the Select only looks for its
// value again when the number of its items changes.
const ACCOUNTS: PaymentMethod[] = [
  { id: 1, name: "Banco ARS", type: "bank", currency: "ARS", initial_balance: 0 },
  { id: 2, name: "Efectivo", type: "cash", currency: "ARS", initial_balance: 0 },
  { id: 3, name: "Banco USD", type: "bank", currency: "USD", initial_balance: 0 },
];

const RENT: RecurringTransactionWithNames = {
  id: 10,
  description: "Alquiler",
  amount: 300000,
  type: "expense",
  category_id: 1,
  payment_method_id: 1,
  currency: "ARS",
  frequency: "monthly",
  start_date: "2026-01-01",
  last_confirmed_date: null,
  is_active: 1,
  category_name: "Alquiler",
  category_icon: "🏠",
  payment_method_name: "Banco ARS",
};

function renderDialog(
  onSubmitRecurring = vi.fn(() => Promise.resolve()),
  {
    editing = RENT,
    draft = null,
  }: {
    editing?: RecurringTransactionWithNames | null;
    draft?: NewRecurringTransaction | null;
  } = {},
) {
  render(
    <RecurringDialog
      open
      onOpenChange={vi.fn()}
      editing={editing}
      draft={draft}
      categories={CATEGORIES}
      paymentMethods={ACCOUNTS}
      onSubmitRecurring={onSubmitRecurring}
    />,
  );
  return onSubmitRecurring;
}

async function choose(
  user: ReturnType<typeof userEvent.setup>,
  trigger: string,
  option: RegExp,
) {
  await user.click(document.querySelector(trigger)!);
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("RecurringDialog", () => {
  // The account list only offers accounts in the chosen currency, so switching
  // it hid the account while the form went on holding it: the template was
  // saved in dollars against a peso account.
  it("drops the account once the currency leaves it behind", async () => {
    const user = userEvent.setup();
    const onSubmitRecurring = renderDialog();

    await choose(user, "#recurring-currency", /Dólar/);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmitRecurring).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "USD", paymentMethodId: null }),
    );
  });

  // Once its list has been opened, the Select also reports a null of its own
  // when the account drops out of it. That null was read as account 0, which
  // the schema rejects with nothing on screen: the dialog refused to save.
  it("still saves after the account was picked from the list", async () => {
    const user = userEvent.setup();
    const onSubmitRecurring = renderDialog();

    await choose(user, "#recurring-account", /Banco ARS/);
    await choose(user, "#recurring-currency", /Dólar/);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmitRecurring).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "USD", paymentMethodId: null }),
    );
  });

  // What the local AI found repeating, handed over to be added in one step.
  it("opens a new one on the draft it is handed", async () => {
    const user = userEvent.setup();
    const draft: NewRecurringTransaction = {
      description: "Spotify",
      amount: 4500,
      type: "expense",
      currency: "ARS",
      categoryId: 1,
      paymentMethodId: 2,
      frequency: "monthly",
      startDate: "2026-10-10",
      isActive: true,
    };
    const onSubmitRecurring = renderDialog(undefined, { editing: null, draft });

    expect(screen.getByRole("heading", { name: "Nueva recurrente" })).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toHaveProperty("value", "Spotify");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmitRecurring).toHaveBeenCalledWith(draft);
  });

  // A price that went up: the template, with the new amount already in.
  it("edits a template from the draft it is handed", async () => {
    const user = userEvent.setup();
    const onSubmitRecurring = renderDialog(undefined, {
      draft: {
        description: RENT.description,
        amount: 330000,
        type: RENT.type,
        currency: RENT.currency,
        categoryId: RENT.category_id,
        paymentMethodId: RENT.payment_method_id,
        frequency: RENT.frequency,
        startDate: RENT.start_date,
        isActive: true,
      },
    });

    expect(screen.getByRole("heading", { name: "Editar recurrente" })).toBeTruthy();
    expect(screen.getByLabelText("Monto")).toHaveProperty("value", "330000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmitRecurring).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 330000, startDate: RENT.start_date }),
    );
  });
});
