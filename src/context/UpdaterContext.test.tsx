// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdaterProvider } from "./UpdaterContext";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { useUpdater } from "@/hooks/useUpdater";

const updater = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: updater.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { loading: vi.fn(), error: vi.fn() }),
}));

function aFoundUpdate() {
  return {
    version: "1.3.0",
    body: "Novedades",
    close: vi.fn(() => Promise.resolve()),
    downloadAndInstall: vi.fn(() => new Promise(() => {})),
  };
}

// Stands in for the card in Ajustes: another reader of the same updater.
function SettingsCard() {
  const { status, update, check } = useUpdater();
  return (
    <div>
      <p>
        {status} {update?.version}
      </p>
      <button type="button" onClick={() => void check()}>
        Buscar actualizaciones
      </button>
    </div>
  );
}

function renderApp() {
  return render(
    <UpdaterProvider>
      <UpdatePrompt />
      <SettingsCard />
    </UpdaterProvider>,
  );
}

beforeEach(() => {
  updater.check.mockReset();
  vi.mocked(toast).mockClear();
});

describe("UpdaterProvider", () => {
  // Each of the two used to hold its own state: Ajustes did not know the
  // launch check had found a version the toast was already offering.
  it("shows Ajustes what the launch check found", async () => {
    updater.check.mockResolvedValue(aFoundUpdate());

    renderApp();

    expect(await screen.findByText("available 1.3.0")).toBeInTheDocument();
    expect(updater.check).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("does not offer the same version again when Ajustes checks", async () => {
    updater.check.mockResolvedValue(aFoundUpdate());
    renderApp();
    await screen.findByText("available 1.3.0");

    await userEvent.click(screen.getByRole("button", { name: "Buscar actualizaciones" }));

    expect(updater.check).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("closes the previous update handle when a new check replaces it", async () => {
    const first = aFoundUpdate();
    updater.check.mockResolvedValueOnce(first).mockResolvedValueOnce(aFoundUpdate());
    renderApp();
    await screen.findByText("available 1.3.0");

    await userEvent.click(screen.getByRole("button", { name: "Buscar actualizaciones" }));

    expect(first.close).toHaveBeenCalled();
  });
});
