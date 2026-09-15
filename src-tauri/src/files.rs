use sqlx::SqlitePool;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

// Every error below is shown to the user as is, so it is written in Spanish;
// the OS's own wording is English and ends in an errno ("(os error 2)").
// src/lib/fileErrors.ts must list them word for word (its test checks).
pub const LIVE_DATABASE_ERROR: &str = "No se puede guardar sobre la base de datos en uso";
pub const NOT_FOUND_ERROR: &str = "No se encontró el archivo";
pub const PERMISSION_ERROR: &str = "No hay permiso para usar esa ubicación";
pub const DISK_FULL_ERROR: &str = "No queda espacio en el disco";
pub const READ_ONLY_ERROR: &str = "Esa ubicación es de solo lectura";
// Excel saves a plain "CSV" in the system's legacy encoding; its "CSV UTF-8"
// option is the way out.
pub const NOT_UTF8_ERROR: &str =
    "El archivo no está en UTF-8. Guardalo como «CSV UTF-8» y probá de nuevo";
pub const DAMAGED_ATTACHMENT_ERROR: &str = "El adjunto está dañado";
// For everything else. Deliberately missing from fileErrors.ts, so the
// frontend shows its own, more specific message ("No se pudo guardar la
// copia") instead of this one.
pub const FILE_ERROR: &str = "No se pudo usar el archivo";

// Puts an I/O failure into words the user can act on. Kinds without a message
// of their own are logged, since the generic text says nothing about them.
pub fn user_error(error: std::io::Error) -> String {
    let message = match error.kind() {
        ErrorKind::NotFound => NOT_FOUND_ERROR,
        ErrorKind::PermissionDenied => PERMISSION_ERROR,
        ErrorKind::StorageFull => DISK_FULL_ERROR,
        ErrorKind::ReadOnlyFilesystem => READ_ONLY_ERROR,
        _ => {
            eprintln!("File operation failed: {error}");
            FILE_ERROR
        }
    };
    message.to_string()
}

pub fn read_text(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| match error.kind() {
        // What `read_to_string` reports for bytes that are not UTF-8.
        ErrorKind::InvalidData => NOT_UTF8_ERROR.to_string(),
        _ => user_error(error),
    })
}

// Largest receipt accepted. Attachments are stored inside the database, so an
// unbounded file would bloat every backup from then on.
pub const MAX_ATTACHMENT_BYTES: usize = 5 * 1024 * 1024;

pub fn read_attachment(path: &Path) -> Result<Vec<u8>, String> {
    let bytes = fs::read(path).map_err(user_error)?;

    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "El archivo pesa {} MB y el máximo es {} MB",
            format_megabytes(bytes.len() as u64),
            format_megabytes(MAX_ATTACHMENT_BYTES as u64)
        ));
    }
    Ok(bytes)
}

// Megabytes with one decimal, written the Spanish way ("5,9"), dropping a
// trailing ",0". Rounded up rather than down: a file just over the limit must
// never read as weighing exactly the limit it is refused for.
fn format_megabytes(bytes: u64) -> String {
    const MB: u64 = 1024 * 1024;
    let tenths = (bytes * 10).div_ceil(MB);
    match tenths % 10 {
        0 => format!("{}", tenths / 10),
        decimal => format!("{},{decimal}", tenths / 10),
    }
}

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
    let result =
        produce(&temporary).and_then(|()| fs::rename(&temporary, destination).map_err(user_error));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

// Runs blocking file work on the runtime's pool of blocking threads, for the
// commands in lib.rs. A plain `fn` command runs on the main thread, so copying
// a large file or encoding a 5 MB receipt froze the window and the menu until
// it was done; an `async fn` doing the same work inline would only move the
// stall to one of the few threads that drive every other async command.
pub async fn blocking<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .unwrap_or_else(|error| {
            eprintln!("A file operation stopped unexpectedly: {error}");
            Err(FILE_ERROR.to_string())
        })
}

pub fn write_atomically(destination: &Path, database: &Path, bytes: &[u8]) -> Result<(), String> {
    replace_with(destination, database, |temporary| {
        fs::write(temporary, bytes).map_err(user_error)
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
        // SQLite opens the destination itself, so a failure there arrives as
        // one of its own result codes rather than as an I/O error with a kind.
        .map_err(|error| {
            eprintln!("The backup failed: {error}");
            FILE_ERROR.to_string()
        })
        .and_then(|_| fs::rename(&temporary, destination).map_err(user_error));
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
    fn blocking_work_runs_off_the_calling_thread() {
        // A command's own thread is the one that must stay free: for a plain
        // `fn` command that was the main thread, which froze the window.
        let caller = std::thread::current().id();

        let worker =
            tauri::async_runtime::block_on(blocking(|| Ok(std::thread::current().id()))).unwrap();

        assert_ne!(worker, caller);
    }

    #[test]
    fn blocking_work_that_panics_is_reported_in_spanish() {
        let result = tauri::async_runtime::block_on(blocking::<(), _>(|| panic!("boom")));

        assert_eq!(result, Err(FILE_ERROR.to_string()));
    }

    #[test]
    fn puts_common_os_failures_into_spanish() {
        use std::io::{Error, ErrorKind};

        let cases = [
            (ErrorKind::NotFound, NOT_FOUND_ERROR),
            (ErrorKind::PermissionDenied, PERMISSION_ERROR),
            (ErrorKind::StorageFull, DISK_FULL_ERROR),
            (ErrorKind::ReadOnlyFilesystem, READ_ONLY_ERROR),
            (ErrorKind::TimedOut, FILE_ERROR),
        ];
        for (kind, message) in cases {
            assert_eq!(user_error(Error::from(kind)), message, "{kind:?}");
        }
    }

    #[test]
    fn a_file_that_is_not_utf8_says_how_to_fix_it() {
        let workspace = Workspace::new("read-latin1");
        let export = workspace.path("export.csv");
        // "Café" as Excel's plain "CSV" writes it on a Spanish Windows.
        fs::write(&export, b"Caf\xe9\n").unwrap();

        assert_eq!(read_text(&export), Err(NOT_UTF8_ERROR.to_string()));
    }

    #[test]
    fn a_missing_file_is_reported_in_spanish() {
        let workspace = Workspace::new("read-missing");
        let missing = workspace.path("gone.csv");

        assert_eq!(read_text(&missing), Err(NOT_FOUND_ERROR.to_string()));
        assert_eq!(read_attachment(&missing), Err(NOT_FOUND_ERROR.to_string()));
    }

    #[test]
    fn sizes_are_rounded_up_to_a_tenth_of_a_megabyte() {
        const MB: u64 = 1024 * 1024;

        assert_eq!(format_megabytes(5 * MB), "5");
        assert_eq!(format_megabytes(5 * MB + 1), "5,1");
        assert_eq!(format_megabytes(59 * MB / 10), "5,9");
        assert_eq!(format_megabytes(6 * MB), "6");
    }

    // Truncating 5.9 MB to 5 used to tell the user their file weighed exactly
    // the maximum it was being refused for.
    #[test]
    fn an_oversized_attachment_never_reads_as_the_limit() {
        let workspace = Workspace::new("read-oversized");
        let receipt = workspace.path("recibo.pdf");
        fs::write(&receipt, vec![0u8; MAX_ATTACHMENT_BYTES + 1]).unwrap();

        assert_eq!(
            read_attachment(&receipt),
            Err("El archivo pesa 5,1 MB y el máximo es 5 MB".to_string())
        );
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
