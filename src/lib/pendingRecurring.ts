import type { RecurringTransactionWithNames } from "@/db/schema";
import { pendingOccurrences } from "@/lib/recurring";

export interface PendingRecurrence {
  template: RecurringTransactionWithNames;
  date: string;
  // The occurrence that has to be registered or dismissed before this one, or
  // null when this is the next one. The series stores the last date decided
  // on, so deciding a later one would settle every one before it.
  waitingFor: string | null;
}

// Every occurrence waiting for a decision, across all active templates, oldest
// first. Paused templates are skipped entirely rather than quietly piling up a
// backlog to be dumped on the user when they resume.
export function collectPendingRecurrences(
  templates: RecurringTransactionWithNames[],
  today: string,
): PendingRecurrence[] {
  const pending: PendingRecurrence[] = [];

  for (const template of templates) {
    if (template.is_active !== 1) continue;

    const dates = pendingOccurrences(
      template.start_date,
      template.frequency,
      template.last_confirmed_date,
      today,
    );
    for (const date of dates) {
      pending.push({ template, date, waitingFor: date === dates[0] ? null : dates[0] });
    }
  }

  return pending.sort((a, b) => a.date.localeCompare(b.date));
}
