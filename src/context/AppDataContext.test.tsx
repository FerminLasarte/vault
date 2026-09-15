// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppDataProvider } from "./AppDataContext";
import * as db from "@/db";
import type * as DbModule from "@/db";
import type { ExchangeRate } from "@/db";
import { useAppData } from "@/hooks/useAppData";
import { DEFAULT_RATE_TYPE, RATE_TYPES, fetchRate } from "@/lib/exchangeRate";
import type * as ExchangeRateModule from "@/lib/exchangeRate";
import type { RateType } from "@/lib/exchangeRate";
import { isReported } from "@/lib/reportedError";

// The provider is exercised for real; only what sits behind it is replaced —
// the database, the network and the toasts — so these tests see exactly which
// messages a user would see and how many requests go out.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/hooks/useNotifications", () => ({ useNotifications: () => {} }));

vi.mock("@/lib/exchangeRate", async (importOriginal) => ({
  ...(await importOriginal<typeof ExchangeRateModule>()),
  fetchRate: vi.fn(),
  fetchRateHistory: vi.fn(),
}));

// Every query answers "nothing stored yet": lists come back empty and single
// reads come back null, which is a freshly installed app.
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value !== "function"
        ? value
        : name.startsWith("list")
          ? vi.fn(() => Promise.resolve([]))
          : vi.fn(() => Promise.resolve(null)),
    ]),
  );
});

const OTHER_RATE_TYPE = RATE_TYPES.find((type) => type !== DEFAULT_RATE_TYPE)!;

function aRate(type: RateType, sell = 1100): ExchangeRate {
  return {
    date: "2026-09-14",
    rate_type: type,
    buy: sell - 50,
    sell,
    source: `dolarapi:${type}`,
    fetched_at: "2026-09-14T15:00:00.000Z",
  };
}

const aCategory = {
  name: "Mascotas",
  type: "expense" as const,
  icon: "🐶",
  color: "#000",
};

async function mount() {
  const { result } = renderHook(() => useAppData(), { wrapper: AppDataProvider });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(fetchRate).mockImplementation((type) => Promise.resolve(aRate(type)));
});

describe("a mutation that fails", () => {
  it("tells the user once, and marks the error so nothing adds a second message", async () => {
    const data = await mount();
    vi.mocked(db.insertCategory).mockRejectedValueOnce(new Error("disk I/O error"));

    let caught: unknown;
    await act(async () => {
      await data.current.addCategory(aCategory).catch((error: unknown) => {
        caught = error;
      });
    });

    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith("No se pudo crear la categoría");
    // Still rejected, so a dialog waiting on it stays open with what was typed.
    expect(caught).toBeDefined();
    expect(isReported(caught)).toBe(true);
  });
});

describe("a reload that fails after a mutation that worked", () => {
  it("reports the save as done and the reload as the problem", async () => {
    const data = await mount();
    // The write goes through; the reload that follows it does not.
    vi.mocked(db.listCategories).mockRejectedValueOnce(new Error("database is locked"));

    await act(async () => {
      await data.current.addCategory(aCategory);
    });

    // Saying "No se pudo crear la categoría" here invited a retry that
    // created it twice.
    expect(toast.success).toHaveBeenCalledWith("Categoría creada");
    expect(toast.error).not.toHaveBeenCalledWith("No se pudo crear la categoría");
    expect(toast.error).toHaveBeenCalledWith(
      "No se pudieron recargar los datos",
      expect.anything(),
    );
  });
});

