// The errors the file commands in src-tauri/src/files.rs return, which are
// written for the user and can be shown as they are. Must match the Rust
// constants word for word; fileErrors.test.ts reads the Rust source to check.
export const FILE_ERRORS = [
  "No se puede guardar sobre la base de datos en uso",
  "No se encontró el archivo",
  "No hay permiso para usar esa ubicación",
  "No queda espacio en el disco",
  "Esa ubicación es de solo lectura",
  "El archivo no está en UTF-8. Guardalo como «CSV UTF-8» y probá de nuevo",
  "El adjunto está dañado",
] as const;

// The size limit carries the file's figures, so it is recognised by its shape.
const SIZE_LIMIT = /El archivo pesa [\d,]+ MB y el máximo es [\d,]+ MB/;

// What to tell the user when reading or writing a file fails. One of the
// messages above says what went wrong and usually what to do about it, so it
// is shown as is. Anything else — an OS error Rust had no words for, a dialog
// plugin failing, a parser throwing — gets the caller's own message instead.
export function fileErrorMessage(error: unknown, fallback: string): string {
  const text = String(error);
  const known = FILE_ERRORS.find((message) => text.includes(message));
  if (known !== undefined) return known;
  return SIZE_LIMIT.exec(text)?.[0] ?? fallback;
}
