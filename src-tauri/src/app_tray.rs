use std::sync::atomic::{AtomicBool, Ordering};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

pub struct TrayState {
    minimize_to_tray: AtomicBool,
}

impl TrayState {
    pub fn new(minimize_to_tray: bool) -> Self {
        Self {
            minimize_to_tray: AtomicBool::new(minimize_to_tray),
        }
    }

    pub fn minimize_to_tray(&self) -> bool {
        self.minimize_to_tray.load(Ordering::Relaxed)
    }

    pub fn set_minimize_to_tray(&self, enabled: bool) {
        self.minimize_to_tray.store(enabled, Ordering::Relaxed);
    }
}

pub fn install(app: &tauri::App, tooltip: &str) -> Result<(), String> {
    let mut builder = TrayIconBuilder::with_id("kkterm-main").tooltip(tooltip);
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
        .build(app)
        .map_err(|error| format!("failed to install tray icon: {error}"))?;

    Ok(())
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
