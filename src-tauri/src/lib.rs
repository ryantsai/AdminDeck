mod ai;
mod diagnostics;
mod logging;
mod performance;
mod rdp;
mod screenshot;
mod secrets;
mod serial;
mod sessions;
mod sftp;
mod ssh;
mod ssh_config;
mod storage;
mod telnet;
mod vnc;
mod webview;
mod window_state;

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
fn get_general_settings(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<storage::GeneralSettings, String> {
    storage.general_settings()
}

#[tauri::command]
fn update_general_settings(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::GeneralSettings,
) -> Result<storage::GeneralSettings, String> {
    storage.update_general_settings(request)
}

#[tauri::command]
fn export_settings_database(
    storage: tauri::State<'_, storage::Storage>,
    path: String,
) -> Result<(), String> {
    storage.export_database_zip(path.into())
}

#[tauri::command]
fn import_settings_database(
    storage: tauri::State<'_, storage::Storage>,
    path: String,
) -> Result<storage::ImportedDatabaseSnapshot, String> {
    storage.import_database_zip(path.into())
}

#[tauri::command]
fn backup_settings_database(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<storage::DatabaseBackupInfo, String> {
    storage.backup_database()
}

#[tauri::command]
fn prepare_main_window_for_quit(
    window: tauri::Window,
    storage: tauri::State<'_, storage::Storage>,
    window_tracker: tauri::State<'_, window_state::MainWindowState>,
) -> Result<(), String> {
    let settings = window_tracker.snapshot_for_window(&window);
    storage.update_main_window_settings(settings)?;
    storage.backup_if_enabled_for_quit()?;
    Ok(())
}

#[tauri::command]
fn update_terminal_settings(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::TerminalSettings,
) -> Result<storage::TerminalSettings, String> {
    storage.update_terminal_settings(request)
}

#[tauri::command]
fn get_appearance_settings(
    storage: tauri::State<'_, storage::Storage>,
) -> Result<storage::AppearanceSettings, String> {
    storage.appearance_settings()
}

#[tauri::command]
fn update_appearance_settings(
    storage: tauri::State<'_, storage::Storage>,
    request: storage::AppearanceSettings,
) -> Result<storage::AppearanceSettings, String> {
    storage.update_appearance_settings(request)
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
fn capture_screenshot_for_assistant(
    app: tauri::AppHandle,
    request: screenshot::CaptureScreenshotRequest,
) -> Result<screenshot::AssistantScreenshot, String> {
    screenshot::capture_rect_for_assistant(&app, request)
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
async fn start_terminal_session(
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
async fn list_tmux_sessions(
    app: tauri::AppHandle,
    request: sessions::TmuxConnectionRequest,
) -> Result<Vec<sessions::TmuxSession>, String> {
    run_blocking_command("tmux list sessions", move || {
        let sessions = app.state::<sessions::SessionManager>();
        let secrets = app.state::<secrets::Secrets>();
        sessions.list_tmux_sessions(app.clone(), &secrets, request)
    })
    .await
}

#[tauri::command]
async fn close_tmux_session(
    app: tauri::AppHandle,
    request: sessions::CloseTmuxSessionRequest,
) -> Result<(), String> {
    run_blocking_command("tmux close session", move || {
        let sessions = app.state::<sessions::SessionManager>();
        let secrets = app.state::<secrets::Secrets>();
        sessions.close_tmux_session(app.clone(), &secrets, request)
    })
    .await
}

#[tauri::command]
async fn set_tmux_mouse(
    app: tauri::AppHandle,
    request: sessions::SetTmuxSessionMouseRequest,
) -> Result<(), String> {
    run_blocking_command("tmux set mouse", move || {
        let sessions = app.state::<sessions::SessionManager>();
        let secrets = app.state::<secrets::Secrets>();
        sessions.set_tmux_session_mouse(app.clone(), &secrets, request)
    })
    .await
}

#[tauri::command]
async fn capture_tmux_pane(
    app: tauri::AppHandle,
    request: sessions::CaptureTmuxPaneRequest,
) -> Result<String, String> {
    run_blocking_command("tmux capture pane", move || {
        let sessions = app.state::<sessions::SessionManager>();
        let secrets = app.state::<secrets::Secrets>();
        sessions.capture_tmux_pane(app.clone(), &secrets, request)
    })
    .await
}

#[tauri::command]
async fn inspect_ssh_system_context(
    app: tauri::AppHandle,
    request: sessions::TmuxConnectionRequest,
) -> Result<String, String> {
    run_blocking_command("SSH system context inspection", move || {
        let sessions = app.state::<sessions::SessionManager>();
        let secrets = app.state::<secrets::Secrets>();
        sessions.inspect_ssh_system_context(app.clone(), &secrets, request)
    })
    .await
}

#[tauri::command]
fn launch_elevated_terminal(
    request: sessions::LaunchElevatedTerminalRequest,
) -> Result<(), String> {
    sessions::launch_elevated_terminal(request)
}

async fn run_blocking_command<T, F>(label: &'static str, job: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|error| format!("{label} worker failed: {error}"))?
}

#[tauri::command]
async fn start_sftp_session(
    app: tauri::AppHandle,
    request: sftp::StartSftpSessionRequest,
) -> Result<sftp::SftpSessionStarted, String> {
    let worker_app = app.clone();
    run_blocking_command("SFTP startup", move || {
        let sftp_sessions = worker_app.state::<sftp::SftpSessionManager>();
        let secrets = worker_app.state::<secrets::Secrets>();
        sftp_sessions.start_sftp_session(worker_app.clone(), &secrets, request)
    })
    .await
}

#[tauri::command]
async fn list_sftp_directory(
    app: tauri::AppHandle,
    request: sftp::ListSftpDirectoryRequest,
) -> Result<sftp::SftpDirectoryListing, String> {
    run_blocking_command("SFTP list directory", move || {
        let sftp_sessions = app.state::<sftp::SftpSessionManager>();
        sftp_sessions.list_directory(request)
    })
    .await
}

#[tauri::command]
fn list_local_directory(
    request: sftp::ListLocalDirectoryRequest,
) -> Result<sftp::LocalDirectoryListing, String> {
    sftp::list_local_directory(request)
}

#[tauri::command]
async fn upload_sftp_path(
    app: tauri::AppHandle,
    request: sftp::UploadSftpPathRequest,
) -> Result<sftp::SftpTransferResult, String> {
    let worker_app = app.clone();
    run_blocking_command("SFTP upload", move || {
        let sftp_sessions = worker_app.state::<sftp::SftpSessionManager>();
        sftp_sessions.upload_path(worker_app.clone(), request)
    })
    .await
}

#[tauri::command]
async fn download_sftp_path(
    app: tauri::AppHandle,
    request: sftp::DownloadSftpPathRequest,
) -> Result<sftp::SftpTransferResult, String> {
    let worker_app = app.clone();
    run_blocking_command("SFTP download", move || {
        let sftp_sessions = worker_app.state::<sftp::SftpSessionManager>();
        sftp_sessions.download_path(worker_app.clone(), request)
    })
    .await
}

#[tauri::command]
fn cancel_sftp_transfer(
    sftp_sessions: tauri::State<'_, sftp::SftpSessionManager>,
    request: sftp::CancelSftpTransferRequest,
) -> Result<(), String> {
    sftp_sessions.cancel_transfer(request)
}

#[tauri::command]
async fn create_sftp_folder(
    app: tauri::AppHandle,
    request: sftp::CreateSftpFolderRequest,
) -> Result<(), String> {
    run_blocking_command("SFTP create folder", move || {
        let sftp_sessions = app.state::<sftp::SftpSessionManager>();
        sftp_sessions.create_folder(request)
    })
    .await
}

#[tauri::command]
async fn rename_sftp_path(
    app: tauri::AppHandle,
    request: sftp::RenameSftpPathRequest,
) -> Result<(), String> {
    run_blocking_command("SFTP rename", move || {
        let sftp_sessions = app.state::<sftp::SftpSessionManager>();
        sftp_sessions.rename_path(request)
    })
    .await
}

#[tauri::command]
async fn delete_sftp_path(
    app: tauri::AppHandle,
    request: sftp::DeleteSftpPathRequest,
) -> Result<(), String> {
    run_blocking_command("SFTP delete", move || {
        let sftp_sessions = app.state::<sftp::SftpSessionManager>();
        sftp_sessions.delete_path(request)
    })
    .await
}

#[tauri::command]
async fn sftp_path_properties(
    app: tauri::AppHandle,
    request: sftp::SftpPathPropertiesRequest,
) -> Result<sftp::SftpPathProperties, String> {
    run_blocking_command("SFTP properties", move || {
        let sftp_sessions = app.state::<sftp::SftpSessionManager>();
        sftp_sessions.path_properties(request)
    })
    .await
}

#[tauri::command]
async fn update_sftp_path_properties(
    app: tauri::AppHandle,
    request: sftp::UpdateSftpPathPropertiesRequest,
) -> Result<sftp::SftpPathProperties, String> {
    run_blocking_command("SFTP update properties", move || {
        let sftp_sessions = app.state::<sftp::SftpSessionManager>();
        sftp_sessions.update_path_properties(request)
    })
    .await
}

#[tauri::command]
async fn close_sftp_session(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    run_blocking_command("SFTP close", move || {
        let sftp_sessions = app.state::<sftp::SftpSessionManager>();
        sftp_sessions.close_sftp_session(session_id)
    })
    .await
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
async fn start_rdp_session(
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
fn sync_rdp_display_size(
    app: tauri::AppHandle,
    rdp_sessions: tauri::State<'_, rdp::RdpSessionManager>,
    request: rdp::SyncRdpDisplaySizeRequest,
) -> Result<rdp::RdpDisplaySizeSync, String> {
    rdp_sessions.sync_display_size(app, request)
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

#[tauri::command]
fn send_rdp_ctrl_alt_delete(
    app: tauri::AppHandle,
    rdp_sessions: tauri::State<'_, rdp::RdpSessionManager>,
    request: rdp::RdpSimpleRequest,
) -> Result<(), String> {
    rdp_sessions.send_ctrl_alt_delete(app, request)
}

#[tauri::command]
fn start_vnc_session(
    app: tauri::AppHandle,
    vnc_sessions: tauri::State<'_, vnc::VncSessionManager>,
    secrets: tauri::State<'_, secrets::Secrets>,
    mut request: vnc::StartVncSessionRequest,
) -> Result<vnc::VncSessionStarted, String> {
    if request.password().is_none() {
        if let Some(owner_id) = request.secret_owner_id().map(str::to_string) {
            request.set_password(
                secrets
                    .read_connection_password(owner_id)
                    .map_err(|error| format!("failed to read VNC password: {error}"))?,
            );
        }
    }
    vnc_sessions.start_session(app, request)
}

#[tauri::command]
fn send_vnc_pointer_event(
    vnc_sessions: tauri::State<'_, vnc::VncSessionManager>,
    request: vnc::VncPointerEventRequest,
) -> Result<(), String> {
    vnc_sessions.pointer_event(request)
}

#[tauri::command]
fn send_vnc_key_event(
    vnc_sessions: tauri::State<'_, vnc::VncSessionManager>,
    request: vnc::VncKeyEventRequest,
) -> Result<(), String> {
    vnc_sessions.key_event(request)
}

#[tauri::command]
fn refresh_vnc_session(
    vnc_sessions: tauri::State<'_, vnc::VncSessionManager>,
    request: vnc::VncSimpleRequest,
) -> Result<(), String> {
    vnc_sessions.refresh(request)
}

#[tauri::command]
fn close_vnc_session(
    vnc_sessions: tauri::State<'_, vnc::VncSessionManager>,
    request: vnc::VncSimpleRequest,
) -> Result<(), String> {
    vnc_sessions.close_session(request)
}

#[tauri::command]
fn get_vnc_session_status(
    vnc_sessions: tauri::State<'_, vnc::VncSessionManager>,
    request: vnc::VncSimpleRequest,
) -> Result<vnc::VncSessionStatus, String> {
    vnc_sessions.session_status(request)
}

#[tauri::command]
fn send_vnc_ctrl_alt_delete(
    vnc_sessions: tauri::State<'_, vnc::VncSessionManager>,
    request: vnc::VncSimpleRequest,
) -> Result<(), String> {
    vnc_sessions.send_ctrl_alt_delete(request)
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
            let main_window_settings = storage.main_window_settings().map_err(setup_error)?;
            if let Some(main_window) = app.get_window(window_state::MAIN_WINDOW_LABEL) {
                let initial_window_settings =
                    window_state::restore_main_window(&main_window, main_window_settings);
                app.manage(window_state::MainWindowState::new(initial_window_settings));
            }
            app.manage(storage);
            app.manage(performance::PerformanceMonitor::new());
            app.manage(secrets::Secrets::new());
            app.manage(sessions::SessionManager::new());
            app.manage(sftp::SftpSessionManager::new());
            app.manage(webview::WebviewSessionManager::new());
            app.manage(rdp::RdpSessionManager::new());
            app.manage(vnc::VncSessionManager::new());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != window_state::MAIN_WINDOW_LABEL {
                return;
            }

            if let Some(window_tracker) = window.try_state::<window_state::MainWindowState>() {
                match event {
                    tauri::WindowEvent::Resized(size) => {
                        if !window.is_maximized().unwrap_or(false) {
                            window_tracker.update_normal_size(*size);
                        }
                    }
                    tauri::WindowEvent::CloseRequested { .. } => {}
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_bootstrap,
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
            get_general_settings,
            update_general_settings,
            export_settings_database,
            import_settings_database,
            backup_settings_database,
            prepare_main_window_for_quit,
            get_terminal_settings,
            update_terminal_settings,
            get_appearance_settings,
            update_appearance_settings,
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
            capture_screenshot_for_assistant,
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
            sync_rdp_display_size,
            close_rdp_session,
            get_rdp_session_status,
            send_rdp_ctrl_alt_delete,
            start_vnc_session,
            send_vnc_pointer_event,
            send_vnc_key_event,
            refresh_vnc_session,
            close_vnc_session,
            get_vnc_session_status,
            send_vnc_ctrl_alt_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running AdminDeck");
}

fn setup_error(message: String) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message))
}
