// The file name at the end of a path, whichever separator the platform uses.
//
// The native dialogs return backslashes on Windows, so splitting on "/" alone
// stored "C:\Users\...\recibo.pdf" as an attachment's name. Kept pure rather
// than using `basename` from @tauri-apps/api/path, which is async and would
// also be wrong for names already stored from a Windows path.
export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
