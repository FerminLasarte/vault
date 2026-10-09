# Personal spreadsheets

Importing the spreadsheet someone keeps by hand, not just a bank statement.
Started from a LinkedIn reply on 2026-10-09: "I still write everything down
in Excel". Four sample spreadsheets went through the real pipeline (the
read-excel-file parser, `cellToText`, `guessColumns`, `applyGuess`,
`buildMappedImportPlan`) at `aedadb0`:

| Fixture                        | Layout                                                                                           | Today                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `title-and-signed-amount.xlsx` | Title row, blank row, Fecha · Detalle · Monto (signed, typed as text) · Medio de pago            | Correct with no help                                                                     |
| `income-expense-columns.xlsx`  | Fecha · Descripción · Categoría · Ingreso · Gasto                                                | Not guessed: «Gasto» is no debit synonym. Correct once the user picks "Débito y crédito" |
| `amount-and-type.xlsx`         | Fecha · Concepto · Categoría · Monto (always positive) · Tipo (Gasto/Ingreso), then a totals row | **Every row imported as income**, and no setting fixes it                                |
| `sheet-per-month.xlsx`         | Sheets Agosto, Septiembre, Octubre, each Fecha · Concepto · Monto                                | Only Agosto is read; the other sheets vanish with no notice                              |

The fixtures live in `src/lib/testing/spreadsheets/` (hand-built .xlsx, ~3 KB
each; dates are real Excel dates and amounts real numbers, except in
`title-and-signed-amount.xlsx`, where they are text the way people type them).

## How to read this file

