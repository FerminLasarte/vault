import { calculateBudgetProgress } from "@/lib/finance";
import { countPending } from "@/lib/pendingCommitments";
import { BUDGET_WARNING_RATIO } from "@/lib/notifications";
import { parseIsoDate } from "@/lib/format";
import type { NotificationSources } from "@/lib/notifications";
import type { View } from "@/lib/navigation";

export type PendingBadges = Partial<Record<View, number>>;

// How many things each section is waiting on.
//
// The same facts the system notifications are built from, but answering a
// different question: a notification says something happened, a badge says
// where to go. One is easy to miss and the other is always there.
//
// Only the sections that can actually be acted on get a count. Estadísticas
// already spells the whole thing out in a notice of its own, and a badge on a
// screen that is only a summary would send the user nowhere.
export function pendingBadges(
  sources: NotificationSources,
  today: string,
): PendingBadges {
  const badges: PendingBadges = {};

  // Recurring movements, instalments, loan payments and expected movements are
  // all confirmed the same way and share a section, so they share a badge: what
  // the user needs to know is how many things are waiting, not how they are
  // filed.
  const commitments = countPending(sources.pending);
  if (commitments > 0) badges.commitments = commitments;

  // Budgets moved in with the categories they cap, so this count rides on that
  // section. It counts caps at or near the limit, which is a warning rather
  // than a queue of work — the statistics screen spells out which ones.
  //
  // The reference date has to be the `today` given, not the system clock:
  // it decides which period the spending is measured over, and a badge that
  // read a different month from the notification about the same budget would
  // be telling the user two different things.
  const budgets = calculateBudgetProgress(
    sources.budgets,
    sources.transactions,
    parseIsoDate(today),
  ).filter((progress) => progress.ratio >= BUDGET_WARNING_RATIO).length;
  if (budgets > 0) badges.categories = budgets;

  return badges;
}
