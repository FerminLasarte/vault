import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

// The version lives in package.json, and Tauri reads it from there; Cargo has
// no way to, so Cargo.toml (and Cargo.lock after it) carry a copy. The updater
// compares installed copies against the one Tauri builds in, so a stale copy
// anywhere would ship an installer that reports the wrong version.
describe("app version", () => {
  const version = (JSON.parse(read("package.json")) as { version: string }).version;

  it("is read by Tauri from package.json", () => {
    const config = JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string };

    expect(config.version).toBe("../package.json");
  });

  it("matches in Cargo.toml and Cargo.lock", () => {
    const manifest = /^\[package\][^[]*?^version = "([^"]+)"/m.exec(
      read("src-tauri/Cargo.toml"),
    );
    const lock = /^name = "vault"\nversion = "([^"]+)"/m.exec(
      read("src-tauri/Cargo.lock"),
    );

    expect(manifest?.[1]).toBe(version);
    expect(lock?.[1]).toBe(version);
  });
});
