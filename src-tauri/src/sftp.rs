use crate::{secrets, ssh};
use russh::{client, Disconnect};
use russh_sftp::{
    client::SftpSession,
    protocol::{FileType, OpenFlags},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;
use tokio::runtime::Runtime;

pub struct SftpSessionManager {
    sessions: std::sync::Mutex<HashMap<String, SftpConnection>>,
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
    local_path: String,
    remote_directory: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSftpPathRequest {
    session_id: String,
    remote_path: String,
    local_directory: String,
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

#[derive(Clone, Copy, PartialEq, Eq)]
enum SftpAuthMethod {
    KeyFile,
    Password,
    Agent,
}

impl SftpSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: std::sync::Mutex::new(HashMap::new()),
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
        request: UploadSftpPathRequest,
    ) -> Result<SftpTransferResult, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        session.runtime.block_on(upload_path(
            &session.sftp,
            &request.local_path,
            &request.remote_directory,
        ))
    }

    pub fn download_path(
        &self,
        request: DownloadSftpPathRequest,
    ) -> Result<SftpTransferResult, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "SFTP session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "SFTP session was not found".to_string())?;
        session.runtime.block_on(download_path(
            &session.sftp,
            &request.remote_path,
            &request.local_directory,
        ))
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
}

async fn upload_path(
    sftp: &SftpSession,
    local_path: &str,
    remote_directory: &str,
) -> Result<SftpTransferResult, String> {
    let source = fs::canonicalize(local_path)
        .map_err(|error| format!("failed to resolve local source: {error}"))?;
    let name = local_path_name(&source)?;
    let remote_target = join_remote_path(remote_directory, &name);
    ensure_remote_missing(sftp, &remote_target).await?;

    let mut summary = TransferSummary {
        name,
        ..TransferSummary::default()
    };
    upload_local_entry(sftp, &source, &remote_target, &mut summary).await?;
    Ok(summary.into_result())
}

async fn download_path(
    sftp: &SftpSession,
    remote_path: &str,
    local_directory: &str,
) -> Result<SftpTransferResult, String> {
    let local_directory = resolve_local_directory(Some(local_directory))?;
    let remote_path = normalize_path(remote_path);
    let name = remote_path_name(&remote_path)?;
    let local_target = local_directory.join(&name);
    ensure_local_missing(&local_target)?;

    let mut summary = TransferSummary {
        name,
        ..TransferSummary::default()
    };
    download_remote_entry(sftp, &remote_path, &local_target, &mut summary).await?;
    Ok(summary.into_result())
}

fn upload_local_entry<'a>(
    sftp: &'a SftpSession,
    local_path: &'a Path,
    remote_path: &'a str,
    summary: &'a mut TransferSummary,
) -> Pin<Box<dyn Future<Output = Result<(), String>> + 'a>> {
    Box::pin(async move {
        let metadata = fs::metadata(local_path)
            .map_err(|error| format!("failed to inspect local source: {error}"))?;
        if metadata.is_dir() {
            create_remote_dir_if_missing(sftp, remote_path).await?;
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
                upload_local_entry(sftp, &child_path, &child_remote_path, summary).await?;
            }
            return Ok(());
        }

        if !metadata.is_file() {
            return Err("only local files and folders can be uploaded".to_string());
        }

        ensure_remote_missing(sftp, remote_path).await?;
        let data =
            fs::read(local_path).map_err(|error| format!("failed to read local file: {error}"))?;
        let mut file = sftp
            .open_with_flags(
                remote_path.to_string(),
                OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE,
            )
            .await
            .map_err(|error| format!("failed to create remote file: {error}"))?;
        file.write_all(&data)
            .await
            .map_err(|error| format!("failed to upload remote file: {error}"))?;
        file.shutdown()
            .await
            .map_err(|error| format!("failed to finish remote upload: {error}"))?;
        summary.files += 1;
        summary.bytes += data.len() as u64;
        Ok(())
    })
}

fn download_remote_entry<'a>(
    sftp: &'a SftpSession,
    remote_path: &'a str,
    local_path: &'a Path,
    summary: &'a mut TransferSummary,
) -> Pin<Box<dyn Future<Output = Result<(), String>> + 'a>> {
    Box::pin(async move {
        let metadata = sftp
            .metadata(remote_path.to_string())
            .await
            .map_err(|error| format!("failed to inspect remote source: {error}"))?;
        match metadata.file_type() {
            FileType::Dir => {
                ensure_local_missing(local_path)?;
                fs::create_dir(local_path)
                    .map_err(|error| format!("failed to create local folder: {error}"))?;
                summary.folders += 1;
                let mut entries = sftp
                    .read_dir(remote_path.to_string())
                    .await
                    .map_err(|error| format!("failed to read remote folder: {error}"))?
                    .map(|entry| entry.file_name())
                    .collect::<Vec<_>>();
                entries.sort_by_key(|name| name.to_lowercase());
                for child_name in entries {
                    let child_remote_path = join_remote_path(remote_path, &child_name);
                    let child_local_path = local_path.join(&child_name);
                    download_remote_entry(sftp, &child_remote_path, &child_local_path, summary)
                        .await?;
                }
                Ok(())
            }
            FileType::File => {
                ensure_local_missing(local_path)?;
                let data = sftp
                    .read(remote_path.to_string())
                    .await
                    .map_err(|error| format!("failed to download remote file: {error}"))?;
                fs::write(local_path, &data)
                    .map_err(|error| format!("failed to write local file: {error}"))?;
                summary.files += 1;
                summary.bytes += data.len() as u64;
                Ok(())
            }
            _ => Err("only remote files and folders can be downloaded".to_string()),
        }
    })
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
    fn remote_path_names_reject_directory_only_values() {
        assert_eq!(
            remote_path_name("/srv/releases/app.zip"),
            Ok("app.zip".to_string())
        );
        assert!(remote_path_name(".").is_err());
        assert!(remote_path_name("..").is_err());
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
