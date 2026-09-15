// @vitest-environment jsdom
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppDataProvider } from "./AppDataContext";
import * as db from "@/db";
import type * as DbModule from "@/db";
import type { ExchangeRate } from "@/db";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import type { AppActions } from "./AppDataContext";
import { DEFAULT_RATE_TYPE, RATE_TYPES, fetchRate } from "@/lib/exchangeRate";
import type * as ExchangeRateModule from "@/lib/exchangeRate";
import type { RateType } from "@/lib/exchangeRate";
import { isReported } from "@/lib/reportedError";
import { todayIsoDate } from "@/lib/format";

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

function aRate(
  type: RateType,
  sell = 1100,
  { date = "2026-09-14", source = `dolarapi:${type}` } = {},
): ExchangeRate {
  return {
    date,
    rate_type: type,
    buy: sell - 50,
    sell,
    source,
    fetched_at: "2026-09-14T15:00:00.000Z",
  };
}

const aCategory = {
  name: "Mascotas",
  type: "expense" as const,
  icon: "🐶",
  color: "#000",
};

// The three halves of the provider read as one, as most of these tests only
// care about what it does, not about who re-renders.
async function mount() {
  const { result } = renderHook(
    () => ({ ...useAppData(), ...useAppActions(), ...useAppStatus() }),
    { wrapper: AppDataProvider },
  );
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

  it("offers one Deshacer for Registrar todas, which takes back every step", async () => {
    const data = await mount();
    const undo = vi.fn(() => Promise.resolve());
    vi.mocked(db.recordSteps).mockResolvedValueOnce(undo);
    const steps = [
      { kind: "installment", id: 1, index: 0, date: "2026-08-01", amount: 100 },
      { kind: "installment", id: 1, index: 1, date: "2026-09-01", amount: 100 },
    ] as const;

    await act(async () => {
      await data.current.registerAll([...steps]);
    });

    // One write and one toast for the lot, not one of each per step.
    expect(db.recordSteps).toHaveBeenCalledExactlyOnceWith([...steps]);
    expect(toast.success).toHaveBeenCalledOnce();
    const action = toastOptions("2 cuotas registradas")?.action;
    expect(action?.label).toBe("Deshacer");

    act(() => {
      action?.onClick();
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Se deshizo"));
    expect(undo).toHaveBeenCalledOnce();
  });

  it("calls recurring steps movements rather than instalments", async () => {
    const data = await mount();
    vi.mocked(db.recordSteps).mockResolvedValueOnce(vi.fn());

    await act(async () => {
      await data.current.registerAll([
        { kind: "recurring", id: 1, date: "2026-08-08" },
        { kind: "recurring", id: 2, date: "2026-08-10" },
      ]);
    });

    expect(toastOptions("2 movimientos registrados")?.action?.label).toBe("Deshacer");
  });

  it("says nothing was registered when Registrar todas fails", async () => {
    const data = await mount();
    vi.mocked(db.recordSteps).mockRejectedValueOnce(new Error("simulated failure"));

    await act(async () => {
      await data.current
        .registerAll([{ kind: "loan", id: 1, index: 0, date: "2026-08-01", amount: 100 }])
        .catch(() => {});
    });

    expect(toast.error).toHaveBeenCalledWith("No se pudo registrar ninguna cuota");
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

describe("who re-renders", () => {
  // Whether a write or a download is in progress used to live beside the data,
  // so every reader of the data — the sidebar, every section, each rate bar —
  // rendered again when it started and again when it ended.
  async function mountReaders() {
    const renders = { data: 0 };
    const actions: { current: AppActions | null } = { current: null };
    const status = { isMutating: false, isRefreshingRate: false };

    function DataReader() {
      useAppData();
      renders.data += 1;
      return null;
    }
    function ActionsHolder() {
      actions.current = useAppActions();
      return null;
    }
    function StatusReader() {
      ({ isMutating: status.isMutating, isRefreshingRate: status.isRefreshingRate } =
        useAppStatus());
      return null;
    }

    let loaded = false;
    function LoadWatcher() {
      loaded = !useAppData().isLoading;
      return null;
    }

    render(
      <AppDataProvider>
        <DataReader />
        <ActionsHolder />
        <StatusReader />
        <LoadWatcher />
      </AppDataProvider>,
    );
    await waitFor(() => expect(loaded).toBe(true));
    // The start-up download settles before anything is counted.
    await waitFor(() => expect(fetchRate).toHaveBeenCalled());
    await act(async () => {});

    return { renders, actions, status };
  }

  // Held open by the test, so the render in which the work is in progress
  // actually happens: settled inside one `act`, the flag would go up and down
  // in a single batch and nobody would render in between.
  function deferred<T>() {
    let reject: (error: Error) => void = () => {};
    const promise = new Promise<T>((_, rejectWith) => {
      reject = rejectWith;
    });
    return { promise, reject };
  }

  it("leaves a reader of the data alone while a write fails", async () => {
    const { renders, actions, status } = await mountReaders();
    const before = renders.data;
    const write = deferred<void>();
    vi.mocked(db.insertCategory).mockReturnValueOnce(write.promise);

    let finished: Promise<void> = Promise.resolve();
    act(() => {
      finished = actions.current!.addCategory(aCategory).catch(() => {});
    });
    expect(status.isMutating).toBe(true);

    await act(async () => {
      write.reject(new Error("disk I/O error"));
      await finished;
    });

    expect(status.isMutating).toBe(false);
    expect(renders.data).toBe(before);
  });

  it("leaves a reader of the data alone while a download fails", async () => {
    const { renders, actions, status } = await mountReaders();
    const before = renders.data;
    const download = deferred<ExchangeRate>();
    vi.mocked(fetchRate).mockReturnValueOnce(download.promise);

    let finished: Promise<void> = Promise.resolve();
    act(() => {
      finished = actions.current!.refreshExchangeRate({ silent: true });
    });
    expect(status.isRefreshingRate).toBe(true);

    await act(async () => {
      download.reject(new Error("offline"));
      await finished;
    });

    expect(status.isRefreshingRate).toBe(false);
    expect(renders.data).toBe(before);
  });

  it("keeps the same actions across writes and a change of dollar type", async () => {
    const { actions } = await mountReaders();
    const before = actions.current;

    await act(async () => {
      await actions.current!.addCategory(aCategory);
    });
    await act(async () => {
      await actions.current!.setRateType(OTHER_RATE_TYPE);
    });
    await act(async () => {});

    expect(actions.current).toBe(before);
  });
});

describe("what a write reloads", () => {
  // Reading every table after every write re-sent the whole ledger and years
  // of quotes over IPC to create a budget, and gave every list a new identity,
  // so every memo in every mounted view ran again.
  async function mountAndForgetTheLoad() {
    const data = await mount();
    await waitFor(() => expect(data.current.isRefreshingRate).toBe(false));
    vi.clearAllMocks();
    return data;
  }

  it("reads back only what the write touched", async () => {
    const data = await mountAndForgetTheLoad();

    await act(async () => {
      await data.current.addBudget({
        categoryId: 1,
        currency: "ARS",
        amount: 1000,
        period: "monthly",
      });
    });

    expect(db.listBudgets).toHaveBeenCalledOnce();
    expect(db.listTransactionsWithCategory).not.toHaveBeenCalled();
    expect(db.listCategories).not.toHaveBeenCalled();
    expect(db.listExchangeRates).not.toHaveBeenCalled();
  });

  it("reads back the plan and the ledger after an instalment is registered", async () => {
    const data = await mountAndForgetTheLoad();

    await act(async () => {
      await data.current.confirmInstallment(1, 0, "2026-09-01", 100);
    });

    expect(db.listInstallmentPlans).toHaveBeenCalledOnce();
    expect(db.listTransactionsWithCategory).toHaveBeenCalledOnce();
    expect(db.listLoans).not.toHaveBeenCalled();
  });

  it("reads back the expected movements when a transaction is deleted", async () => {
    // Deleting the transaction a movement was confirmed into reopens it.
    const data = await mountAndForgetTheLoad();

    await act(async () => {
      await data.current.removeTransaction(1);
    });

    expect(db.listTransactionsWithCategory).toHaveBeenCalledOnce();
    expect(db.listExpectedMovements).toHaveBeenCalledOnce();
    expect(db.listBudgets).not.toHaveBeenCalled();
  });

  it("reads back every list that shows a category when one is edited", async () => {
    const data = await mountAndForgetTheLoad();

    await act(async () => {
      await data.current.editCategory(1, aCategory);
    });

    expect(db.listTransactionsWithCategory).toHaveBeenCalledOnce();
    expect(db.listBudgets).toHaveBeenCalledOnce();
    expect(db.listRecurringTransactions).toHaveBeenCalledOnce();
    expect(db.listExchangeRates).not.toHaveBeenCalled();
  });
});

describe("the exchange rate on screen", () => {
  it("is the latest quote of the history loaded at start-up", async () => {
    vi.mocked(fetchRate).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(db.listExchangeRates).mockResolvedValueOnce([
      aRate(DEFAULT_RATE_TYPE, 1000, { date: "2026-09-10" }),
      aRate(DEFAULT_RATE_TYPE, 1100, { date: "2026-09-14" }),
    ]);

    const data = await mount();
    await waitFor(() => expect(data.current.isRefreshingRate).toBe(false));

    expect(data.current.exchangeRate?.sell).toBe(1100);
    expect(db.listExchangeRates).toHaveBeenCalledOnce();
  });

  it("joins the history once downloaded", async () => {
    const data = await mount();

    await waitFor(() => expect(data.current.exchangeRateHistory).toHaveLength(1));
    expect(data.current.exchangeRateHistory[0].sell).toBe(1100);
  });

  it("stays the manual correction when a download for the same day arrives", async () => {
    // The download is refused by the database; the screen showed it anyway,
    // until the next reload put the correction back.
    vi.mocked(db.listExchangeRates).mockResolvedValueOnce([
      aRate(DEFAULT_RATE_TYPE, 1500, { source: "manual" }),
    ]);

    const data = await mount();
    await waitFor(() => expect(fetchRate).toHaveBeenCalled());
    await waitFor(() => expect(data.current.isRefreshingRate).toBe(false));

    expect(data.current.exchangeRate?.sell).toBe(1500);
  });
});

describe("what is pending", () => {
  it("is worked out once, as of today, for every screen to read", async () => {
    vi.mocked(db.listRecurringTransactions).mockResolvedValueOnce([
      {
        id: 1,
        description: "Alquiler",
        amount: 500000,
        type: "expense",
        category_id: null,
        payment_method_id: null,
        currency: "ARS",
        frequency: "monthly",
        start_date: "2026-01-05",
        last_confirmed_date: null,
        is_active: 1,
        category_name: null,
        category_icon: null,
        payment_method_name: null,
      },
    ]);

    const data = await mount();

    expect(data.current.today).toBe(todayIsoDate());
    expect(data.current.pending.recurring[0]?.date).toBe("2026-01-05");
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
