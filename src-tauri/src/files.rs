use sqlx::SqlitePool;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

// Shown to the user as is (see src/lib/files.ts), so it is the one error here
// written in Spanish.
pub const LIVE_DATABASE_ERROR: &str = "No se puede guardar sobre la base de datos en uso";

// The files SQLite keeps for one database. Writing over any of them corrupts
// it: the main file is the data itself, and a stray -wal or -journal would be
// replayed into it the next time it opens.
const DATABASE_SIDECARS: [&str; 4] = ["", "-wal", "-shm", "-journal"];

// The folder (resolved through symlinks and `..`) and the lower-cased file
// name a path points at. Lower-cased because macOS and Windows file systems
// are case-insensitive by default, so "VAULT-AI.db" beside the database is the
// database; on a case-sensitive one this refuses a little more than it has to,
// which costs nothing.
fn location(path: &Path) -> Option<(String, String)> {
    let resolved = fs::canonicalize(path).ok().or_else(|| {
        let parent = match path.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => parent,
            _ => Path::new("."),
        };
        Some(fs::canonicalize(parent).ok()?.join(path.file_name()?))
    })?;
    let folder = resolved.parent()?.to_string_lossy().to_lowercase();
    let name = resolved.file_name()?.to_string_lossy().to_lowercase();
    Some((folder, name))
}

#[cfg(unix)]
fn same_file(a: &Path, b: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (fs::metadata(a), fs::metadata(b)) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    }
}

#[cfg(not(unix))]
fn same_file(_: &Path, _: &Path) -> bool {
    false
}

// Refuses a destination that is the live database or one of its sidecars.
//
// The save dialog will happily return the database's own path — Ajustes shows
// where it lives, and the user only has to browse there and accept
// "Reemplazar" — and writing to it truncates it before a single byte is
// copied, which loses everything.
pub fn guard_destination(destination: &Path, database: &Path) -> Result<(), String> {
    // A hard link to the database is the same file under a name the checks
    // below cannot recognise.
    if same_file(destination, database) {
        return Err(LIVE_DATABASE_ERROR.to_string());
    }

    let (Some((folder, name)), Some((database_folder, database_name))) =
        (location(destination), location(database))
    else {
        // The destination's folder does not exist, so it cannot hold the
        // database either; the write itself will report the missing folder.
        return Ok(());
    };

    let is_sidecar = DATABASE_SIDECARS
        .iter()
        .any(|suffix| name == format!("{database_name}{suffix}"));

    if folder == database_folder && is_sidecar {
        return Err(LIVE_DATABASE_ERROR.to_string());
    }
    Ok(())
}

// A hidden sibling of the destination, unique to this call. Beside it rather
// than in the system temp folder, because a rename is only atomic within one
// volume.
fn temporary_sibling(destination: &Path) -> Result<PathBuf, String> {
    let name = destination
        .file_name()
        .ok_or_else(|| "La ruta elegida no es un archivo".to_string())?
        .to_string_lossy();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default();
    Ok(destination.with_file_name(format!(".{name}.{}-{nanos}.tmp", std::process::id())))
}

