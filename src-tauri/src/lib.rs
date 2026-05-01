mod logging;
mod secrets;
mod sessions;
mod ssh;
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
    keychain_status: secrets::KeychainStatus,
}

#[tauri::command]
fn app_bootstrap(
    storage: tauri::State<'_, storage::Storage>,
    secrets: tauri::State<'_, secrets::Secrets>,
) -> AppBootstrap {
    AppBootstrap {
        product_name: "AdminDeck",
        version: env!("CARGO_PKG_VERSION"),
        log_status: logging::status(),
        storage_status: storage.status(),
        keychain_status: secrets.status(),
    }
}

#[tauri::command]
fn list_connection_groups(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<Vec<storage::ConnectionGroup>, String> {
    storage.list_connection_groups()
}

#[tauri::command]
fn create_connection(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::CreateConnectionRequest,
) -> Result<storage::SavedConnection, String> {
    storage.create_connection(request)
}

#[tauri::command]
fn create_connection_folder(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::CreateConnectionFolderRequest,
) -> Result<storage::ConnectionGroup, String> {
    storage.create_connection_folder(request)
}

#[tauri::command]
fn rename_connection_folder(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::RenameConnectionFolderRequest,
) -> Result<storage::ConnectionGroup, String> {
    storage.rename_connection_folder(request)
}

#[tauri::command]
fn delete_connection_folder(
    storage: tauri::State<'_, storage::Storage>,
    folder_id: String,
) -> Result<(), String> {
    storage.delete_connection_folder(folder_id)
}

#[tauri::command]
fn rename_connection(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::RenameConnectionRequest,
) -> Result<storage::SavedConnection, String> {
    storage.rename_connection(request)
}

#[tauri::command]
fn delete_connection(
    storage: tauri::State<'_, storage::Storage>,
    connection_id: String,
) -> Result<(), String> {
    storage.delete_connection(connection_id)
}

#[tauri::command]
fn duplicate_connection(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::DuplicateConnectionRequest,
) -> Result<storage::SavedConnection, String> {
    storage.duplicate_connection(request)
}

#[tauri::command]
fn move_connection_folder(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::MoveConnectionFolderRequest,
) -> Result<Vec<storage::ConnectionGroup>, String> {
    storage.move_connection_folder(request)
}

#[tauri::command]
fn move_connection(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::MoveConnectionRequest,
) -> Result<Vec<storage::ConnectionGroup>, String> {
    storage.move_connection(request)
}

#[tauri::command]
fn get_terminal_settings(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<storage::TerminalSettings, String> {
    storage.terminal_settings()
}

#[tauri::command]
fn update_terminal_settings(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::TerminalSettings,
) -> Result<storage::TerminalSettings, String> {
    storage.update_terminal_settings(request)
}

#[tauri::command]
fn keychain_status(secrets: tauri::State<'_, secrets::Secrets>) -> secrets::KeychainStatus {
    secrets.status()
}

#[tauri::command]
fn ssh_transport_plan() -> ssh::SshTransportPlan {
    ssh::transport_plan()
}

#[tauri::command]
fn store_secret(
    secrets: tauri::State<'_, secrets::Secrets>,
    request: secrets::StoreSecretRequest,
) -> Result<(), String> {
    secrets.store_secret(request)
}

#[tauri::command]
fn secret_exists(
    secrets: tauri::State<'_, secrets::Secrets>,
    request: secrets::SecretReferenceRequest,
) -> Result<secrets::SecretPresence, String> {
    secrets.secret_exists(request)
}

#[tauri::command]
fn delete_secret(
    secrets: tauri::State<'_, secrets::Secrets>,
    request: secrets::SecretReferenceRequest,
) -> Result<(), String> {
    secrets.delete_secret(request)
}

#[tauri::command]
fn start_terminal_session(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, sessions::SessionManager>,
    request: sessions::StartTerminalSessionRequest,
) -> Result<sessions::TerminalSessionStarted, String> {
    sessions.start_terminal_session(app, request)
}

#[tauri::command]
fn write_terminal_input(
    sessions: tauri::State<'_, sessions::SessionManager>,
    request: sessions::TerminalInputRequest,
) -> Result<(), String> {
    sessions.write_terminal_input(request)
}

#[tauri::command]
fn resize_terminal(
    sessions: tauri::State<'_, sessions::SessionManager>,
    request: sessions::ResizeTerminalRequest,
) -> Result<(), String> {
    sessions.resize_terminal(request)
}

#[tauri::command]
fn close_terminal_session(
    sessions: tauri::State<'_, sessions::SessionManager>,
    session_id: String,
) -> Result<(), String> {
    sessions.close_terminal_session(session_id)
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
            app.manage(secrets::Secrets::new());
            app.manage(sessions::SessionManager::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_bootstrap,
            list_connection_groups,
            create_connection,
            create_connection_folder,
            rename_connection_folder,
            delete_connection_folder,
            rename_connection,
            delete_connection,
            duplicate_connection,
            move_connection_folder,
            move_connection,
            get_terminal_settings,
            update_terminal_settings,
            keychain_status,
            ssh_transport_plan,
            store_secret,
            secret_exists,
            delete_secret,
            start_terminal_session,
            write_terminal_input,
            resize_terminal,
            close_terminal_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running AdminDeck");
}

fn setup_error(message: String) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message))
}
