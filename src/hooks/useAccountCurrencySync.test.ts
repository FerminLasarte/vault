// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { useAccountCurrencySync } from "./useAccountCurrencySync";
import type { PaymentMethod } from "@/db";

const ACCOUNTS: PaymentMethod[] = [
  { id: 1, name: "Efectivo", type: "cash", currency: "ARS", initial_balance: 0 },
  { id: 2, name: "Banco ARS", type: "bank", currency: "ARS", initial_balance: 0 },
  { id: 3, name: "Banco USD", type: "bank", currency: "USD", initial_balance: 0 },
];

interface Values {
  currency: string;
  paymentMethodId: number | null;
}

interface HarnessProps {
  row: Values;
  paymentMethods: PaymentMethod[];
}

// Stands in for the dialogs: a form, an effect that loads a row into it, and
// the sync declared after that effect — the order the hook relies on.
function useHarness({ row, paymentMethods }: HarnessProps) {
  const form = useForm<Values>({
    defaultValues: { currency: "ARS", paymentMethodId: null },
  });

  const { reset } = form;
  useEffect(() => {
    reset(row);
  }, [row, reset]);

  const available = useAccountCurrencySync({
    form,
    paymentMethods,
    currencyField: "currency",
    accountField: "paymentMethodId",
  });

  return { form, available };
}

function renderSync(props: Partial<HarnessProps> = {}) {
  return renderHook(useHarness, {
    initialProps: {
      row: { currency: "ARS", paymentMethodId: 2 },
      paymentMethods: ACCOUNTS,
      ...props,
    } satisfies HarnessProps,
  });
}

describe("useAccountCurrencySync", () => {
  it("keeps the account a row was just loaded with", () => {
    const { result, rerender } = renderSync();

    rerender({ row: { currency: "USD", paymentMethodId: 3 }, paymentMethods: ACCOUNTS });

    expect(result.current.form.getValues("paymentMethodId")).toBe(3);
  });

  // The list only offers accounts in the chosen currency, so switching it hid
  // the account while the form went on holding it: a template in dollars was
  // saved against a peso account.
  it("drops an account in another currency", () => {
    const { result } = renderSync();

    act(() => {
      result.current.form.setValue("currency", "USD");
    });

    expect(result.current.form.getValues("paymentMethodId")).toBeNull();
  });

  it("leaves an empty account empty", () => {
    // "Sin cuenta" is a real answer, so nothing may be chosen on the user's
    // behalf, not even the only account in the new currency.
    const { result } = renderSync({ row: { currency: "ARS", paymentMethodId: null } });

    act(() => {
      result.current.form.setValue("currency", "USD");
    });

    expect(result.current.form.getValues("paymentMethodId")).toBeNull();
  });

  it("offers only the accounts in the current currency", () => {
    const { result } = renderSync();

    expect(result.current.available.map((account) => account.id)).toEqual([1, 2]);

    act(() => {
      result.current.form.setValue("currency", "USD");
    });

    expect(result.current.available.map((account) => account.id)).toEqual([3]);
  });
});