- **Batch** — the order of attack, 1 first. Each batch is one branch
  (`excel/batch-N-<theme>`) and one PR, under the same rules as the audit,
  polish and AI batches: failing test first for logic, every check green
  (`npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `cargo check` if Rust changes), screenshots of anything visible, ask before
  pushing.
- Every item says what the app does today (checked at `aedadb0`), what it
  should do and how it is built. Line numbers drift; re-check them.
- When an item is done, tick it in the table in the same PR and record what was
  checked in the running app and what was not.

## Decisions already taken

- **All three gaps are fixed**, in one minor release (1.6.0) after batch 3.
- **Several sheets** (decided 2026-10-09): a «Hoja» selector when the file has
  more than one, plus «Todas las hojas» when every sheet has the same header
  row, which imports the whole year at once. Not a warning only, not one sheet
  at a time only.
- **The type column is a third amount layout**, «Importe y tipo», beside «Una
  columna con signo» and «Débito y crédito»: the three are mutually exclusive
  ways a file says which way the money went, which is what the tabs already
  model. Not an optional extra column on the signed layout, where the sign
  and the type could contradict each other.
- **One vocabulary.** The words that name a debit or credit column in a header
  («Gasto», «Egreso», «Ingreso», «Haber») are the same words a type cell holds,
  so the type cell is read with the `debit` and `credit` lists of
  `src/lib/ai/data/csvHeaders.json`, not with a second list.
- **The Categoría column stays ignored.** Rules and the local AI place the
  category, as for a bank statement. Mapping a category column (matching names
  against the user's categories, creating missing ones) is a feature of its
  own and out of this plan.
- **One end-to-end test over the fixtures**, `src/lib/personalSpreadsheets.test.ts`,
  which reads each .xlsx with `read-excel-file/node`, runs it through
  `startingMapping` and `buildMappedImportPlan`, and checks the rows that come
  out. Batch 1 creates it with the two layouts that work after it; each later
  batch adds its fixture. That is the failing test first for every batch.
  `cellToText` (private in `src/lib/files.ts`) is exported for it rather than
  copied.

## Tracking

| #   | Batch | Item                                     | Done |
| --- | ----- | ---------------------------------------- | ---- |
| E1  | 1     | «Gasto» and «Gastos» name a debit column | [x]  |
| E2  | 2     | Amount and type layout                   | [ ]  |
| E3  | 3     | Sheet selector and «Todas las hojas»     | [ ]  |
| E4  | —     | Release 1.6.0                            | [ ]  |

---

## Batch 1 — header synonyms

### E1. «Gasto» and «Gastos» name a debit column

- [x] Done

**Today:** `csvHeaders.json` lists «egreso», «débito», «salida»… under
`debit`, and «ingreso» under `credit`, but not «gasto». A personal sheet with
Ingreso · Gasto columns gets only date and description guessed; the amount
has to be set by hand.

**Should:** guess «Débito y crédito» with Gasto as debit and Ingreso as credit.

**How:**

1. Create `src/lib/personalSpreadsheets.test.ts` with
   `title-and-signed-amount.xlsx` (passes today) and
   `income-expense-columns.xlsx` (fails today), checking date, type, amount
   and description of every row and that nothing is skipped. Export
   `cellToText` from `src/lib/files.ts` for it.
2. Add a `guessColumns` case to `src/lib/ai/columnGuess.test.ts`: header
   Fecha · Descripción · Categoría · Ingreso · Gasto.
3. Add `"gasto"` and `"gastos"` to `debit`. The synonym tests in
   `columnGuess.test.ts` already enforce normalised spelling and one column
   per name.

Nothing visible changes except the guess marks in the dialog; one screenshot
of the import dialog with `income-expense-columns.xlsx` open.

---

## Batch 2 — amount and type

### E2. Amount and type layout

- [ ] Done

**Today:** `AmountLayout` is `"single" | "debit-credit"`
(`src/lib/importMapping.ts:27`). With all amounts positive, `readAmount`
(`:165`) makes every row income; flipping «Qué significa un número negativo»
makes every row an expense. A Tipo column cannot be pointed at.

**Should:** a third tab «Importe y tipo» with two column selects, «Importe»
and «Tipo (gasto o ingreso)». The amount is taken as an absolute value; the
type cell decides. Guessed when the file has such a column.

**How:**

1. **Mapping** (`src/lib/importMapping.ts`): `AmountLayout` gains
   `"amount-type"`; `ColumnMapping` gains `type: number | null`, `null` in
   `EMPTY_MAPPING`. `isMappingComplete` needs `amount` and `type` for it.
   Profiles stored before the field existed are laid over `EMPTY_MAPPING`
   (`startingMapping`, `src/lib/importProfiles.ts:93`), so they read it as
   unset: add a test that says so.
2. **Reading a type cell**: a pure `movementType(cell): "income" | "expense" | null`
   in `importMapping.ts`. The cell's words (`words` from
   `src/lib/ai/tokens.ts`, joined) must **equal** an entry of the `debit`
   (expense) or `credit` (income) list — equal, not start with, so a bank's
   «Débito automático» or «Compra» does not read as a type. Tests: every
   synonym of both lists classifies; accents and capitals do not matter;
   «Transferencia», «» and «Gasto fijo» are `null`.
3. **`readAmount`**: for `"amount-type"`, `Math.abs` of the amount and the
   type from `movementType`. A row whose type cell is empty is skipped as
   «Sin tipo»; one that does not read, as «Tipo ilegible: «…»». Both are new
   `skipped` reasons in `buildMappedImportPlan`.
4. **Guess** (`src/lib/ai/columnGuess.ts`): `csvHeaders.json` gains a `type`
   field (`"tipo"`, `"tipo de movimiento"`, `"ingreso egreso"`, `"clase"`;
   update the test that pins the field list). A column is the type column
   when it is named so or unnamed, dense, and at least `MIN_CONTENT_SHARE` of
   its cells read with `movementType`. When there is one and an amount column,
   the layout is `"amount-type"` with the reason «“Tipo” dice si cada fila es
   gasto o ingreso.». `GuessedField` gains `"type"`. The type column is taken
   before the description is picked, so it can never become the description.
5. **Dialog** (`src/components/ImportMappingDialog.tsx:280-330`): the third
   `TabsTrigger` «Importe y tipo» and its branch with the two `columnSelect`s,
   the type one marked through `fieldLabel("type", …)`. Check the three tabs
   fit at the dialog's narrowest width; if not, shorten the labels rather than
   wrapping.
6. Add `amount-and-type.xlsx` to the end-to-end test: six expenses and two
   incomes, and the totals row skipped for its missing date.

Screenshots: the dialog on `amount-and-type.xlsx` with the guess marks, and
the three tabs at narrow width.

---

## Batch 3 — sheets

### E3. Sheet selector and «Todas las hojas»

- [ ] Done

**Today:** `openStatementFile` (`src/lib/files.ts:118`) calls `readSheet`,
which reads the first sheet only. Nothing tells the user the rest exist.

**Should:** with more than one non-empty sheet, a «Hoja» select above the
preview lists them by name. When every non-empty sheet has the same header
row, it also offers «Todas las hojas», selected by default; otherwise the
first sheet is. Changing the sheet recomputes the starting mapping for it.

**How:**

1. **Reading**: use the default export of `read-excel-file/browser`, which
   returns every sheet as `{ sheet, data }`. `PickedStatement` becomes
   `{ fileName, sheets: StatementSheet[] }` with
   `StatementSheet = { name: string; rows: string[][] }`; a CSV is one sheet
   named after the file. Empty sheets are dropped here. Update the
   `read-excel-file/browser` mock in `src/lib/files.test.ts`.
2. **Combining** — a new pure module `src/lib/statementSheets.ts`, with tests:
   - `sharedHeader(sheets)`: the header row all sheets share, found per sheet
     among its first `MAX_HEADER_SEARCH` rows by `statementSignature`
     (`src/lib/importProfiles.ts`), using the first sheet's header as found by
     `startingMapping`; `null` when any sheet lacks it.
   - `combineSheets(sheets, header)`: the first sheet whole (so its
     `headerRow` stays valid), then each other sheet's rows after its own
     header, plus an `origin` per row (`{ sheet, row }`).
   - `rowLabel(origin)`: «Octubre, fila 5» for a combined file, «Fila 5» for a
     single sheet. The dialog's skipped list (`ImportMappingDialog.tsx:492`,
     «Línea N») and any other place that shows a line number (check the
     instalment and duplicate lists) go through it, so a skipped row can be
     found in the right sheet.
3. **State** (`src/components/views/SettingsView.tsx:234`): keep the picked
   file and the chosen sheet (`number | "all"`); the `PickedStatement` the
   dialog gets (`fileName` and `rows`) is derived from them with `useMemo`.
   A new choice reruns `startingMapping` and resets the guess. The remembered
   profile keeps working: its signature is the header row, the same in every
   sheet.
4. **Dialog**: a «Hoja» `Select` above the preview, shown only with two or
   more sheets; items are the sheet names, plus «Todas las hojas» first when
   `sharedHeader` is not `null`.
5. Add `sheet-per-month.xlsx` to the end-to-end test: nine rows, three per
   month, with «Todas las hojas»; and three with «Septiembre».

Screenshots: the selector open on `sheet-per-month.xlsx`, and the preview
with «Todas las hojas».

---

## E4. Release 1.6.0

- [ ] Done

After batch 3 is merged: bump to 1.6.0 and rewrite `RELEASE_NOTES.md`
(«Importá tu planilla de Excel»: the type column, the two-column layout, the
sheets), then the README's "Releasing" steps, as for 1.5.1 (PR #77).
