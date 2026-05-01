mod logging;
mod storage;

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppBootstrap {
    product_name: &'static str,
    version: &'static str,
    log_status: String,
    storage_status: String,
}

#[tauri::command]
fn app_bootstrap(storage: tauri::State<'_, storage::Storage>) -> AppBootstrap {
    AppBootstrap {
        product_name: "AdminDeck",
        version: env!("CARGO_PKG_VERSION"),
        log_status: logging::status(),
        storage_status: storage.status(),
    }
}

#[tauri::command]
fn list_connection_groups(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<Vec<storage::ConnectionGroup>, String> {
    storage.list_connection_groups()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_path = app
                .path()
                .app_data_dir()
                .map_err(|error| {
                    setup_error(format!("failed to resolve app data directory: {error}"))
                })?
                .join("admin-deck.sqlite3");
            let storage = storage::Storage::open(db_path).map_err(setup_error)?;
            app.manage(storage);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_bootstrap,
            list_connection_groups
        ])
        .run(tauri::generate_context!())
        .expect("error while running AdminDeck");
}

fn setup_error(message: String) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message))
}
