use crate::{secrets, ssh};
use russh::{client, Disconnect};
use russh_sftp::{
    client::{fs::Metadata, SftpSession},
    protocol::{FileAttributes, FileType, OpenFlags},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    future::Future,
    io::{Read, Write},
    path::{Path, PathBuf},
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::runtime::Runtime;

const TRANSFER_CHUNK_SIZE: usize = 64 * 1024;
const TRANSFER_CANCELED: &str = "transfer canceled";

pub struct SftpSessionManager {
    sessions: std::sync::Mutex<HashMap<String, SftpConnection>>,
    transfers: std::sync::Mutex<HashMap<String, Arc<AtomicBool>>>,
}

struct SftpConnection {
    runtime: Runtime,
    ssh_session: client::Handle<ssh::VerifyingClient>,
    sftp: SftpSession,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSftpSessionRequest {
    pub session_id: Option<String>,
    pub title: String,
    pub host: String,
    pub user: String,
    pub port: Option<u16>,
    pub key_path: Option<String>,
    pub proxy_jump: Option<String>,
    pub auth_method: Option<String>,
    pub secret_owner_id: Option<String>,
    pub path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSftpDirectoryRequest {
    session_id: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListLocalDirectoryRequest {
    path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadSftpPathRequest {
    session_id: String,
    transfer_id: String,
    local_path: String,
    remote_directory: String,
    overwrite_behavior: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSftpPathRequest {
    session_id: String,
    transfer_id: String,
    remote_path: String,
    local_directory: String,
    overwrite_behavior: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelSftpTransferRequest {
    transfer_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSftpFolderRequest {
    session_id: String,
    parent_path: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameSftpPathRequest {
    session_id: String,
    path: String,
    new_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSftpPathRequest {
    session_id: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpPathPropertiesRequest {
    session_id: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSftpPathPropertiesRequest {
    session_id: String,
    path: String,
    permissions: Option<String>,
    uid: Option<u32>,
    gid: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpSessionStarted {
    session_id: String,
    path: String,
    entries: Vec<SftpDirectoryEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpDirectoryListing {
    session_id: String,
    path: String,
    entries: Vec<SftpDirectoryEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirectoryListing {
    path: String,
    entries: Vec<LocalDirectoryEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpDirectoryEntry {
    name: String,
    kind: String,
    size: Option<u64>,
    modified: Option<u64>,
    accessed: Option<u64>,
    permissions: Option<u32>,
    uid: Option<u32>,
    user: Option<String>,
    gid: Option<u32>,
    group: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirectoryEntry {
    name: String,
    kind: String,
    size: Option<u64>,
    modified: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpTransferResult {
    name: String,
    files: u64,
    folders: u64,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpPathProperties {
    path: String,
    name: String,
    kind: String,
    size: Option<u64>,
    modified: Option<u64>,
    accessed: Option<u64>,
    permissions: Option<u32>,
    mode: Option<String>,
    uid: Option<u32>,
    user: Option<String>,
    gid: Option<u32>,
    group: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpTransferProgress {
    transfer_id: String,
    transferred_bytes: u64,
    total_bytes: u64,
    progress: u8,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SftpAuthMethod {
    KeyFile,
    Password,
    Agent,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SftpOverwriteBehavior {
    Fail,
    Overwrite,
}

struct RemoteUploadTarget {
    flags: OpenFlags,
    existed: bool,
}

impl SftpSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: std::sync::Mutex::new(HashMap::new()),
            transfers: std::sync::Mutex::new(HashMap::new()),
        }
    }

    pub fn start_sftp_session(
        &self,
        app: AppHandle,
        secrets: &secrets::Secrets,
        request: StartSftpSessionRequest,
    ) -> Result<SftpSessionStarted, String> {
        if request
            .proxy_jump
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
        {
            return Err("native SFTP sessions do not support ProxyJump yet".to_string());
        }

        let session_id = request
            .session_id
            .clone()
            .unwrap_or_else(|| make_session_id(&request.title));
        let path = request
            .path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(".")
            .to_string();
        let auth = auth_for(secrets, &request)?;
        let known_hosts_path = ssh::app_known_hosts_path(&app)?;
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| format!("failed to create SFTP runtime: {error}"))?;

        let host = request.host.clone();
        let user = request.user.clone();
        let port = request.port.unwrap_or(22);
        let (ssh_session, sftp, listing) = runtime.block_on(async {
            let ssh_session = ssh::connect_verified_client(ssh::NativeSshConnectionRequest {
                host,
                user,
                port,
                auth,
                known_hosts_path,
            })
            .await?;

            let channel = ssh_session
                .channel_open_session()
                .await
                .map_err(|error| format!("failed to open SFTP SSH channel: {error}"))?;
            channel
                .request_subsystem(true, "sftp")
                .await
                .map_err(|error| format!("failed to start SFTP subsystem: {error}"))?;
            let sftp = SftpSession::new(channel.into_stream())
                .await
                .map_err(|error| format!("failed to initialize SFTP session: {error}"))?;
            let listing = read_directory(&sftp, &session_id, &path).await?;
            Ok::<_, String>((ssh_session, sftp, listing))
        })?;

        self.sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?
            .insert(
                session_id.clone(),
                SftpConnection {
                    runtime,
                    ssh_session,
                    sftp,
                },
            );

        Ok(SftpSessionStarted {
            session_id,
            path: listing.path,
            entries: listing.entries,
        })
    }

    pub fn list_directory(
        &self,
        request: ListSftpDirectoryRequest,
    ) -> Result<SftpDirectoryListing, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        session.runtime.block_on(read_directory(
            &session.sftp,
            &request.session_id,
            &request.path,
        ))
    }

    pub fn upload_path(
        &self,
        app: AppHandle,
        request: UploadSftpPathRequest,
    ) -> Result<SftpTransferResult, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        let overwrite_behavior =
            normalize_sftp_overwrite_behavior(request.overwrite_behavior.as_deref())?;
        let cancellation = self.register_transfer(&request.transfer_id)?;
        let result = session.runtime.block_on(upload_path(
            &session.sftp,
            app,
            &request.transfer_id,
            cancellation,
            overwrite_behavior,
            &request.local_path,
            &request.remote_directory,
        ));
        self.finish_transfer(&request.transfer_id);
        result
    }

    pub fn download_path(
        &self,
        app: AppHandle,
        request: DownloadSftpPathRequest,
    ) -> Result<SftpTransferResult, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        let overwrite_behavior =
            normalize_sftp_overwrite_behavior(request.overwrite_behavior.as_deref())?;
        let cancellation = self.register_transfer(&request.transfer_id)?;
        let result = session.runtime.block_on(download_path(
            &session.sftp,
            app,
            &request.transfer_id,
            cancellation,
            overwrite_behavior,
            &request.remote_path,
            &request.local_directory,
        ));
        self.finish_transfer(&request.transfer_id);
        result
    }

    pub fn cancel_transfer(&self, request: CancelSftpTransferRequest) -> Result<(), String> {
        if let Some(cancellation) = self
            .transfers
            .lock()
            .map_err(|_| "SFTP transfer lock is poisoned".to_string())?
            .get(&request.transfer_id)
        {
            cancellation.store(true, Ordering::SeqCst);
        }
        Ok(())
    }

    pub fn create_folder(&self, request: CreateSftpFolderRequest) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        session.runtime.block_on(create_folder(
            &session.sftp,
            &request.parent_path,
            &request.name,
        ))
    }

    pub fn rename_path(&self, request: RenameSftpPathRequest) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        session
            .runtime
            .block_on(rename_path(&session.sftp, &request.path, &request.new_name))
    }

    pub fn delete_path(&self, request: DeleteSftpPathRequest) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        session
            .runtime
            .block_on(delete_remote_entry(&session.sftp, &request.path))
    }

    pub fn path_properties(
        &self,
        request: SftpPathPropertiesRequest,
    ) -> Result<SftpPathProperties, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        session
            .runtime
            .block_on(path_properties(&session.sftp, &request.path))
    }

    pub fn update_path_properties(
        &self,
        request: UpdateSftpPathPropertiesRequest,
    ) -> Result<SftpPathProperties, String> {
        let permissions = match request.permissions.as_deref() {
            Some(value) => Some(parse_octal_permissions(value)?),
            None => None,
        };
        if permissions.is_none() && request.uid.is_none() && request.gid.is_none() {
            return Err("at least one SFTP property must be changed".to_string());
        }

        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        session.runtime.block_on(async {
            update_path_properties(
                &session.sftp,
                &request.path,
                permissions,
                request.uid,
                request.gid,
            )
            .await?;
            path_properties(&session.sftp, &request.path).await
        })
    }

    pub fn close_sftp_session(&self, session_id: String) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?
            .remove(&session_id);
        if let Some(session) = session {
            let _ = session.runtime.block_on(async {
                let _ = session.sftp.close().await;
                session
                    .ssh_session
                    .disconnect(Disconnect::ByApplication, "", "en")
                    .await
            });
        }
        Ok(())
    }

    fn register_transfer(&self, transfer_id: &str) -> Result<Arc<AtomicBool>, String> {
        let transfer_id = transfer_id.trim();
        if transfer_id.is_empty() {
            return Err("SFTP transfer id cannot be blank".to_string());
        }

        let cancellation = Arc::new(AtomicBool::new(false));
        self.transfers
            .lock()
            .map_err(|_| "SFTP transfer lock is poisoned".to_string())?
            .insert(transfer_id.to_string(), cancellation.clone());
        Ok(cancellation)
    }

    fn finish_transfer(&self, transfer_id: &str) {
        if let Ok(mut transfers) = self.transfers.lock() {
            transfers.remove(transfer_id);
        }
    }
}

async fn upload_path(
    sftp: &SftpSession,
    app: AppHandle,
    transfer_id: &str,
    cancellation: Arc<AtomicBool>,
    overwrite_behavior: SftpOverwriteBehavior,
    local_path: &str,
    remote_directory: &str,
) -> Result<SftpTransferResult, String> {
    let source = fs::canonicalize(local_path)
        .map_err(|error| format!("failed to resolve local source: {error}"))?;
    let name = local_path_name(&source)?;
    let remote_target = join_remote_path(remote_directory, &name);
    let total_bytes = local_transfer_size(&source)?;
    let mut progress = TransferProgress::new(app, transfer_id, cancellation, total_bytes);
    progress.emit();

    let mut summary = TransferSummary {
        name,
        ..TransferSummary::default()
    };
    upload_local_entry(
        sftp,
        &source,
        &remote_target,
        overwrite_behavior,
        &mut summary,
        &mut progress,
    )
    .await?;
    Ok(summary.into_result())
}

async fn download_path(
    sftp: &SftpSession,
    app: AppHandle,
    transfer_id: &str,
    cancellation: Arc<AtomicBool>,
    overwrite_behavior: SftpOverwriteBehavior,
    remote_path: &str,
    local_directory: &str,
) -> Result<SftpTransferResult, String> {
    let local_directory = resolve_local_directory(Some(local_directory))?;
    let remote_path = normalize_path(remote_path);
    let name = remote_path_name(&remote_path)?;
    let local_target = local_directory.join(&name);
    let total_bytes = remote_transfer_size(sftp, &remote_path).await?;
    let mut progress = TransferProgress::new(app, transfer_id, cancellation, total_bytes);
    progress.emit();

    let mut summary = TransferSummary {
        name,
        ..TransferSummary::default()
    };
    download_remote_entry(
        sftp,
        &remote_path,
        &local_target,
        overwrite_behavior,
        &mut summary,
        &mut progress,
    )
    .await?;
    Ok(summary.into_result())
}

async fn create_folder(sftp: &SftpSession, parent_path: &str, name: &str) -> Result<(), String> {
    let name = validate_remote_child_name(name)?;
    let target = join_remote_path(parent_path, &name);
    ensure_remote_missing(sftp, &target).await?;
    sftp.create_dir(target)
        .await
        .map_err(|error| format!("failed to create remote folder: {error}"))
}

async fn rename_path(sftp: &SftpSession, path: &str, new_name: &str) -> Result<(), String> {
    let source = normalize_mutable_remote_path(path)?;
    let new_name = validate_remote_child_name(new_name)?;
    let target = join_remote_path(&remote_parent_path(&source), &new_name);
    ensure_remote_missing(sftp, &target).await?;
    sftp.rename(source, target)
        .await
        .map_err(|error| format!("failed to rename remote path: {error}"))
}

fn delete_remote_entry<'a>(
    sftp: &'a SftpSession,
    path: &'a str,
) -> Pin<Box<dyn Future<Output = Result<(), String>> + 'a>> {
    Box::pin(async move {
        let path = normalize_mutable_remote_path(path)?;
        let metadata = sftp
            .symlink_metadata(path.clone())
            .await
            .map_err(|error| format!("failed to inspect remote path: {error}"))?;
        if metadata.file_type() == FileType::Dir {
            let entries = sftp
                .read_dir(path.clone())
                .await
                .map_err(|error| format!("failed to read remote folder: {error}"))?
                .map(|entry| entry.file_name())
                .filter(|name| name != "." && name != "..")
                .collect::<Vec<_>>();
            for child_name in entries {
                let child_path = join_remote_path(&path, &child_name);
                delete_remote_entry(sftp, &child_path).await?;
            }
            sftp.remove_dir(path)
                .await
                .map_err(|error| format!("failed to delete remote folder: {error}"))?;
            return Ok(());
        }

        sftp.remove_file(path)
            .await
            .map_err(|error| format!("failed to delete remote file: {error}"))
    })
}

fn upload_local_entry<'a>(
    sftp: &'a SftpSession,
    local_path: &'a Path,
    remote_path: &'a str,
    overwrite_behavior: SftpOverwriteBehavior,
    summary: &'a mut TransferSummary,
    progress: &'a mut TransferProgress,
) -> Pin<Box<dyn Future<Output = Result<(), String>> + 'a>> {
    Box::pin(async move {
        progress.check_cancelled()?;
        let metadata = fs::metadata(local_path)
            .map_err(|error| format!("failed to inspect local source: {error}"))?;
        if metadata.is_dir() {
            prepare_remote_upload_directory(sftp, remote_path, overwrite_behavior).await?;
            summary.folders += 1;
            let mut children = fs::read_dir(local_path)
                .map_err(|error| format!("failed to read local folder: {error}"))?
                .filter_map(|entry| entry.ok())
                .collect::<Vec<_>>();
            children.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
            for child in children {
                let child_name = child.file_name().to_string_lossy().to_string();
                let child_path = child.path();
                let child_remote_path = join_remote_path(remote_path, &child_name);
                upload_local_entry(
                    sftp,
                    &child_path,
                    &child_remote_path,
                    overwrite_behavior,
                    summary,
                    progress,
                )
                .await?;
            }
            return Ok(());
        }

        if !metadata.is_file() {
            return Err("only local files and folders can be uploaded".to_string());
        }

        let target = remote_upload_target(sftp, remote_path, overwrite_behavior).await?;
        let mut file = sftp
            .open_with_flags(remote_path.to_string(), target.flags)
            .await
            .map_err(|error| format!("failed to create remote file: {error}"))?;
        let upload_result =
            upload_file_chunks(&mut file, local_path, metadata.len(), summary, progress).await;
        if upload_result
            .as_ref()
            .is_err_and(|error| is_transfer_canceled(error))
        {
            let _ = file.shutdown().await;
            if !target.existed {
                let _ = sftp.remove_file(remote_path.to_string()).await;
            }
            return upload_result;
        }
        upload_result?;
        summary.files += 1;
        Ok(())
    })
}

async fn upload_file_chunks(
    remote_file: &mut russh_sftp::client::fs::File,
    local_path: &Path,
    file_size: u64,
    summary: &mut TransferSummary,
    progress: &mut TransferProgress,
) -> Result<(), String> {
    let mut local_file = fs::File::open(local_path)
        .map_err(|error| format!("failed to read local file: {error}"))?;
    let mut buffer = vec![0; TRANSFER_CHUNK_SIZE];
    loop {
        progress.check_cancelled()?;
        let read = local_file
            .read(&mut buffer)
            .map_err(|error| format!("failed to read local file: {error}"))?;
        if read == 0 {
            break;
        }
        remote_file
            .write_all(&buffer[..read])
            .await
            .map_err(|error| format!("failed to upload remote file: {error}"))?;
        summary.bytes += read as u64;
        progress.add_bytes(read as u64);
    }
    remote_file
        .shutdown()
        .await
        .map_err(|error| format!("failed to finish remote upload: {error}"))?;
    if file_size == 0 {
        progress.emit();
    }
    Ok(())
}

fn download_remote_entry<'a>(
    sftp: &'a SftpSession,
    remote_path: &'a str,
    local_path: &'a Path,
    overwrite_behavior: SftpOverwriteBehavior,
    summary: &'a mut TransferSummary,
    progress: &'a mut TransferProgress,
) -> Pin<Box<dyn Future<Output = Result<(), String>> + 'a>> {
    Box::pin(async move {
        progress.check_cancelled()?;
        let metadata = sftp
            .metadata(remote_path.to_string())
            .await
            .map_err(|error| format!("failed to inspect remote source: {error}"))?;
        match metadata.file_type() {
            FileType::Dir => {
                prepare_local_download_directory(local_path, overwrite_behavior)?;
                summary.folders += 1;
                let mut entries = sftp
                    .read_dir(remote_path.to_string())
                    .await
                    .map_err(|error| format!("failed to read remote folder: {error}"))?
                    .map(|entry| entry.file_name())
                    .filter(|name| name != "." && name != "..")
                    .collect::<Vec<_>>();
                entries.sort_by_key(|name| name.to_lowercase());
                for child_name in entries {
                    let child_remote_path = join_remote_path(remote_path, &child_name);
                    let child_local_path = local_path.join(&child_name);
                    download_remote_entry(
                        sftp,
                        &child_remote_path,
                        &child_local_path,
                        overwrite_behavior,
                        summary,
                        progress,
                    )
                    .await?;
                }
                Ok(())
            }
            FileType::File => {
                let target_existed = prepare_local_download_file(local_path, overwrite_behavior)?;
                let mut remote_file = sftp
                    .open(remote_path.to_string())
                    .await
                    .map_err(|error| format!("failed to download remote file: {error}"))?;
                let download_result = download_file_chunks(
                    &mut remote_file,
                    local_path,
                    overwrite_behavior,
                    summary,
                    progress,
                )
                .await;
                if download_result
                    .as_ref()
                    .is_err_and(|error| is_transfer_canceled(error))
                {
                    let _ = remote_file.shutdown().await;
                    if !target_existed {
                        let _ = fs::remove_file(local_path);
                    }
                    return download_result;
                }
                download_result?;
                summary.files += 1;
                Ok(())
            }
            _ => Err("only remote files and folders can be downloaded".to_string()),
        }
    })
}

async fn download_file_chunks(
    remote_file: &mut russh_sftp::client::fs::File,
    local_path: &Path,
    overwrite_behavior: SftpOverwriteBehavior,
    summary: &mut TransferSummary,
    progress: &mut TransferProgress,
) -> Result<(), String> {
    let mut open_options = fs::OpenOptions::new();
    open_options.write(true);
    if overwrite_behavior == SftpOverwriteBehavior::Overwrite {
        open_options.create(true).truncate(true);
    } else {
        open_options.create_new(true);
    }
    let mut local_file = open_options
        .open(local_path)
        .map_err(|error| format!("failed to create local file: {error}"))?;
    let mut buffer = vec![0; TRANSFER_CHUNK_SIZE];
    loop {
        progress.check_cancelled()?;
        let read = remote_file
            .read(&mut buffer)
            .await
            .map_err(|error| format!("failed to download remote file: {error}"))?;
        if read == 0 {
            break;
        }
        local_file
            .write_all(&buffer[..read])
            .map_err(|error| format!("failed to write local file: {error}"))?;
        summary.bytes += read as u64;
        progress.add_bytes(read as u64);
    }
    local_file
        .flush()
        .map_err(|error| format!("failed to finish local download: {error}"))?;
    let _ = remote_file.shutdown().await;
    Ok(())
}

pub fn list_local_directory(
    request: ListLocalDirectoryRequest,
) -> Result<LocalDirectoryListing, String> {
    let directory = resolve_local_directory(request.path.as_deref())?;
    let mut entries = fs::read_dir(&directory)
        .map_err(|error| format!("failed to list local directory: {error}"))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            let file_type = entry.file_type().ok()?;
            Some(LocalDirectoryEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                kind: local_file_kind(&file_type).to_string(),
                size: if metadata.is_file() {
                    Some(metadata.len())
                } else {
                    None
                },
                modified: metadata
                    .modified()
                    .ok()
                    .and_then(|time| unix_timestamp(time).ok()),
            })
        })
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| {
        file_kind_rank(&left.kind)
            .cmp(&file_kind_rank(&right.kind))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(LocalDirectoryListing {
        path: display_local_path(&directory),
        entries,
    })
}

async fn read_directory(
    sftp: &SftpSession,
    session_id: &str,
    path: &str,
) -> Result<SftpDirectoryListing, String> {
    let path = normalize_path(path);
    let canonical_path = sftp
        .canonicalize(path)
        .await
        .map_err(|error| format!("failed to resolve SFTP directory: {error}"))?;
    let mut entries = sftp
        .read_dir(canonical_path.clone())
        .await
        .map_err(|error| format!("failed to list SFTP directory: {error}"))?
        .map(|entry| {
            let metadata = entry.metadata();
            SftpDirectoryEntry {
                name: entry.file_name(),
                kind: file_kind(metadata.file_type()).to_string(),
                size: metadata.size,
                modified: metadata
                    .modified()
                    .ok()
                    .and_then(|time| unix_timestamp(time).ok()),
                accessed: metadata
                    .accessed()
                    .ok()
                    .and_then(|time| unix_timestamp(time).ok()),
                permissions: metadata.permissions.map(sftp_file_mode),
                uid: metadata.uid,
                user: metadata.user,
                gid: metadata.gid,
                group: metadata.group,
            }
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        file_kind_rank(&left.kind)
            .cmp(&file_kind_rank(&right.kind))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(SftpDirectoryListing {
        session_id: session_id.to_string(),
        path: canonical_path,
        entries,
    })
}

async fn path_properties(sftp: &SftpSession, path: &str) -> Result<SftpPathProperties, String> {
    let path = normalize_path(path);
    let metadata = sftp
        .symlink_metadata(path.clone())
        .await
        .map_err(|error| format!("failed to read SFTP properties: {error}"))?;
    Ok(properties_from_metadata(path, metadata))
}

async fn update_path_properties(
    sftp: &SftpSession,
    path: &str,
    permissions: Option<u32>,
    uid: Option<u32>,
    gid: Option<u32>,
) -> Result<(), String> {
    let path = normalize_path(path);
    let mut attrs = FileAttributes::empty();
    attrs.permissions = permissions;
    attrs.uid = uid;
    attrs.gid = gid;
    sftp.set_metadata(path, attrs)
        .await
        .map_err(|error| format!("failed to update SFTP properties: {error}"))
}

fn properties_from_metadata(path: String, metadata: Metadata) -> SftpPathProperties {
    let permissions = metadata.permissions.map(sftp_file_mode);
    SftpPathProperties {
        name: display_remote_path_name(&path),
        path,
        kind: file_kind(metadata.file_type()).to_string(),
        size: metadata.size,
        modified: metadata
            .modified()
            .ok()
            .and_then(|time| unix_timestamp(time).ok()),
        accessed: metadata
            .accessed()
            .ok()
            .and_then(|time| unix_timestamp(time).ok()),
        permissions,
        mode: permissions.map(format_octal_permissions),
        uid: metadata.uid,
        user: metadata.user,
        gid: metadata.gid,
        group: metadata.group,
    }
}

fn display_remote_path_name(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn sftp_file_mode(permissions: u32) -> u32 {
    permissions & 0o7777
}

fn format_octal_permissions(permissions: u32) -> String {
    format!("{:03o}", permissions & 0o7777)
}

fn auth_for(
    secrets: &secrets::Secrets,
    request: &StartSftpSessionRequest,
) -> Result<ssh::NativeSshAuth, String> {
    let auth_method = auth_method_for(request)?;
    match auth_method {
        SftpAuthMethod::KeyFile => Ok(ssh::NativeSshAuth::KeyFile {
            key_path: request.key_path.clone().unwrap_or_default(),
        }),
        SftpAuthMethod::Password => {
            let owner_id = request
                .secret_owner_id
                .clone()
                .ok_or_else(|| "password auth requires a connection secret owner".to_string())?;
            let password = secrets
                .read_connection_password(owner_id)
                .map_err(|error| format!("failed to read SFTP password: {error}"))?
                .ok_or_else(|| "password auth requires a stored connection password".to_string())?;
            Ok(ssh::NativeSshAuth::Password { password })
        }
        SftpAuthMethod::Agent => Ok(ssh::NativeSshAuth::Agent),
    }
}

fn auth_method_for(request: &StartSftpSessionRequest) -> Result<SftpAuthMethod, String> {
    match request
        .auth_method
        .as_deref()
        .map(str::trim)
        .filter(|method| !method.is_empty())
    {
        Some("keyFile") | Some("key-file") | Some("key") => Ok(SftpAuthMethod::KeyFile),
        Some("password") => Ok(SftpAuthMethod::Password),
        Some("agent") | Some("sshAgent") | Some("ssh-agent") => Ok(SftpAuthMethod::Agent),
        Some(_) => Err("SFTP auth method must be keyFile, password, or agent".to_string()),
        None if request
            .key_path
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty()) =>
        {
            Ok(SftpAuthMethod::KeyFile)
        }
        None => Ok(SftpAuthMethod::Agent),
    }
}

fn file_kind(file_type: FileType) -> &'static str {
    match file_type {
        FileType::Dir => "folder",
        FileType::File => "file",
        FileType::Symlink => "symlink",
        FileType::Other => "other",
    }
}

fn file_kind_rank(kind: &str) -> u8 {
    match kind {
        "folder" => 0,
        "file" => 1,
        "symlink" => 2,
        _ => 3,
    }
}

fn local_file_kind(file_type: &fs::FileType) -> &'static str {
    if file_type.is_dir() {
        "folder"
    } else if file_type.is_file() {
        "file"
    } else if file_type.is_symlink() {
        "symlink"
    } else {
        "other"
    }
}

fn normalize_path(path: &str) -> String {
    let path = path.trim();
    if path.is_empty() {
        ".".to_string()
    } else {
        path.to_string()
    }
}

fn normalize_mutable_remote_path(path: &str) -> Result<String, String> {
    let path = normalize_path(path);
    if path == "." || path == "/" || path == ".." {
        return Err("select a remote file or folder first".to_string());
    }
    Ok(path)
}

fn join_remote_path(base_path: &str, child_name: &str) -> String {
    let base_path = normalize_path(base_path);
    if base_path == "." {
        child_name.to_string()
    } else if base_path.ends_with('/') {
        format!("{base_path}{child_name}")
    } else {
        format!("{base_path}/{child_name}")
    }
}

fn remote_parent_path(path: &str) -> String {
    let path = normalize_path(path).trim_end_matches('/').to_string();
    match path.rsplit_once('/') {
        Some(("", _)) => "/".to_string(),
        Some((parent, _)) if !parent.is_empty() => parent.to_string(),
        _ => ".".to_string(),
    }
}

fn validate_remote_child_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("remote name cannot be blank".to_string());
    }
    if name == "." || name == ".." {
        return Err("remote name cannot be . or ..".to_string());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("remote name cannot contain path separators".to_string());
    }
    Ok(name.to_string())
}

