use crate::{secrets, ssh};
use russh::{client, Disconnect};
use russh_sftp::{client::SftpSession, protocol::FileType};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
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
pub struct SftpDirectoryEntry {
    name: String,
    kind: String,
    size: Option<u64>,
    modified: Option<u64>,
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

fn normalize_path(path: &str) -> String {
    let path = path.trim();
    if path.is_empty() {
        ".".to_string()
    } else {
        path.to_string()
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