// Produces the file under a temporary name and only then moves it into place,
// so a failure halfway leaves whatever was at the destination untouched — an
// earlier backup is never lost to a later one that did not finish.
fn replace_with(
    destination: &Path,
    database: &Path,
    produce: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    guard_destination(destination, database)?;

    let temporary = temporary_sibling(destination)?;
    let result = produce(&temporary)
        .and_then(|()| fs::rename(&temporary, destination).map_err(|error| error.to_string()));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn write_atomically(destination: &Path, database: &Path, bytes: &[u8]) -> Result<(), String> {
    replace_with(destination, database, |temporary| {
        fs::write(temporary, bytes).map_err(|error| error.to_string())
    })
}

// Writes a consistent snapshot of the live database to `destination`.
//
// `VACUUM INTO` rather than copying the file: it reads through SQLite, so it
// includes whatever is still in the -wal sidecar and cannot catch the main file
// halfway through a checkpoint. Copying vault-ai.db byte for byte could do
// both.
pub async fn backup_to(
    pool: &SqlitePool,
    database: &Path,
    destination: &Path,
) -> Result<(), String> {
    guard_destination(destination, database)?;

    let temporary = temporary_sibling(destination)?;
    let target = temporary
        .to_str()
        .ok_or_else(|| "La ruta elegida no es válida".to_string())?
        .to_string();

    let result = sqlx::query("VACUUM INTO ?")
        .bind(target)
        .execute(pool)
        .await
        .map_err(|error| error.to_string())
        .and_then(|_| fs::rename(&temporary, destination).map_err(|error| error.to_string()));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
    use sqlx::Row;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    // A scratch folder per test, removed when the guard drops.
    struct Workspace(PathBuf);

    impl Workspace {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir()
                .join(format!("vault-files-{name}-{}-{nanos}", std::process::id()));
            fs::create_dir_all(dir.join("sub")).unwrap();
            Workspace(dir)
        }

        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }

        fn entries(&self) -> Vec<String> {
            let mut names: Vec<String> = fs::read_dir(&self.0)
                .unwrap()
                .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
                .collect();
            names.sort();
            names
        }
    }

    impl Drop for Workspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    // Opens a database the way tauri-plugin-sql does: through a sqlx pool,
    // which puts it in WAL mode.
    async fn open_pool(database: &Path) -> SqlitePool {
        let options = SqliteConnectOptions::new()
            .filename(database)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal);
        SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(options)
            .await
            .unwrap()
    }

    async fn seed(pool: &SqlitePool, rows: i64) {
        sqlx::query("CREATE TABLE IF NOT EXISTS movements (id INTEGER PRIMARY KEY, amount REAL)")
            .execute(pool)
            .await
            .unwrap();
        for amount in 0..rows {
            sqlx::query("INSERT INTO movements (amount) VALUES (?)")
                .bind(amount as f64)
                .execute(pool)
                .await
                .unwrap();
        }
    }

    async fn count_rows(database: &Path) -> i64 {
        let pool = open_pool(database).await;
        let row = sqlx::query("SELECT COUNT(*) FROM movements")
            .fetch_one(&pool)
            .await
            .unwrap();
        let count: i64 = row.get(0);
        let check: String = sqlx::query("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);
        assert_eq!(check, "ok");
        pool.close().await;
        count
    }

    #[test]
    fn refuses_to_write_over_the_live_database() {
        let workspace = Workspace::new("write-live");
        let database = workspace.path("vault-ai.db");
        fs::write(&database, b"real data").unwrap();

        let aliases = [
            database.clone(),
            workspace.path("sub/../vault-ai.db"),
            workspace.path("VAULT-AI.db"),
            workspace.path("vault-ai.db-wal"),
            workspace.path("vault-ai.db-shm"),
        ];
        for alias in aliases {
            let result = write_atomically(&alias, &database, b"a,b,c\n");
            assert_eq!(result, Err(LIVE_DATABASE_ERROR.to_string()), "{alias:?}");
            assert_eq!(fs::read(&database).unwrap(), b"real data", "{alias:?}");
        }
        assert_eq!(workspace.entries(), ["sub", "vault-ai.db"]);
    }

    #[test]
    fn replaces_an_ordinary_file_and_leaves_nothing_behind() {
        let workspace = Workspace::new("write-ordinary");
        let database = workspace.path("vault-ai.db");
        let destination = workspace.path("export.csv");
        fs::write(&destination, b"an older, longer export\n").unwrap();

        write_atomically(&destination, &database, b"a,b\n").unwrap();

        assert_eq!(fs::read(&destination).unwrap(), b"a,b\n");
        assert_eq!(workspace.entries(), ["export.csv", "sub"]);
    }

    #[test]
    fn refuses_to_back_up_over_the_live_database() {
        tauri::async_runtime::block_on(async {
            let workspace = Workspace::new("backup-live");
            let database = workspace.path("vault-ai.db");
            let pool = open_pool(&database).await;
            seed(&pool, 3).await;

            let result = backup_to(&pool, &database, &database).await;

            assert_eq!(result, Err(LIVE_DATABASE_ERROR.to_string()));
            pool.close().await;
            assert_eq!(count_rows(&database).await, 3);
        });
    }

    #[test]
    fn backup_includes_what_is_still_in_the_wal() {
        tauri::async_runtime::block_on(async {
            let workspace = Workspace::new("backup-wal");
            let database = workspace.path("vault-ai.db");
            let destination = workspace.path("sub/backup.db");
            let pool = open_pool(&database).await;
            // Written without a checkpoint, like anything saved while the save
            // dialog was open: it lives only in vault-ai.db-wal.
            seed(&pool, 25).await;

            backup_to(&pool, &database, &destination).await.unwrap();

            pool.close().await;
            assert_eq!(count_rows(&destination).await, 25);
        });
    }

    #[test]
    fn backup_replaces_an_earlier_one_and_leaves_nothing_behind() {
        tauri::async_runtime::block_on(async {
            let workspace = Workspace::new("backup-replace");
            let database = workspace.path("vault-ai.db");
            let destination = workspace.path("sub/backup.db");
            fs::write(&destination, b"yesterday's backup").unwrap();
            let pool = open_pool(&database).await;
            seed(&pool, 4).await;

            backup_to(&pool, &database, &destination).await.unwrap();

            // Listed before the copy is opened: opening it in WAL mode creates
            // -wal and -shm sidecars of its own, which are not leftovers.
            let leftovers: Vec<_> = fs::read_dir(workspace.path("sub"))
                .unwrap()
                .map(|entry| entry.unwrap().file_name())
                .collect();
            assert_eq!(leftovers, ["backup.db"]);

            pool.close().await;
            assert_eq!(count_rows(&destination).await, 4);
        });
    }
}