fn local_path_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "local source must have a file or folder name".to_string())
}

fn remote_path_name(path: &str) -> Result<String, String> {
    normalize_path(path)
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .map(str::trim)
        .filter(|name| !name.is_empty() && *name != "." && *name != "..")
        .map(ToString::to_string)
        .ok_or_else(|| "remote source must have a file or folder name".to_string())
}

fn ensure_local_missing(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Err(format!(
            "local destination already exists: {}",
            display_local_path(path)
        ));
    }
    Ok(())
}

async fn ensure_remote_missing(sftp: &SftpSession, path: &str) -> Result<(), String> {
    let exists = sftp
        .try_exists(path.to_string())
        .await
        .map_err(|error| format!("failed to inspect remote destination: {error}"))?;
    if exists {
        return Err(format!("remote destination already exists: {path}"));
    }
    Ok(())
}

async fn prepare_remote_upload_directory(
    sftp: &SftpSession,
    path: &str,
    overwrite_behavior: SftpOverwriteBehavior,
) -> Result<(), String> {
    if overwrite_behavior == SftpOverwriteBehavior::Fail {
        return create_remote_dir_if_missing(sftp, path).await;
    }

    if !sftp
        .try_exists(path.to_string())
        .await
        .map_err(|error| format!("failed to inspect remote folder: {error}"))?
    {
        return sftp
            .create_dir(path.to_string())
            .await
            .map_err(|error| format!("failed to create remote folder: {error}"));
    }

    let metadata = sftp
        .metadata(path.to_string())
        .await
        .map_err(|error| format!("failed to inspect remote folder: {error}"))?;
    if metadata.file_type() == FileType::Dir {
        Ok(())
    } else {
        Err(format!("remote destination is not a folder: {path}"))
    }
}

