# Polish — UX details

The small things that make the app feel finished: motion, feedback, loading
states and the handful of non-visual details that are noticed only when they
are missing. Nothing here is a bug; `AUDIT.md` is where bugs live.

## How to read this file

- **Batch** — the order of attack, 1 first. Each batch is one branch and one
  PR, like the audit batches.
- Every item says what the app does **today** (checked against the code, not
  assumed), what it should do, and how it is built.
- When an item is done, tick its box in the tracking table in the same PR, and
  record under the item what was checked in the running app and what was not.

## Direction

The app was built ultra-minimal and almost entirely static. That changes here:
**minimalism stays, stillness does not.** Notion is minimal and its icons move;
so is Discord, and its icons move more. The point is that the interface answers
when it is touched.

What keeps it from turning into noise is not withholding motion, it is having a
**closed vocabulary**: a small set of named behaviours, each tied to a meaning,
applied from one place. A new screen picks a behaviour from the list; it never
invents one. That is what `P-02` is for.

Two rules survive the change:

- Motion never delays the user. Everything is at or under 180ms, and nothing
  waits for an animation to finish before doing its work.
- Motion respects `prefers-reduced-motion`. That is `P-01`, and it lands before
  anything else in this file.

`CLAUDE.md` says motion should be "subtle and purposeful, never gratuitous".
That still holds, but its UI/UX section is written for a static app and should
be updated with this direction as part of batch 1.

## Batches

| Batch | Theme                       | Why in this order                                            |
| ----- | --------------------------- | ------------------------------------------------------------ |
| 1     | Motion foundation and icons | Tokens and the vocabulary everything later builds on         |
| 2     | Action feedback             | An action that confirms itself; needs the batch 1 vocabulary |
| 3     | Loading                     | The one moment the app looks unfinished; independent         |
| 4     | Lists and figures           | The bigger surfaces, once the vocabulary has settled         |
| 5     | Details that are not motion | Cheap, unrelated to the rest, easy to land last              |

## Tracking table

| ID   | Title                                                            | Batch | Done |
| ---- | ---------------------------------------------------------------- | ----- | ---- |
| P-01 | No motion tokens, and `prefers-reduced-motion` is ignored        | 1     | [x]  |
| P-02 | Icons do not react to anything                                   | 1     | [x]  |
| P-12 | Every sidebar icon moves the same way, so none of them says much | 1     | [x]  |
| P-03 | Copying and confirming give no visible feedback                  | 2     | [ ]  |
| P-04 | First load shows the word "Cargando..." and then a full app      | 3     | [ ]  |
| P-05 | A row that was just created or edited is lost in the list        | 4     | [ ]  |
| P-06 | Figures snap when the period or the filters change               | 4     | [ ]  |
| P-07 | Row actions are as loud as the data they belong to               | 4     | [ ]  |
| P-08 | Expanding a row opens instantly, and the pattern is duplicated   | 4     | [ ]  |
| P-09 | Focus is lost when a dialog closes                               | 5     | [ ]  |
| P-10 | No keyboard shortcuts for search and filters                     | 5     | [ ]  |
| P-11 | Scroll position is not kept when leaving and returning to a view | 5     | [ ]  |

---

## Batch 1 — Motion foundation and icons

### P-01 · No motion tokens, and `prefers-reduced-motion` is ignored

- **Where:** `src/index.css`.
- **Today:** `grep -rn "reduced-motion\|motion-safe\|motion-reduce" src` returns
  nothing. Durations are ad hoc: the dialog, popover, select and tooltip
  primitives each carry their own `duration-100`, `transition-colors` uses
  Tailwind's default 150ms, and `transition-[width]` on the progress bar uses
  the same. Nothing is named, so nothing can be tuned together.
- **Proposal:** two additions to `src/index.css`, next to the existing tokens:
  - Motion tokens in `@theme inline`, so they are usable as Tailwind utilities
    and from plain CSS:
    - `--duration-fast: 120ms` — hover and press feedback; the icon vocabulary.
    - `--duration-base: 180ms` — something appearing, expanding or crossfading.
    - `--ease-out: cubic-bezier(0.2, 0, 0, 1)` — the default curve. Quick to
      start, settles softly; the standard for interface motion.
  - A global reduced-motion block in `@layer base` that cuts animation and
    transition duration to near zero for everything, the shadcn primitives
    included. Near zero rather than `none` because a few transitions carry a
    `transitionend`, and `animation: none` can leave an element mid-keyframe.
- **Also:** the existing `duration-100` in the dialog, alert dialog, popover,
  select and tooltip primitives moves onto the tokens, so there is one place
  where the app's speed lives.
