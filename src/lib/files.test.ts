import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke =
  vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: Parameters<typeof invoke>) => invoke(...args),
}));

const readSheet = vi.fn<(input: Blob) => Promise<unknown[][]>>();
vi.mock("read-excel-file/browser", () => ({
  readSheet: (input: Blob) => readSheet(input),
}));

const {
  getDatabasePath,
  openCsvFile,
  openStatementFile,
  pickAttachment,
  saveAttachmentCopy,
  saveCsvFile,
  saveDatabaseCopy,
} = await import("@/lib/files");

// Every argument sent to Rust, flattened, so a test can check that none of
// them is a path: the dialogs are opened by Rust, and a command that took a
// path from the webview would read or write wherever a script told it to.
function sentArguments(): unknown[] {
  return invoke.mock.calls.flatMap(([, args]) =>
    args === undefined ? [] : Object.values(args),
  );
}

describe("file commands", () => {
  beforeEach(() => {
    invoke.mockReset();
    readSheet.mockReset();
  });

  it("exports a CSV through Rust's own save dialog", async () => {
    invoke.mockResolvedValue(true);

    await expect(saveCsvFile("vault-2026-09-15.csv", "a,b\n")).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith("export_csv", {
      defaultName: "vault-2026-09-15.csv",
      contents: "a,b\n",
    });
  });

  it("reports a dismissed save dialog as nothing saved", async () => {
    invoke.mockResolvedValue(false);

    await expect(saveDatabaseCopy("vault-2026-09-15.db")).resolves.toBe(false);

    expect(invoke).toHaveBeenCalledWith("backup_database", {
      defaultName: "vault-2026-09-15.db",
    });
  });

  it("reports a dismissed open dialog as nothing chosen", async () => {
    invoke.mockResolvedValue(null);

    await expect(openCsvFile()).resolves.toBeNull();
    await expect(pickAttachment()).resolves.toBeNull();
    await expect(openStatementFile()).resolves.toBeNull();

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "import_csv",
      "pick_attachment",
      "open_statement",
    ]);
  });

  it("returns the text of the CSV the user picked", async () => {
    invoke.mockResolvedValue("fecha,monto\n");

    await expect(openCsvFile()).resolves.toBe("fecha,monto\n");
  });

  it("saves a copy of an attachment under its bare name", async () => {
    invoke.mockResolvedValue(true);

    // Stored whole by a Windows copy from before names were cut down.
    await saveAttachmentCopy("C:\\Users\\ana\\recibo.pdf", "JVBERi0=");

    expect(invoke).toHaveBeenCalledWith("save_attachment_copy", {
      fileName: "recibo.pdf",
      contents: "JVBERi0=",
    });
  });

  it("describes a picked attachment from its name and bytes", async () => {
    invoke.mockResolvedValue({ fileName: "Recibo.JPG", contentBase64: "AAECAw==" });

    await expect(pickAttachment()).resolves.toEqual({
      fileName: "Recibo.JPG",
      mimeType: "image/jpeg",
      byteSize: 4,
      contentBase64: "AAECAw==",
    });
  });

  it("reads a spreadsheet statement from the bytes Rust sends", async () => {
    invoke.mockResolvedValue({
      fileName: "resumen.xlsx",
      kind: "spreadsheet",
      content: btoa("PK"),
    });
    readSheet.mockResolvedValue([
      ["Fecha", "Importe"],
      [new Date("2026-09-01T00:00:00Z"), 1500],
    ]);

    await expect(openStatementFile()).resolves.toEqual({
      fileName: "resumen.xlsx",
      rows: [
        ["Fecha", "Importe"],
        ["2026-09-01", "1500"],
      ],
    });
    const [blob] = readSheet.mock.calls[0];
    expect(await blob.text()).toBe("PK");
  });

  it("reads a text statement with whatever delimiter it uses", async () => {
    invoke.mockResolvedValue({
      fileName: "resumen.csv",
      kind: "text",
      content: "Fecha;Importe\n01/09/2026;1500,50\n",
    });

    await expect(openStatementFile()).resolves.toEqual({
      fileName: "resumen.csv",
      rows: [
        ["Fecha", "Importe"],
        ["01/09/2026", "1500,50"],
      ],
    });
    expect(readSheet).not.toHaveBeenCalled();
  });

  it("never hands Rust a path to read or write", async () => {
    invoke.mockResolvedValue(null);

    await saveCsvFile("vault.csv", "a\n");
    await openCsvFile();
    await saveDatabaseCopy("vault.db");
    await pickAttachment();
    await saveAttachmentCopy("recibo.pdf", "AA==");
    await openStatementFile();

    for (const argument of sentArguments()) {
      expect(String(argument)).not.toMatch(/[\\/]/);
    }
  });

  // Rust knows where the SQL plugin keeps the database; working it out again
  // here pointed Ajustes at the wrong folder on Linux.
  it("asks Rust where the database lives", async () => {
    invoke.mockResolvedValue("/home/ana/.config/com.ferminlasarte.vault-ai/vault-ai.db");

    await expect(getDatabasePath()).resolves.toBe(
      "/home/ana/.config/com.ferminlasarte.vault-ai/vault-ai.db",
    );
    expect(invoke).toHaveBeenCalledWith("database_path");
  });
});