async fn remote_upload_target(
    sftp: &SftpSession,
    path: &str,
    overwrite_behavior: SftpOverwriteBehavior,
) -> Result<RemoteUploadTarget, String> {
    if overwrite_behavior == SftpOverwriteBehavior::Fail {
        ensure_remote_missing(sftp, path).await?;
        return Ok(RemoteUploadTarget {
            flags: OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE,
            existed: false,
        });
    }

    let existed = sftp
        .try_exists(path.to_string())
        .await
        .map_err(|error| format!("failed to inspect remote destination: {error}"))?;
    if existed {
        let metadata = sftp
            .metadata(path.to_string())
            .await
            .map_err(|error| format!("failed to inspect remote destination: {error}"))?;
        if metadata.file_type() == FileType::Dir {
            return Err(format!("remote destination is a folder: {path}"));
        }
    }

    Ok(RemoteUploadTarget {
        flags: OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        existed,
    })
}

fn prepare_local_download_directory(
    path: &Path,
    overwrite_behavior: SftpOverwriteBehavior,
) -> Result<(), String> {
    if overwrite_behavior == SftpOverwriteBehavior::Fail {
        ensure_local_missing(path)?;
        return fs::create_dir(path)
            .map_err(|error| format!("failed to create local folder: {error}"));
    }

    if path.exists() {
        if path.is_dir() {
            Ok(())
        } else {
            Err(format!(
                "local destination is not a folder: {}",
                display_local_path(path)
            ))
        }
    } else {
        fs::create_dir(path).map_err(|error| format!("failed to create local folder: {error}"))
    }
}

