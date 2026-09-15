import { invoke } from "@tauri-apps/api/core";
import { fileNameFromPath } from "@/lib/paths";

// Rust opens the native file dialogs and does the reading and writing (see
// src-tauri/src/lib.rs and dialogs.rs). No path ever leaves the webview: a
// command that took one would read or write wherever a script told it to, so
// the only path Rust uses is the one the user picked in the dialog. The
// webview has no filesystem or dialog permissions of its own.

// Each returns false or null when the user dismissed the dialog, which is not
// an error.
export async function saveCsvFile(
  defaultName: string,
  contents: string,
): Promise<boolean> {
  return invoke<boolean>("export_csv", { defaultName, contents });
}

export async function openCsvFile(): Promise<string | null> {
  return invoke<string | null>("import_csv");
}

// Rust takes the snapshot through SQLite itself (`VACUUM INTO`) once the
// dialog has closed, so nothing has to be checkpointed first and anything
// written while the dialog was open is included.
export async function saveDatabaseCopy(defaultName: string): Promise<boolean> {
  return invoke<boolean>("backup_database", { defaultName });
}

// Where the live database is, for Ajustes to show. Rust works it out from the
// same place the SQL plugin opens it.
export async function getDatabasePath(): Promise<string> {
  return invoke<string>("database_path");
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
};

export interface PickedAttachment {
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentBase64: string;
}

// Returns the chosen file already encoded. Rust enforces the size ceiling and
// reports it as an error.
export async function pickAttachment(): Promise<PickedAttachment | null> {
  const picked = await invoke<{ fileName: string; contentBase64: string } | null>(
    "pick_attachment",
  );
  if (picked === null) return null;

  const { contentBase64 } = picked;
  const fileName = picked.fileName || "comprobante";
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  return {
    fileName,
    mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
    // base64 carries roughly 3 bytes per 4 characters, minus the padding.
    byteSize: Math.floor((contentBase64.replace(/=+$/, "").length * 3) / 4),
    contentBase64,
  };
}

// Only the name is sent, and Rust suggests it in the user's Documents folder:
// an attachment picked on Windows before names were cut down stored its whole
// original path, which would otherwise suggest the original folder.
export async function saveAttachmentCopy(
  fileName: string,
  contentBase64: string,
): Promise<boolean> {
  return invoke<boolean>("save_attachment_copy", {
    fileName: fileNameFromPath(fileName),
    contents: contentBase64,
  });
}

// Opens the system print dialog.
//
// Deliberately not `window.print()`: in the macOS webview that call silently
// does nothing — no dialog, no error — so printing has to be asked for from
// the native side.
export async function printWindow(): Promise<void> {
  await invoke("print_window");
}

export interface PickedStatement {
  fileName: string;
  // The raw grid, before any interpretation: which column means what is the
  // user's decision, not this function's.
  rows: string[][];
}

// What Rust sends: a spreadsheet as base64, for read-excel-file to parse
// here; anything else as its text.
interface StatementFile {
  fileName: string;
  kind: "spreadsheet" | "text";
  content: string;
}

// Opens a bank statement and returns its rows.
//
// CSV and Excel both end up as a grid of strings. Excel cells arrive typed —
// dates as Date objects, amounts as numbers — and are turned back into the text
// they were displayed as, so one parser handles both and the user sees in the
// preview exactly what the mapping will be applied to.
export async function openStatementFile(): Promise<PickedStatement | null> {
  const picked = await invoke<StatementFile | null>("open_statement");
  if (picked === null) return null;

  const { fileName } = picked;

  if (picked.kind === "spreadsheet") {
    const bytes = Uint8Array.from(atob(picked.content), (char) => char.charCodeAt(0));
    // The browser entry point: this runs in a webview, not in Node. And
    // `readSheet` rather than the default export, which returns every sheet
    // wrapped in metadata — a statement is one table on the first sheet.
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(new Blob([bytes as unknown as BlobPart]));
    return { fileName, rows: rows.map((row) => row.map(cellToText)) };
  }

  const { parseCsv, detectDelimiter } = await import("@/lib/csv");
  return { fileName, rows: parseCsv(picked.content, detectDelimiter(picked.content)) };
}

// Excel hands back typed cells. A date has to become the ISO form the parser
// recognises; everything else becomes the string it looked like on screen.
function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  // Anything else has no textual form worth showing; an empty cell is honest,
  // "[object Object]" is not.
  return "";
}
