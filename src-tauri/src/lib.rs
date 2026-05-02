mod logging;
mod secrets;
mod sessions;
mod sftp;
mod ssh;
mod ssh_config;
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
fn get_ssh_settings(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<storage::SshSettings, String> {
    storage.ssh_settings()
}

#[tauri::command]
fn update_ssh_settings(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::SshSettings,
) -> Result<storage::SshSettings, String> {
    storage.update_ssh_settings(request)
}

#[tauri::command]
fn get_sftp_settings(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<storage::SftpSettings, String> {
    storage.sftp_settings()
}

#[tauri::command]
fn update_sftp_settings(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::SftpSettings,
) -> Result<storage::SftpSettings, String> {
    storage.update_sftp_settings(request)
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
fn import_ssh_config(
    request: ssh_config::ImportSshConfigRequest,
) -> Result<ssh_config::SshConfigImportPreview, String> {
    ssh_config::import_ssh_config(request)
}

#[tauri::command]
fn inspect_ssh_host_key(
    app: tauri::AppHandle,
    request: ssh::InspectSshHostKeyRequest,
) -> Result<ssh::SshHostKeyPreview, String> {
    ssh::inspect_host_key(ssh::app_known_hosts_path(&app)?, request)
}

#[tauri::command]
fn trust_ssh_host_key(
    app: tauri::AppHandle,
    request: ssh::TrustSshHostKeyRequest,
) -> Result<ssh::SshHostKeyPreview, String> {
    ssh::trust_host_key(ssh::app_known_hosts_path(&app)?, request)
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
    secrets: tauri::State<'_, secrets::Secrets>,
    request: sessions::StartTerminalSessionRequest,
) -> Result<sessions::TerminalSessionStarted, String> {
    sessions.start_terminal_session(app, &secrets, request)
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

#[tauri::command]
fn start_sftp_session(
    app: tauri::AppHandle,
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    secrets: tauri::State<'_, secrets::Secrets>,
    request: sftp::StartSftpSessionRequest,
) -> Result<sftp::SftpSessionStarted, String> {
    sftp_sessions.start_sftp_session(app, &secrets, request)
}

#[tauri::command]
fn list_sftp_directory(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::ListSftpDirectoryRequest,
) -> Result<sftp::SftpDirectoryListing, String> {
    sftp_sessions.list_directory(request)
}

#[tauri::command]
fn list_local_directory(
    request: sftp::ListLocalDirectoryRequest,
) -> Result<sftp::LocalDirectoryListing, String> {
    sftp::list_local_directory(request)
}

#[tauri::command]
fn upload_sftp_path(
    app: tauri::AppHandle,
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::UploadSftpPathRequest,
) -> Result<sftp::SftpTransferResult, String> {
    sftp_sessions.upload_path(app, request)
}

#[tauri::command]
fn download_sftp_path(
    app: tauri::AppHandle,
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::DownloadSftpPathRequest,
) -> Result<sftp::SftpTransferResult, String> {
    sftp_sessions.download_path(app, request)
}

#[tauri::command]
fn cancel_sftp_transfer(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::CancelSftpTransferRequest,
) -> Result<(), String> {
    sftp_sessions.cancel_transfer(request)
}

#[tauri::command]
fn create_sftp_folder(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::CreateSftpFolderRequest,
) -> Result<(), String> {
    sftp_sessions.create_folder(request)
}

#[tauri::command]
fn rename_sftp_path(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::RenameSftpPathRequest,
) -> Result<(), String> {
    sftp_sessions.rename_path(request)
}

#[tauri::command]
fn delete_sftp_path(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::DeleteSftpPathRequest,
) -> Result<(), String> {
    sftp_sessions.delete_path(request)
}

#[tauri::command]
fn close_sftp_session(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    session_id: String,
) -> Result<(), String> {
    sftp_sessions.close_sftp_session(session_id)
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
            app.manage(sftp::SftpSessionManager::new());
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
            get_ssh_settings,
            update_ssh_settings,
            get_sftp_settings,
            update_sftp_settings,
            keychain_status,
            ssh_transport_plan,
            import_ssh_config,
            inspect_ssh_host_key,
            trust_ssh_host_key,
            store_secret,
            secret_exists,
            delete_secret,
            start_terminal_session,
            write_terminal_input,
            resize_terminal,
            close_terminal_session,
            start_sftp_session,
            list_sftp_directory,
            list_local_directory,
            upload_sftp_path,
            download_sftp_path,
            cancel_sftp_transfer,
            create_sftp_folder,
            rename_sftp_path,
            delete_sftp_path,
            close_sftp_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running AdminDeck");
}

fn setup_error(message: String) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message))
}
