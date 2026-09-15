import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

// The frontend opens the database by URL and Rust finds the same file by name
// to back it up and to guard it; if the two drifted apart, the backup would
// copy (and the guard protect) a file the app never opens.
describe("database file", () => {
  it("is the same file for the frontend and for Rust", () => {
    const rust = read("src-tauri/src/lib.rs");
    const frontendUrl = /const DATABASE_URL = "([^"]+)"/.exec(
      read("src/db/index.ts"),
    )?.[1];
    const rustUrl = /const DATABASE_URL: &str = "([^"]+)"/.exec(rust)?.[1];
    const rustFile = /const DATABASE_FILE: &str = "([^"]+)"/.exec(rust)?.[1];

    expect(frontendUrl).toBe("sqlite:vault-ai.db");
    expect(rustUrl).toBe(frontendUrl);
    expect(rustFile).toBe(frontendUrl?.replace(/^sqlite:/, ""));
  });
});