- **Tests:** none; this is CSS with no logic.
- **Done as:** proposed, with two changes. The curve is `--ease-standard`, not
  `--ease-out`: Tailwind already ships an `--ease-out`, and taking that name
  would have silently changed every `ease-out` in the app. And rather than
  being new utilities nobody remembers to use, the tokens are wired into
  `--default-transition-duration` and `--default-transition-timing-function`,
  so the twelve files that already say `transition-colors` picked up the new
  speed and curve without being touched. The overlay primitives now carry
  `duration-(--duration-base)`, which also moved the dialog, popover and select
  from 100ms to 180ms.
- **Checked in the running app:** the compiled stylesheet carries
  `--duration-fast: .12s`, `--duration-base: .18s`, `--ease-standard` and the
  `prefers-reduced-motion` block, and every `transition-*` utility resolves to
  `var(--duration-fast)`. **Not checked:** reduced motion with the macOS
  setting actually turned on — that is a system preference and was left alone.
- [x] Done

### P-02 · Icons do not react to anything

- **Where:** `src/components/ui/button.tsx` (the `[&_svg]` rules in the cva
  base), `src/components/layout/Sidebar.tsx` (`NavButton`, a plain `<button>`,
  not a `Button`), and every caller of `ActionButton`.
- **Today:** `grep -rn "group-hover" src` returns nothing. An icon button
  changes its background on hover and nothing else. The only moving icons in
  the app are the `ChevronDown` in `LoansSection.tsx:338`, which rotates when a
  loan is expanded, and the `RefreshCw` in `ExchangeRateBar.tsx:70`, which
  spins while a rate is being fetched. Both are good; neither is reusable.
- **Proposal:** one icon motion vocabulary, six behaviours, each meaning
  something different. An icon opts in with a `data-motion` attribute; the
  button it sits in drives it.

  | Behaviour | What it does                                                      | What it means                          | Where                                                                                                           |
  | --------- | ----------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
  | `lift`    | scale to 1.08, colour to `foreground`, `--duration-fast`          | the default: this is a control         | every icon-only button, unless another behaviour fits better                                                    |
  | `nudge`   | translates 1.5px in its own direction                             | the icon points somewhere              | arrows, external link, download, import and export                                                              |
  | `rotate`  | rotates on state, not on hover: 180° for a chevron, 90° for a `+` | something is open, or is about to open | disclosure chevrons, the add buttons                                                                            |
  | `swap`    | crossfades into a second icon                                     | the action succeeded                   | copy → check, eye → eye-off (`P-03` uses this)                                                                  |
  | `spin`    | continuous rotation while a promise is in flight                  | the app is working                     | already on the rate refresh; also on backup, import and export                                                  |
  | `still`   | nothing                                                           | motion would be wrong here             | icons that are decoration or status, not controls: the `HandCoins` next to a loan, the `FigureBar` header icons |

  Deliberately **not** in the vocabulary: bounce, wobble, anything springy, and
  anything over 180ms. Those read as playful, and this app holds the user's
  money.

  The destructive button gets `lift` and its existing colour change, not a
  tilting bin lid. A delete button that is fun to hover is a delete button that
  gets pressed.

- **How it is built:** a single `@utility` in `src/index.css` — provisionally
  `icon-motion` — that styles descendant `svg` on hover and on
  `:focus-visible`, and reads `data-motion` off the icon to pick the
  behaviour. Two call sites use it:
  - the cva base in `button.tsx`, which covers every `Button` and therefore
    every `ActionButton` in the app at once;
  - `NavButton` in `Sidebar.tsx`, which is a plain `<button>` and needs it
    explicitly.

  Keeping it in CSS, driven by the parent's hover, is what avoids the obvious
  mistake: a `MotionIcon` React wrapper would mean touching all ~40 call sites
  and would re-render on hover for no reason. Callers that want something other
  than the default write `data-motion="nudge"` on the icon and nothing else.

  `:focus-visible` matters as much as `:hover`: a keyboard user should get the
  same answer from the interface as a mouse user.

- **Tests:** the behaviour is CSS, so the test is that the vocabulary is
  applied consistently, not that a transform happened in jsdom. What does get a
  unit test is any helper that maps an icon to a behaviour, if the
  implementation ends up needing one.
