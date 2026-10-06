# Local AI

Assistance that feels intelligent and is built entirely from rules, templates
and statistics over the user's own history. No model is downloaded, no API is
called and nothing leaves the machine. It replaces the API-key AI, dropped in
`ideas.md`.

## How to read this file

- **Batch** — the order of attack, 1 first. Each batch is one branch
  (`ai/batch-N-<theme>`) and one PR, under the same rules as the audit and
  polish batches: failing test first for logic, every check green, screenshots
  of anything visible, ask before pushing.
- Every item says what the app does **today** (checked against the code at
  `4d9125a`), what it should do, and how it is built.
- When an item is done, tick its box in the tracking table in the same PR, and
  record under the item what was checked in the running app and what was not.
- The number in brackets after each title is the item's number in the
  proposal agreed in conversation on 2026-10-03.

## Decisions already taken

- **Scope:** all 21 proposed items.
- **Where it shows up:** where the user already is (forms, the import dialog,
  the rules card, the transactions list) plus one-line notices in Atención. No
  new screen and no sidebar section.
- **Identity:** it reads as AI, with no proper name: "IA" on the marks and
  "IA local" as the title of its card in Ajustes. A name has to be learned, and
  a character's name promises a conversation this is not; "local" carries the
  promise that sets it apart. One mark, `AiMark` — lucide `Sparkles` and the
  label "IA" — wherever something was suggested, detected or written by it.
  `Sparkles` and not `WandSparkles`, which already means "category rule" in
  `CategoryRulesCard`.
- **Clean merchant names:** the description stays exactly as the bank wrote
  it; the clean name ("Rappi" for `MERPAGO*RAPPI 4471 CABA`) is used for
  display and for classification. It is **derived, not stored**: computing it
  is cheap, needs no migration, and an improvement to the dictionary fixes old
  movements too.
- **Imported categories:** a category the AI chose on import is written, and
  the movement carries a "suggested by AI" flag until the user confirms or
  changes it.
- **Natural-language search:** in. It filters; it never answers.
- **Not a chat over the user's finances.**

## Principles

Every batch is held to these. Most of them are already how `quickEntry.ts`
behaves.

1. **Nothing is applied unseen.** A suggestion looks like a suggestion, carries
   `AiMark`, and can be accepted or dismissed. The one thing written without a
   click — the imported category — stays flagged until confirmed.
2. **Every suggestion says why**, from the data that produced it: "14 de tus
   15 movimientos con «rappi» están en Comida". No reason, no suggestion.
3. **Silence below a threshold.** Every detector has a minimum sample and a
   minimum confidence, as named constants next to it with a test at the
   boundary. Wrong is worse than quiet when the subject is money.
4. **The user's rules win.** A category rule always beats a learned guess.
5. **Per currency, always.** No statistic ever mixes pesos and dollars.
6. **Short windows.** Argentine prices drift every month, so typical amounts
   come from the last 3 to 6 months, and comparisons are ratios against that
   recent typical value, never against all-time averages.
7. **Suggestions never teach the model.** Only movements the user categorised
   or confirmed are training data; otherwise a wrong guess would reinforce
   itself on every import.
8. **Derived, deterministic, pure.** Everything is computed from the
   transaction list in `src/lib/ai/`, memoised once in `AppDataContext`, with
   its own tests. The same data always yields the same output, so a monthly
   close rebuilt on demand always reads the same.
9. **Stored state is minimal:** one JSON setting, `ai_state` (enabled flag and
   dismissed suggestions), and one column, `category_suggested`. Everything else
   is recomputed.
10. **One switch turns it all off**, from the "IA local" card in Ajustes. Off means
    no marks, no notices, no suggestions and plain descriptions — the app as it
    is today.
11. **Atención stays calm.** At most three AI notices at a time, highest
    priority first; the rest wait.

## Layout

