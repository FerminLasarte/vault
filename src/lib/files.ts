import { invoke } from "@tauri-apps/api/core";
import { documentDir, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

// The native pickers return the path the user chose; the actual reading and
// writing happens in Rust (see src-tauri/src/lib.rs), which keeps the webview
// from needing filesystem permissions of its own.

const CSV_FILTER = [{ name: "CSV", extensions: ["csv"] }];
const DB_FILTER = [{ name: "Base de datos SQLite", extensions: ["db"] }];
// Bank statements arrive in whatever the bank felt like exporting.
const STATEMENT_FILTER = [
  { name: "Resumen bancario", extensions: ["csv", "txt", "xlsx", "xls"] },
];

// Suggests the user's Documents folder rather than letting the panel reopen
// wherever it happened to be last. Documents is the sane default for a file the
// user is meant to keep: it is backed up by Time Machine and picked up by
// iCloud Drive when Desktop & Documents sync is on, which puts a copy off the
// machine — the one thing a local-first app cannot do for itself. Falls back to
// a bare file name if the folder cannot be resolved, which only loses the
// suggestion, not the save.
async function suggestPath(fileName: string): Promise<string> {
  try {
    return await join(await documentDir(), fileName);
  } catch {
    return fileName;
  }
}

// Returns false when the user dismissed the dialog, which is not an error.
export async function saveCsvFile(
  defaultName: string,
  contents: string,
): Promise<boolean> {
  const path = await save({
    defaultPath: await suggestPath(defaultName),
    filters: CSV_FILTER,
  });
  if (path === null) return false;

  await invoke("write_text_file", { path, contents });
  return true;
}

// Returns the file's contents, or null when the user dismissed the dialog.
export async function openCsvFile(): Promise<string | null> {
  const path = await open({ multiple: false, directory: false, filters: CSV_FILTER });
  if (path === null || typeof path !== "string") return null;

  return invoke<string>("read_text_file", { path });
}

// Rust refuses to write over the live database, whatever is being saved (see
// guard_destination in src-tauri/src/files.rs). Must match LIVE_DATABASE_ERROR
// there word for word.
const LIVE_DATABASE_ERROR = "No se puede guardar sobre la base de datos en uso";

// What to tell the user when a save fails. The refusal above is shown as is,
// since it says what to do differently; anything else is an OS error in
// English, so it gets the caller's generic message instead.
export function saveErrorMessage(error: unknown, fallback: string): string {
  return String(error).includes(LIVE_DATABASE_ERROR) ? LIVE_DATABASE_ERROR : fallback;
}

// Rust takes the snapshot through SQLite itself (`VACUUM INTO`), so nothing
// has to be checkpointed first and anything written while the dialog was open
// is included.
export async function saveDatabaseCopy(defaultName: string): Promise<boolean> {
  const destination = await save({
    defaultPath: await suggestPath(defaultName),
    filters: DB_FILTER,
  });
  if (destination === null) return false;

  await invoke("backup_database", { destination });
  return true;
}

const ATTACHMENT_FILTER = [
  { name: "Comprobantes", extensions: ["png", "jpg", "jpeg", "webp", "heic", "pdf"] },
];

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

// Returns the chosen file already encoded, or null when the dialog was
// dismissed. Rust enforces the size ceiling and reports it as an error.
export async function pickAttachment(): Promise<PickedAttachment | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: ATTACHMENT_FILTER,
  });
  if (path === null || typeof path !== "string") return null;

  const contentBase64 = await invoke<string>("read_file_base64", { path });
  const fileName = path.split("/").pop() ?? "comprobante";
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  return {
    fileName,
    mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
    // base64 carries roughly 3 bytes per 4 characters, minus the padding.
    byteSize: Math.floor((contentBase64.replace(/=+$/, "").length * 3) / 4),
    contentBase64,
  };
}

export async function saveAttachmentCopy(
  fileName: string,
  contentBase64: string,
): Promise<boolean> {
  const path = await save({ defaultPath: await suggestPath(fileName) });
  if (path === null) return false;

  await invoke("write_file_base64", { path, contents: contentBase64 });
  return true;
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

// Opens a bank statement and returns its rows.
//
// CSV and Excel both end up as a grid of strings. Excel cells arrive typed —
// dates as Date objects, amounts as numbers — and are turned back into the text
// they were displayed as, so one parser handles both and the user sees in the
// preview exactly what the mapping will be applied to.
export async function openStatementFile(): Promise<PickedStatement | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: STATEMENT_FILTER,
  });
  if (path === null || typeof path !== "string") return null;

  const fileName = path.split("/").pop() ?? path;

  if (/\.xlsx?$/i.test(path)) {
    const base64 = await invoke<string>("read_file_base64", { path });
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    // The browser entry point: this runs in a webview, not in Node. And
    // `readSheet` rather than the default export, which returns every sheet
    // wrapped in metadata — a statement is one table on the first sheet.
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(new Blob([bytes as unknown as BlobPart]));
    return { fileName, rows: rows.map((row) => row.map(cellToText)) };
  }

  const text = await invoke<string>("read_text_file", { path });
  const { parseCsv, detectDelimiter } = await import("@/lib/csv");
  return { fileName, rows: parseCsv(text, detectDelimiter(text)) };
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