fn prepare_local_download_file(
    path: &Path,
    overwrite_behavior: SftpOverwriteBehavior,
) -> Result<bool, String> {
    if overwrite_behavior == SftpOverwriteBehavior::Fail {
        ensure_local_missing(path)?;
        return Ok(false);
    }

    if path.is_dir() {
        return Err(format!(
            "local destination is a folder: {}",
            display_local_path(path)
        ));
    }
    Ok(path.exists())
}

fn local_transfer_size(path: &Path) -> Result<u64, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("failed to inspect local transfer size: {error}"))?;
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    if !metadata.is_dir() {
        return Ok(0);
    }

    let mut bytes = 0;
    for child in
        fs::read_dir(path).map_err(|error| format!("failed to inspect local folder: {error}"))?
    {
        let child = child.map_err(|error| format!("failed to inspect local folder: {error}"))?;
        bytes += local_transfer_size(&child.path())?;
    }
    Ok(bytes)
}

fn remote_transfer_size<'a>(
    sftp: &'a SftpSession,
    path: &'a str,
) -> Pin<Box<dyn Future<Output = Result<u64, String>> + 'a>> {
    Box::pin(async move {
        let metadata = sftp
            .metadata(path.to_string())
            .await
            .map_err(|error| format!("failed to inspect remote transfer size: {error}"))?;
        match metadata.file_type() {
            FileType::File => Ok(metadata.size.unwrap_or(0)),
            FileType::Dir => {
                let entries = sftp
                    .read_dir(path.to_string())
                    .await
                    .map_err(|error| format!("failed to inspect remote folder: {error}"))?
                    .map(|entry| entry.file_name())
                    .filter(|name| name != "." && name != "..")
                    .collect::<Vec<_>>();
                let mut bytes = 0;
                for child_name in entries {
                    let child_path = join_remote_path(path, &child_name);
                    bytes += remote_transfer_size(sftp, &child_path).await?;
                }
                Ok(bytes)
            }
            _ => Ok(0),
        }
    })
}