```
src/lib/ai/
  data/
    merchants.json      known merchants, their patterns and a category hint
    stopwords.json      words that say nothing about a movement
    categoryHints.json  hint → words that match the user's own category names
    csvHeaders.json     how banks name each column
    closePhrases.json   phrase templates for the monthly close
  tokens.ts             how every module reads the words of a text
  merchants.ts          clean merchant name
  state.ts              ai_state setting: parse, serialize, dismiss
  categoryModel.ts      the most telling word, learned from the history
  categorySuggestion.ts the one entry point for "which category"
  ruleProposals.ts      rules to create, rules to fix
  stats.ts              median, MAD, percentiles
  series.ts             repeating movements
  ...                   one module per later item
```

The JSON files ship with the app, are versioned in the repo and are checked by
tests (shape, no duplicate patterns, every hint resolvable). They hold
knowledge, never user data.

## Batches

| Batch | Theme                         | Why in this order                                                  |
| ----- | ----------------------------- | ------------------------------------------------------------------ |
| 1     | Foundation and merchant names | Words, dictionary, `AiMark` and the switch; everything uses them   |
| 2     | Learned categorisation        | The core feature, and the training-data rule everything else obeys |
| 3     | Rules                         | Builds on the model's statistics; first use of dismissals          |
| 4     | Typing less                   | Autocomplete and search reuse names and model; daily value         |
| 5     | Repeating movements           | `stats.ts` and `series.ts`, which batches 8 and 9 read             |
| 6     | Bank statement import         | Column detection and instalments, both inside the import dialog    |
| 7     | Ledger hygiene                | Split transfers and near-duplicates, on import and in history      |
| 8     | Statistics                    | Unusual spending, pace, budgets, end of month; needs series        |
| 9     | Narrative                     | Writes from everything above, so it comes after it                 |
| 10    | Receipt OCR                   | Native code on two platforms; isolated, riskiest so far            |
| 11    | Card statement PDF            | Builds on OCR and import; the most uncertain item                  |

This differs from the order recorded in `ideas.md` in two places, both for
dependency reasons: the narrative moves after statistics because it narrates
them, and repeating movements come before it because subscriptions that went up
are one of its best sentences.

## Tracking table

| Item  | Batch | Title                                          | Proposal | Done |
| ----- | ----- | ---------------------------------------------- | -------- | ---- |
| AI-01 | 1     | Words                                          | —        | [x]  |
| AI-02 | 1     | Clean merchant names                           | 5        | [x]  |
| AI-03 | 1     | `AiMark`, the "IA local" card and the switch   | —        | [x]  |
| AI-04 | 2     | Learned category model                         | 1        | [x]  |
| AI-05 | 2     | One entry point for category suggestions       | 1        | [x]  |
| AI-06 | 2     | Suggested categories on import                 | 1        | [x]  |
| AI-07 | 3     | Dismissals                                     | —        | [ ]  |
| AI-08 | 3     | Rule proposals                                 | 2        | [ ]  |
| AI-09 | 3     | Rule hygiene                                   | 3        | [ ]  |
| AI-10 | 3     | Bulk categorisation of uncategorised movements | 4        | [ ]  |
| AI-11 | 4     | Autocomplete from history                      | 19       | [ ]  |
| AI-12 | 4     | Account by merchant in quick entry             | 19       | [ ]  |
| AI-13 | 4     | Natural-language search                        | 21       | [ ]  |
| AI-14 | 5     | Series detection                               | 6        | [ ]  |
| AI-15 | 5     | Unregistered recurring movements               | 6        | [ ]  |
| AI-16 | 5     | Subscriptions that went up                     | 7        | [ ]  |
| AI-17 | 5     | Expected income that has not arrived           | 11       | [ ]  |
| AI-18 | 6     | Column detection                               | 18       | [ ]  |
| AI-19 | 6     | Instalments on statements                      | 8        | [ ]  |
| AI-20 | 7     | Split transfers                                | 9        | [ ]  |
| AI-21 | 7     | Near-duplicates                                | 10       | [ ]  |
| AI-22 | 8     | Unusual spending                               | 12       | [ ]  |
| AI-23 | 8     | Pace of the month                              | 13       | [ ]  |
| AI-24 | 8     | Suggested budgets                              | 14       | [ ]  |
| AI-25 | 8     | End-of-month projection                        | 15       | [ ]  |
| AI-26 | 9     | Narrated monthly close                         | 16       | [ ]  |
| AI-27 | 9     | One line in Resumen                            | 17       | [ ]  |
| AI-28 | 10    | Native text recognition                        | 20       | [ ]  |
| AI-29 | 10    | A movement from a receipt                      | 20       | [ ]  |
| AI-30 | 11    | Card statement PDF import                      | 20       | [ ]  |

