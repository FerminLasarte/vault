import {
  formatCurrency,
  formatDate,
  formatMonthLabel,
  formatPercent,
} from "@/lib/format";
import type { BackupStatus } from "@/lib/backupReminder";
import type { BudgetProgress } from "@/lib/finance";
import type { RecurrenceFrequency } from "@/lib/recurring";
import type { LateIncome } from "@/lib/ai/lateIncome";
import { merchantName } from "@/lib/ai/merchants";
import type { NearDuplicate } from "@/lib/ai/nearDuplicates";
import type { SplitTransfer } from "@/lib/ai/splitTransfers";
import type { TransactionWithCategory } from "@/db/schema";
import { RISE_BASELINE, type PriceRise } from "@/lib/ai/priceRises";
import type { UnregisteredSeries } from "@/lib/ai/unregisteredSeries";

// What the overview needs to tell the user before it shows them a
// single figure.
//
// These used to be three separate cards stacked one on top of another, each
// with its own heading and its own border. Three of them can be true at once,
// which pushed every actual number below the fold and made the screen open
// with a wall of warnings. Deciding *what* to say is kept here, apart from the
// drawing, so the wording and the priorities can be tested without a DOM.

export type AttentionTone = "critical" | "neutral";

export type AttentionKind =
  | "budget"
  | "backup"
  | "pending"
  | "late"
  | "rise"
  | "duplicate"
  | "transfer"
  | "suggested"
  | "uncategorised"
  | "unregistered"
  | "close";

// The local AI's notices share the line with everything else, and never take
// it over: at most this many at once, the most pressing first; the rest wait
// for these to be dealt with.
export const MAX_AI_NOTICES = 3;

export interface AttentionItem {
  // Tells apart two notices of the same kind: one per group of uncategorised
  // movements. The kind itself for the rest.
  key: string;
  kind: AttentionKind;
  tone: AttentionTone;
  // The headline: what happened.
  title: string;
  // What to do about it, or where to go. Never repeats the title.
  detail: string;
  // When the row can be acted on from where it sits. Only the label lives here:
  // this module stays data, so what the button *does* is the screen's business
  // and the wording stays testable without a DOM.
  actionLabel?: string;
  // The local AI's id for it, when it can be waved away from the line itself
  // (see isDismissed). The rest go away once dealt with.
  dismissalId?: string;
}

function budgetItem(overspent: BudgetProgress[]): AttentionItem | null {
  if (overspent.length === 0) return null;

  return {
    key: "budget",
    kind: "budget",
    tone: "critical",
    title:
      overspent.length === 1
        ? "Superaste un presupuesto"
        : `Superaste ${overspent.length} presupuestos`,
    detail: overspent
      .map((entry) => `${entry.budget.category_name} (${Math.round(entry.ratio * 100)}%)`)
      .join(" · "),
  };
}

function backupItem(backup: BackupStatus): AttentionItem | null {
  if (!backup.isOverdue) return null;

  return {
    key: "backup",
    kind: "backup",
    tone: "critical",
    title:
      backup.daysAgo === null
        ? "Nunca guardaste una copia de seguridad"
        : `Hace ${backup.daysAgo} días que no guardás una copia`,
    detail: "Tus datos viven solo en este equipo. Guardá una desde Ajustes.",
  };
}

function pendingItem(pendingCount: number): AttentionItem | null {
  if (pendingCount <= 0) return null;

  return {
    key: "pending",
    kind: "pending",
    tone: "neutral",
    title:
      pendingCount === 1
        ? "Tenés 1 movimiento pendiente de confirmar"
        : `Tenés ${pendingCount} movimientos pendientes de confirmar`,
    detail: "Revisalos en Compromisos.",
  };
}

