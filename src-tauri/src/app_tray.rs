use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

const TRAY_ID: &str = "kkterm-main";
const DONT_SLEEP_ITEM_ID: &str = "kkterm-tray-dont-sleep";
const EXIT_ITEM_ID: &str = "kkterm-tray-exit";
const RECENT_ITEM_PREFIX: &str = "kkterm-tray-recent:";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayRecentConnection {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayMenuSnapshot {
    pub recent_connections: Vec<TrayRecentConnection>,
    pub dont_sleep_label: String,
    pub exit_label: String,
}

pub struct TrayState {
    minimize_to_tray: AtomicBool,
    snapshot: Mutex<Option<TrayMenuSnapshot>>,
}

impl TrayState {
    pub fn new(minimize_to_tray: bool) -> Self {
        Self {
            minimize_to_tray: AtomicBool::new(minimize_to_tray),
            snapshot: Mutex::new(None),
        }
    }

    pub fn minimize_to_tray(&self) -> bool {
        self.minimize_to_tray.load(Ordering::Relaxed)
    }

    pub fn set_minimize_to_tray(&self, enabled: bool) {
        self.minimize_to_tray.store(enabled, Ordering::Relaxed);
    }

    pub fn set_snapshot(&self, snapshot: TrayMenuSnapshot) {
        if let Ok(mut guard) = self.snapshot.lock() {
            *guard = Some(snapshot);
        }
    }
}

pub fn install(app: &tauri::App, tooltip: &str) -> Result<(), String> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID).tooltip(tooltip);
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => restore_main_window(tray.app_handle()),
            _ => {}
        })
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .build(app)
        .map_err(|error| format!("failed to install tray icon: {error}"))?;

    Ok(())
}

/// Rebuilds the tray menu from the snapshot the frontend last pushed. Does nothing until the
/// frontend has pushed a snapshot, since the menu labels are localized on the frontend. The
/// Don't Sleep check state is read live from [`crate::power::DontSleepManager`], which owns it.
pub fn rebuild_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    tray_state: &TrayState,
) -> Result<(), String> {
    let guard = tray_state
        .snapshot
        .lock()
        .map_err(|_| "tray menu snapshot is unavailable".to_string())?;
    let Some(snapshot) = guard.as_ref() else {
        return Ok(());
    };
    let dont_sleep_enabled = app
        .try_state::<crate::power::DontSleepManager>()
        .map(|power| power.is_enabled())
        .unwrap_or(false);
    let menu = build_menu(app, snapshot, dont_sleep_enabled)?;
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Err("tray icon is not installed".to_string());
    };
    tray.set_menu(Some(menu))
        .map_err(|error| format!("failed to update tray menu: {error}"))
}

fn build_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    snapshot: &TrayMenuSnapshot,
    dont_sleep_enabled: bool,
) -> Result<Menu<R>, String> {
    let menu = Menu::new(app).map_err(|error| error.to_string())?;

    for connection in &snapshot.recent_connections {
        let item = MenuItem::with_id(
            app,
            format!("{RECENT_ITEM_PREFIX}{}", connection.id),
            &connection.label,
            true,
            None::<&str>,
        )
        .map_err(|error| error.to_string())?;
        menu.append(&item).map_err(|error| error.to_string())?;
    }

    if !snapshot.recent_connections.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    }

    let dont_sleep = CheckMenuItem::with_id(
        app,
        DONT_SLEEP_ITEM_ID,
        &snapshot.dont_sleep_label,
        true,
        dont_sleep_enabled,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    menu.append(&dont_sleep)
        .map_err(|error| error.to_string())?;

    menu.append(&PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;

    let exit = MenuItem::with_id(app, EXIT_ITEM_ID, &snapshot.exit_label, true, None::<&str>)
        .map_err(|error| error.to_string())?;
    menu.append(&exit).map_err(|error| error.to_string())?;

    Ok(menu)
}

fn handle_menu_event<R: tauri::Runtime>(app: &tauri::AppHandle<R>, id: &str) {
    if id == EXIT_ITEM_ID {
        app.exit(0);
        return;
    }

    if id == DONT_SLEEP_ITEM_ID {
        toggle_dont_sleep(app);
        return;
    }

    if let Some(connection_id) = id.strip_prefix(RECENT_ITEM_PREFIX) {
        restore_main_window(app);
        let _ = app.emit("kkterm://tray-open-connection", connection_id.to_string());
    }
}

fn toggle_dont_sleep<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Some(power) = app.try_state::<crate::power::DontSleepManager>() else {
        return;
    };
    let currently_enabled = power.is_enabled();

    match power.set_enabled(!currently_enabled) {
        Ok(enabled) => {
            if let Some(tray_state) = app.try_state::<TrayState>() {
                if let Err(error) = rebuild_menu(app, &tray_state) {
                    eprintln!("failed to refresh tray menu after Don't Sleep toggle: {error}");
                }
            }
            let _ = app.emit("kkterm://dont-sleep-changed", enabled);
        }
        Err(error) => {
            eprintln!("failed to toggle Don't Sleep from tray: {error}");
            let _ = app.emit("kkterm://dont-sleep-changed", currently_enabled);
        }
    }
}

pub fn restore_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(main_window) = app.get_window(crate::window_state::MAIN_WINDOW_LABEL) {
        if main_window.is_minimized().unwrap_or(false) {
            let _ = main_window.unminimize();
        }

        let _ = main_window.show();
        let _ = main_window.set_focus();
    }
}

pub fn hide_minimized_window_if_enabled<R: tauri::Runtime>(window: &tauri::Window<R>) {
    let Some(tray_state) = window.try_state::<TrayState>() else {
        return;
    };

    if !tray_state.minimize_to_tray() || !window.is_minimized().unwrap_or(false) {
        return;
    }

    let _ = window.hide();
}

/// Diverts the native title-bar close button to a hide-to-tray when minimize-to-tray is enabled.
/// When disabled, the close request is left untouched so the window quits natively. The tray
/// "Exit" item calls `app.exit(0)`, which never routes through `CloseRequested`, so quitting
/// always remains possible.
pub fn hide_window_on_close_if_enabled<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    api: &tauri::CloseRequestApi,
) {
    let Some(tray_state) = window.try_state::<TrayState>() else {
        return;
    };

    if !tray_state.minimize_to_tray() {
        return;
    }

    api.prevent_close();
    let _ = window.hide();
}