---

## Batch 1 — Foundation and merchant names

### AI-01 · Words

**Today:** text is compared with `normalizeForSearch` and substring search
(`categoryRules.ts`). Nothing splits a description into words.

**Should:** one reading every later module uses, so "the words of a movement"
means the same thing everywhere.

**How:** `tokens.ts` exports `words(text)`: `normalizeForSearch`, then split on
anything that is not a letter or digit. The merchant dictionary matches on it.
Dropping codes and `stopwords.json` lands with the model (AI-04), the first
thing that needs them; adding them now would be code nothing calls.

- [x] Done

### AI-02 · Clean merchant names [5]

**Today:** the transactions list shows whatever the bank wrote:
`MERPAGO*RAPPI 4471 CABA AR`.

**Should:** show "Rappi", keep the original everywhere it matters (inspector,
search, CSV export, editing).

**How:**

- `merchants.json`: entries `{ name, patterns[] }` for common Argentine
  merchants and services (supermarkets, delivery apps, fuel, streaming,
  telecoms, utilities, ARCA/AFIP, transport…), plus the processor prefixes
  that wrap them (`MERPAGO*`, `MP*`, `DLO*`, `PAYU*`, `PAYPAL *`…), legal forms
  and trailing places. The category `hint` is added in AI-04, which reads it.
- `merchants.ts` exports `merchantName(description)`. **Only text that reads
  like a bank's is touched** — no lower case, or a word followed by an
  asterisk — because someone who typed "nafta ypf" said more than "YPF". For
  those: the processor prefix comes off, a dictionary match wins (longest
  pattern, whole words), and otherwise codes, legal form and trailing place are
  dropped and the rest is written like a name ("Casa de las Empanadas", "TKT
  Bar").
- Display: the transactions table, recent transactions and the inspector's
  title show the clean name. Under the description field (dialog and
  inspector), "Se muestra como «Rappi»" with `AiMark`, so a row never changes
  name unexplained. Search matches both; export and editing use the original.
- Each distinct description is worked out once and cached, since the same
  merchant comes back every month and the lists ask on every render.

- [x] Done

Checked in tests: 20 cases for `words` and `merchantName` on bank strings,
user-typed text and edge cases; the dictionary's integrity (patterns written
the way descriptions are read, no pattern claimed twice, no name twice); the
search; and the hint in the dialog, on and off. Search keeps matching the clean
name with the AI off: harmless, and it keeps search from changing under the
user's feet.

Checked in the running app (a debug build on a separate `.smoke` database with
seven statement-style and typed descriptions, deleted afterwards): Resumen and
Transacciones show Rappi, Spotify, Coto, La Birra Bar, YPF and Mercado Libre,
and "café con Juan" untouched; the inspector's title is the clean name, its
field the original, and the mark's tooltip gives the reason; searching
"mercado libre" finds `MERCADOLIBRE*COMPRA 8812`. Not checked: dark theme.

### AI-03 · `AiMark`, the "IA" card and the switch

**Today:** nothing.

**Should:** one visual mark for the AI, and one place to turn it off.

**How:**

- `AiMark`: lucide `Sparkles` and the label "IA", with the reason on hover and
  focus through `Hint`. Its motion rule is in `src/styles/motion.css`: the star
  stays and the small sparkles flare, on the existing duration tokens.
- `state.ts`: the `ai_state` setting as JSON `{ enabled }`, parsed defensively
  like `donation_prompt` (anything unreadable means the defaults, which are
  on). Dismissals are added in AI-07, when something first needs them.
