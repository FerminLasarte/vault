import type {
  Category,
  CategoryRule,
  NewTransaction,
  PaymentMethod,
  Transaction,
  TransactionType,
  TransactionWithCategory,
} from "@/db/schema";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { normalizeForSearch as normalize } from "@/lib/text";
import { matchCategoryIdForType } from "@/lib/categoryRules";
import { parseFlexibleAmount, parseFlexibleDate } from "@/lib/importMapping";
import { splitTagNames } from "@/lib/text";

export const CSV_HEADERS = [
  "fecha",
  "tipo",
  "monto",
  "moneda",
  "categoria",
  "cuenta",
  "cuenta_destino",
  "monto_destino",
  "descripcion",
] as const;

// Written on export but not demanded on import, so a file produced before tags
// existed still loads instead of being rejected for a missing column.
export const TAGS_HEADER = "etiquetas";

const EXPORT_HEADERS = [...CSV_HEADERS, TAGS_HEADER];

// Quotes a field only when it needs it, per RFC 4180: a bare value stays bare,
// which keeps the file readable in a text editor.
function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatAmount(value: number | null): string {
  return value === null ? "" : String(value);
}

export function transactionsToCsv(transactions: TransactionWithCategory[]): string {
  const lines = [EXPORT_HEADERS.join(",")];

  for (const transaction of transactions) {
    lines.push(
      [
        transaction.date,
        TRANSACTION_TYPE_LABELS[transaction.type],
        String(transaction.amount),
        transaction.currency,
        transaction.category_name ?? "",
        transaction.payment_method_name ?? "",
        transaction.destination_payment_method_name ?? "",
        formatAmount(transaction.destination_amount),
        transaction.description ?? "",
        splitTagNames(transaction.tag_names).join(","),
      ]
        .map(escapeField)
        .join(","),
    );
  }

  // Trailing newline so the file ends the way POSIX tools expect.
  return `${lines.join("\n")}\n`;
}

// Full RFC 4180 parse: handles quoted fields containing commas, escaped
// quotes, and newlines inside a quoted value. Returns one array per record.
// Guesses which character separates the fields.
//
// Argentine banks export with semicolons, because the comma is already the
// decimal separator there. Counting occurrences outside quotes on the first
// few lines is enough: the true delimiter appears once per column on every
// row, and anything else appears by chance.
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const candidates = [",", ";", "\t"];

  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = sample.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  // Strip a UTF-8 BOM, which spreadsheet apps happily prepend and which would
  // otherwise corrupt the first header name.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < input.length) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }
    if (char === "\r") {
      index += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // A file that does not end in a newline still has a final record pending.
  if (field !== "" || row.length > 0) endRow();

  return rows.filter((entry) => entry.length > 1 || entry[0] !== "");
}

// Accepts both the Spanish labels this app exports and the raw stored values,
// so a file edited by hand or produced elsewhere still imports.
function parseType(value: string): TransactionType | null {
  const normalized = normalize(value);
  if (normalized === "ingreso" || normalized === "income") return "income";
  if (normalized === "gasto" || normalized === "expense") return "expense";
  if (normalized === "transferencia" || normalized === "transfer") return "transfer";
  return null;
}

export interface ImportSkip {
  line: number;
  reason: string;
}

// Tags live in their own table, so an imported row carries them alongside the
// transaction rather than inside it.
export interface ImportedTransaction {
  transaction: NewTransaction;
  tags: string[];
}

export interface ImportPlan {
  ready: ImportedTransaction[];
  skipped: ImportSkip[];
  duplicates: number;
}

export interface ImportContext {
  categories: Category[];
  // Applied only to rows that arrive with no category of their own, so an
  // explicit value in the file always wins over a rule.
  categoryRules?: CategoryRule[];
  accounts: PaymentMethod[];
  existing: Transaction[];
  supportedCurrencies: string[];
}

// Identifies a movement closely enough to catch a file being imported twice,
// without needing an id that a hand-edited file would not carry.
function duplicateKey(
  date: string,
  type: string,
  amount: number,
  currency: string,
  description: string,
): string {
  return [date, type, amount, currency, normalize(description)].join("|");
}