describe("a step that can be taken back", () => {
  // The options the success toast was shown with, for the one with this message.
  function toastOptions(message: string) {
    const call = vi.mocked(toast.success).mock.calls.find(([text]) => text === message);
    return call?.[1] as
      { action?: { label: string; onClick: () => void }; duration?: number } | undefined;
  }

  it("offers Deshacer, which runs the step's own undo", async () => {
    const data = await mount();
    const undo = vi.fn(() => Promise.resolve());
    vi.mocked(db.recordRecurringOccurrence).mockResolvedValueOnce(undo);

    await act(async () => {
      await data.current.confirmRecurring(1, "2026-09-08");
    });

    const action = toastOptions("Movimiento registrado")?.action;
    expect(action?.label).toBe("Deshacer");

    act(() => {
      action?.onClick();
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Se deshizo"));
    expect(undo).toHaveBeenCalledOnce();
  });

  it("says so when the step can no longer be taken back", async () => {
    const data = await mount();
    const undo = vi.fn(() => Promise.reject(new Error("changed 0 rows instead of 1")));
    vi.mocked(db.dismissExpectedMovement).mockResolvedValueOnce(undo);

    await act(async () => {
      await data.current.dismissExpected(1);
    });
    act(() => {
      toastOptions("Movimiento descartado")?.action?.onClick();
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No se pudo deshacer"));
  });

  it("does not offer it for Registrar todas", async () => {
    const data = await mount();
    vi.mocked(db.recordInstallment).mockResolvedValueOnce(vi.fn());

    await act(async () => {
      await data.current.confirmInstallment(1, 0, "2026-09-01", 100, {
        offerUndo: false,
      });
    });

    expect(toast.success).toHaveBeenCalledWith("Cuota registrada");
  });

  it("withdraws the offer as soon as anything else is written", async () => {
    const data = await mount();
    vi.mocked(db.recordLoanPayment).mockResolvedValueOnce(vi.fn());
    vi.mocked(toast.success).mockReturnValueOnce("undo-toast");

    await act(async () => {
      await data.current.confirmLoanPayment(1, 0, "2026-09-01", 100);
    });
    await act(async () => {
      await data.current.addCategory(aCategory);
    });

    expect(toast.dismiss).toHaveBeenCalledWith("undo-toast");
  });
});

describe("changing the dollar type", () => {
  it("downloads the new rate once", async () => {
    const data = await mount();
    await waitFor(() => expect(fetchRate).toHaveBeenCalledWith(DEFAULT_RATE_TYPE));
    vi.mocked(fetchRate).mockClear();

    await act(async () => {
      await data.current.setRateType(OTHER_RATE_TYPE);
    });

    await waitFor(() =>
      expect(data.current.exchangeRate?.rate_type).toBe(OTHER_RATE_TYPE),
    );
    expect(fetchRate).toHaveBeenCalledOnce();
    expect(fetchRate).toHaveBeenCalledWith(OTHER_RATE_TYPE);
  });

  it("ignores a late answer for the type it replaced", async () => {
    // The start-up refresh for the old type is still on the wire when the user
    // switches; when it lands it must not show the old figure under the new
    // type's name.
    let answerOldType: (rate: ExchangeRate) => void = () => {};
    vi.mocked(fetchRate).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerOldType = resolve;
        }),
    );
    const data = await mount();
    await waitFor(() => expect(fetchRate).toHaveBeenCalledWith(DEFAULT_RATE_TYPE));

    await act(async () => {
      await data.current.setRateType(OTHER_RATE_TYPE);
    });
    await waitFor(() =>
      expect(data.current.exchangeRate?.rate_type).toBe(OTHER_RATE_TYPE),
    );

    act(() => {
      answerOldType(aRate(DEFAULT_RATE_TYPE, 999));
    });
    // Proves the late answer really landed — it is still cached — before
    // checking that it was not shown.
    await waitFor(() =>
      expect(db.upsertExchangeRate).toHaveBeenCalledWith(
        expect.objectContaining({ rate_type: DEFAULT_RATE_TYPE, sell: 999 }),
      ),
    );
    await waitFor(() => expect(data.current.isRefreshingRate).toBe(false));

    expect(data.current.exchangeRate?.rate_type).toBe(OTHER_RATE_TYPE);
  });
});
