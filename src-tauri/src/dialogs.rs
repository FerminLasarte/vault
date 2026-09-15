use std::path::{Path, PathBuf};
use tauri::{Manager, Runtime, Window};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

// The native file dialogs, opened from Rust rather than from the webview.
//
// The file commands in lib.rs read and write whatever path they are handed, so
// the path must never come from JavaScript: a script running in the webview
// could otherwise read ~/.ssh or overwrite ~/.zshrc through them. Asking the
// user here makes the dialog's answer the only path those commands ever see.
//
// Both functions block until the user answers, so they belong inside
// files::blocking, never on the main thread (the dialog itself runs there).

pub struct Filter {
    name: &'static str,
    extensions: &'static [&'static str],
}

pub const CSV: Filter = Filter {
    name: "CSV",
    extensions: &["csv"],
};
pub const DATABASE: Filter = Filter {
    name: "Base de datos SQLite",
    extensions: &["db"],
};
pub const ATTACHMENT: Filter = Filter {
    name: "Comprobantes",
    extensions: &["png", "jpg", "jpeg", "webp", "heic", "pdf"],
};
// Bank statements arrive in whatever the bank felt like exporting.
pub const STATEMENT: Filter = Filter {
    name: "Resumen bancario",
    extensions: &["csv", "txt", "xlsx", "xls"],
};

fn dialog<R: Runtime>(window: &Window<R>, filter: Option<&Filter>) -> FileDialogBuilder<R> {
    // Attached to the window, as the plugin's own JavaScript API does it: on
    // macOS the panel slides out of the title bar instead of floating apart.
    let dialog = window.dialog().file().set_parent(window);
    match filter {
        Some(filter) => dialog.add_filter(filter.name, filter.extensions),
        None => dialog,
    }
}

// Asks where to save a file, suggesting `default_name` in the user's Documents
// folder rather than wherever the panel happened to be last. Documents is the
// sane default for a file the user is meant to keep: it is backed up by Time
// Machine and picked up by iCloud Drive when Desktop & Documents sync is on,
// which puts a copy off the machine — the one thing a local-first app cannot
// do for itself. None when the user cancels.
pub fn choose_destination<R: Runtime>(
    window: &Window<R>,
    default_name: &str,
    filter: Option<&Filter>,
) -> Option<PathBuf> {
    // Only the name: the suggestion comes from the webview, and a folder in it
    // would steer the panel away from Documents (towards ~/.ssh, say).
    let mut dialog = dialog(window, filter).set_file_name(file_name(Path::new(default_name)));
    if let Ok(documents) = window.path().document_dir() {
        dialog = dialog.set_directory(documents);
    }
    dialog.blocking_save_file()?.into_path().ok()
}

// Asks for one existing file. None when the user cancels.
pub fn choose_file<R: Runtime>(window: &Window<R>, filter: &Filter) -> Option<PathBuf> {
    dialog(window, Some(filter))
        .blocking_pick_file()?
        .into_path()
        .ok()
}

// The name shown for a picked file; the rest of its path stays in Rust.
pub fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn has_extension(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .is_some_and(|extension| extensions.contains(&extension.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_a_spreadsheet_whatever_the_case() {
        let spreadsheet = ["xlsx", "xls"];

        assert!(has_extension(Path::new("/tmp/Resumen.XLSX"), &spreadsheet));
        assert!(has_extension(Path::new("resumen.xls"), &spreadsheet));
        assert!(!has_extension(Path::new("resumen.csv"), &spreadsheet));
        assert!(!has_extension(Path::new("xlsx"), &spreadsheet));
    }

    #[test]
    fn names_a_file_by_its_last_component() {
        assert_eq!(file_name(Path::new("/Users/ana/recibo.pdf")), "recibo.pdf");
        assert_eq!(file_name(Path::new("/")), "");
    }
}
