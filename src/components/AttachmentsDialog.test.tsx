// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentsDialog } from "./AttachmentsDialog";
import type { AppActions, AppData, AppStatus } from "@/context/AppDataContext";

// The provider's three halves, read here from one object.
type AppContext = AppData & AppActions & AppStatus;
import type { AttachmentMeta, TransactionWithCategory } from "@/db";

// The dialog reads its actions through this hook and its rows straight from the
// database module, so replacing both is enough to drive it without either.
const appData = vi.hoisted(() => ({ current: {} as AppContext }));
vi.mock("@/hooks/useAppData", () => ({
  useAppData: () => appData.current,
  useAppActions: () => appData.current,
  useAppStatus: () => appData.current,
}));

const database = vi.hoisted(() => ({
  listAttachments: vi.fn(),
  getAttachmentContent: vi.fn(),
}));
vi.mock("@/db", () => database);
vi.mock("@/lib/files", () => ({ pickAttachment: vi.fn(), saveAttachmentCopy: vi.fn() }));

// A query that answers only when the test says so, to put the answers for two
// transactions in whatever order the test needs.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// The list is not on screen the moment the query answers: a load that takes
// long enough puts up a placeholder, and one that is up is held briefly so it
// cannot flicker. That is a fraction of a second on any machine anyone uses,
// and it was still under the default second of patience here — until CI, where
// eight test files at once starve the timers and the whole thing lands late.
//
// So these two wait properly. They are the only tests in the file that read
// the list itself; the rest watch what the dialog asks the database.
const LOADS = { timeout: 3000 };

function aTransaction(id: number): TransactionWithCategory {
  return { id, description: `Movimiento ${id}` } as TransactionWithCategory;
}

function anAttachment(transactionId: number, fileName: string): AttachmentMeta {
  return {
    id: transactionId * 10,
    transaction_id: transactionId,
    file_name: fileName,
    mime_type: "application/pdf",
    byte_size: 2048,
    created_at: "2026-09-01T10:00:00.000Z",
  };
}

beforeEach(() => {
  database.listAttachments.mockReset();
  appData.current = {
    addAttachment: vi.fn(),
    removeAttachment: vi.fn(),
    isMutating: false,
  } as unknown as AppContext;
});

describe("AttachmentsDialog", () => {
  // The previous transaction's rows stayed on screen, with live "Eliminar"
  // buttons, under a title that already named the next transaction.
  it("never shows the previous transaction's receipts while the next ones load", async () => {
    const second = deferred<AttachmentMeta[]>();
    database.listAttachments.mockImplementation((id: number) =>
      id === 1 ? Promise.resolve([anAttachment(1, "recibo-uno.pdf")]) : second.promise,
    );

    const { rerender } = render(
      <AttachmentsDialog transaction={aTransaction(1)} onOpenChange={vi.fn()} />,
    );
    expect(await screen.findByText("recibo-uno.pdf", {}, LOADS)).toBeInTheDocument();

    rerender(<AttachmentsDialog transaction={aTransaction(2)} onOpenChange={vi.fn()} />);

    expect(screen.queryByText("recibo-uno.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  // The bytes live only in the database: a slip of the mouse lost the receipt
  // for good, with nothing asked first.
  it("asks before deleting a receipt", async () => {
    database.listAttachments.mockResolvedValue([anAttachment(1, "recibo-uno.pdf")]);
    const removeAttachment = vi.fn(() => Promise.resolve());
    appData.current = { ...appData.current, removeAttachment };

    render(<AttachmentsDialog transaction={aTransaction(1)} onOpenChange={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Eliminar recibo-uno\.pdf/ }, LOADS),
    );

    expect(removeAttachment).not.toHaveBeenCalled();
    expect(await screen.findByText("¿Eliminar este comprobante?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(removeAttachment).toHaveBeenCalledWith(10);
  });

  it("drops an answer that arrives after the dialog has moved on", async () => {
    const first = deferred<AttachmentMeta[]>();
    const second = deferred<AttachmentMeta[]>();
    database.listAttachments.mockImplementation((id: number) =>
      id === 1 ? first.promise : second.promise,
    );

    const { rerender } = render(
      <AttachmentsDialog transaction={aTransaction(1)} onOpenChange={vi.fn()} />,
    );
    rerender(<AttachmentsDialog transaction={aTransaction(2)} onOpenChange={vi.fn()} />);

    await act(async () => {
      second.resolve([anAttachment(2, "recibo-dos.pdf")]);
      await second.promise;
    });
    await act(async () => {
      first.resolve([anAttachment(1, "recibo-uno.pdf")]);
      await first.promise;
    });

    expect(screen.getByText("recibo-dos.pdf")).toBeInTheDocument();
    expect(screen.queryByText("recibo-uno.pdf")).not.toBeInTheDocument();
  });
});