- An "IA local" card in Ajustes, after Notificaciones: what it does in two
  lines ("Todo se calcula en este equipo: nada sale de él") and an
  Activada/Desactivada switch like the one for notifications. The reset for
  dismissed suggestions joins it in AI-07.
- `aiEnabled` is exposed from `AppDataContext`; `setAiEnabled` reads the stored
  state from a ref, so the actions object never changes identity and writing
  the switch will not drop what AI-07 adds to the same setting.
- The forms take `aiEnabled` as a prop, like everything else they show:
  `TransactionDialog` is deliberately free of the app context.

- [x] Done

Checked in the running app: the card sits after Notificaciones; switching it
off writes `{"enabled":false}` to `ai_state` and the lists go back to the
bank's text.

---

## Batch 2 — Learned categorisation

### AI-04 · Learned category model [1]

**Today:** a category is suggested only when a rule's pattern is a substring
of the description. With no rule, nothing.

**Should:** learn from the user's own history which category a movement
belongs to.

**How:**

- `categoryModel.ts` learns, per kind of movement (income or expense, so an
  expense is never placed in an income category), how many of the user's
  movements with each word — and each pair of adjacent words, so "mercado
  libre" and "mercado pago" stay apart — went to each category.
- **Not naive Bayes, as first planned.** With category priors, a category
  holding hundreds of movements drowns a word that has only ever meant a small
  one ("uber", three times in Transporte, landed in Comida); without them, the
  smoothing penalises big categories the other way. What decides instead is the
  single most telling word of the description: the one whose movements most
  consistently landed in one category. That is also exactly the reason shown,
  "14 de tus 15 movimientos con «rappi» están en Comida", which someone can
  check. The account and amount features are left out: they describe the
  account's mix, not the movement.
- A word that has only ever meant one category is trusted from its first
  movement ("Tu único movimiento con «gluck» está en Salida."). A word that has
  been in more than one needs `MIN_CONFIDENCE` (0.65): its share counting one
  extra "could be something else" against it, so 2 of 3 is not enough and 4 of
  5 is. Silent when two telling words point at different categories ("rappi
  farmacia"). Boundary tests pin the rule.
- Tuned on the user's real export on 2026-10-06 (147 movements learned, 37
  newest tested): requiring two movements placed 46%, this rule 68%, both
  with no mistakes. That 68% was measured before a single-movement word could
  also contradict another; that check only makes it more cautious, and the
  export was deleted before it could be re-run. Trusting any single movement, mixed or not, placed 70% but
  would also accept 2 of 3, so it was not taken. A small sample: worth
  re-measuring as the history grows.
- Tokens come from `words` (AI-01) minus single characters, anything with a
  digit, `stopwords.json` (filler words, card networks, "compra", "pago"…) and
  the dictionary's processors, legal forms and places.
- Training data: income and expense movements with a category and
  `category_suggested = 0` (principle 7). A rule's category counts: the rule is
  the user's.
- Cold start: `merchants.json` gained a `hint` per merchant (supermercado,
  delivery, combustible…), resolved against the user's own category names
  through `categoryHints.json`, with the reason "Rappi es una app de
  delivery.". Expenses only. No matching category, no suggestion.
- Trained once per transaction list in `AppDataContext`, and only with the AI
  on (`categoryModel` is null otherwise).
- `categoryModel.eval.test.ts` is the dev-only evaluation: it reads an export
  from `VAULT_EVAL_CSV`, learns from the oldest 80% and prints coverage and
  accuracy on the newest 20%. Skipped in every normal run.

- [x] Done

### AI-05 · One entry point for category suggestions [1]

**Today:** five places call the rule matcher directly: `useTransactionFields`,
`TransactionInspector`, `quickEntry.ts`, `importMapping.ts`, `csv.ts`.

**Should:** all of them ask one function, so rules-then-model is decided once.

