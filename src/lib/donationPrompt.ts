import { z } from "zod";
import { daysSince } from "@/lib/backupReminder";

// When Vault asks for a donation. Rarely, and never to someone who has only
// just installed it: two weeks and ten launches is long enough to know whether
// the app is worth anything to them.
export const DONATION_FIRST_DAYS = 14;
export const DONATION_MIN_LAUNCHES = 10;
// After asking once, the gap before the next time. Declining is remembered this
// long even when it was only "Ahora no".
export const DONATION_INTERVAL_DAYS = 60;

const stateSchema = z.object({
  firstLaunchAt: z.iso.datetime(),
  launches: z.int().nonnegative(),
  // Null until the invitation has been shown once.
  lastShownAt: z.iso.datetime().nullable(),
  // Set by donating or by "No mostrar más": the invitation never comes back.
  stopped: z.boolean(),
});

export type DonationPromptState = z.infer<typeof stateSchema>;

export interface DonationLaunch {
  // What to store for next time.
  state: DonationPromptState;
  show: boolean;
}

// Reads what was stored. Anything unreadable counts as never stored, which
// starts the count over: a damaged value can delay the invitation, never bring
// it forward.
export function parseDonationPromptState(raw: string | null): DonationPromptState | null {
  if (raw === null) return null;

  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Counts this launch and decides whether it is one to ask on. Asking is
// recorded here, as soon as it is decided, so that quitting without answering
// counts as "Ahora no" instead of asking again on the very next launch.
export function launchDonationPrompt(
  previous: DonationPromptState | null,
  now: Date = new Date(),
): DonationLaunch {
  const counted: DonationPromptState =
    previous === null
      ? {
          firstLaunchAt: now.toISOString(),
          launches: 1,
          lastShownAt: null,
          stopped: false,
        }
      : { ...previous, launches: previous.launches + 1 };

  const show =
    !counted.stopped &&
    counted.launches >= DONATION_MIN_LAUNCHES &&
    daysSince(counted.firstLaunchAt, now) >= DONATION_FIRST_DAYS &&
    (counted.lastShownAt === null ||
      daysSince(counted.lastShownAt, now) >= DONATION_INTERVAL_DAYS);

  return {
    state: show ? { ...counted, lastShownAt: now.toISOString() } : counted,
    show,
  };
}

export function stopDonationPrompt(state: DonationPromptState): DonationPromptState {
  return { ...state, stopped: true };
}
