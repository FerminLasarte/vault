import { MAX_INSTALLMENT_COUNT } from "@/lib/installments";

// The instalment a statement line is for, the way banks write it: "C.03/12",
// "CUOTA 03/12", "CTA 3 DE 12". Only with a word saying it is an instalment:
// "15/09" alone is a date.
const INSTALLMENT =
  /(?<![\p{L}\d])(?:c|cta|cuo|cuota|cuotas)\.?\s*(\d{1,3})\s*(?:\/|\s+de\s+)\s*(\d{1,3})(?!\d)/iu;

export interface InstallmentText {
  // One-based: 3 for "C.03/12".
  number: number;
  count: number;
  // The line with the instalment taken out: what is left names the purchase.
  text: string;
}

export function readInstallment(description: string): InstallmentText | null {
  const match = INSTALLMENT.exec(description);
  if (match === null) return null;

  const number = Number(match[1]);
  const count = Number(match[2]);
  // A plan has at least two instalments, as the plan form requires.
  if (count < 2 || count > MAX_INSTALLMENT_COUNT || number < 1 || number > count) {
    return null;
  }

  const text =
    `${description.slice(0, match.index)} ${description.slice(match.index + match[0].length)}`
      .replace(/\s+/g, " ")
      .trim();
  return { number, count, text };
}
