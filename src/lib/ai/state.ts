import { z } from "zod";

// What the local AI keeps about itself, as the JSON stored under `ai_state`.
// Only what the history cannot say: everything the AI shows is recomputed from
// the transactions, so this holds choices, never conclusions.
const stateSchema = z.object({
  // The switch in Ajustes. Off means the app as it was before any of this: no
  // marks, no suggestions, descriptions exactly as written.
  enabled: z.boolean(),
});

export type AiState = z.infer<typeof stateSchema>;

export const DEFAULT_AI_STATE: AiState = { enabled: true };

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
