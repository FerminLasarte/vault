import { detectDelimiter, parseCsv } from "@/lib/csv";

// Statement files for the tests of everything that reads one: the mapped
// import itself and the guess of its columns, so both are held to the same
// shapes a bank actually exports.

// Semicolon separated because the comma is already the decimal separator,
// day-first dates, a preamble above the table, separate Débito and Crédito
// columns, a blank spacer row and a totals line at the end. Every one of
// those is normal, and every one breaks a naive parser.
export const ARGENTINE_STATEMENT = [
  "Resumen de cuenta;;;",
  "Cuenta 123-456/7;;;",
  ";;;",
  "Fecha;Concepto;Débito;Crédito",
  "05/08/2026;COMPRA COTO DIGITAL;12.345,67;0,00",
  "06/08/2026;TRANSFERENCIA RECIBIDA;0,00;500.000,00",
  ";;;",
  "07/08/2026;DEBITO AUTOMATICO EDESUR;8.900,50;",
  "08/08/2026;PAGO TARJETA;150.000,00;0,00",
  "Saldo final;;;",
].join("\n");

export function rowsOf(file: string): string[][] {
  return parseCsv(file, detectDelimiter(file));
}
