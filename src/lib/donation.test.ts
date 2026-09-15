import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DONATION_LINK } from "@/lib/donation";

interface Permission {
  identifier: string;
  allow?: { url: string }[];
}

function openerAllowList(): string[] {
  const capability = JSON.parse(
    readFileSync(
      new URL("../../src-tauri/capabilities/default.json", import.meta.url),
      "utf8",
    ),
  ) as { permissions: (string | Permission)[] };

  const opener = capability.permissions.find(
    (permission): permission is Permission =>
      typeof permission !== "string" && permission.identifier === "opener:allow-open-url",
  );
  return (opener?.allow ?? []).map((entry) => entry.url);
}

// The link lives in two places: here, and in the capability that lets the
// webview hand it to the browser. Tauri refuses any URL the capability does
// not list, so a copy that drifted would leave "Donar" silently doing nothing.
describe("donation link", () => {
  it("is an https link", () => {
    expect(new URL(DONATION_LINK).protocol).toBe("https:");
  });

  it("is the only web address the app may open, allowed exactly and not by domain", () => {
    expect(openerAllowList()).toEqual(["mailto:*", DONATION_LINK]);
  });
});
