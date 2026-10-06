import { describe, expect, it } from "vitest";
import {
  findProfile,
  parseProfiles,
  rememberProfile,
  startingMapping,
  statementSignature,
} from "./importProfiles";
import { EMPTY_MAPPING } from "./importMapping";
import type { ColumnMapping } from "./importMapping";
import type { ImportProfiles } from "./importProfiles";
import { CURRENCY_CODES } from "@/lib/currency";
import type { PaymentMethod } from "@/db/schema";

const MAPPING: ColumnMapping = {
  ...EMPTY_MAPPING,
  headerRow: 3,
  date: 0,
  description: 1,
  amountLayout: "debit-credit",
  debit: 2,
  credit: 3,
};

const HEADER = ["Fecha", "Concepto", "Débito", "Crédito"];

describe("statementSignature", () => {
  it("ignores casing and padding, which a bank varies between exports", () => {
    expect(statementSignature(HEADER)).toBe(
      statementSignature(["  fecha", "CONCEPTO ", "débito", "Crédito"]),
    );
  });

  it("tells two banks' formats apart", () => {
    expect(statementSignature(HEADER)).not.toBe(
      statementSignature(["Fecha", "Detalle", "Importe"]),
    );
  });
});

describe("parseProfiles", () => {
  it("treats nothing stored as no profiles", () => {
    expect(parseProfiles(null)).toEqual({});
  });

  it("treats a corrupted value as no profiles rather than failing", () => {
    // The cost is re-doing a mapping. Throwing here would block the import.
    expect(parseProfiles("not json")).toEqual({});
    expect(parseProfiles("[1,2,3]")).toEqual({});
    expect(parseProfiles("null")).toEqual({});
  });
});

describe("rememberProfile", () => {
  it("keeps the newest mapping for a format", () => {
    const first = rememberProfile({}, "sig", MAPPING);
    const second = rememberProfile(first, "sig", { ...MAPPING, date: 5 });

    expect(Object.keys(second)).toHaveLength(1);
    expect(second.sig.date).toBe(5);
  });

  it("stops growing without bound", () => {
    let profiles = {};
    for (let index = 0; index < 40; index++) {
      profiles = rememberProfile(profiles, `sig-${index}`, MAPPING);
    }

    expect(Object.keys(profiles).length).toBeLessThanOrEqual(20);
    // The most recent is the one worth keeping.
    expect(profiles).toHaveProperty("sig-39");
  });
});

describe("findProfile", () => {
  const STATEMENT = [
    ["Resumen de cuenta", "", "", ""],
    ["Cuenta 123-456/7", "", "", ""],
    ["", "", "", ""],
    HEADER,
    ["05/08/2026", "COMPRA", "1.000,00", ""],
  ];

  it("finds a mapping whose headers are not on the first row", () => {
    // The regression this guards: the mapping was saved against the real header
    // row but looked up against row 0, so it never matched and the user had to
    // redo the mapping on every import.
    const profiles = rememberProfile({}, statementSignature(HEADER), MAPPING);

    const found = findProfile(profiles, STATEMENT);

    expect(found).not.toBeNull();
    expect(found?.headerRow).toBe(3);
    expect(found?.mapping.debit).toBe(2);
  });

  it("finds one on the first row too", () => {
    const profiles = rememberProfile({}, statementSignature(HEADER), MAPPING);

    expect(findProfile(profiles, [HEADER, ["05/08/2026", "X", "1", ""]])?.headerRow).toBe(
      0,
    );
  });

  it("reports the row it was found on, not the row it was saved with", () => {
    // The same bank can add or drop a preamble line between exports.
    const profiles = rememberProfile({}, statementSignature(HEADER), MAPPING);

    const found = findProfile(profiles, [["Título", "", "", ""], HEADER]);

    expect(found?.headerRow).toBe(1);
  });

  it("returns nothing for a format never seen before", () => {
    const profiles = rememberProfile({}, statementSignature(HEADER), MAPPING);

    expect(findProfile(profiles, [["Fecha", "Detalle", "Importe"]])).toBeNull();
  });

  it("does not scan an entire file looking for a header", () => {
    const profiles = rememberProfile({}, statementSignature(HEADER), MAPPING);
    const deep = [...Array.from({ length: 30 }, () => ["", "", "", ""]), HEADER];

    // A header 30 rows down is not a preamble, it is a different file.
    expect(findProfile(profiles, deep)).toBeNull();
  });
});

describe("startingMapping", () => {
  const ACCOUNTS: PaymentMethod[] = [
    { id: 2, name: "Banco ARS", type: "bank", currency: "ARS", initial_balance: 0 },
    { id: 3, name: "Banco USD", type: "bank", currency: "USD", initial_balance: 0 },
  ];
  const STATEMENT = [
    ["Título", "", "", ""],
    HEADER,
    ["05/08/2026", "COMPRA COTO", "12.345,67", ""],
    ["06/08/2026", "SUELDO", "", "500.000,00"],
  ];

  function remembered(mapping: Partial<ColumnMapping>) {
    return rememberProfile({}, statementSignature(HEADER), { ...MAPPING, ...mapping });
  }

  function starting(profiles: ImportProfiles, aiEnabled = true) {
    return startingMapping(profiles, STATEMENT, ACCOUNTS, aiEnabled);
  }

  it("offers back a remembered mapping, from the row its header is on", () => {
    const profiles = remembered({ currency: "USD", paymentMethodId: 3 });

    expect(starting(profiles)).toEqual({
      mapping: { ...MAPPING, currency: "USD", paymentMethodId: 3, headerRow: 1 },
      guess: null,
    });
  });

  // The account list only offers existing accounts in the mapping's currency,
  // so a remembered account that no longer fits showed as "Sin cuenta" while
  // the import went on writing to it.
  it("drops a remembered account that was deleted since", () => {
    const profiles = remembered({ currency: "ARS", paymentMethodId: 9 });

    expect(starting(profiles).mapping.paymentMethodId).toBeNull();
  });

  it("drops a remembered account now in another currency", () => {
    const profiles = remembered({ currency: "ARS", paymentMethodId: 3 });

    expect(starting(profiles).mapping.paymentMethodId).toBeNull();
  });

  // Remembered before instalments were asked about, so without the answer.
  it("reads a profile stored without the instalments' date as unanswered", () => {
    const { installmentDates: _, ...older } = MAPPING;
    const profiles = { [statementSignature(HEADER)]: older as ColumnMapping };

    expect(starting(profiles).mapping.installmentDates).toBeNull();
  });

  it("guesses the columns of a format never seen before", () => {
    const { mapping, guess } = starting({});

    expect(guess).not.toBeNull();
    expect(mapping).toEqual({
      ...EMPTY_MAPPING,
      currency: CURRENCY_CODES[0],
      headerRow: 1,
      date: 0,
      description: 1,
      amountLayout: "debit-credit",
      debit: 2,
      credit: 3,
    });
  });

  it("starts from nothing with the AI off", () => {
    expect(starting({}, false)).toEqual({
      mapping: { ...EMPTY_MAPPING, currency: CURRENCY_CODES[0] },
      guess: null,
    });
  });

  it("starts from nothing when there is nothing to guess from", () => {
    expect(startingMapping({}, [["Hola"]], ACCOUNTS, true)).toEqual({
      mapping: { ...EMPTY_MAPPING, currency: CURRENCY_CODES[0] },
      guess: null,
    });
  });
});
