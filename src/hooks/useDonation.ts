import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { DONATION_PROMPT, getSetting, setSetting } from "@/db";
import { DONATION_ALIAS, DONATION_LINK } from "@/lib/donation";
import { parseDonationPromptState, stopDonationPrompt } from "@/lib/donationPrompt";

// Turns the invitation at launch off for good. The state is read back rather
// than passed in, so Ajustes, which never sees the launch's state, stops it the
// same way the invitation does. Nothing stored means nothing to stop.
async function stopAsking(): Promise<void> {
  try {
    const state = parseDonationPromptState(await getSetting(DONATION_PROMPT));
    if (state === null) return;
    await setSetting(DONATION_PROMPT, JSON.stringify(stopDonationPrompt(state)));
  } catch (error) {
    console.error("Failed to stop the donation prompt:", error);
  }
}

// Both say whether they worked, so the invitation knows whether to close.
async function donate(): Promise<boolean> {
  try {
    await openUrl(DONATION_LINK);
  } catch {
    toast.error("No se pudo abrir el navegador");
    return false;
  }
  void stopAsking();
  return true;
}

async function copyAlias(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(DONATION_ALIAS);
  } catch {
    toast.error("No se pudo copiar el alias");
    return false;
  }
  // Copying the alias is the other way to donate, so it counts as "Donar":
  // asking again someone who just transferred would nag.
  void stopAsking();
  toast.success(`Alias copiado: ${DONATION_ALIAS}`, {
    description: "Pegalo al transferir desde Mercado Pago o tu banco. ¡Gracias!",
  });
  return true;
}

const ACTIONS = { donate, copyAlias, stopAsking };

// Donating, wherever it is offered: the invitation at launch and the card in
// Ajustes. One set of actions, so both answer the same way and both stop the
// invitation, and someone who donated from Ajustes is not asked again. Nothing
// here holds state, so the same object comes back on every render.
export function useDonation() {
  return ACTIONS;
}
