# Review of 2026-09-22 (`6eaa428..d9c0477`)

Scope: everything merged to `main` on 2026-09-22, PRs #36 (motion foundation), #41 (action feedback), #38 (loading skeletons), #39 (list motion) and #40 (keyboard and focus). 54 files, +3066 / −557.

Method: one finder agent per dimension (cross-PR inconsistencies, efficiency, dead code, flow and functionality, CLAUDE.md compliance), each followed by an adversarial verifier that tried to refute every finding against the code at `d9c0477`. 41 findings were raised; 32 survived verification and 9 were refuted. The 32 survivors collapse to 18 distinct issues, since several dimensions found the same thing; a 19th (M9) was reported afterwards. Refuted findings are listed at the end so they are not re-raised.

Severity: **high** = user-visible bug or broken flow; **medium** = real inconsistency, partial feature or rule violation users can see; **low** = cleanup, dead code or a barely visible deviation. Nothing reached high.

"Pre-existing" marks an issue whose code predates the range but which breaks a rule this range adopted in CLAUDE.md.

## Checks

| Check                  | Result                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`             | Pass: 65 files, 812 tests. Two `CHECK constraint failed` lines on stderr come from tests that assert the schema rejects bad values; the run is green. |
| `npm run lint`         | Pass                                                                                                                                                  |
| `npm run typecheck`    | Pass                                                                                                                                                  |
| `npm run format:check` | Pass                                                                                                                                                  |

## Summary

| #   | Severity | Issue                                                                      | Where                                                               | Origin               |
| --- | -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------- |
| M1  | medium   | `.row-actions` transition wipes out Button's own transitions               | `src/index.css:213`                                                 | #39                  |
| M2  | medium   | The just-written tint is usually not visible                               | `src/components/views/TransactionsView.tsx:388`                     | #39, worsened by #40 |
| M3  | medium   | Remembered scroll is applied to a view whose tab, page and filters reset   | `src/hooks/useRememberedScroll.ts:49`                               | #40                  |
| M4  | medium   | Figure skeletons on Estadísticas skip the slow-loading gate                | `src/components/FigureBar.tsx:90`                                   | #38                  |
| M5  | medium   | Loaded content replaces its skeleton with no fade                          | `src/components/Loading.tsx:65`                                     | #38                  |
| M6  | medium   | AnsweringButton hard-swaps icon and label, and resizes                     | `src/components/AnsweringButton.tsx:51`                             | #41                  |
| M7  | medium   | Icons in controls that are not a Button never move                         | `src/components/TagInput.tsx:66`, `src/components/ui/select.tsx:38` | #36                  |
| M8  | medium   | Recharts animations run 1500 ms / 400 ms                                   | `src/components/charts/CategoryBreakdownChart.tsx:57`               | pre-existing         |
| M9  | medium   | Icon parts are clipped at the edge of their drawing on hover               | `src/styles/motion.css:36`                                          | #36                  |
| L1  | low      | `@utility just-written` defined twice                                      | `src/index.css:181`, `:234`                                         | #39                  |
| L2  | low      | Paperclip on rows without attachments is quietened twice                   | `src/components/views/TransactionsView.tsx:471`                     | #39                  |
| L3  | low      | ListCard shows empty message and footer over the held skeleton             | `src/components/ListCard.tsx:62`                                    | #38                  |
| L4  | low      | IncomeVsExpenseChart skeleton is 20 px short                               | `src/components/charts/IncomeVsExpenseChart.tsx:61`                 | #38                  |
| L5  | low      | CategoryBreakdownChart still shows `—` while loading                       | `src/components/charts/CategoryBreakdownChart.tsx:43`               | #38                  |
| L6  | low      | file-text stagger uses literal delays and runs to 260 ms                   | `src/styles/motion.css:248`                                         | #36                  |
| L7  | low      | Tooltip not on the duration tokens; `animate-in` ignores `--ease-standard` | `src/components/ui/tooltip.tsx:48`                                  | pre-existing / #36   |
| L8  | low      | Sonner toasts animate at 400–500 ms                                        | `src/components/ui/sonner.tsx:12`                                   | pre-existing         |
| L9  | low      | Dialog close button's accessible name is English                           | `src/components/ui/dialog.tsx:65`                                   | pre-existing         |
| L10 | low      | A useRememberedScroll test duplicates another                              | `src/hooks/useRememberedScroll.test.ts:71`                          | #40                  |

---

## Medium

### M1. `.row-actions` transition wipes out Button's own transitions

**Where:** `src/index.css:211-214`; interacts with `src/components/ui/button.tsx:7`.

**What happens:** #39 added `.row-actions :is(button, [role="button"]):not(:disabled) { opacity: 0.55; transition: opacity var(--duration-fast) var(--ease-standard); }` as unlayered CSS (deliberately, per its comment). Unlayered CSS beats everything in Tailwind's `@layer utilities`, so the `transition` shorthand resets `transition-property` to `opacity` on every row button and overrides the Button cva's `transition-all`.

**Why it's a problem:** on all 15 row-action groups, `hover:bg-muted`, `active:translate-y-px` and the focus ring snap instantly, while every other Button fades them over the token #36 set up. Repro: in Transacciones, hover a row's pencil, then hover "Limpiar filtros"; only the second fades its background. Found independently by three dimensions.

**Fix:** delete the `transition:` line and keep `opacity: 0.55`. Button's `transition-all` already animates opacity with the same token and curve.

### M2. The just-written tint is usually not visible

**Where:** `src/components/views/TransactionsView.tsx:388`; `src/context/AppDataContext.tsx:374`, `:783`; `src/hooks/useRememberedScroll.ts:50`.

**What happens:** the only consumer of `justWrittenTransaction` adds the `just-written` class to a row if it happens to be in `visible`, the current 50-row page. Nothing moves to the page holding the row, scrolls it into view, or handles a row that the active filters exclude. Also, `noteWrittenTransaction` runs inside the mutation, before `await reload(touches)` in `runMutation`, so the 1200 ms `useBriefly` window starts before the new row exists in `transactions`. For an add, the first status change re-renders the table with no row able to match.

**Why it's a problem:** P-05 exists to answer "where did the thing I just typed go?", and it only answers when the row was already on screen. Repros:

- Add a transaction dated two months ago, so 50+ newer rows sort above it (`date DESC`). It lands on page 2 and is never tinted.
- Add a USD transaction while the currency filter is ARS. It's filtered out and nothing says so.
- #40 interaction: scroll to the bottom of Transacciones, go to Ajustes, use Archivo → "Nueva transacción". The view comes back scrolled to the bottom, the new today-dated row is tinted at the top, off-screen, and the tint is gone before anyone scrolls up.

**Fix:**

1. Return the new id from the add mutation and call `noteWrittenTransaction` after `await reload(touches)` (for example through an optional `afterReload` callback on `runMutation`).
2. In TransactionsView, when `justWrittenTransaction` changes and the id is in `filtered`, set `page` to `Math.floor(index / PAGE_SIZE)` using the same adjust-in-render pattern as `filterSignature`, then `scrollIntoView({ block: "nearest" })` on the row after commit (a `data-id` lookup or a ref map).
3. When the id is not in `filtered`, say so in the success toast (e.g. that it's hidden by the current filters) or offer to clear them.

### M3. Remembered scroll is applied to a view whose tab, page and filters reset

**Where:** `src/hooks/useRememberedScroll.ts:28`, `:49-50`; `src/App.tsx:73`; `src/components/views/TransactionsView.tsx:102-111`; `src/hooks/useRequestedTab.ts:24`.

**What happens:** positions are stored as a pixel offset per view name, but every view remounts when navigated to and its local state starts over. StatisticsView reopens on its default tab, CommitmentsView and CategoriesView on theirs, TransactionsView on page 0 with no search or filters. The old offset is then applied to different content. When the stored offset exceeds the new content's height, `scrollTo` clamps, the resulting scroll event fires with `current` already set to the arriving view, and the clamped value overwrites the stored one.

**Why it's a problem:**

- Repro 1: Estadísticas → Análisis → scroll ~700 px to the charts → Transacciones → Estadísticas. It opens on Resumen, scrolled 700 px down a different tab.
- Repro 2: Transacciones → search "super" or go to page 3 → scroll → Ajustes → back. The filters and page are gone and the table sits at the old offset in an unrelated list.

P-11 promises "keep each view where it was left". That only holds for a view with no tabs or filters, left on page 0.

**Fix:** either lift tab, page and filters out of the views (e.g. a per-view store kept in App next to `tab`) so a remount rebuilds the same content, or store `{ top, key }` with `key` derived from the view's sub-state and restore to 0 on a mismatch. Independently, in the layout effect, remember the target and ignore the next scroll event if `scrollTop < target`, so a clamp doesn't overwrite the stored position.

### M4. Figure skeletons on Estadísticas skip the slow-loading gate

**Where:** `src/components/FigureBar.tsx:90`; `src/components/MonthOverviewCards.tsx:43`, `:89`, `:132`. Compare `src/components/Loading.tsx:63` and `src/components/ListCard.tsx:66`.

**What happens:** FigureBar and MonthOverviewCards render `<Skeleton>` straight from the raw `isLoading` flag. `Loading` and `ListCard` go through `useSlowLoading`, which shows nothing for 120 ms and then holds the placeholder for at least 300 ms.

**Why it's a problem:** Estadísticas is the view the app opens on. On every cold start, however fast the local DB answers, the balance bar and the three month cards paint a pulsing skeleton for a frame or two, while RecentTransactions next to them shows nothing. That is the flash P-04 names under "the trap to avoid". On a slow load the two kinds come and go at different times on the same screen.

**Fix:** compute `const showPlaceholder = useSlowLoading(isLoading)` once in FigureBar, and once in MonthOverviewCards, which passes it to its three cards. While `isLoading && !showPlaceholder`, reserve the line's height without drawing it (e.g. `<Skeleton className="invisible my-1 h-5 w-32" />`), not an empty slot, which would collapse the line and make the card jump when the figure lands. Show the visible skeleton only while `showPlaceholder`.

### M5. Loaded content replaces its skeleton with no fade

**Where:** `src/components/Loading.tsx:65-68`; `src/components/ListCard.tsx:81-86`; `src/components/MonthOverviewCards.tsx:43`, `:90`, `:133`. Compare `src/components/FigureBar.tsx:101-103`.

**What happens:** `Loading` returns `<>{children}</>` and ListCard `<CardContent>{children}</CardContent>` with no enter animation. The month card figures swap inline. Only FigureBar (#39) fades its value in, and it uses `--duration-fast`, not the `--duration-base` P-04 specified.

**Why it's a problem:** P-04 says "the data fades into place over `--duration-base`" and is marked done as proposed, but no fade was built. CLAUDE.md requires that what appears is "animated rather than swapped". On a slow load, the balance figures fade in while the month cards, the lists, the table and both charts hard-cut in, in the same viewport.

**Fix:** put the fade in `Loading` and route ListCard and MonthOverviewCards through it, so every loaded region fades the same way. Two constraints the verifier found:

- A plain wrapping `div` breaks callers that rely on the parent's flex gap (CategoryBreakdownChart passes a fragment into a `flex flex-col gap-4` CardContent). Give `Loading` an optional `className` for the wrapper.
- Decide whether to fade from state, not from a ref written during render, which the repo's React-compiler rules forbid (see the comment at `useRememberedScroll.ts:46-49`). Fading on every mount is also acceptable, since a first-paint fade is harmless.

### M6. AnsweringButton hard-swaps icon and label, and resizes

**Where:** `src/components/AnsweringButton.tsx:51-53`; `src/components/views/SettingsView.tsx:399-437`.

**What happens:** `{done ? <Check /> : <Icon />}{done ? answer : children}` replaces icon and text in one frame, both ways. The button's width is intrinsic, so it resizes when the label changes.

**Why it's a problem:**

- It breaks "animated rather than swapped". P-02 defined `swap` as a crossfade and reserved it for this P-03 consumer, and #39 solved the same in-place replacement in FigureBar with a keyed fade. So the same kind of change fades on Estadísticas and hard-cuts on Ajustes.
- In Ajustes, "Guardar copia de seguridad" → "¡Guardada!" and "Exportar a CSV" → "¡Exportadas!" sit in a `flex flex-wrap gap-2` row. The buttons to the right slide left under the pointer that just clicked, then slide back 1.5 s later. In DonationCard the button is last, so nothing shifts there.

**Fix:** stack the idle and answered content in one grid cell (`inline-grid`, both children `col-start-1 row-start-1`, the inactive one `invisible` and `aria-hidden`), so the width is always the wider of the two, and fade the active one in with `animate-in fade-in duration-(--duration-fast)`, keyed on `done`. A wrapper stops Button's `gap-*` from spacing icon and label, so it needs its own gap matching the button size (`gap-1.5` default, `gap-1` sm).

### M7. Icons in controls that are not a Button never move

**Where:** `src/components/TagInput.tsx:66-74`; `src/components/ui/select.tsx:38-50`.

**What happens:** `icon-motion` is only applied in the `buttonVariants` base (`button.tsx:7`) and on `NavButton` (`Sidebar.tsx:130`). The TagInput remove control is a raw `<button>` around `<X />`, and `SelectTrigger` renders `ChevronDownIcon` in a Base UI trigger. No rule in `motion.css` reaches either.

**Why it's a problem:** CLAUDE.md says an icon moves inside any control and "the same icon cannot answer differently in two views". The X turns 90° in every Button but not on a tag's remove button in the transaction dialog. The chevron-down nudges on the loan expander but stays still in all ~76 Select triggers.

**Fix:** add `icon-motion` to the TagInput remove button (or render it through `<Button variant="ghost" size="icon-xs">`) and to the SelectTrigger class list. The other raw buttons (CategoryDialog pickers, TagInput suggestion chips) contain no lucide icons.

### M8. Recharts animations run 1500 ms / 400 ms

**Where:** `src/components/charts/CategoryBreakdownChart.tsx:57`; `src/components/charts/IncomeVsExpenseChart.tsx:83`, `:108`, `:113`. Pre-existing.

**What happens:** `<Pie>`, both `<Bar>`s and the recharts `<Tooltip>`s use recharts 3.10 defaults: Pie 1500 ms, Bar and Tooltip 400 ms, easing `ease`. They are driven in JS, so the CSS tokens can't reach them. Reduced motion is respected through `isAnimationActive: 'auto'`.

**Why it's a problem:** CLAUDE.md: nothing is slower than `--duration-base` (180 ms). Since #38 the charts mount inside `<Loading>`, so the donut sweep replays in full after every load and every period change.

**Fix:** one shared constant next to the chart tooltip style, e.g. `export const CHART_ANIMATION = { animationDuration: 180, animationEasing: "ease-out" } as const`, spread onto the Pie, the Bars and the Tooltips. Keep `isAnimationActive` at its `'auto'` default so reduced motion still applies.

### M9. Icon parts are clipped at the edge of their drawing on hover

**Where:** `src/styles/motion.css:36-44`. Reported by Fermín after the review; not raised by any agent.

**What happens:** a browser clips an inline `svg` to its view box, and lucide leaves one unit of margin inside it, which is exactly half a stroke. Any part that moves further than that loses its outer edge. Measured in Chromium by sampling every hovered path against the 24-unit grid, 10 icons go past it, by 0.37 to 1.24 units: `trash2` (the handle, the worst), `wand-sparkles`, `landmark`, `calendar`, `calendar-days`, `chart-pie`, `copy`, `hand-coins`, `printer` and `tags`.

**Why it's a problem:** on hover the bin's handle is cut flat, the bank's roof loses its peak and the calendar's hooks lose their tops. It reads as a broken icon, not a movement.

**Fix:** `overflow: visible` on the `svg` inside `icon-motion`, so the movement stays as designed and the part draws in full. It spills under 1 screen px into the button's padding.

---

## Low

### L1. `@utility just-written` defined twice

**Where:** `src/index.css:168-183` and `:221-236`.

Byte-identical copies of the comment plus `@utility just-written { background-color: var(--muted); }`, both added in 74b9e2a. Tailwind merges them, so nothing breaks today, but it duplicates a rule and a later edit to one copy would fight the other. Found by four dimensions. **Fix:** delete the second block (lines 221-236).

### L2. Paperclip on rows without attachments is quietened twice

**Where:** `src/components/views/TransactionsView.tsx:471`; `src/index.css:209-212`.

The attach button already has `text-muted-foreground/50` when `attachment_count === 0` (pre-existing). #39 wrapped it in `.row-actions`, which adds `opacity: 0.55`, so at rest it renders at about 27% of muted-foreground and is nearly invisible. #39's own comment excludes disabled buttons for exactly this "quietened twice" reason. **Fix:** drop the `/50` now that `.row-actions` does the quietening, or mark the empty state by colour or icon rather than alpha.

### L3. ListCard shows empty message and footer over the held skeleton

**Where:** `src/components/ListCard.tsx:62`, `:89`; `src/components/charts/IncomeVsExpenseChart.tsx:123`.

`showEmpty` and the footer read the raw `isLoading`, but the body reads `useSlowLoading(isLoading)`, which stays true up to 300 ms after the load ends. On a load over 120 ms, an empty section shows "Todavía no hay …", three pulsing rows and the "Agregar …" button at once, against the comment at lines 63-65. The IncomeVsExpenseChart projection caption has the same mismatch. **Fix:** in ListCard, `const waiting = isLoading || showPlaceholder` and gate `showEmpty`, the body and the footer on `!waiting`. In IncomeVsExpenseChart, move the caption inside the `<Loading>` children.

### L4. IncomeVsExpenseChart skeleton is 20 px short

**Where:** `src/components/charts/IncomeVsExpenseChart.tsx:61`, `:67`.

Placeholder `h-[260px]`, chart `ResponsiveContainer height={280}`, against skeleton.tsx's own contract. Only visible on a cold start over 120 ms on the Análisis tab. **Fix:** share one `CHART_HEIGHT = 280` between the placeholder and the container.

### L5. CategoryBreakdownChart still shows `—` while loading

**Where:** `src/components/charts/CategoryBreakdownChart.tsx:43`.

`isLoading || !hasData ? "—" : formatCurrency(...)`. That is the "late figure shown as a dash" pattern #38 removed elsewhere and documented against (`FigureBar.tsx:26-28`, `MonthOverviewCards.tsx:22-23`). On the same tab, SummaryBar shows skeletons while this header says the total can't be computed. **Fix:** render a `Skeleton` in the CardAction while loading, through the same gate as the chart body. Keep `—` for `!hasData` once loaded.

### L6. file-text stagger uses literal delays and runs to 260 ms

**Where:** `src/styles/motion.css:247-253`.

The parts run for `--duration-base` (180 ms) plus literal `transition-delay: 40ms` and `80ms`, so the last line ends 260 ms after hover. That contradicts the file's own header (line 15) and CLAUDE.md. P-12 asked for the stagger, so it's intended, but it breaks the rule the same range wrote. **Fix:** derive it from the tokens. Run those parts on `--duration-fast` with delays of `calc((var(--duration-base) - var(--duration-fast)) / 2)` and `calc(var(--duration-base) - var(--duration-fast))`, ending at 180 ms, and update the tests that pin 40/80 ms.

### L7. Tooltip not on the duration tokens; `animate-in` ignores `--ease-standard`

**Where:** `src/components/ui/tooltip.tsx:48` (pre-existing); every `animate-in` in overlays, `FigureBar.tsx:103`, `LoansSection.tsx:60`.

TooltipContent has no `duration-*`, so tw-animate-css falls back to 150 ms on `ease`. P-01 lists the tooltip among the primitives to move onto the tokens, but its "Done as" left it out. Separately, `--default-transition-timing-function` only feeds `transition-*` utilities, so every `animate-in` in the app uses `ease` rather than `--ease-standard`, despite the index.css comment at lines 48-51. **Fix:** add `duration-(--duration-fast)` to TooltipContent. For the curve, set `--tw-ease: var(--ease-standard)` on `*, ::before, ::after` in `@layer base`, not on `:root`: Tailwind v4 registers `--tw-ease` as non-inheriting.

### L8. Sonner toasts animate at 400–500 ms

**Where:** `src/components/ui/sonner.tsx:12`. Pre-existing.

sonner 2.0.7's stylesheet transitions the toast over 400 ms (500 ms on swipe-out), with no override. Toasts are the failure path of every AnsweringButton and the success path of every mutation. Sonner unmounts on a 200 ms timer, not on `transitionend`, so shortening is safe. **Fix:** in index.css, inside `@media (prefers-reduced-motion: no-preference)`, set `[data-sonner-toaster] [data-sonner-toast] { transition-duration: var(--duration-base); transition-timing-function: var(--ease-standard); }`. The media query matters: an unlayered selector this specific would outrank the global reduced-motion `*` rule and turn toast motion back on for those users.

### L9. Dialog close button's accessible name is English

**Where:** `src/components/ui/dialog.tsx:65`, `:103`. Pre-existing; the file was edited in #36.

Every dialog's X has `<span className="sr-only">Close</span>`, so VoiceOver reads "Close", while DonationPrompt's equivalent says "Cerrar". CLAUDE.md puts `aria-label`s under the Spanish rule. Line 103's visible "Close" in DialogFooter is unreachable today, since no caller enables it. **Fix:** change line 65 to "Cerrar", and line 103 as well, or remove that unused option.

### L10. A useRememberedScroll test duplicates another

**Where:** `src/hooks/useRememberedScroll.test.ts:71-83` vs `:35-45`.

"does not file the position it restores against the view being left" performs the same steps as "puts a view back where it was left", minus one intermediate assertion. The regression it claims to guard (setting `current.current` after `scrollTo`) already fails tests 1 and 2, so it adds no coverage. **Fix:** delete it and move its comment onto test 1, or make it distinct (scroll the second view to a non-zero position before switching back and assert the first view's position survived).

---

## Refuted (do not re-raise)

| Raised as                                                                 | Why it was refuted                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Guardar una copia" in AttachmentsDialog still only answers with a toast  | P-03 deliberately scopes AnsweringButton to three labelled buttons.                                                                                                                 |
| Dialog-open selector duplicated between `useShortcuts` and DonationPrompt | One is a JS query, the other must stay a literal Tailwind selector; merging them is speculative.                                                                                    |
| Skeleton pulse runs at 2 s, above the ceiling                             | The duration limit governs how controls answer a touch; a continuous loading indicator is not that.                                                                                 |
| ProgressBar animates `width`                                              | `progress-bar.tsx` is unchanged in the range; P-01 only moved it onto the tokens indirectly.                                                                                        |
| 18 icon rules in motion.css can never fire                                | True today, but deliberate: CLAUDE.md requires a rule for every imported icon, so it moves the moment it lands in a control. Removing them would be a policy change, not a cleanup. |
| useJustDone tests re-test useBriefly                                      | They are black-box tests of useJustDone's public contract.                                                                                                                          |
| The `/` search shortcut is not discoverable                               | P-10 specifies exactly that behaviour.                                                                                                                                              |
| motion.test misses namespace, `.ts` and dynamic lucide imports            | The limitation is real, but no current import takes those forms.                                                                                                                    |
| Whole-icon nudges move 1.5 screen px vs 1 px for parts                    | Technically accurate, not a defect.                                                                                                                                                 |

## Suggested batches

1. **Quick wins** (one small PR): M1, M9, L1, L2, L9, L10. **Done** on `fix/review-batch-1-quick-wins`. L2 took the second option: the empty paperclip is `text-muted-foreground` with no alpha, so rows with receipts still stand out.
2. **Loading coherence**: M4, M5, L3, L4, L5. They all touch the `useSlowLoading` / `Loading` path and should share one fade and gate.
3. **Motion budget**: M6, M7, M8, L6, L7, L8.
4. **Navigation state**: M2 and M3. Both need a decision on where per-view state (page, filters, tab) lives, and M2's page jump depends on it.