async fn create_remote_dir_if_missing(sftp: &SftpSession, path: &str) -> Result<(), String> {
    if sftp
        .try_exists(path.to_string())
        .await
        .map_err(|error| format!("failed to inspect remote folder: {error}"))?
    {
        return Err(format!("remote destination already exists: {path}"));
    }
    sftp.create_dir(path.to_string())
        .await
        .map_err(|error| format!("failed to create remote folder: {error}"))
}

fn resolve_local_directory(path: Option<&str>) -> Result<PathBuf, String> {
    let path = path
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(default_local_directory);
    let path = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|error| format!("failed to resolve current directory: {error}"))?
            .join(path)
    };
    let directory = fs::canonicalize(&path)
        .map_err(|error| format!("failed to resolve local directory: {error}"))?;
    if !directory.is_dir() {
        return Err("local path is not a directory".to_string());
    }
    Ok(directory)
}

fn default_local_directory() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn display_local_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(stripped) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{stripped}")
    } else if let Some(stripped) = value.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        value.to_string()
    }
}

fn unix_timestamp(time: SystemTime) -> Result<u64, std::time::SystemTimeError> {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
}

fn make_session_id(title: &str) -> String {
    let slug = title
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("{}-{unique}", if slug.is_empty() { "sftp" } else { &slug })
}

