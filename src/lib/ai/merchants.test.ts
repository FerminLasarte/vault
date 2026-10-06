import { describe, expect, it } from "vitest";
import dictionary from "./data/merchants.json";
import { knownMerchant, merchantKey, merchantName } from "./merchants";
import { words } from "./tokens";

describe("merchantName", () => {
  describe("a known merchant", () => {
    it("is named by the dictionary, whatever the processor wrapped it in", () => {
      expect(merchantName("MERPAGO*RAPPI 4471 CABA AR")).toBe("Rappi");
      expect(merchantName("DLO*SPOTIFY P1A2B3")).toBe("Spotify");
      expect(merchantName("PAYPAL *STEAM GAMES")).toBe("Steam");
    });

    it("is recognised in a statement line with no processor at all", () => {
      expect(merchantName("NETFLIX.COM")).toBe("Netflix");
      expect(merchantName("COTO CICSA 1234")).toBe("Coto");
      expect(merchantName("YPF 1234 CABA")).toBe("YPF");
    });

    // "uber eats" is more specific than "uber", and the more specific one is the
    // merchant: the same rule the category rules follow.
    it("goes by the longest pattern that matches", () => {
      expect(merchantName("UBER EATS PENDING")).toBe("Uber Eats");
      expect(merchantName("UBER *TRIP")).toBe("Uber");
    });

    it("matches whole words only", () => {
      expect(merchantName("SHELLEY BOUTIQUE")).toBe("Shelley Boutique");
    });

    // A merchant whose own name is the prefix is still that merchant: only
    // payment processors are stripped.
    it("treats a merchant's own prefix as the merchant", () => {
      expect(merchantName("Rappi*Restaurante Don Julio")).toBe("Rappi");
    });
  });

  describe("an unknown merchant on a statement", () => {
    it("loses the processor, the codes and the place, and is written like a name", () => {
      expect(merchantName("MERPAGO*LA BIRRA BAR 0021 CABA AR")).toBe("La Birra Bar");
    });

    it("loses its legal form", () => {
      expect(merchantName("PANADERIA LOS ANDES SRL")).toBe("Panaderia los Andes");
    });

    it("keeps connectors in lower case, except at the start", () => {
      expect(merchantName("MERPAGO*CASA DE LAS EMPANADAS")).toBe("Casa de las Empanadas");
      expect(merchantName("LA FABRICA DEL TACO")).toBe("La Fabrica del Taco");
    });

    // An acronym written as a word would be a misspelling: "Ypf", "Psn".
    it("keeps a short word with no vowels in capitals", () => {
      expect(merchantName("TKT BAR 33")).toBe("TKT Bar");
    });

    // "Argentina" can be part of a name, so a place is only dropped from the
    // end, where statements put it.
    it("drops a place only from the end", () => {
      expect(merchantName("BA HOSTEL CABA")).toBe("Ba Hostel");
    });
  });

  describe("what is left alone", () => {
    // Someone who typed "nafta ypf" said more than "YPF". Only text that reads
    // like a bank's — capitals, or a processor's asterisk — is renamed.
    it("leaves what the user typed exactly as typed", () => {
      expect(merchantName("nafta ypf")).toBeNull();
      expect(merchantName("Cena con Juan en McDonalds")).toBeNull();
      expect(merchantName("Netflix")).toBeNull();
    });

    it("says nothing when there is no name left to give", () => {
      expect(merchantName("")).toBeNull();
      expect(merchantName("1234 5678")).toBeNull();
      expect(merchantName("MERPAGO*")).toBeNull();
      expect(merchantName("MERPAGO* 4471 CABA")).toBeNull();
    });
  });
});

describe("knownMerchant", () => {
  // Nothing on screen changes, so typed text is fair game: "nafta ypf" is
  // about YPF all the same.
  it("finds the merchant in typed text as well as in a bank's", () => {
    expect(knownMerchant("nafta ypf")).toEqual({
      name: "YPF",
      patterns: ["ypf"],
      hint: "combustible",
    });
    expect(knownMerchant("MERPAGO*RAPPI 4471")?.hint).toBe("delivery");
  });

  it("says nothing about a merchant it does not know", () => {
    expect(knownMerchant("verduleria los hermanos")).toBeNull();
  });
});

describe("the merchant dictionary", () => {
  const patterns = dictionary.merchants.flatMap((merchant) => merchant.patterns);

  // A pattern is compared against the words of a description, so one written
  // any other way — an accent, a capital, a hyphen — could never match.
  it("writes every pattern the way descriptions are read", () => {
    for (const pattern of [
      ...patterns,
      ...dictionary.processorPrefixes,
      ...dictionary.legalSuffixes,
      ...dictionary.locationSuffixes,
    ]) {
      expect(words(pattern).join(" ")).toBe(pattern);
    }
  });

  // Two merchants claiming the same words would make the name depend on the
  // order of the file.
  it("gives every pattern to one merchant only", () => {
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it("names every merchant once", () => {
    const names = dictionary.merchants.map((merchant) => merchant.name);

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("merchantKey", () => {
  it("is the same for a statement line and the merchant typed by hand", () => {
    expect(merchantKey("MERPAGO*RAPPI 4471 CABA AR")).toBe("rappi");
    expect(merchantKey("rappi")).toBe("rappi");
  });

  it("ignores accents, case and punctuation in typed text", () => {
    expect(merchantKey("Café con Juan")).toBe(merchantKey("cafe con juan."));
  });

  it("keeps typed text apart from the merchant it mentions", () => {
    expect(merchantKey("nafta ypf")).not.toBe(merchantKey("YPF 1234 CABA"));
  });
});
