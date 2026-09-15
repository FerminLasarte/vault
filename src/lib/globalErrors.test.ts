// @vitest-environment jsdom
import { toast } from "sonner";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installGlobalErrorHandlers } from "./globalErrors";
import { ReportedError } from "./reportedError";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

// jsdom has no PromiseRejectionEvent, so the event is built by hand with the
// one field the handler reads.
function rejectUnhandled(reason: unknown): void {
  const event = new Event("unhandledrejection");
  Object.defineProperty(event, "reason", { value: reason });
  window.dispatchEvent(event);
}

beforeAll(() => {
  installGlobalErrorHandlers();
});

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("unhandled rejections", () => {
  it("stays quiet about a failure the app already told the user about", () => {
    // A failed mutation shows its own message and rethrows so the dialog stays
    // open; adding "Una operación no pudo completarse" on top buried it.
    rejectUnhandled(new ReportedError(new Error("disk I/O error")));

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("still speaks up for a failure nobody handled", () => {
    rejectUnhandled(new Error("something else"));

    expect(toast.error).toHaveBeenCalledWith(
      "Una operación no pudo completarse",
      expect.anything(),
    );
  });
});
