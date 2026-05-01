mod logging;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppBootstrap {
    product_name: &'static str,
    version: &'static str,
    log_status: String,
}

#[tauri::command]
fn app_bootstrap() -> AppBootstrap {
    AppBootstrap {
        product_name: "AdminDeck",
        version: env!("CARGO_PKG_VERSION"),
        log_status: logging::status(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![app_bootstrap])
        .run(tauri::generate_context!())
        .expect("error while running AdminDeck");
}
