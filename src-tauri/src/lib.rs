mod ai;
mod diagnostics;
mod logging;
mod performance;
mod rdp;
mod screenshot;
mod secrets;
mod sessions;
mod sftp;
mod ssh;
mod ssh_config;
mod storage;
mod webview;

use serde::{Deserialize, Serialize};
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FillWebviewCredentialRequest {
    session_id: String,
    secret_owner_id: String,
    username: String,
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
) -> Result<storage::ConnectionTree, String> {
    storage.list_connection_groups()
}

#[tauri::command]
fn list_connection_tree(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<storage::ConnectionTree, String> {
    storage.list_connection_tree()
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
) -> Result<storage::ConnectionFolder, String> {
    storage.create_connection_folder(request)
}

#[tauri::command]
fn rename_connection_folder(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::RenameConnectionFolderRequest,
) -> Result<storage::ConnectionFolder, String> {
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
fn update_connection(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::UpdateConnectionRequest,
) -> Result<storage::SavedConnection, String> {
    storage.update_connection(request)
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
) -> Result<storage::ConnectionTree, String> {
    storage.move_connection_folder(request)
}

#[tauri::command]
fn move_connection(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::MoveConnectionRequest,
) -> Result<storage::ConnectionTree, String> {
    storage.move_connection(request)
}

#[tauri::command]
fn upsert_url_credential(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::UpsertUrlCredentialRequest,
) -> Result<storage::SavedConnection, String> {
    storage.upsert_url_credential(request)
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
fn get_ai_provider_settings(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<storage::AiProviderSettings, String> {
    storage.ai_provider_settings()
}

#[tauri::command]
fn update_ai_provider_settings(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::AiProviderSettings,
) -> Result<storage::AiProviderSettings, String> {
    storage.update_ai_provider_settings(request)
}

#[tauri::command]
fn plan_command_proposal(
    request: ai::CommandProposalRequest,
) -> Result<ai::CommandProposalPlan, String> {
    ai::plan_command_proposal(request)
}

#[tauri::command]
async fn run_ai_agent(
    storage: tauri::State<'_, storage::Storage>,
    secrets: tauri::State<'_, secrets::Secrets>,
    request: ai::AgentRunRequest,
) -> Result<ai::AgentRunResponse, String> {
    let settings = storage.ai_provider_settings()?;
    let api_key = secrets
        .read_ai_api_key("openai-compatible-provider".to_string())
        .map_err(|error| format!("failed to read AI API key: {error}"))?;
    ai::run_agent(settings, api_key, request).await
}

#[tauri::command]
fn keychain_status(secrets: tauri::State<'_, secrets::Secrets>) -> secrets::KeychainStatus {
    secrets.status()
}

#[tauri::command]
fn get_performance_snapshot(
    performance: tauri::State<'_, performance::PerformanceMonitor>,
) -> performance::PerformanceSnapshot {
    performance.snapshot()
}

#[tauri::command]
fn create_diagnostics_bundle(
    app: tauri::AppHandle,
    performance: tauri::State<'_, performance::PerformanceMonitor>,
) -> Result<diagnostics::DiagnosticsBundle, String> {
    diagnostics::create_bundle(&app, &performance)
}

#[tauri::command]
fn capture_screenshot_to_clipboard(
    app: tauri::AppHandle,
    request: screenshot::CaptureScreenshotRequest,
) -> Result<(), String> {
    screenshot::capture_rect_to_clipboard(&app, request)
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
    performance: tauri::State<'_, performance::PerformanceMonitor>,
    request: sessions::StartTerminalSessionRequest,
) -> Result<sessions::TerminalSessionStarted, String> {
    let started = sessions.start_terminal_session(app, &secrets, request)?;
    if let Some(terminal_ready_ms) = started.terminal_ready_ms() {
        performance.record_ssh_terminal_ready(terminal_ready_ms);
    }
    Ok(started)
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
fn list_tmux_sessions(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, sessions::SessionManager>,
    secrets: tauri::State<'_, secrets::Secrets>,
    request: sessions::TmuxConnectionRequest,
) -> Result<Vec<sessions::TmuxSession>, String> {
    sessions.list_tmux_sessions(app, &secrets, request)
}

#[tauri::command]
fn close_tmux_session(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, sessions::SessionManager>,
    secrets: tauri::State<'_, secrets::Secrets>,
    request: sessions::CloseTmuxSessionRequest,
) -> Result<(), String> {
    sessions.close_tmux_session(app, &secrets, request)
}

#[tauri::command]
fn set_tmux_mouse(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, sessions::SessionManager>,
    secrets: tauri::State<'_, secrets::Secrets>,
    request: sessions::SetTmuxSessionMouseRequest,
) -> Result<(), String> {
    sessions.set_tmux_session_mouse(app, &secrets, request)
}

#[tauri::command]
fn capture_tmux_pane(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, sessions::SessionManager>,
    secrets: tauri::State<'_, secrets::Secrets>,
    request: sessions::CaptureTmuxPaneRequest,
) -> Result<String, String> {
    sessions.capture_tmux_pane(app, &secrets, request)
}

#[tauri::command]
fn inspect_ssh_system_context(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, sessions::SessionManager>,
    secrets: tauri::State<'_, secrets::Secrets>,
    request: sessions::TmuxConnectionRequest,
) -> Result<String, String> {
    sessions.inspect_ssh_system_context(app, &secrets, request)
}

#[tauri::command]
fn launch_elevated_terminal(
    request: sessions::LaunchElevatedTerminalRequest,
) -> Result<(), String> {
    sessions::launch_elevated_terminal(request)
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
fn sftp_path_properties(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::SftpPathPropertiesRequest,
) -> Result<sftp::SftpPathProperties, String> {
    sftp_sessions.path_properties(request)
}

#[tauri::command]
fn update_sftp_path_properties(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::UpdateSftpPathPropertiesRequest,
) -> Result<sftp::SftpPathProperties, String> {
    sftp_sessions.update_path_properties(request)
}

#[tauri::command]
fn close_sftp_session(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    session_id: String,
) -> Result<(), String> {
    sftp_sessions.close_sftp_session(session_id)
}

#[tauri::command]
async fn start_webview_session(
    app: tauri::AppHandle,
    webviews: tauri::State<'_, webview::WebviewSessionManager>,
    request: webview::StartWebviewSessionRequest,
) -> Result<webview::WebviewSessionStarted, String> {
    webviews.start_session(&app, request)
}

#[tauri::command]
fn update_webview_bounds(
    webviews: tauri::State<'_, webview::WebviewSessionManager>,
    request: webview::UpdateWebviewBoundsRequest,
) -> Result<(), String> {
    webviews.update_bounds(request)
}

#[tauri::command]
fn set_webview_visibility(
    webviews: tauri::State<'_, webview::WebviewSessionManager>,
    request: webview::SetWebviewVisibilityRequest,
) -> Result<(), String> {
    webviews.set_visibility(request)
}

#[tauri::command]
fn webview_navigate(
    webviews: tauri::State<'_, webview::WebviewSessionManager>,
    request: webview::WebviewNavigateRequest,
) -> Result<(), String> {
    webviews.navigate(request)
}

#[tauri::command]
fn webview_reload(
    webviews: tauri::State<'_, webview::WebviewSessionManager>,
    request: webview::WebviewSimpleRequest,
) -> Result<(), String> {
    webviews.reload(request)
}

#[tauri::command]
fn webview_go_back(
    webviews: tauri::State<'_, webview::WebviewSessionManager>,
    request: webview::WebviewSimpleRequest,
) -> Result<(), String> {
    webviews.go_back(request)
}

#[tauri::command]
fn webview_go_forward(
    webviews: tauri::State<'_, webview::WebviewSessionManager>,
    request: webview::WebviewSimpleRequest,
) -> Result<(), String> {
    webviews.go_forward(request)
}

#[tauri::command]
fn fill_webview_credential(
    webviews: tauri::State<'_, webview::WebviewSessionManager>,
    secrets: tauri::State<'_, secrets::Secrets>,
    request: FillWebviewCredentialRequest,
) -> Result<(), String> {
    let username = request.username.trim().to_string();
    if username.is_empty() {
        return Err("URL credential username is required".to_string());
    }
    let password = secrets
        .read_url_password(request.secret_owner_id)
        .map_err(|error| format!("failed to read URL password: {error}"))?
        .ok_or_else(|| "stored URL password was not found".to_string())?;
    webviews.fill_credential(webview::WebviewFillCredentialRequest {
        session_id: request.session_id,
        username,
        password,
    })
}

#[tauri::command]
fn close_webview_session(
    webviews: tauri::State<'_, webview::WebviewSessionManager>,
    request: webview::WebviewSimpleRequest,
) -> Result<(), String> {
    webviews.close_session(request)
}

#[tauri::command]
fn start_rdp_session(
    app: tauri::AppHandle,
    rdp_sessions: tauri::State<'_, rdp::RdpSessionManager>,
    secrets: tauri::State<'_, secrets::Secrets>,
    mut request: rdp::StartRdpSessionRequest,
) -> Result<rdp::RdpSessionStarted, String> {
    if request.password().is_none() {
        if let Some(owner_id) = request.secret_owner_id().map(str::to_string) {
            request.set_password(
                secrets
                    .read_connection_password(owner_id)
                    .map_err(|error| format!("failed to read RDP password: {error}"))?,
            );
        }
    }
    rdp_sessions.start_session(app, request)
}

#[tauri::command]
fn update_rdp_bounds(
    app: tauri::AppHandle,
    rdp_sessions: tauri::State<'_, rdp::RdpSessionManager>,
    request: rdp::UpdateRdpBoundsRequest,
) -> Result<(), String> {
    rdp_sessions.update_bounds(app, request)
}

#[tauri::command]
fn set_rdp_visibility(
    app: tauri::AppHandle,
    rdp_sessions: tauri::State<'_, rdp::RdpSessionManager>,
    request: rdp::SetRdpVisibilityRequest,
) -> Result<(), String> {
    rdp_sessions.set_visibility(app, request)
}

#[tauri::command]
fn close_rdp_session(
    app: tauri::AppHandle,
    rdp_sessions: tauri::State<'_, rdp::RdpSessionManager>,
    request: rdp::RdpSimpleRequest,
) -> Result<(), String> {
    rdp_sessions.close_session(app, request)
}

#[tauri::command]
fn get_rdp_session_status(
    app: tauri::AppHandle,
    rdp_sessions: tauri::State<'_, rdp::RdpSessionManager>,
    request: rdp::RdpSimpleRequest,
) -> Result<rdp::RdpSessionStatus, String> {
    rdp_sessions.session_status(app, request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            app.manage(performance::PerformanceMonitor::new());
            app.manage(secrets::Secrets::new());
            app.manage(sessions::SessionManager::new());
            app.manage(sftp::SftpSessionManager::new());
            app.manage(webview::WebviewSessionManager::new());
            app.manage(rdp::RdpSessionManager::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_bootstrap,
            list_connection_groups,
            list_connection_tree,
            create_connection,
            create_connection_folder,
            rename_connection_folder,
            delete_connection_folder,
            rename_connection,
            update_connection,
            delete_connection,
            duplicate_connection,
            move_connection_folder,
            move_connection,
            upsert_url_credential,
            get_terminal_settings,
            update_terminal_settings,
            get_ssh_settings,
            update_ssh_settings,
            get_sftp_settings,
            update_sftp_settings,
            get_ai_provider_settings,
            update_ai_provider_settings,
            plan_command_proposal,
            run_ai_agent,
            keychain_status,
            get_performance_snapshot,
            create_diagnostics_bundle,
            capture_screenshot_to_clipboard,
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
            list_tmux_sessions,
            close_tmux_session,
            set_tmux_mouse,
            capture_tmux_pane,
            inspect_ssh_system_context,
            launch_elevated_terminal,
            start_sftp_session,
            list_sftp_directory,
            list_local_directory,
            upload_sftp_path,
            download_sftp_path,
            cancel_sftp_transfer,
            create_sftp_folder,
            rename_sftp_path,
            delete_sftp_path,
            sftp_path_properties,
            update_sftp_path_properties,
            close_sftp_session,
            start_webview_session,
            update_webview_bounds,
            set_webview_visibility,
            webview_navigate,
            webview_reload,
            webview_go_back,
            webview_go_forward,
            fill_webview_credential,
            close_webview_session,
            start_rdp_session,
            update_rdp_bounds,
            set_rdp_visibility,
            close_rdp_session,
            get_rdp_session_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running AdminDeck");
}

fn setup_error(message: String) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message))
}
