import { describe, expect, it } from "vitest";
import { readInstallment } from "./installmentText";

describe("readInstallment", () => {
  it.each([
    ["FRAVEGA C.03/12", 3, 12],
    ["FRAVEGA C 03/12", 3, 12],
    ["FRAVEGA CUOTA 03/12", 3, 12],
    ["FRAVEGA CUOTAS 3/12", 3, 12],
    ["FRAVEGA CTA 03/12", 3, 12],
    ["FRAVEGA CTA. 3 DE 12", 3, 12],
    ["Fravega cuota 3 de 12", 3, 12],
    ["MERPAGO*FRAVEGA CUO 12/12", 12, 12],
  ])("reads «%s» as instalment %i of %i", (description, number, count) => {
    expect(readInstallment(description)).toMatchObject({ number, count });
  });

  it("gives back the text without the instalment", () => {
    expect(readInstallment("MERPAGO*FRAVEGA C.03/12 CABA")?.text).toBe(
      "MERPAGO*FRAVEGA CABA",
    );
  });

  it.each([
    ["a date, with nothing saying it is an instalment", "COTO 15/09"],
    ["a C that is part of a word", "ABC 03/12"],
    ["an instalment past the last", "FRAVEGA C.13/12"],
    ["instalment zero", "FRAVEGA C.00/12"],
    ["a single payment", "FRAVEGA C.01/01"],
    ["more instalments than a plan can hold", "FRAVEGA C.01/240"],
  ])("does not read %s", (_, description) => {
    expect(readInstallment(description)).toBeNull();
  });
});
