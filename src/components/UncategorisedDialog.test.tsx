// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UncategorisedDialog } from "./UncategorisedDialog";
import { ReportedError } from "@/lib/reportedError";
import type { UncategorisedGroup } from "@/lib/ai/uncategorised";
import type { TransactionWithCategory } from "@/db/schema";

const app = vi.hoisted(() => ({
  aiEnabled: true,
  isMutating: false,
  categoriseTransactions: vi.fn((_ids: number[], _categoryId: number) =>
    Promise.resolve(),
  ),
  dismissAiSuggestions: vi.fn((_ids: string[]) => Promise.resolve()),
}));
vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => app,
  useAppActions: () => app,
  useAppStatus: () => app,
}));

beforeEach(() => {
  app.categoriseTransactions.mockClear();
  app.dismissAiSuggestions.mockClear();
});

function row(id: number, description: string) {
  return {
    transaction: {
      id,
      description,
      amount: 25_000,
      currency: "ARS",
      date: "2026-09-10",
      type: "expense",
      category_id: null,
      payment_method_name: "Visa",
    } as TransactionWithCategory,
    reason: "Tus 12 movimientos con «coto» están en Super.",
    dismissalId: `categorise:${id}:4`,
  };
}

const GROUP: UncategorisedGroup<TransactionWithCategory> = {
  id: "uncategorised:4",
  categoryId: 4,
  categoryName: "Super",
  rows: [row(11, "COTO SUC 45"), row(12, "COTO SUC 12"), row(13, "COTO ONLINE")],
};

describe("UncategorisedDialog", () => {
  it("lists every movement ticked, by its merchant name", () => {
    render(<UncategorisedDialog group={GROUP} onClose={() => {}} />);

    expect(screen.getByText("3 movimientos parecen Super")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Aplicar a todos" })).toBeEnabled();
  });

  // What was unticked was looked at and turned down: it is not offered again.
  it("applies the category to the ticked ones and turns the rest down", async () => {
    const onClose = vi.fn();
    render(<UncategorisedDialog group={GROUP} onClose={onClose} />);

    await userEvent.click(screen.getAllByRole("checkbox")[1]);
    await userEvent.click(screen.getByRole("button", { name: "Aplicar a 2" }));

    expect(app.categoriseTransactions).toHaveBeenCalledExactlyOnceWith([11, 13], 4);
    expect(app.dismissAiSuggestions).toHaveBeenCalledExactlyOnceWith(["categorise:12:4"]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("applies nothing with nothing ticked", async () => {
    render(<UncategorisedDialog group={GROUP} onClose={() => {}} />);

    for (const box of screen.getAllByRole("checkbox")) await userEvent.click(box);

    expect(screen.getByRole("button", { name: "Aplicar a 0" })).toBeDisabled();
  });

  it("turns the whole group down", async () => {
    const onClose = vi.fn();
    render(<UncategorisedDialog group={GROUP} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(app.categoriseTransactions).not.toHaveBeenCalled();
    expect(app.dismissAiSuggestions).toHaveBeenCalledExactlyOnceWith([
      "categorise:11:4",
      "categorise:12:4",
      "categorise:13:4",
    ]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // A failed write has been told already; the review is not lost to it.
  it("stays open when applying fails", async () => {
    app.categoriseTransactions.mockRejectedValueOnce(new ReportedError(new Error("x")));
    const onClose = vi.fn();
    render(<UncategorisedDialog group={GROUP} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Aplicar a todos" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(app.dismissAiSuggestions).not.toHaveBeenCalled();
  });
});
