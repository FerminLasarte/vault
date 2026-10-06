import type { LedgerContext } from "@/lib/ai/ledger";
import type { TransactionWithCategory } from "@/db/schema";

// Movements as the lists hold them, for the tests of the ledger checks: split
// transfers and near-duplicates, in Atención and on import.

export const TODAY = "2026-10-06";

// Pesos per dollar on every day.
export const RATE = 1450;

export const BANK = 1;
export const WALLET = 2;
export const DOLLARS = 3;

export const LEDGER: LedgerContext = {
  rateAt: () => RATE,
  fromExpected: new Set(),
  isDismissed: () => false,
};

let nextId = 1;

export function held(
  overrides: Partial<TransactionWithCategory> = {},
): TransactionWithCategory {
  return {
    id: nextId++,
    amount: 50000,
    type: "expense",
    category_id: null,
    payment_method_id: BANK,
    destination_payment_method_id: null,
    destination_amount: null,
    description: "TRANSF 0012",
    date: "2026-10-01",
    currency: "ARS",
    category_suggested: 0,
    category_name: null,
    category_color: null,
    category_icon: null,
    payment_method_name: "Banco",
    destination_payment_method_name: null,
    destination_currency: null,
    tag_names: null,
    attachment_count: 0,
    ...overrides,
  };
}
