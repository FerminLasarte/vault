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

Every change prioritizes **good programming practices, modular code and efficient code**:

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
- Motion and visual effects should be subtle and purposeful, never gratuitous.
- When in doubt, prefer removing an element over adding one.