// Categories the local AI chose on import that nobody has looked at yet. Work
// to do rather than something wrong, and where to do it.
function suggestedItem(suggestedCount: number): AttentionItem | null {
  if (suggestedCount <= 0) return null;

  return {
    key: "suggested",
    kind: "suggested",
    tone: "neutral",
    title:
      suggestedCount === 1
        ? "Revisá 1 categoría sugerida por IA"
        : `Revisá ${suggestedCount} categorías sugeridas por IA`,
    detail:
      "En Transacciones, con «Sugeridas por IA»: confirmalas o cambiales la categoría.",
  };
}

// A group of movements nobody categorised that the AI can place together.
function uncategorisedItem(group: {
  id: string;
  size: number;
  categoryName: string;
}): AttentionItem {
  return {
    key: group.id,
    kind: "uncategorised",
    tone: "neutral",
    title:
      group.size === 1
        ? `1 movimiento sin categoría parece ${group.categoryName}`
        : `${group.size} movimientos sin categoría parecen ${group.categoryName}`,
    detail: "Revisalos y aplicales la categoría de una vez.",
    actionLabel: "Revisar",
  };
}

// Monthly income that has not come in when it usually has by now.
function lateIncomeItem(late: LateIncome): AttentionItem {
  const { usualDay, earliestDay, latestDay, months } = late;
  return {
    key: late.id,
    kind: "late",
    tone: "neutral",
    title: `${late.series.merchant.label} suele entrar alrededor del ${usualDay} y todavía no llegó`,
    detail:
      earliestDay === latestDay
        ? `En los últimos ${months} meses entró el ${usualDay}.`
        : `En los últimos ${months} meses entró entre el ${earliestDay} y el ${latestDay}.`,
    dismissalId: late.id,
  };
}

// A monthly charge that just went up. For a declared recurring movement still
// at an older amount, the offer to bring it up to date; for one nobody declared
// and that was not turned down as recurring, the offer to add it, which its own
// notice would have made (see buildAttentionItems).
function riseItem(rise: PriceRise, canAdd: boolean): AttentionItem {
  const { currency, label } = rise.series.merchant;
  const compared = `Comparado con los ${RISE_BASELINE} cobros anteriores.`;
  return {
    key: rise.id,
    kind: "rise",
    tone: "neutral",
    title: `${label} pasó de ${formatCurrency(rise.previous, currency)} a ${formatCurrency(rise.latest, currency)} (+${formatPercent(rise.rise)})`,
    detail:
      rise.recurring === null
        ? compared
        : `${compared} Tu recurrente todavía dice ${formatCurrency(rise.recurring.amount, currency)}.`,
    actionLabel: rise.recurring !== null ? "Actualizar" : canAdd ? "Agregar" : undefined,
    dismissalId: rise.id,
  };
}

// Two movements that look like the same one. Named after what is not a
// transfer, which is what has a merchant, by its clean name when one has it.
function duplicateItem(pair: NearDuplicate<TransactionWithCategory>): AttentionItem {
  const movements = pair.movements.filter((movement) => movement.type !== "transfer");
  const named = movements[0] ?? pair.movements[0];
  const name =
    movements.map((movement) => merchantName(movement.description)).find(Boolean) ??
    named.description;
  return {
    key: pair.id,
    kind: "duplicate",
    tone: "neutral",
    title: `Posible duplicado: ${name} por ${formatCurrency(named.amount, named.currency)}`,
    detail: `${pair.reason} Revisalos y eliminá el que sobra.`,
    actionLabel: "Revisar",
    dismissalId: pair.id,
  };
}

// An expense and an income that are one transfer between two of the user's
// accounts, counted twice until joined.
function transferItem(offer: SplitTransfer<TransactionWithCategory>): AttentionItem {
  const from = offer.outgoing.payment_method_name ?? "una cuenta";
  const to = offer.incoming.payment_method_name ?? "otra";
  return {
    key: offer.id,
    kind: "transfer",
    tone: "neutral",
    title: `Parece una transferencia de ${from} a ${to}`,
    detail: `${offer.reason} Unidos, no cuentan como gasto ni como ingreso.`,
    actionLabel: "Unir",
    dismissalId: offer.id,
  };
}

