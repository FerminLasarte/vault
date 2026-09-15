// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePrintRequest } from "./usePrintRequest";

// Printing goes through a Tauri command, which does not exist here.
const printWindow = vi.hoisted(() => vi.fn((_title?: string) => Promise.resolve()));

vi.mock(import("@/lib/files"), async (importOriginal) => ({
  ...(await importOriginal()),
  printWindow,
}));

describe("usePrintRequest", () => {
  it("hands each document's title to the print dialog, and none without one", () => {
    const { result } = renderHook(() => usePrintRequest<string>());

    act(() => result.current.requestPrint("2026-08", "Vault - Cierre de agosto de 2026"));
    act(() => result.current.requestPrint("report"));

    expect(printWindow.mock.calls).toEqual([
      ["Vault - Cierre de agosto de 2026"],
      [undefined],
    ]);
  });
});
