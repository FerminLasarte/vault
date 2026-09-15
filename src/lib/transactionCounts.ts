// How the import and export messages count transactions. Spanish agrees both
// the noun and the participle with the number, so "1 transacciones importadas"
// is not a shortcut but a mistake the user reads every time one row goes in.

type Participle = "importada" | "exportada";

export function transactionCount(count: number, participle: Participle): string {
  return count === 1
    ? `1 transacción ${participle}`
    : `${count} transacciones ${participle}s`;
}

// The line under an import that says how many rows were already there.
export function duplicatesSkipped(count: number): string {
  return count === 1
    ? "1 ya existía y se omitió."
    : `${count} ya existían y se omitieron.`;
}
