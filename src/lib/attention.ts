import { formatMonthLabel } from "@/lib/format";
import type { BackupStatus } from "@/lib/backupReminder";
import type { BudgetProgress } from "@/lib/finance";

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
  "budget" | "backup" | "pending" | "suggested" | "uncategorised" | "close";

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
  // The month whose close is ready and unseen, or null when there is none.
  pendingClose: string | null;
}): AttentionItem[] {
  // What the AI already wrote comes before what it could write.
  const ai = [
    suggestedItem(sources.suggestedCount),
    ...sources.uncategorised.map(uncategorisedItem),
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