- **Done as:** proposed, with a smaller vocabulary than the table above. What
  shipped is `lift`, `nudge-up` / `nudge-down` / `nudge-left` / `nudge-right`,
  `turn` and `turn-back`, in the `icon-motion` utility in `src/index.css`.

  `nudge` is split per direction because a single name cannot know which way an
  icon points. `turn` is a hover behaviour (90°, for a `+`, which has no
  direction to lean in) and `turn-back` its mirror (for the `RotateCcw` on
  "Reintentar"). What the table called `rotate` needs no rule of its own: a
  disclosure chevron carries the caller's own `rotate-180` and is animated by
  the transition the utility already puts on every icon, which let
  `LoansSection` drop its one-off `transition-transform`. `spin` is likewise
  just Tailwind's `animate-spin`, left alone.

  `swap` was dropped from this batch: its only consumer is `P-03`, and shipping
  it now would have been a behaviour with nothing to prove it. `still` was
  dropped outright — no icon in the app wanted it, and the decorative icons it
  was meant for are not inside controls, so the vocabulary never reaches them.

  The transition uses the individual `scale` / `translate` / `rotate`
  properties rather than `transform`, so a behaviour and a caller's `rotate-*`
  compose instead of overwriting each other.

- **Checked in the running app:** with the dev server in the browser pane,
  reading computed styles rather than trusting a screenshot — hovering a
  sidebar item gives the icon `scale: 1.08`; hovering "Nueva transacción" gives
  the `+` `rotate: 90deg` and no scale; hovering "Importar desde CSV" gives
  `translate: 0px -1.5px`. Tabbing to "Guardar copia de seguridad" gives
  `translate: 0px 1.5px`, so keyboard focus is answered the same way as the
  pointer. The native window was checked with real data and is unchanged at
  rest, which is the point. No console errors beyond the expected "no Tauri
  IPC" ones of a plain browser. **Not checked:** the action columns under a
  pointer in the native window — motion there cannot be measured, only the
  compiled rules and the browser can.
- [x] Done

### P-12 · Every sidebar icon moves the same way, so none of them says much

- **Where:** `src/components/layout/Sidebar.tsx`, `src/index.css`.
- **Today:** after `P-02`, all eight sections lift their icon by the same 8%.
  That is an answer, but it is the same answer everywhere, and the sidebar is
  the one place in the app where the icon is doing the explaining — collapsed,
  it is the only thing naming the section at all.
- **Proposal:** a signature per section, the way Discord gives each of its
  icons one. A second tier under the behaviours: a behaviour says what a
  control does and any icon can have it, a signature says what one icon is and
  travels with that icon wherever it appears.

  | Section       | Signature | What moves                                               |
  | ------------- | --------- | -------------------------------------------------------- |
  | Estadísticas  | `chart`   | the slice comes out of the pie                           |
  | Transacciones | `flow`    | money in and money out pull apart                        |
  | Compromisos   | `clock`   | the hand turns a quarter, around the clock's own centre  |
  | Categorías    | `fan`     | the front tag lifts off the one behind it, dot and all   |
  | Cuentas       | `bank`    | the roof lifts off the columns                           |
  | Ahorros       | `piggy`   | a nod — the whole animal, because a pig is not a diagram |
  | Cierres       | `pages`   | the three lines write themselves, 40ms apart             |
  | Ajustes       | `gear`    | the gear turns one tooth and the hub stays put           |

- **How it is built:** the same `icon-motion` utility, with a rule per
  signature reaching into the icon's `svg` by child position. They move at
  `--duration-base` rather than `--duration-fast`, because they travel further
  and through more of an arc. The stagger on `pages` is a `transition-delay`
  set only in the hover rule, so the lines write themselves on the way in and
  settle back together on the way out rather than unwriting.
- **The fragile part:** those child positions belong to lucide, not to us. An
  upgrade that reorders a path would leave a rule animating the wrong half of
  an icon, and nothing would fail, because no test looks at a hover.
- **Tests:** `Sidebar.test.tsx` is the tripwire for exactly that — for every
  section it asserts the signature it carries, that no two sections share one,
  how many children the icon has, and a distinctive fragment of the geometry of
  each part a rule moves. It was confirmed to fail when one of those fragments
  is changed.
- **Checked in the running app:** each of the eight hovered in turn and read as
  computed styles — the pie slice at `translate: 1.5px -1.5px`, the two halves
  of the transfer arrows at `-1.5px` and `1.5px`, the clock hand at
  `rotate: 90deg` about `16px 16px`, the front tag and its dot together, the
  bank roof at `0 -1.5px`, the pig at `-6deg` and `1.06`, the three closing
  lines at `1.5px` with delays of 0, 40ms and 80ms, and the gear at `45deg`
  about `12px 12px` with the hub left alone. **Not checked:** how they read
  under a real pointer at 16px in the native window, which is a matter of taste
  rather than of correctness.
- [x] Done

---

## Batch 2 — Action feedback

### P-03 · Copying and confirming give no visible feedback

- **Where:** `src/components/DonationCard.tsx:35` and
  `src/components/DonationPrompt.tsx:130` ("Copiar alias"), and the confirm
  actions in `CommitmentsView` / `RecurringSection` / `LoansSection`.
