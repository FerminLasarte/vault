import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Transaction } from "@/db/schema";
import { detectDelimiter, parseCsv } from "@/lib/csv";
import { parseFlexibleDate } from "@/lib/importMapping";
import { normalizeForSearch } from "@/lib/text";
import { predictCategory, trainCategoryModel } from "./categoryModel";

// How well the category model does on someone's real history, to tune
// MIN_EVIDENCE and MIN_CONFIDENCE on data rather than by feel. Never part of a
// normal run: it needs a file exported from the app (Ajustes › Exportar a CSV),
// which holds real finances and never belongs in the repository.
//
//   VAULT_EVAL_CSV=~/Desktop/vault.csv npx vitest run categoryModel.eval --reporter=verbose
//
// It learns from the oldest 80% of the movements and predicts the newest 20%,
// the way the model meets new movements in use, and prints how many it dared to
// place (coverage) and how many of those it got right (accuracy).
const FILE = process.env.VAULT_EVAL_CSV;

describe.runIf(FILE)("the category model on a real export", () => {
  it("prints its coverage and accuracy", () => {
    const text = readFileSync(FILE!, "utf8");
    const rows = parseCsv(text, detectDelimiter(text));
    const header = rows[0].map(normalizeForSearch);
    const column = (name: string) => header.indexOf(name);
    const categories = new Map<string, number>();

    const transactions: Transaction[] = rows.slice(1).flatMap((row, index) => {
      const type = normalizeForSearch(row[column("tipo")] ?? "");
      const category = (row[column("categoria")] ?? "").trim();
      const date = parseFlexibleDate(row[column("fecha")] ?? "");
      if ((type !== "gasto" && type !== "ingreso") || category === "" || date === null) {
        return [];
      }
      const key = `${type}|${category}`;
      if (!categories.has(key)) categories.set(key, categories.size + 1);
      return [
        {
          id: index,
          amount: 1,
          type: type === "gasto" ? "expense" : "income",
          category_id: categories.get(key)!,
          payment_method_id: null,
          destination_payment_method_id: null,
          destination_amount: null,
          description: row[column("descripcion")] ?? "",
          date,
          currency: "ARS",
          category_suggested: 0,
        },
      ];
    });
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    const cut = Math.floor(transactions.length * 0.8);
    const model = trainCategoryModel(transactions.slice(0, cut));
    const tested = transactions.slice(cut);

    let placed = 0;
    let right = 0;
    for (const transaction of tested) {
      const prediction = predictCategory(model, {
        description: transaction.description,
        type: transaction.type === "income" ? "income" : "expense",
      });
      if (prediction === null) continue;
      placed++;
      if (prediction.categoryId === transaction.category_id) right++;
    }

    const percent = (part: number, whole: number) =>
      `${Math.round((part / Math.max(whole, 1)) * 100)}%`;
    console.info(
      `Learned from ${cut}, tested ${tested.length}: placed ${percent(placed, tested.length)}` +
        `, right ${percent(right, placed)} of those.`,
    );
    expect(tested.length).toBeGreaterThan(0);
  });
});
