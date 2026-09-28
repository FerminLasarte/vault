---
name: run-vault-ai
description: Launch the Vault desktop app and verify a change end to end — running the real Tauri window, checking that migrations applied to the live SQLite database, inspecting the UI, and driving native file dialogs on macOS. Use whenever asked to run the app, screenshot it, or confirm a change works outside the test suite.
---

# Running and verifying Vault

Tauri v2 desktop app: Rust backend, React frontend, SQLite through
`tauri-plugin-sql`. Verification takes three separate channels because no
single one covers everything.

## Launch

```bash
npm run tauri dev
```

Run it in the background — it stays up and rebuilds on change. First build
takes minutes; later ones are seconds.

**Do not use `npm run dev` to verify anything data-related.** That serves the
frontend at `localhost:1420` with no Tauri IPC, so `@tauri-apps/plugin-sql`
fails with `Cannot read properties of undefined (reading 'invoke')` and every
view renders empty behind a "No se pudieron cargar los datos" toast. It is
still useful — see _Inspecting the UI_ — but it proves nothing about data.

The app watches `src-tauri/` and restarts on Rust changes; Vite hot-reloads on
frontend changes. **A hot reload resets the visible view back to Resumen**,
because the current view is React state. Editing or deleting any file under
`src/` mid-session will therefore knock you off whatever screen you were on.

## Verify the backend actually came up

Migrations run when the frontend opens the connection, not when the window
appears. The window can be up while the database is untouched, so check the
database rather than the log:

```bash
DB=~/Library/Application\ Support/com.ferminlasarte.vault-ai/vault-ai.db
sqlite3 "$DB" "SELECT version, description, success FROM _sqlx_migrations ORDER BY version;"
sqlite3 "$DB" "SELECT fetched_at FROM exchange_rates;"
```

A `fetched_at` newer than the launch proves the whole frontend chain ran: React
mounted, the effect fired, the network fetch passed CORS, and the SQL plugin
wrote. If the migration version is behind and nothing errored in the log,
`Database.load` is rejecting — see _Migrations_ below.

## Inspecting the UI

Two options, with different reach.

**Browser pane** (`preview_start` at `http://localhost:1420`): renders the real
components, gives a readable accessibility tree, and `read_console_messages`
surfaces frontend errors. No data, no Tauri commands. Good for layout, copy,
conditional rendering, and CSS-only behaviour like the theme toggle.

**The native window**: the only place with real data. Needs macOS permissions
for the terminal app — Screen Recording to capture, Accessibility to click.
Without them `screencapture` returns `could not create image from display` and
`osascript` returns `-1728`. Say so plainly rather than claiming the app was
checked.

Capture just the window, not the whole screen:

```bash
POS=$(osascript -e 'tell application "System Events" to tell process "Vault" to get position of window 1')
SIZE=$(osascript -e 'tell application "System Events" to tell process "Vault" to get size of window 1')
screencapture -x -R"<x>,<y>,<w>,<h>" out.png
```

## Clicking the native window

The webview exposes an accessibility tree, but its buttons carry no accessible
names, so element-based pressing is not usable. Click by coordinate instead,
mapping from a window capture:

```
screen_x = window_x + displayed_x * (image_scale / 2)
screen_y = window_y + displayed_y * (image_scale / 2)
```

The `/ 2` is the Retina backing factor; `image_scale` converts the displayed
image back to its original pixels. Verify with a screenshot after every click —
a stale view or a hot reload silently moves the target, and a missed click lands
on another app and steals focus.

```bash
osascript -e 'tell application "System Events" to tell process "Vault" to set frontmost to true'
osascript -e 'tell application "System Events" to tell process "Vault" to click at {X, Y}'
```

## Driving native file dialogs

Save and open panels appear as a _sheet_, not a window:

```bash
osascript -e 'tell application "System Events" to tell process "Vault" to count sheets of window 1'
```

Drive them by keyboard, which is far more reliable than clicking:

```applescript
keystroke "g" using {command down, shift down}  -- Go to folder
delay 1
keystroke "/absolute/path"
delay 0.8
key code 36                                     -- Return: go there
delay 1.5
key code 36                                     -- Return: save / open
```

## Migrations

The SQL lives in `src-tauri/src/lib.rs` as strings, so nothing type-checks it.
`npm run test` includes `src/db/migrations.test.ts`, which applies every
migration to a throwaway database **with `PRAGMA foreign_keys=ON`**, one
transaction each, exactly the way sqlx does — plus an upgrade run over a
populated legacy database. Run it before launching; a failing migration makes
`Database.load` reject and the app comes up completely empty.

The sqlite3 CLI defaults foreign keys **OFF**, and the app runs with them ON.
This cuts both ways and has bitten twice:

- Migrations piped into `sqlite3` by hand pass statements that fail in the app.
  That gap shipped a broken migration once.
- `DELETE` run from the CLI does **not** fire `ON DELETE CASCADE`, so tidying up
  test rows that way silently orphans their children. Always start an ad-hoc
  cleanup with `PRAGMA foreign_keys=ON;` and finish by checking
  `PRAGMA foreign_key_check;`.

Rebuilding a table that other rows reference needs the references parked in a
temp table, the swap done, then restored — `defer_foreign_keys` does not help,
because a schema change never clears the violation counter.

**sqlx checksums the SQL of every applied migration (SHA-384).** Editing the SQL
of a migration that already ran makes the app refuse to open the database. To
change applied behaviour, add a new migration.

## Leaving things clean

Back up before anything that migrates, since migrations that rebuild tables run
`DROP TABLE`:

```bash
cp ~/Library/Application\ Support/com.ferminlasarte.vault-ai/vault-ai.db ~/Desktop/vault-backup.db
```

Delete any test rows written into the live database, and remove temporary copies
of it from scratch directories — it holds real personal finances.
