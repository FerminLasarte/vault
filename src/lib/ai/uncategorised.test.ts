import { describe, expect, it } from "vitest";
import type { Category, CategoryRule, Transaction } from "@/db/schema";
import { trainCategoryModel } from "./categoryModel";
import { MIN_GROUP_SIZE, groupUncategorised } from "./uncategorised";

const CATEGORIES: Category[] = [
  { id: 1, name: "Salario", type: "income", color: "", icon: "" },
  { id: 3, name: "Comida", type: "expense", color: "", icon: "" },
  { id: 4, name: "Transporte", type: "expense", color: "", icon: "" },
];

let nextId = 1;
function movement(
  description: string,
  categoryId: number | null,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id: nextId++,
    amount: 1000,
    type: "expense",
    category_id: categoryId,
    payment_method_id: 1,
    destination_payment_method_id: null,
    destination_amount: null,
    description,
    date: "2026-09-01",
    currency: "ARS",
    category_suggested: 0,
    ...overrides,
  };
}

function times(count: number, description: string, categoryId: number | null) {
  return Array.from({ length: count }, () => movement(description, categoryId));
}

const NOTHING_DISMISSED = () => false;

function group(
  transactions: Transaction[],
  rules: CategoryRule[] = [],
  isDismissed: (id: string) => boolean = NOTHING_DISMISSED,
) {
  return groupUncategorised(
    transactions,
    { rules, categories: CATEGORIES, model: trainCategoryModel(transactions) },
    isDismissed,
  );
}

describe("groupUncategorised", () => {
  it("gathers uncategorised movements by the category they seem to belong to", () => {
    const older = movement("rappi", null, { date: "2026-08-01" });
    const newer = movement("rappi", null, { date: "2026-09-10" });
    const groups = group([...times(3, "rappi", 3), older, newer]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "uncategorised:3",
      categoryId: 3,
      categoryName: "Comida",
    });
    expect(groups[0].rows).toEqual([
      {
        transaction: newer,
        reason: "Tus 3 movimientos con «rappi» están en Comida.",
        dismissalId: `categorise:${newer.id}:3`,
      },
      {
        transaction: older,
        reason: "Tus 3 movimientos con «rappi» están en Comida.",
        dismissalId: `categorise:${older.id}:3`,
      },
    ]);
  });

  it(`leaves a group of fewer than ${MIN_GROUP_SIZE} to the inspector`, () => {
    const history = times(3, "rappi", 3);

    expect(group([...history, ...times(MIN_GROUP_SIZE - 1, "rappi", null)])).toEqual([]);
    expect(group([...history, ...times(MIN_GROUP_SIZE, "rappi", null)])).toHaveLength(1);
  });

  // A rule nobody applied to movements older than it still knows where they go.
  it("uses the user's rules first, and says so", () => {
    const rule: CategoryRule = { id: 9, pattern: "Cabify", category_id: 4 };
    const [found] = group(times(2, "CABIFY VIAJE", null), [rule]);

    expect(found.categoryName).toBe("Transporte");
    expect(found.rows[0].reason).toBe("Coincide con tu regla «Cabify».");
  });

  it("leaves out what is already categorised, transfers, and what it cannot place", () => {
    const transactions = [
      ...times(3, "rappi", 3),
      movement("rappi", 3, { category_suggested: 1 }),
      movement("rappi", null, { type: "transfer" }),
      ...times(2, "kiosco", null),
    ];

    expect(group(transactions)).toEqual([]);
  });

  it("keeps a movement the user waved away for that category out of it", () => {
    const pending = times(3, "rappi", null);
    const dismissed = `categorise:${pending[0].id}:3`;
    const [found] = group(
      [...times(3, "rappi", 3), ...pending],
      [],
      (id) => id === dismissed,
    );

    expect(found.rows.map((row) => row.transaction.id)).toEqual([
      pending[2].id,
      pending[1].id,
    ]);
  });

  it("puts the biggest group first", () => {
    const groups = group([
      ...times(3, "rappi", 3),
      ...times(3, "uber", 4),
      ...times(2, "rappi", null),
      ...times(3, "uber", null),
    ]);

    expect(groups.map((found) => found.categoryName)).toEqual(["Transporte", "Comida"]);
  });
});
