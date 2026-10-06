// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateDialog } from "./DuplicateDialog";
import { ReportedError } from "@/lib/reportedError";
import { held } from "@/lib/ai/testing/ledger";
import type { NearDuplicate } from "@/lib/ai/nearDuplicates";
import type { TransactionWithCategory } from "@/db/schema";

const app = vi.hoisted(() => ({
  aiEnabled: true,
  isMutating: false,
  deleteDuplicate: vi.fn((_transaction: unknown) => Promise.resolve()),
  dismissAiSuggestions: vi.fn((_ids: string[]) => Promise.resolve()),
}));
vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => app,
  useAppActions: () => app,
  useAppStatus: () => app,
}));

beforeEach(() => {
  app.deleteDuplicate.mockReset().mockResolvedValue(undefined);
  app.dismissAiSuggestions.mockClear();
});

const typed = held({ description: "rappi", category_name: "Comida", tag_names: "viaje" });
const imported = held({ description: "MERPAGO*RAPPI 4471", date: "2026-10-02" });

const PAIR: NearDuplicate<TransactionWithCategory> = {
  id: "duplicate:1:out:5000000:2026-10-01:2026-10-02",
  reason: "Dos gastos de $ 50.000,00 en la misma cuenta.",
  movements: [typed, imported],
  removable: [false, true],
};

describe("DuplicateDialog", () => {
  it("shows both, and lets only the one nothing hangs on be deleted", () => {
    render(<DuplicateDialog pair={PAIR} onClose={() => {}} />);

    expect(screen.getByText("rappi")).toBeInTheDocument();
    expect(screen.getByText("Rappi")).toBeInTheDocument();
    const [first, second] = screen.getAllByRole("button", { name: "Eliminar este" });
    expect(first).toBeDisabled();
    expect(second).toBeEnabled();
  });

  it("deletes the one picked and closes", async () => {
    const onClose = vi.fn();
    render(<DuplicateDialog pair={PAIR} onClose={onClose} />);

    await userEvent.click(screen.getAllByRole("button", { name: "Eliminar este" })[1]);

    expect(app.deleteDuplicate).toHaveBeenCalledWith(imported);
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when the delete fails", async () => {
    app.deleteDuplicate.mockRejectedValue(new ReportedError(new Error("busy")));
    const onClose = vi.fn();
    render(<DuplicateDialog pair={PAIR} onClose={onClose} />);

    await userEvent.click(screen.getAllByRole("button", { name: "Eliminar este" })[1]);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("waves the pair away when it is not a duplicate", async () => {
    const onClose = vi.fn();
    render(<DuplicateDialog pair={PAIR} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "No es un duplicado" }));

    expect(app.dismissAiSuggestions).toHaveBeenCalledWith([PAIR.id]);
    expect(onClose).toHaveBeenCalled();
  });
});