export function buildImportPlan(rows: string[][], context: ImportContext): ImportPlan {
  const ready: ImportedTransaction[] = [];
  const skipped: ImportSkip[] = [];
  let duplicates = 0;

  if (rows.length === 0) {
    return { ready, skipped, duplicates };
  }

  const header = rows[0].map(normalize);
  const column = (name: string) => header.indexOf(name);
  const missing = CSV_HEADERS.filter((name) => column(name) === -1);
  if (missing.length > 0) {
    return {
      ready,
      skipped: [
        { line: 1, reason: `Faltan columnas obligatorias: ${missing.join(", ")}` },
      ],
      duplicates,
    };
  }

  // Keyed by name *and* kind: the same name can legitimately exist as both an
  // income and an expense category ("Trabajo" earned versus "Trabajo" spent),
  // and keying by name alone silently resolved every such row to whichever one
  // happened to come last.
  const categoryByNameAndType = new Map(
    context.categories.map((category) => [
      `${normalize(category.name)}|${category.type}`,
      category,
    ]),
  );
  const accountByName = new Map(
    context.accounts.map((account) => [normalize(account.name), account]),
  );

  // How many of each movement the database already holds. A row is skipped
  // only while the file has not brought more of it than that, so importing the
  // same file twice adds nothing, while two identical fares on one day both
  // make it in.
  const alreadyHeld = new Map<string, number>();
  for (const transaction of context.existing) {
    const key = duplicateKey(
      transaction.date,
      transaction.type,
      transaction.amount,
      transaction.currency,
      transaction.description ?? "",
    );
    alreadyHeld.set(key, (alreadyHeld.get(key) ?? 0) + 1);
  }

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    // Header row is line 1, so the first data row is line 2.
    const line = index + 1;
    const cell = (name: string) => (row[column(name)] ?? "").trim();

    // Dates and amounts are read the way a bank statement is: the app writes
    // "2026-08-01" and "1234.56", but the same file saved again by Excel in an
    // Argentine locale says "1/8/2026" and "1234,56".
    const rawDate = cell("fecha");
    const date = parseFlexibleDate(rawDate);
    if (date === null) {
      skipped.push({
        line,
        reason: `Fecha inválida: "${rawDate}" (se espera AAAA-MM-DD o DD/MM/AAAA)`,
      });
      continue;
    }

    const type = parseType(cell("tipo"));
    if (type === null) {
      skipped.push({ line, reason: `Tipo desconocido: "${cell("tipo")}"` });
      continue;
    }

    const amount = parseFlexibleAmount(cell("monto"));
    if (amount === null || amount <= 0) {
      skipped.push({ line, reason: `Monto inválido: "${cell("monto")}"` });
      continue;
    }

    const currency = cell("moneda").toUpperCase();
    if (!context.supportedCurrencies.includes(currency)) {
      skipped.push({ line, reason: `Moneda no admitida: "${currency}"` });
      continue;
    }

    const description = cell("descripcion");
    if (description === "") {
      skipped.push({ line, reason: "Falta la descripción" });
      continue;
    }

    // An empty account is allowed and lands unattached; a name that does not
    // match anything is a mistake worth reporting rather than silently dropping.
    const accountName = cell("cuenta");
    const account = accountName === "" ? null : accountByName.get(normalize(accountName));
    if (accountName !== "" && account === undefined) {
      skipped.push({ line, reason: `Cuenta desconocida: "${accountName}"` });
      continue;
    }

    let categoryId: number | null = null;
    let destinationId: number | null = null;
    let destinationAmount: number | null = null;

    if (type === "transfer") {
      const destinationName = cell("cuenta_destino");
      const destination = accountByName.get(normalize(destinationName));
      if (destination === undefined) {
        skipped.push({
          line,
          reason: `Cuenta de destino desconocida: "${destinationName}"`,
        });
        continue;
      }
      destinationId = destination.id;
      // An omitted destination amount means the transfer did not change
      // currency, so the same figure lands on the other side.
      destinationAmount = parseFlexibleAmount(cell("monto_destino")) ?? amount;
    } else {
      const categoryName = cell("categoria");
      if (categoryName !== "") {
        const category = categoryByNameAndType.get(`${normalize(categoryName)}|${type}`);
        if (category === undefined) {
          skipped.push({
            line,
            reason: `No existe la categoría "${categoryName}" para ${
              type === "income" ? "ingresos" : "gastos"
            }`,
          });
          continue;
        }
        categoryId = category.id;
      } else {
        categoryId = matchCategoryIdForType(
          description,
          context.categoryRules ?? [],
          context.categories,
          type,
        );
      }
    }

    const key = duplicateKey(date, type, amount, currency, description);
    const held = alreadyHeld.get(key) ?? 0;
    if (held > 0) {
      alreadyHeld.set(key, held - 1);
      duplicates += 1;
      continue;
    }

    const tagColumn = column(TAGS_HEADER);
    const tags =
      tagColumn === -1 ? [] : splitTagNames((row[tagColumn] ?? "").trim() || null);

    ready.push({
      transaction: {
        amount,
        type,
        currency,
        categoryId,
        paymentMethodId: account?.id ?? null,
        destinationPaymentMethodId: destinationId,
        destinationAmount,
        description,
        date,
      },
      tags,
    });
  }

  return { ready, skipped, duplicates };
}
