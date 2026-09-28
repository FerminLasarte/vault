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

export type AttentionKind = "budget" | "backup" | "pending" | "close";

export interface AttentionItem {
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
    kind: "pending",
    tone: "neutral",
    title:
      pendingCount === 1
        ? "Tenés 1 movimiento pendiente de confirmar"
        : `Tenés ${pendingCount} movimientos pendientes de confirmar`,
    detail: "Revisalos en Compromisos.",
  };
}

// A month that has finished, has something in it, and has not been dealt with
// yet. Informational rather than a warning: nothing is wrong, something is
// ready — which is why it carries a neutral tone and sits last.
function closeItem(monthKey: string | null): AttentionItem | null {
  if (monthKey === null) return null;

  return {
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
  // The month whose close is ready and unseen, or null when there is none.
  pendingClose: string | null;
}): AttentionItem[] {
  return [
    budgetItem(sources.overspent),
    backupItem(sources.backup),
    pendingItem(sources.pendingCount),
    closeItem(sources.pendingClose),
  ].filter((item): item is AttentionItem => item !== null);
}
