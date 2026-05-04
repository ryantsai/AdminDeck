use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{PhysicalSize, Size, Window};

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";

const DEFAULT_WIDTH: u32 = 1360;
const DEFAULT_HEIGHT: u32 = 860;
const MIN_WIDTH: u32 = 1120;
const MIN_HEIGHT: u32 = 720;
const MAX_WIDTH: u32 = 10_000;
const MAX_HEIGHT: u32 = 10_000;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MainWindowSettings {
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) maximized: bool,
}

impl MainWindowSettings {
    fn default_normal() -> Self {
        Self {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            maximized: false,
        }
    }
}

pub(crate) struct MainWindowState {
    settings: Mutex<MainWindowSettings>,
}

impl MainWindowState {
    pub(crate) fn new(settings: MainWindowSettings) -> Self {
        Self {
            settings: Mutex::new(settings),
        }
    }

    pub(crate) fn update_normal_size(&self, size: PhysicalSize<u32>) {
        if let Ok(mut settings) = self.settings.lock() {
            if let Ok(next) = validate_main_window_settings(MainWindowSettings {
                width: size.width,
                height: size.height,
                maximized: settings.maximized,
            }) {
                settings.width = next.width;
                settings.height = next.height;
            }
        }
    }

    pub(crate) fn snapshot_for_window(&self, window: &Window) -> MainWindowSettings {
        let mut settings = self
            .settings
            .lock()
            .map(|settings| settings.clone())
            .unwrap_or_else(|_| MainWindowSettings::default_normal());

        let maximized = window.is_maximized().unwrap_or(settings.maximized);
        settings.maximized = maximized;

        if !maximized {
            if let Ok(size) = window.inner_size() {
                if let Ok(next) = validate_main_window_settings(MainWindowSettings {
                    width: size.width,
                    height: size.height,
                    maximized,
                }) {
                    settings = next;
                }
            }
        }

        settings
    }
}

pub(crate) fn restore_main_window(
    window: &Window,
    settings: Option<MainWindowSettings>,
) -> MainWindowSettings {
    let settings = settings.unwrap_or_else(|| {
        window
            .inner_size()
            .ok()
            .and_then(|size| {
                validate_main_window_settings(MainWindowSettings {
                    width: size.width,
                    height: size.height,
                    maximized: window.is_maximized().unwrap_or(false),
                })
                .ok()
            })
            .unwrap_or_else(MainWindowSettings::default_normal)
    });

    let _ = window.set_size(Size::Physical(PhysicalSize::new(
        settings.width,
        settings.height,
    )));

    if settings.maximized {
        let _ = window.maximize();
    }

    settings
}

pub(crate) fn validate_main_window_settings(
    mut settings: MainWindowSettings,
) -> Result<MainWindowSettings, String> {
    settings.width = settings.width.clamp(MIN_WIDTH, MAX_WIDTH);
    settings.height = settings.height.clamp(MIN_HEIGHT, MAX_HEIGHT);
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_window_size_to_supported_range() {
        let settings = validate_main_window_settings(MainWindowSettings {
            width: 200,
            height: 50,
            maximized: true,
        })
        .expect("settings are normalized");

        assert_eq!(
            settings,
            MainWindowSettings {
                width: MIN_WIDTH,
                height: MIN_HEIGHT,
                maximized: true,
            }
        );
    }
}
