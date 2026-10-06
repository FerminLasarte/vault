import { z } from "zod";

// What the local AI keeps about itself, as the JSON stored under `ai_state`.
// Only what the history cannot say: everything the AI shows is recomputed from
// the transactions, so this holds choices, never conclusions.
const stateSchema = z.object({
  // The switch in Ajustes. Off means the app as it was before any of this: no
  // marks, no suggestions, descriptions exactly as written.
  enabled: z.boolean(),
  // Suggestions the user waved away, by id: until an ISO date, or for good
  // (null). An id is derived from what the suggestion is about — `rule:rappi:12`
  // — so the same suggestion is recognised after a restart, and a different one
  // about the same thing is not mistaken for it. Stored before this existed
  // without the field, which reads as nothing dismissed.
  dismissed: z.record(z.string(), z.string().nullable()).default({}),
});

export type AiState = z.infer<typeof stateSchema>;

export type Dismissals = AiState["dismissed"];

export const DEFAULT_AI_STATE: AiState = { enabled: true, dismissed: {} };

// Anything unreadable counts as never stored. The worst a damaged value can do
// is bring back the defaults.
export function parseAiState(raw: string | null): AiState {
  if (raw === null) return DEFAULT_AI_STATE;

  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_AI_STATE;
  } catch {
    return DEFAULT_AI_STATE;
  }
}

// Whether a suggestion is out of sight as of `today`: dismissed for good, or
// snoozed until a day that has not come yet.
export function isDismissed(dismissed: Dismissals, id: string, today: string): boolean {
  if (!Object.hasOwn(dismissed, id)) return false;
  const until = dismissed[id];
  return until === null || today < until;
}

// These suggestions, dismissed for good.
export function withDismissed(state: AiState, ids: readonly string[]): AiState {
  return {
    ...state,
    dismissed: { ...state.dismissed, ...Object.fromEntries(ids.map((id) => [id, null])) },
  };
}
