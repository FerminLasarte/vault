// A failure the app has already told the user about.
//
// A mutation that fails shows its own specific message and then rethrows, so
// whatever awaited it stops — a dialog stays open with what was typed, a
// "Registrar todas" loop stops at the first failure. Nothing downstream needs
// to say anything more, and the global "Una operación no pudo completarse"
// handler in particular must not: it would bury the specific message under a
// generic one. Wrapping the error is how they tell the two cases apart.
export class ReportedError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "ReportedError";
  }
}

export function isReported(error: unknown): boolean {
  return error instanceof ReportedError;
}