**How:** `categorySuggestion.ts` exports `suggestCategory(movement, context)`,
returning `{ source: "rule", categoryId, rule }` or `{ source: "ai",
categoryId, reason }`: a matching rule first, then the model, then the
cold-start hint, and never a category that no longer exists. With the AI off
(`model: null`) only the rules answer, as before. All five call sites use it,
and the two wrappers it replaced (`matchCategoryIdForType`, and
`matchCategoryId`, which nothing called already) are gone.

- The form fills the category in as before and, while it is the AI's, says
  "Sugerida por IA" under it with the reason (`AiNote`, which the "Se muestra
  como" line now shares).
- The quick entry reads "Comida ✨ IA" with the reason on hover. As with rules,
  an income suggestion can turn an unsigned line into income.
- The inspector's line under the category covers both: "Coincide con la regla
  «x»" or "La regla «x» la pondría en…", and "Coincide con lo que sugiere la
  IA" or "La IA la pondría en… Aplicarla".

- [x] Done

### AI-06 · Suggested categories on import [1]

**Today:** import applies rules silently; the preview does not show a category
at all. Without a rule the movement arrives uncategorised.

**Should:** arrive categorised by the AI where it is confident, visibly flagged
until confirmed.

**How:**

- Migration 29: `category_suggested INTEGER NOT NULL DEFAULT 0` on
  `transactions`, with `CHECK (category_suggested IN (0, 1))`. Applied to the
  user's database by `tauri dev` on 2026-10-06 and pinned in
  `SHIPPED_MIGRATIONS` the same day.
- `NewTransaction.categorySuggested` (optional, so nothing else that writes a
  movement changes) is set by both imports only when the suggestion's source
  is the AI.
- The inspector keeps the flag while the category is left alone
  (`stillSuggested`: fixing an amount says nothing about the category), drops
  it when the category changes, and offers "Sugerida por IA al importar.
  Confirmar". `confirmSuggestedCategories` clears it for a list of ids.
- The bank statement preview gains a Categoría column, with `AiMark` on the
  AI's choices. The app's own CSV import has no preview; its rows are flagged
  the same way.
- The transactions list shows `AiMark` next to a suggested category, and a
  "Revisar" group in the filters: "Sugeridas por IA (n)" narrows the list to
  them in the currency on screen, and "Confirmar todas" confirms what is shown.
- Atención: "Revisá n categorías sugeridas por IA", pointing at that filter,
  after pending movements and before the monthly close.
- With the AI off, none of it shows and the filter is ignored; the flags stay
  in the database for when it is back on.

- [x] Done

Checked: migration 29 applied by a debug build to a separate `.smoke` database
(deleted afterwards). The Mac's screen was locked, so the native window could
not be captured; the screens were checked instead on a throwaway Vite page
(removed) mounting the real components with stand-in data: the list's marks,
the "Sugeridas por IA (2)" filter narrowing to two rows with "Confirmar
todas", the inspector's "Sugerida por IA al importar. Confirmar" (which called
`confirmSuggestedCategories([2])`), the statement preview (Rappi → Comida from
history, Coto → Comida from the supermarket hint, the greengrocer with none),
the quick entry ("Ocio ✨ IA" for "turno padel 9990"), the form ("Transporte",
"Sugerida por IA" for "UBER \*TRIP") and the Atención line. Not checked in the
native app: an actual import writing flagged rows, and the toasts.

---

## Batch 3 — Rules

### AI-07 · Dismissals

**Today:** nothing to dismiss.

**Should:** a dismissed suggestion stays dismissed, across launches.

**How:** `ai_state.dismissed: Record<suggestionId, string | null>` (an ISO
date to snooze until, or null for never again). Suggestion ids are stable and
derived from what they are about (`rule:rappi:12`, `series:netflix:monthly`),
so the same suggestion is recognised after a restart. The reset lives in the
"IA" card.

- [ ] Done

### AI-08 · Rule proposals [2]

**Today:** rules are written by hand.

**Should:** propose the rule when a word keeps landing in the same category.

**How:** `ruleProposals.ts`: for each merchant name or token, count confirmed
movements per category; propose `pattern → category` when it has at least
`MIN_OCCURRENCES`, at least `MIN_PURITY` in one category, and no existing rule
already matches those movements. Shown in `CategoryRulesCard` under "Sugeridas
por IA", with how many movements it would cover, "Crear" and "Descartar".