const EVERY: Record<RecurrenceFrequency, string> = {
  weekly: "todas las semanas",
  monthly: "todos los meses",
  yearly: "todos los años",
};

// Something that repeats and was never declared as recurring.
function unregisteredItem(offer: UnregisteredSeries): AttentionItem {
  const { merchant, frequency, movements, typicalAmount, lastDate } = offer.series;
  const verb = merchant.type === "expense" ? "pagás" : "cobrás";
  return {
    key: offer.id,
    kind: "unregistered",
    tone: "neutral",
    title: `Parece que ${verb} ${merchant.label} ${EVERY[frequency]}`,
    detail: `${movements.length} veces seguidas, cerca de ${formatCurrency(typicalAmount, merchant.currency)}; la última el ${formatDate(lastDate)}.`,
    actionLabel: "Agregar",
    dismissalId: offer.id,
  };
}

// A month that has finished, has something in it, and has not been dealt with
// yet. Informational rather than a warning: nothing is wrong, something is
// ready — which is why it carries a neutral tone and sits last.
function closeItem(monthKey: string | null): AttentionItem | null {
  if (monthKey === null) return null;

  return {
    key: "close",
    kind: "close",
    tone: "neutral",
    title: `El cierre de ${formatMonthLabel(monthKey)} está listo`,
    detail: "Ingresos, gastos y la comparación con el mes anterior y el año pasado.",
    actionLabel: "Guardar como PDF",
  };
}

// Ordered by how much it costs to ignore each one: money already spent, then
// data that could be lost, then work still to do, and last the one where
// nothing is wrong at all. The order is fixed rather than sorted by tone, so
// the same situation always reads the same way.
export function buildAttentionItems(sources: {
  overspent: BudgetProgress[];
  backup: BackupStatus;
  pendingCount: number;
  // Categories the local AI chose and nobody confirmed; 0 with it switched off.
  suggestedCount: number;
  // Uncategorised movements the AI can place, biggest group first; empty with
  // it switched off.
  uncategorised: { id: string; size: number; categoryName: string }[];
  // What the AI read from repeating movements; empty with it switched off.
  lateIncome: LateIncome[];
  rises: PriceRise[];
  unregistered: UnregisteredSeries[];
  // Movements the AI read as recorded twice, or as one transfer split in two;
  // empty with it switched off.
  duplicates: NearDuplicate<TransactionWithCategory>[];
  transfers: SplitTransfer<TransactionWithCategory>[];
  // The month whose close is ready and unseen, or null when there is none.
  pendingClose: string | null;
}): AttentionItem[] {
  // Money missing and money spent beyond the usual first; then totals that
  // count something twice; then what the AI already wrote, before what it
  // could write; and last what would only save typing.
  //
  // One notice per series: while it has gone up, the rise speaks for it and
  // carries the offer to add it, and "Parece que pagás…" waits.
  const risen = new Set(sources.rises.map((rise) => rise.series.id));
  const addable = new Set(sources.unregistered.map((offer) => offer.series.id));
  const ai = [
    ...sources.lateIncome.map(lateIncomeItem),
    ...sources.rises.map((rise) => riseItem(rise, addable.has(rise.series.id))),
    ...sources.duplicates.map(duplicateItem),
    ...sources.transfers.map(transferItem),
    suggestedItem(sources.suggestedCount),
    ...sources.uncategorised.map(uncategorisedItem),
    ...sources.unregistered
      .filter((offer) => !risen.has(offer.series.id))
      .map(unregisteredItem),
  ]
    .filter((item): item is AttentionItem => item !== null)
    .slice(0, MAX_AI_NOTICES);

  return [
    budgetItem(sources.overspent),
    backupItem(sources.backup),
    pendingItem(sources.pendingCount),
    ...ai,
    closeItem(sources.pendingClose),
  ].filter((item): item is AttentionItem => item !== null);
}
