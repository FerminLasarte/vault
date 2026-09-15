import { describe, expect, it } from "vitest";
import { fileNameFromPath } from "@/lib/paths";

describe("fileNameFromPath", () => {
  it("takes the last part of a macOS path", () => {
    expect(fileNameFromPath("/Users/fermin/Documents/recibo.pdf")).toBe("recibo.pdf");
  });

  it("takes the last part of a Windows path", () => {
    // The Windows dialog returns backslashes, and splitting on "/" alone stored
    // the whole path as the attachment's name.
    expect(fileNameFromPath("C:\\Users\\fermin\\Documents\\recibo.pdf")).toBe(
      "recibo.pdf",
    );
  });

  it("copes with a path that mixes both separators", () => {
    expect(fileNameFromPath("C:\\Users\\fermin/Descargas\\extracto.xlsx")).toBe(
      "extracto.xlsx",
    );
  });

  it("returns a bare name unchanged", () => {
    expect(fileNameFromPath("recibo.pdf")).toBe("recibo.pdf");
  });
});
