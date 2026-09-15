// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DonationCard } from "./DonationCard";
import { Toaster } from "@/components/ui/sonner";
import { DONATION_ALIAS, DONATION_LINK } from "@/lib/donation";
import type { DonationPromptState } from "@/lib/donationPrompt";

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

// An invitation that is still active, as the launches before this one left it.
const ACTIVE: DonationPromptState = {
  firstLaunchAt: "2026-08-01T12:00:00.000Z",
  launches: 4,
  lastShownAt: null,
  stopped: false,
};

function written(): DonationPromptState[] {
  return db.setSetting.mock.calls.map(
    ([, value]) => JSON.parse(value) as DonationPromptState,
  );
}

function renderCard() {
  return render(
    <>
      <DonationCard />
      <Toaster />
    </>,
  );
}

beforeEach(() => {
  db.stored = JSON.stringify(ACTIVE);
  db.setSetting.mockClear();
  openUrl.mockReset();
  openUrl.mockImplementation(() => Promise.resolve());
});

describe("DonationCard", () => {
  it("shows the alias so it can be typed from another device", () => {
    renderCard();

    expect(screen.getByText(`Alias: ${DONATION_ALIAS}`)).toBeInTheDocument();
  });

  // Whoever donated from Ajustes should not be asked again at launch.
  it("opens the payment link and stops the invitation at launch", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Donar con Mercado Pago" }));

    expect(openUrl).toHaveBeenCalledWith(DONATION_LINK);
    await waitFor(() => expect(written()).toEqual([{ ...ACTIVE, stopped: true }]));
  });

  it("copies the alias, confirms it and stops the invitation", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Copiar alias" }));

    expect(await navigator.clipboard.readText()).toBe(DONATION_ALIAS);
    expect(
      await screen.findByText(`Alias copiado: ${DONATION_ALIAS}`),
    ).toBeInTheDocument();
    await waitFor(() => expect(written().at(-1)?.stopped).toBe(true));
  });

  it("says so and changes nothing when the browser cannot be opened", async () => {
    openUrl.mockImplementation(() => Promise.reject(new Error("denied")));
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Donar con Mercado Pago" }));

    expect(await screen.findByText("No se pudo abrir el navegador")).toBeInTheDocument();
    expect(db.setSetting).not.toHaveBeenCalled();
  });

  it("writes nothing when no invitation was ever stored", async () => {
    db.stored = null;
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Donar con Mercado Pago" }));

    expect(openUrl).toHaveBeenCalledWith(DONATION_LINK);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(db.setSetting).not.toHaveBeenCalled();
  });
});
