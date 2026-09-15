import { useCallback, useEffect, useState } from "react";
import { printWindow } from "@/lib/files";

interface PrintRequest<T> {
  // Which document was asked for. What that means is the caller's business:
  // one screen chooses between two documents, another names a month.
  target: T;
  seq: number;
}

// Asks the window to print, once the document being asked for is on screen.
//
// The sequence number is why this is not a plain value: asking for the same
// document twice has to count as two requests, the same reason `TabRequest`
// carries one (see src/lib/navigation.ts). Without it the second request would
// look identical to the first and the effect below would not fire.
//
// Nothing clears the target afterwards, and that is deliberate. `printWindow`
// resolves the moment the sheet opens, not when printing ends, so clearing it
// here swapped the document out from under a preview that was still being
// drawn — the dialog showed the wrong document. Each caller names what it
// wants instead, and what stays mounted is invisible on screen anyway.
export function usePrintRequest<T>(): {
  request: PrintRequest<T> | null;
  requestPrint: (target: T) => void;
} {
  const [request, setRequest] = useState<PrintRequest<T> | null>(null);

  const requestPrint = useCallback((target: T) => {
    setRequest((previous) => ({ target, seq: (previous?.seq ?? 0) + 1 }));
  }, []);

  // Printing happens in an effect rather than in the click handler, so the
  // document being asked for has already been committed to the DOM by the time
  // the print engine reads the window.
  useEffect(() => {
    if (request === null) return;
    void printWindow();
  }, [request]);

  return { request, requestPrint };
}
