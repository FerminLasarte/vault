import { describe, expect, it } from "vitest";
import { words } from "./tokens";

describe("words", () => {
  it("splits on anything that is not a letter or a digit", () => {
    expect(words("MERPAGO*RAPPI 4471 CABA-AR")).toEqual([
      "merpago",
      "rappi",
      "4471",
      "caba",
      "ar",
    ]);
  });

  it("compares the way search does: no case, no accents", () => {
    expect(words("Café Martínez")).toEqual(["cafe", "martinez"]);
  });

  it("keeps the letter of an ñ, the way search already reads it", () => {
    expect(words("Panadería Ñandú")).toEqual(["panaderia", "nandu"]);
  });

  it("reads a domain as the words it is made of", () => {
    expect(words("NETFLIX.COM")).toEqual(["netflix", "com"]);
  });

  it("has nothing to say about blank text", () => {
    expect(words("")).toEqual([]);
    expect(words("  *  -  ")).toEqual([]);
  });
});
