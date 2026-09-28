use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime};

// Menu item ids. Kept as constants because the click handler matches on them
// and a typo there produces a menu entry that silently does nothing.
const NEW_TRANSACTION: &str = "new-transaction";
const BACKUP: &str = "backup";
const EXPORT_CSV: &str = "export-csv";
const IMPORT_CSV: &str = "import-csv";
const PRINT_REPORT: &str = "print-report";
const CHECK_UPDATES: &str = "check-updates";
const VIEW_PREFIX: &str = "view:";

// Events the frontend listens for. The menu never touches the interface
// directly: it says what the user asked for and React decides what that means.
pub const NAVIGATE_EVENT: &str = "menu://navigate";
pub const ACTION_EVENT: &str = "menu://action";

// The sections, in sidebar order, paired with the label shown in the menu. The
// accelerators follow the same order, so Cmd+1 is always the first item in the
// sidebar and the two never drift apart.
const SECTIONS: [(&str, &str); 8] = [
    ("overview", "Resumen"),
    ("transactions", "Transacciones"),
    ("commitments", "Compromisos"),
    ("categories", "Categorías"),
    ("accounts", "Cuentas"),
    ("savings", "Ahorros"),
    ("closes", "Cierres"),
    ("settings", "Ajustes"),
];

// Places that are a tab inside one of the sections above rather than a stop of
// their own. They are still worth listing: a menu is somewhere to look
// something up, which is exactly what a surface that had to give up space
// cannot be.
//
// No accelerators, deliberately — Cmd+8 onwards would drift from the sidebar,
// and these are not the shortcuts anyone reaches for.
const TABS: [(&str, &str); 5] = [
    ("analysis", "Análisis"),
    ("budgets", "Presupuestos"),
    ("expected", "Previstos"),
    ("installments", "Compras en cuotas"),
    ("loans", "Préstamos"),
];

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = AboutMetadata {
        name: Some("Vault".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        copyright: Some("© 2026 Fermín Lasarte".into()),
        ..Default::default()
    };

    let settings = MenuItem::with_id(
        app,
        format!("{VIEW_PREFIX}settings"),
        "Ajustes",
        true,
        Some("CmdOrCtrl+,"),
    )?;

    let app_menu = Submenu::with_items(
        app,
        "Vault",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("Acerca de Vault"), Some(about))?,
            &MenuItem::with_id(
                app,
                CHECK_UPDATES,
                "Buscar actualizaciones...",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("Servicios"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("Ocultar Vault"))?,
            &PredefinedMenuItem::hide_others(app, Some("Ocultar otros"))?,
            &PredefinedMenuItem::show_all(app, Some("Mostrar todo"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Salir de Vault"))?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "Archivo",
        true,
        &[
            &MenuItem::with_id(
                app,
                NEW_TRANSACTION,
                "Nueva transacción",
                true,
                Some("CmdOrCtrl+N"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                BACKUP,
                "Guardar copia de seguridad",
                true,
                Some("CmdOrCtrl+S"),
            )?,
            &MenuItem::with_id(app, EXPORT_CSV, "Exportar a CSV", true, None::<&str>)?,
            &MenuItem::with_id(app, IMPORT_CSV, "Importar desde CSV", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                PRINT_REPORT,
                "Imprimir informe",
                true,
                Some("CmdOrCtrl+P"),
            )?,
        ],
    )?;

    // Without this submenu macOS does not wire Cmd+C, Cmd+V or Cmd+Z into text
    // fields at all — the shortcuts belong to the menu, not to the webview, so
    // an app with no Edit menu has no working clipboard in its inputs.
    let edit_menu = Submenu::with_items(
        app,
        "Editar",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("Deshacer"))?,
            &PredefinedMenuItem::redo(app, Some("Rehacer"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("Cortar"))?,
            &PredefinedMenuItem::copy(app, Some("Copiar"))?,
            &PredefinedMenuItem::paste(app, Some("Pegar"))?,
            &PredefinedMenuItem::select_all(app, Some("Seleccionar todo"))?,
        ],
    )?;

    let mut section_items = Vec::with_capacity(SECTIONS.len());
    for (index, (view, label)) in SECTIONS.iter().enumerate() {
        section_items.push(MenuItem::with_id(
            app,
            format!("{VIEW_PREFIX}{view}"),
            *label,
            true,
            Some(format!("CmdOrCtrl+{}", index + 1)),
        )?);
    }

    let mut tab_items = Vec::with_capacity(TABS.len());
    for (view, label) in TABS.iter() {
        tab_items.push(MenuItem::with_id(
            app,
            format!("{VIEW_PREFIX}{view}"),
            *label,
            true,
            None::<&str>,
        )?);
    }

    let separator = PredefinedMenuItem::separator(app)?;
    let mut view_refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = Vec::new();
    for item in &section_items {
        view_refs.push(item);
    }
    view_refs.push(&separator);
    for item in &tab_items {
        view_refs.push(item);
    }
    let view_menu = Submenu::with_items(app, "Ver", true, &view_refs)?;

    let window_menu = Submenu::with_items(
        app,
        "Ventana",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("Minimizar"))?,
            &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
            &PredefinedMenuItem::fullscreen(app, Some("Pantalla completa"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("Cerrar"))?,
        ],
    )?;

    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
    )
}

// Translates a click into an event for the frontend. Nothing here knows what a
// view looks like; React owns that, and this only reports the request.
pub fn handle_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    // Bringing the window forward first: a menu item picked while the window is
    // hidden behind another app would otherwise act on something unseen.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }

    let emitted = if let Some(view) = id.strip_prefix(VIEW_PREFIX) {
        app.emit(NAVIGATE_EVENT, view)
    } else if matches!(
        id,
        NEW_TRANSACTION | BACKUP | EXPORT_CSV | IMPORT_CSV | PRINT_REPORT | CHECK_UPDATES
    ) {
        app.emit(ACTION_EVENT, id)
    } else {
        // Predefined items (copy, quit, minimize…) are handled by the OS.
        return;
    };

    if let Err(error) = emitted {
        eprintln!("Failed to forward the menu event {id}: {error}");
    }
}