#[derive(Default)]
struct TransferSummary {
    name: String,
    files: u64,
    folders: u64,
    bytes: u64,
}

impl TransferSummary {
    fn into_result(self) -> SftpTransferResult {
        SftpTransferResult {
            name: self.name,
            files: self.files,
            folders: self.folders,
            bytes: self.bytes,
        }
    }
}

struct TransferProgress {
    app: AppHandle,
    transfer_id: String,
    cancellation: Arc<AtomicBool>,
    transferred_bytes: u64,
    total_bytes: u64,
}

impl TransferProgress {
    fn new(
        app: AppHandle,
        transfer_id: &str,
        cancellation: Arc<AtomicBool>,
        total_bytes: u64,
    ) -> Self {
        Self {
            app,
            transfer_id: transfer_id.to_string(),
            cancellation,
            transferred_bytes: 0,
            total_bytes,
        }
    }

    fn add_bytes(&mut self, bytes: u64) {
        self.transferred_bytes = self.transferred_bytes.saturating_add(bytes);
        self.emit();
    }

    fn emit(&self) {
        let _ = self.app.emit(
            "sftp-transfer-progress",
            SftpTransferProgress {
                transfer_id: self.transfer_id.clone(),
                transferred_bytes: self.transferred_bytes,
                total_bytes: self.total_bytes,
                progress: transfer_progress_percent(self.transferred_bytes, self.total_bytes),
            },
        );
    }

