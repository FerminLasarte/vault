// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DonationPrompt } from "./DonationPrompt";
import { Toaster } from "@/components/ui/sonner";
import { DONATION_ALIAS, DONATION_LINK } from "@/lib/donation";
import {
  DONATION_FIRST_DAYS,
  DONATION_MIN_LAUNCHES,
  type DonationPromptState,
} from "@/lib/donationPrompt";

const db = vi.hoisted(() => ({
  stored: null as string | null,
  setSetting: vi.fn((_key: string, _value: string) => Promise.resolve()),
}));
vi.mock("@/db", () => ({
  DONATION_PROMPT: "donation_prompt",
  getSetting: () => Promise.resolve(db.stored),
  setSetting: db.setSetting,
}));

const openUrl = vi.hoisted(() => vi.fn((_url: string) => Promise.resolve()));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

const appData = vi.hoisted(() => ({ isLoading: false }));
vi.mock("@/hooks/useAppData", () => ({ useAppData: () => appData }));

// One launch short of the thresholds, so the launch under test is the one due.
const DUE: DonationPromptState = {
  firstLaunchAt: new Date(
    Date.now() - (DONATION_FIRST_DAYS + 1) * 24 * 60 * 60 * 1000,
  ).toISOString(),
  launches: DONATION_MIN_LAUNCHES - 1,
  lastShownAt: null,
  stopped: false,
};

function written(): DonationPromptState[] {
  return db.setSetting.mock.calls.map(
    ([, value]) => JSON.parse(value) as DonationPromptState,
  );
}

function renderPrompt() {
  return render(
    <>
      <DonationPrompt />
      <Toaster />
    </>,
  );
}

beforeEach(() => {
  db.stored = JSON.stringify(DUE);
  db.setSetting.mockClear();
  openUrl.mockClear();
  appData.isLoading = false;
  // jsdom lays nothing out, so it has no idea what is visible, and it has no
  // pointer capture, which sonner asks for on every press inside a toast.
  HTMLElement.prototype.checkVisibility = () => true;
  HTMLElement.prototype.setPointerCapture = () => {};
});

describe("DonationPrompt", () => {
  it("counts the launch and stays quiet when it is not due", async () => {
    db.stored = null;
    renderPrompt();

    await waitFor(() => expect(written()).toHaveLength(1));
    expect(written()[0]).toMatchObject({ launches: 1, stopped: false });
    expect(screen.queryByText("¿Te sirve Vault?")).not.toBeInTheDocument();
  });

  it("reads nothing while the data is still loading", async () => {
    appData.isLoading = true;
    renderPrompt();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(db.setSetting).not.toHaveBeenCalled();
  });

  it("opens the payment link and stops asking after «Donar»", async () => {
    renderPrompt();
    await userEvent.click(
      await screen.findByRole("button", { name: "Donar con Mercado Pago" }),
    );

    expect(openUrl).toHaveBeenCalledWith(DONATION_LINK);
    await waitFor(() => expect(written().at(-1)?.stopped).toBe(true));
    await waitFor(() =>
      expect(screen.queryByText("¿Te sirve Vault?")).not.toBeInTheDocument(),
    );
  });

  it("copies the alias, confirms it and stops asking", async () => {
    const user = userEvent.setup();
    renderPrompt();
    await user.click(await screen.findByRole("button", { name: "Copiar alias" }));

    expect(await navigator.clipboard.readText()).toBe(DONATION_ALIAS);
    expect(
      await screen.findByText(`Alias copiado: ${DONATION_ALIAS}`),
    ).toBeInTheDocument();
    await waitFor(() => expect(written().at(-1)?.stopped).toBe(true));
  });

  it("stops asking after «No mostrar más»", async () => {
    renderPrompt();
    await userEvent.click(await screen.findByRole("button", { name: "No mostrar más" }));

    await waitFor(() => expect(written().at(-1)?.stopped).toBe(true));
  });

  it.each([
    [
      "«Ahora no»",
      () => userEvent.click(screen.getByRole("button", { name: "Ahora no" })),
    ],
    ["the X", () => userEvent.click(screen.getByRole("button", { name: "Cerrar" }))],
    ["Esc", () => userEvent.keyboard("{Escape}")],
  ])("closes on %s and asks again later", async (_, close) => {
    renderPrompt();
    await screen.findByText("¿Te sirve Vault?");
    await close();

    await waitFor(() =>
      expect(screen.queryByText("¿Te sirve Vault?")).not.toBeInTheDocument(),
    );
    // Only the launch itself was written: nothing turned the invitation off.
    expect(written()).toHaveLength(1);
    expect(written()[0]).toMatchObject({ stopped: false });
    expect(written()[0]?.lastShownAt).not.toBeNull();
  });
});
