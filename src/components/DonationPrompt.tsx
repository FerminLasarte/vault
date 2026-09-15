import { useEffect, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { HeartIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DONATION_PROMPT, getSetting, setSetting } from "@/db";
import { useAppData } from "@/hooks/useAppData";
import { DONATION_ALIAS, DONATION_LINK } from "@/lib/donation";
import {
  launchDonationPrompt,
  parseDonationPromptState,
  stopDonationPrompt,
  type DonationPromptState,
} from "@/lib/donationPrompt";

const NOTICE_ID = "donation-prompt";

function persist(state: DonationPromptState): Promise<void> {
  return setSetting(DONATION_PROMPT, JSON.stringify(state));
}

// Every so often, at launch, a small invitation to donate. A toast in the
// corner rather than a dialog: it never blocks the app, and ignoring it is as
// good as answering it. When to ask is decided in src/lib/donationPrompt.ts;
// this only reads the stored state once per launch, stores the next one, and
// shows the notice if it is due.
//
// Waits for the initial load, so it neither lands on a screen that is still
// filling in nor counts a launch whose database never opened.
export function DonationPrompt() {
  const { isLoading } = useAppData();

  // StrictMode runs effects twice in development; this keeps that from
  // counting one launch as two.
  const launched = useRef(false);
  useEffect(() => {
    if (isLoading || launched.current) return;
    launched.current = true;

    void (async () => {
      const stored = parseDonationPromptState(await getSetting(DONATION_PROMPT));
      const { state, show } = launchDonationPrompt(stored);
      await persist(state);
      if (!show) return;

      const stop = () =>
        persist(stopDonationPrompt(state)).catch((error: unknown) => {
          console.error("Failed to stop the donation prompt:", error);
        });
      const close = () => toast.dismiss(NOTICE_ID);

      toast.custom(
        () => (
          <DonationNotice
            onClose={close}
            onStop={() => {
              close();
              void stop();
            }}
            onDonate={async () => {
              try {
                await openUrl(DONATION_LINK);
              } catch {
                toast.error("No se pudo abrir el navegador");
                return;
              }
              close();
              void stop();
            }}
            onCopyAlias={async () => {
              try {
                await navigator.clipboard.writeText(DONATION_ALIAS);
              } catch {
                toast.error("No se pudo copiar el alias");
                return;
              }
              // Copying the alias is the other way to donate, so it counts as
              // "Donar": asking again someone who just transferred would nag.
              close();
              void stop();
              toast.success(`Alias copiado: ${DONATION_ALIAS}`, {
                description:
                  "Pegalo al transferir desde Mercado Pago o tu banco. ¡Gracias!",
              });
            }}
          />
        ),
        { id: NOTICE_ID, duration: Infinity },
      );
    })().catch((error: unknown) => {
      // Nothing to tell the user: the invitation is optional, and failing to
      // show it costs them nothing.
      console.error("Failed to update the donation prompt:", error);
    });
  }, [isLoading]);

  return null;
}

interface DonationNoticeProps {
  onDonate: () => void;
  onCopyAlias: () => void;
  // "Ahora no", the X and Esc: the interval still applies.
  onClose: () => void;
  onStop: () => void;
}

// Hidden, not dismissed, while any dialog is open: toasts sit above the dialog
// layer, and an invitation on top of a form someone is filling in is exactly
// what this must never be. It comes back when the dialog closes.
const HIDDEN_UNDER_DIALOG = "[body:has([data-slot$=dialog-content])_&]:hidden";

function DonationNotice({ onDonate, onCopyAlias, onClose, onStop }: DonationNoticeProps) {
  const notice = useRef<HTMLDivElement>(null);

  // Esc closes it without it having to take focus, which a notice that does not
  // interrupt should never do. Ignored while hidden under a dialog, where the
  // key belongs to the dialog.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !notice.current?.checkVisibility()) return;
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={notice}
      role="region"
      aria-label="Invitación a donar"
      className={`relative flex w-(--width) flex-col gap-3 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 ${HIDDEN_UNDER_DIALOG}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Cerrar"
        className="absolute top-2 right-2 text-muted-foreground"
        onClick={onClose}
      >
        <XIcon />
      </Button>

      <div className="flex flex-col gap-1 pr-6">
        <p className="flex items-center gap-2 font-medium">
          <HeartIcon className="size-4 text-muted-foreground" />
          ¿Te sirve Vault?
        </p>
        <p className="text-muted-foreground">
          Es gratis y sin publicidad. Si querés darle una mano, podés donar lo que
          quieras; es totalmente opcional.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onDonate}>
          Donar con Mercado Pago
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCopyAlias}>
          Copiar alias
        </Button>
      </div>

      <div className="-mx-2 -mb-1 flex gap-1">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-muted-foreground"
          onClick={onClose}
        >
          Ahora no
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-muted-foreground"
          onClick={onStop}
        >
          No mostrar más
        </Button>
      </div>
    </div>
  );
}