    fn check_cancelled(&self) -> Result<(), String> {
        if self.cancellation.load(Ordering::SeqCst) {
            Err(TRANSFER_CANCELED.to_string())
        } else {
            Ok(())
        }
    }
}

fn transfer_progress_percent(transferred_bytes: u64, total_bytes: u64) -> u8 {
    if total_bytes == 0 {
        return 0;
    }
    let percent = transferred_bytes.saturating_mul(100) / total_bytes;
    percent.min(100) as u8
}

fn is_transfer_canceled(error: &str) -> bool {
    error == TRANSFER_CANCELED
}

fn normalize_sftp_overwrite_behavior(value: Option<&str>) -> Result<SftpOverwriteBehavior, String> {
    match value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("fail")
        .to_lowercase()
        .as_str()
    {
        "fail" | "error" | "never" => Ok(SftpOverwriteBehavior::Fail),
        "overwrite" | "replace" => Ok(SftpOverwriteBehavior::Overwrite),
        _ => Err("SFTP overwrite behavior must be fail or overwrite".to_string()),
    }
}

fn parse_octal_permissions(value: &str) -> Result<u32, String> {
    let trimmed = value.trim().trim_start_matches("0o");
    if trimmed.is_empty()
        || trimmed.len() > 4
        || !trimmed.chars().all(|digit| ('0'..='7').contains(&digit))
    {
        return Err("SFTP permissions must be an octal mode like 755 or 0644".to_string());
    }

    u32::from_str_radix(trimmed, 8)
        .map(|mode| mode & 0o7777)
        .map_err(|_| "SFTP permissions must be an octal mode like 755 or 0644".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sftp_auth_defaults_to_agent_without_key_path() {
        let request = sftp_request();

        assert!(matches!(
            auth_method_for(&request),
            Ok(SftpAuthMethod::Agent)
        ));
    }

    #[test]
    fn sftp_auth_uses_key_file_when_key_path_exists() {
        let mut request = sftp_request();
        request.key_path = Some("C:\\Users\\ryan\\.ssh\\id_ed25519".to_string());

        assert!(matches!(
            auth_method_for(&request),
            Ok(SftpAuthMethod::KeyFile)
        ));
    }

    #[test]
    fn sftp_auth_rejects_unknown_methods() {
        let mut request = sftp_request();
        request.auth_method = Some("keyboardInteractive".to_string());

        assert!(auth_method_for(&request).is_err());
    }

    #[test]
    fn blank_sftp_paths_open_home_directory() {
        assert_eq!(normalize_path(""), ".");
        assert_eq!(normalize_path("  "), ".");
        assert_eq!(normalize_path("/srv/releases"), "/srv/releases");
    }

    #[test]
    fn display_local_path_strips_windows_verbatim_prefixes() {
        assert_eq!(
            display_local_path(Path::new(r"\\?\C:\Users\Ryan")),
            r"C:\Users\Ryan"
        );
        assert_eq!(
            display_local_path(Path::new(r"\\?\UNC\server\share")),
            r"\\server\share"
        );
    }

    #[test]
    fn remote_paths_join_with_single_separator() {
        assert_eq!(join_remote_path(".", "release.zip"), "release.zip");
        assert_eq!(
            join_remote_path("/srv/releases", "release.zip"),
            "/srv/releases/release.zip"
        );
        assert_eq!(
            join_remote_path("/srv/releases/", "release.zip"),
            "/srv/releases/release.zip"
        );
    }

    #[test]
    fn remote_parent_paths_keep_sibling_renames_in_place() {
        assert_eq!(remote_parent_path("release.zip"), ".");
        assert_eq!(
            remote_parent_path("/srv/releases/release.zip"),
            "/srv/releases"
        );
        assert_eq!(remote_parent_path("/release.zip"), "/");
    }

    #[test]
    fn remote_child_names_reject_paths_and_parent_segments() {
        assert_eq!(
            validate_remote_child_name("release.zip"),
            Ok("release.zip".to_string())
        );
        assert!(validate_remote_child_name("").is_err());
        assert!(validate_remote_child_name("..").is_err());
        assert!(validate_remote_child_name("folder/release.zip").is_err());
        assert!(validate_remote_child_name(r"folder\release.zip").is_err());
    }

    #[test]
    fn mutable_remote_paths_reject_directory_only_values() {
        assert_eq!(
            normalize_mutable_remote_path("/srv/releases/app.zip"),
            Ok("/srv/releases/app.zip".to_string())
        );
        assert!(normalize_mutable_remote_path(".").is_err());
        assert!(normalize_mutable_remote_path("/").is_err());
        assert!(normalize_mutable_remote_path("..").is_err());
    }

    #[test]
    fn remote_path_names_reject_directory_only_values() {
        assert_eq!(
            remote_path_name("/srv/releases/app.zip"),
            Ok("app.zip".to_string())
        );
        assert!(remote_path_name(".").is_err());
        assert!(remote_path_name("..").is_err());
    }

    #[test]
    fn sftp_permission_modes_parse_octal_values() {
        assert_eq!(parse_octal_permissions("755"), Ok(0o755));
        assert_eq!(parse_octal_permissions("0644"), Ok(0o644));
        assert_eq!(parse_octal_permissions("0o600"), Ok(0o600));
        assert!(parse_octal_permissions("").is_err());
        assert!(parse_octal_permissions("888").is_err());
        assert!(parse_octal_permissions("10000").is_err());
    }

    #[test]
    fn transfer_progress_handles_zero_and_caps_at_one_hundred() {
        assert_eq!(transfer_progress_percent(0, 0), 0);
        assert_eq!(transfer_progress_percent(50, 200), 25);
        assert_eq!(transfer_progress_percent(250, 200), 100);
    }

    #[test]
    fn sftp_overwrite_behavior_defaults_to_fail_and_normalizes_aliases() {
        assert!(matches!(
            normalize_sftp_overwrite_behavior(None),
            Ok(SftpOverwriteBehavior::Fail)
        ));
        assert!(matches!(
            normalize_sftp_overwrite_behavior(Some(" replace ")),
            Ok(SftpOverwriteBehavior::Overwrite)
        ));
        assert!(normalize_sftp_overwrite_behavior(Some("skip")).is_err());
    }

    fn sftp_request() -> StartSftpSessionRequest {
        StartSftpSessionRequest {
            session_id: None,
            title: "Test SFTP".to_string(),
            host: "files.internal".to_string(),
            user: "deploy".to_string(),
            port: Some(22),
            key_path: None,
            proxy_jump: None,
            auth_method: None,
            secret_owner_id: None,
            path: None,
        }
    }
}