- [ ] Done

### AI-09 · Rule hygiene [3]

**Today:** a rule that never matches, or that the user keeps overriding, stays
silently.

**Should:** point those out where rules are edited.

**How:** in the same module: rules that match no movement, rules always beaten
by a longer one, and rules contradicted by the user (most of their matches sit
in another category), with a proposal to change the rule's category. Shown
inline on the rule's row in `CategoryRulesCard`.

- [ ] Done

### AI-10 · Bulk categorisation of uncategorised movements [4]

**Today:** uncategorised movements are fixed one at a time.

**Should:** "23 movimientos sin categoría parecen Supermercado", reviewed and
applied together.

**How:** group uncategorised movements by confident prediction; an Atención
notice per group opens a dialog with the list, a checkbox per row (all ticked)
and "Aplicar". Applied categories are confirmed (`category_suggested = 0`):
the user reviewed them.

- [ ] Done

---

## Batch 4 — Typing less

### AI-11 · Autocomplete from history [19]

**Today:** the description field is a plain input.

**Should:** as the user types, offer past movements that match, and fill
category, account and typical amount in one keystroke.

**How:** a pure `descriptionSuggestions(prefix, history)` grouped by merchant
name, ranked by frequency and recency, each with its usual category, usual
account and median amount over the recent window. Rendered with the existing
`Popover`; keyboard first (arrows, Enter, Esc). Amount stays editable and
selected, since it is the field most likely to differ.

- [ ] Done

### AI-12 · Account by merchant in quick entry [19]

**Today:** with no account typed, quick entry assumes the last account used in
that currency (`lastUsedAccountByCurrency`).

**Should:** assume the account this merchant is usually paid with, when there
is a clear one, and fall back to today's rule otherwise.

**How:** the most frequent account for the merchant over the recent window,
when it holds at least `MIN_SHARE` of its movements. The screen already says
when an account was assumed; it adds the reason.

- [ ] Done

### AI-13 · Natural-language search [21]

**Today:** the search box in Transacciones matches text; category, dates and
amounts are separate controls.

**Should:** "comida en agosto más de 5000" sets the filters itself.

**How:**

- `searchQuery.ts`: `parseSearchQuery(text, context) → { filters, rest, chips }`,
  reading category names, account names, tags (`#viaje`), months and relative
  periods ("agosto", "el mes pasado", "este año"), comparators ("más de",
  "menos de", "entre"), types ("gastos", "ingresos", "transferencias") and
  currencies. Whatever is not understood stays as text search.
- The date, currency and account readers already in `quickEntry.ts` move to
  a shared module that both parsers use, with quickEntry's tests unchanged as
  the regression.
- `TransactionFilters` gains `type` and `paymentMethodId`, which the screen
  lacks today and the queries need.
- Understood parts appear as removable chips under the box, with `AiMark`.

- [ ] Done

---

## Batch 5 — Repeating movements

### AI-14 · Series detection [6]

**Today:** repetition exists only where the user declared it (recurring
movements, instalment plans, loans).

**Should:** find what repeats on its own.

**How:** `stats.ts` (median, MAD, percentiles) and `series.ts`: group movements
by merchant name, type, currency and account; a group is a series when it has
at least three occurrences whose intervals sit around 7, 30 or 365 days within
a tolerance, and whose amounts are stable relative to their median. A series
is active when its last occurrence is within one and a half periods. Series
already covered by a recurring movement, plan or loan are excluded.

- [ ] Done

### AI-15 · Unregistered recurring movements [6]

**Should:** "Parece que pagás Spotify todos los meses. ¿Lo agrego como
recurrente?"

**How:** an Atención notice per active, undeclared series; the action opens
`RecurringDialog`, which gains a `draft` prop like `TransactionDialog` has,
pre-filled from the series.

- [ ] Done

### AI-16 · Subscriptions that went up [7]

**Should:** "Netflix pasó de $X a $Y (+18%)".