- **Today:** copying the alias writes to the clipboard and the button stays
  exactly as it was. The only signal is a toast, which is in the corner, away
  from where the user is looking. Confirming a commitment is the same: the row
  updates when the data reloads, with nothing in between.
- **Proposal:** the button answers where the user is looking. The icon `swap`s
  to a `Check` for about 1.5 seconds and the label follows it ("Copiar alias" →
  "¡Copiado!"), then both return. The toast stays for the failure case, where
  there is something to explain.
- **How it is built:** a `useActionFeedback` hook in `src/hooks` holding a
  short-lived flag and its timer, so the timeout is cleared on unmount and the
  behaviour cannot drift between the two donation call sites. The icon swap
  itself is the batch 1 vocabulary, not new CSS.
- **Tests:** the hook gets a test first, with fake timers: it turns on, it
  turns off after the delay, a second call restarts the delay rather than
  stacking timers, and unmounting mid-flight does not leave a timer running.
- **Checks in the running app:** copying the alias from Ajustes and from the
  prompt; confirming a commitment.

---

## Batch 3 — Loading

### P-04 · First load shows the word "Cargando..." and then a full app

- **Where:** `src/context/AppDataContext.tsx` (`isLoading`), and its consumers:
  `CategoryRulesCard.tsx`, `AttachmentsDialog.tsx:154`, `BudgetsSection.tsx`.
- **Today:** there is no `Skeleton` primitive in `src/components/ui`. Loading
  is the literal string "Cargando..." where anyone bothered, and nothing where
  they did not, so the window opens empty and fills in one jump.
- **Proposal:** the shadcn `Skeleton` primitive, plus skeleton shapes that
  match the real layout — the figure bar, the card list, the table — so the app
  opens with its own silhouette and the data fades into place over
  `--duration-base`. The shapes go next to the components whose layout they
  imitate, not in one "skeletons" file that goes stale the moment a card
  changes.
- **The trap to avoid:** SQLite is local and usually answers in a few
  milliseconds. A skeleton that appears and vanishes in 40ms is a flash, which
  is worse than nothing. The skeleton only appears once loading has lasted
  beyond a threshold (~120ms), and once shown stays for a minimum (~300ms).
- **Tests:** the delay-and-minimum logic is a pure function of elapsed time and
  gets a unit test with fake timers, written first: it does not show for a fast
  load, it shows for a slow one, and it does not flicker off early.
- **Checks in the running app:** a cold start, and a cold start on a database
  large enough to be slow.

---

## Batch 4 — Lists and figures

### P-05 · A row that was just created or edited is lost in the list

You add a transaction and land back in a table of hundreds. Nothing says where
it went. Proposal: the affected row carries a background highlight that fades
out over about 800ms — long enough to find, short enough not to linger.

### P-06 · Figures snap when the period or the filters change

The `FigureBar` on Estadísticas replaces its numbers instantly, which reads as
a glitch rather than a recalculation. Proposal: a crossfade at
`--duration-fast`. Explicitly not a count-up animation: a balance counting
upwards reads as marketing, not as money.

### P-07 · Row actions are as loud as the data they belong to

Every row in Compromisos carries three or four icon buttons at full strength,
competing with the amounts. Proposal: 60% opacity, full on `group-hover` and on
`focus-within`. Opacity only — never `display: none` or `invisible`, which
takes the buttons out of the keyboard order and hides them from a user who
cannot hover.

### P-08 · Expanding a row opens instantly, and the pattern is duplicated

`LoansSection` rotates its chevron but its schedule appears with no transition,
and the same expand/collapse is rebuilt per section. Proposal: pull it into one
disclosure primitive that owns the chevron (`rotate` from the vocabulary), the
animated height and the ARIA wiring, and use it everywhere a row expands.

---

## Batch 5 — Details that are not motion

### P-09 · Focus is lost when a dialog closes

After a dialog closes, focus should return to the control that opened it. Worth
checking what the Base UI dialog already restores before writing anything.

### P-10 · No keyboard shortcuts for search and filters

`grep -rn "addEventListener(\"keydown\"" src` finds only the donation prompt
and `TagInput`. Proposal: `/` focuses the search field of the current view and
`Esc` clears the filters, both routed through one hook so a new view does not
have to reinvent them, and both inert while a dialog or an input has focus.

### P-11 · Scroll position is not kept when leaving and returning to a view

`grep -rn "scrollTo\|scrollTop" src` returns nothing. Scrolling deep into
Transacciones, stepping into Ajustes and coming back puts the user at the top
again. Proposal: remember the scroll offset per view and restore it on return.
