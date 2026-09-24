# Vault

Local-first desktop application built with a Tauri (Rust) backend and a React/TypeScript frontend.

## Tech stack

- **Shell / runtime**: Tauri v2 (Rust backend, native webview)
- **Frontend**: React 19 + TypeScript, bundled with Vite
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite`)
- **UI components**: shadcn/ui (components are generated into `src/components/ui` and owned by the project, not imported as a library)
- **Local data**: SQLite, embedded and accessed from the Rust side (or via a Tauri SQL plugin), for fully local-first persistence with no required backend server

## Project structure

- `src/components` — React components (`src/components/ui` holds shadcn-generated primitives)
- `src/lib` — shared utilities (e.g. `cn()` class helper)
- `src/hooks` — custom React hooks
- `src/db` — local SQLite access layer (queries, schema, migrations)
- `src-tauri` — Rust backend, Tauri commands, and native integrations

## Language policy

All source code must be written in **English**: variable names, function names, type names, comments, log messages, commit messages, and any other code-level or repository-level text. This is a strict, non-negotiable standard for this project.

The **only** exception is the end-user-facing UI copy (labels, buttons, messages shown to the user), which is written in **Spanish**, since the application's target audience is Spanish-speaking.

That Spanish is **Argentine**, the audience the app is built for:

- Address the user with **voseo**, never tuteo: "Seleccioná", "Elegí", "Ingresá", "querés", "tenés" — not "Selecciona", "Elige", "Introduce", "quieres", "tienes". This covers every string the user can see: labels, placeholders, validation messages, toasts, `aria-label`s, native menu items and error messages returned from Rust.
- Format amounts, percentages and dates with the **`es-AR`** locale through the helpers in `src/lib/format.ts`, never with an ad hoc `Intl` or `toLocaleString` call.

## Code quality

- Keep domain logic pure and in `src/lib`, with its own tests. Components compose it, `src/db` only persists, and Rust does only what the webview cannot.
- One concern per module. Reuse existing helpers, hooks and shadcn/ui primitives before adding new ones, and never duplicate a rule across screens.
- Derive rather than store what can be computed, memoize work that walks rows, and avoid repeated passes or rebuilding formatters on every render.
- Logic bugs get a failing test first, then the fix.
- Prefer small, readable code over clever code or speculative abstractions.

## UI/UX principles

The primary design directive for this project is a **minimalist, elegant, high-end** interface, in the spirit of Notion's clean, content-first UI. When building or reviewing UI:

- Prioritize clean, uncluttered layouts with generous whitespace over dense ones.
- Favor a restrained, neutral color palette and typography over decorative flourishes.
- Reuse shadcn/ui primitives and existing design tokens (see `src/index.css`) instead of inventing one-off styles.
- When in doubt, prefer removing an element over adding one.

Minimalist does not mean static. The interface answers when it is touched: icons in a control move on hover and on keyboard focus, and something that appears, expands or changes is animated rather than swapped. Notion is minimal and its icons move; that is the bar.

What keeps that from turning into noise is that all of it lives in one file, `src/styles/motion.css`, and is keyed to the icon rather than to the place it is used. Every icon in the app has a rule there, applied through the lucide class on its `svg`: render `<Trash2 />` inside any control and the lid tilts, here and on every other screen. A screen never decides how its icons move, there is nothing to pass at a call site, and the same icon cannot answer differently in two views. On top of its own movement, every icon inside a control lifts slightly — that is the part that says "this is a control"; the rest is what says which one.

The rules are grouped by movement, not by icon, so icons that share one share a declaration. Adding an icon usually means adding its class to a group rather than writing a rule. Adding one and giving it nothing is not an option: `motion.test.tsx` fails on any icon the app imports that has no rule, and pins the shape of every icon a rule reaches into, because those parts belong to lucide and an upgrade that reorders one would silently animate the wrong half of an icon.

Origins inside an icon are written in its own 24 unit grid; an origin on a whole icon is a percentage, because the root `svg` is measured in screen pixels.

Three limits hold:

- Durations come from `--duration-fast` and `--duration-base`, and nothing is slower than the latter. Motion never delays the user or blocks work.
- Nothing bounces, springs or overshoots. This app holds someone's money.
- `prefers-reduced-motion` is honoured globally, and the loading spinner is the only thing that survives it.

The full backlog and the batch plan for this live in `POLISH.md`.