**How:** for monthly expense series and declared recurring expenses, the
latest amount against the median of the previous three. Only jumps above
`MIN_RISE`, so ordinary monthly drift is not a notice every month. For a
declared recurring movement, the action offers to update its amount.

- [ ] Done

### AI-17 · Expected income that has not arrived [11]

**Should:** "El sueldo suele entrar antes del 5 y todavía no llegó."

**How:** for monthly income series, the usual day of the month (median) plus a
tolerance; past it with no occurrence this month, a neutral notice. Never for
series with fewer than four occurrences.

- [ ] Done

---

## Batch 6 — Bank statement import

### AI-18 · Column detection [18]

**Today:** a statement whose header was never seen starts from `EMPTY_MAPPING`;
a remembered profile is reused by header signature.

**Should:** the first import of a new bank arrives already mapped.

**How:** `columnGuess.ts` with `csvHeaders.json`: score each column by its
header against the synonyms, and by its contents — the share that
`parseFlexibleDate` and `parseFlexibleAmount` read, text length, signs. Detect
the header row, the single versus debit/credit layout and, when the evidence
is clear, the sign convention. `startingMapping` becomes: remembered profile,
then guess, then empty. Guessed selects carry `AiMark` until the user touches
them.

- [ ] Done

### AI-19 · Instalments on statements [8]

**Today:** "C.03/12" in an imported description is just text, and an existing
instalment plan would also propose that same instalment, so the user ends up
with two.

**Should:** recognise instalments and keep plans and imports from duplicating
each other.

**How:**

- Patterns for how statements write it (`C.03/12`, `CUOTA 03/12`, `Cta 3 de
12`…), in `installmentText.ts`.
- On import, a row that matches an existing plan's next instalment (merchant,
  amount within a tolerance, next index) is registered as that plan's payment:
  the same statement batch `confirmInstallment` uses today (the transaction
  plus the compare-and-set advance), shown in the preview as "Cuota 4/12 de
  Heladera, se registra en su plan".
- A row with no plan offers "Crear plan de cuotas": `InstallmentPlanDialog`
  gains a `draft`, pre-filled with the instalment amount, count and first due
  date, and registered as already paid up to this instalment. Creating a plan
  with a starting count is a new db function.

- [ ] Done

---

## Batch 7 — Ledger hygiene

### AI-20 · Split transfers [9]

**Today:** importing two accounts' statements leaves a move between them as an
expense in one and an income in the other, which inflates both totals.

**Should:** propose joining them into one transfer.

