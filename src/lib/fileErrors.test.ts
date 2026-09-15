import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FILE_ERRORS, fileErrorMessage } from "@/lib/fileErrors";

const RUST_SOURCES = ["files.rs", "lib.rs"]
  .map((file) =>
    readFileSync(new URL(`../../src-tauri/src/${file}`, import.meta.url), "utf8"),
  )
  .join("\n");

describe("fileErrorMessage", () => {
  it("passes on the refusal to write over the live database", () => {
    expect(
      fileErrorMessage(
        "No se puede guardar sobre la base de datos en uso",
        "No se pudo guardar la copia",
      ),
    ).toBe("No se puede guardar sobre la base de datos en uso");
  });

  it("passes on the size limit, with its figures", () => {
    expect(
      fileErrorMessage(
        "El archivo pesa 5,9 MB y el máximo es 5 MB",
        "No se pudo leer el archivo",
      ),
    ).toBe("El archivo pesa 5,9 MB y el máximo es 5 MB");
  });

  it("passes on the OS failures Rust has put into words", () => {
    expect(
      fileErrorMessage("No se encontró el archivo", "No se pudo leer el archivo"),
    ).toBe("No se encontró el archivo");
  });

  it("falls back to the caller's message for anything else", () => {
    const fallback = "No se pudo guardar la copia";

    expect(fileErrorMessage("Operation not permitted (os error 1)", fallback)).toBe(
      fallback,
    );
    expect(fileErrorMessage(new Error("dialog closed unexpectedly"), fallback)).toBe(
      fallback,
    );
    expect(fileErrorMessage(undefined, fallback)).toBe(fallback);
  });
});

// The two lists live in two languages, so nothing but this test keeps them in
// step: a message reworded in Rust would otherwise silently fall back here.
describe("the messages it recognises", () => {
  it("are the ones Rust returns, word for word", () => {
    for (const message of FILE_ERRORS) {
      expect(RUST_SOURCES).toContain(`"${message}"`);
    }
  });

  it("include the size limit's wording", () => {
    expect(RUST_SOURCES).toContain('"El archivo pesa {} MB y el máximo es {} MB"');
  });
});