**How:** pairs of an expense and an income in two different own accounts,
within a day, with the same amount (or, across currencies, a ratio within a
tolerance of that day's cached rate). Atención notice and import preview mark;
"Unir en una transferencia" replaces both with one transfer in a single batch,
with "Deshacer".

- [ ] Done

### AI-21 · Near-duplicates [10]

**Today:** import skips exact duplicates (`duplicateKey`); a movement typed by
hand and later imported with a slightly different date or text goes in twice.

**Should:** flag those.

**How:** same type, account and amount, dates up to two days apart, and the
same merchant name or overlapping tokens. In the import preview the row is
unticked with "Posible duplicado del 12/09"; in the history, an Atención
notice with "Eliminar uno" (with undo) or "No es un duplicado" (dismissed).

- [ ] Done

---

## Batch 8 — Statistics

### AI-22 · Unusual spending [12]

**Should:** "Gastaste $X en Farmacia; lo habitual es cerca de $Y."

**How:** per merchant (at least 5 movements) or else per category (at least
8), per currency, over the recent window: flag a movement above
median + k·MAD. A notice for recent ones, and a line in the inspector.

- [ ] Done

### AI-23 · Pace of the month [13]

**Today:** a budget warns once 80% of it has been spent
(`BUDGET_WARNING_RATIO`).

**Should:** warn from the pace: "A este ritmo vas a gastar $X en Comida, 35%
más de lo habitual" and "superarías el presupuesto de Salidas el 22".

**How:** spending so far against the median of previous months' spending up to
the same day; projected to month end. Shown as a line on the budget and in the
month overview; an Atención notice only when the projection crosses a budget.

- [ ] Done

### AI-24 · Suggested budgets [14]

**Should:** a starting amount when creating a budget, and a proposal for
categories with steady spending and no budget.

**How:** median monthly spend over the last 3 to 6 months. `BudgetDialog`
shows it as a suggestion with `AiMark` and its reason; `BudgetsSection` lists
the proposals.

- [ ] Done

### AI-25 · End-of-month projection [15]

**Should:** "Fin de mes estimado: $X", per currency.

**How:** current balance, plus what `projection.ts` already computes for the
rest of the month (commitments and expected movements), plus the typical
variable spending still to come, excluding series already counted so nothing
is subtracted twice. A figure in Resumen with its breakdown on hover.

- [ ] Done

---

## Batch 9 — Narrative

### AI-26 · Narrated monthly close [16]

**Today:** the close is tables and figures (`monthlyClose.ts`,
`PrintableClose`).

**Should:** three to five sentences on top of the close and its PDF that say
what happened.

**How:**

- `closeFacts.ts` turns a `MonthlyClose` (plus series and anomalies of that
  month) into typed facts: biggest change by category, new category,
  saving rate versus last month and last year, subscriptions that went up,
  unusual spending.
- `closePhrases.json` holds templates per fact kind, with priority and several
  wordings, in voseo, with placeholders.
- `closeNarrative.ts` picks the top facts, picks a wording by hashing the month
  and the fact (deterministic: the same close always reads the same), and
  fills placeholders through `src/lib/format.ts`. Numbers come from the facts,
  never from the template, so a sentence cannot get a figure wrong.
- One block per currency, like the rest of the close.

- [ ] Done

### AI-27 · One line in Resumen [17]

**Should:** the single most relevant thing right now, or nothing.

**How:** a pure ranking over everything batches 5 to 8 produce, with the same
dismissals; one line at the top of Resumen with `AiMark`. Not a repeat of
Atención: if the top item is already a notice there, this shows nothing.

- [ ] Done

---

## Batch 10 — Receipt OCR

### AI-28 · Native text recognition [20]

**Today:** attachments are stored (`attachments`, base64) and only displayed.

**Should:** read the text of an image or PDF on the machine itself.

**How:**

- A Tauri command `recognize_text(attachment)` with one implementation per
  shipped platform: Vision (`VNRecognizeTextRequest`, Spanish, accurate level)
  on macOS and `Windows.Media.Ocr` on Windows. Both are part of the operating
  system: no bundled engine and no download. PDFs: the text layer when there
  is one, otherwise the first page rendered and recognised.
- Windows OCR depends on the Spanish language being installed; when it is not,
  the error says so in Spanish.
- CI runs on Ubuntu, so neither path would be compiled before a release. This
  batch adds `cargo check` jobs on macOS and Windows.
- Start with a spike on both platforms before the full item: crates, output
  quality on real receipts.

- [ ] Done

### AI-29 · A movement from a receipt [20]

**Should:** drop a photo of a receipt and get the movement filled in.

**How:** `receipt.ts` reads the recognised lines: total (near "TOTAL",
"IMPORTE", "A PAGAR", the largest such amount), date, CUIT, merchant (the
dictionary first, then the top lines). Dropping an image on the app or in quick
entry opens `TransactionDialog` with a draft, each read field marked with
`AiMark`, and the image attached on save. On an existing movement, "Leer
comprobante" in the inspector offers to fill what is empty.

- [ ] Done

---

## Batch 11 — Card statement PDF

### AI-30 · Card statement PDF import [20]

**Should:** import a credit card's PDF statement the way a CSV is imported.

**How:** text from AI-28, lines grouped into rows (date, description, amount,
instalment), fed into the existing mapped-import pipeline so rules, the model,
instalments and duplicates all apply. Every bank lays these out differently,
so this starts with the user's own statements as fixtures. **It is the most
uncertain item:** if the rows cannot be read reliably, it is dropped rather than
shipped half-working.

- [ ] Done
