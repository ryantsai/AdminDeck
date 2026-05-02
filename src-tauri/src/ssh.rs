use russh::{
    client,
    keys::{
        agent::{client::AgentClient, AgentIdentity},
        load_secret_key, PrivateKeyWithHashAlg,
    },
    ChannelMsg, Disconnect,
};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{mpsc as std_mpsc, Arc},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTransportPlan {
    primary_library: &'static str,
    sftp_candidate: &'static str,
    fallback_library: &'static str,
    system_ssh_role: &'static str,
}

pub fn transport_plan() -> SshTransportPlan {
    SshTransportPlan {
        primary_library: "russh",
        sftp_candidate: "russh-sftp",
        fallback_library: "ssh2",
        system_ssh_role: "debug-fallback",
    }
}

pub struct NativeSshTerminal {
    control: mpsc::UnboundedSender<SshTerminalControl>,
    worker: Option<JoinHandle<()>>,
    terminal_ready_ms: u128,
}

impl NativeSshTerminal {
    pub fn terminal_ready_ms(&self) -> u128 {
        self.terminal_ready_ms
    }
}

#[derive(Clone)]
pub struct NativeSshTerminalRequest {
    pub session_id: String,
    pub host: String,
    pub user: String,
    pub port: u16,
    pub auth: NativeSshAuth,
    pub known_hosts_path: PathBuf,
    pub cols: u16,
    pub pixel_height: u16,
    pub pixel_width: u16,
    pub rows: u16,
    pub initial_directory: Option<String>,
}

#[derive(Clone)]
pub(crate) struct NativeSshConnectionRequest {
    pub host: String,
    pub user: String,
    pub port: u16,
    pub auth: NativeSshAuth,
    pub known_hosts_path: PathBuf,
}

#[derive(Clone)]
pub enum NativeSshAuth {
    KeyFile { key_path: String },
    Password { password: String },
    Agent,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectSshHostKeyRequest {
    host: String,
    port: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustSshHostKeyRequest {
    host: String,
    port: Option<u16>,
    public_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshHostKeyPreview {
    host: String,
    port: u16,
    algorithm: String,
    fingerprint: String,
    public_key: String,
    status: String,
}

enum SshTerminalControl {
    Input(Vec<u8>),
    Resize {
        cols: u16,
        pixel_height: u16,
        pixel_width: u16,
        rows: u16,
    },
    Close,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: String,
}

pub(crate) struct VerifyingClient {
    host: String,
    port: u16,
    known_hosts_path: PathBuf,
    rejection: Arc<std::sync::Mutex<Option<String>>>,
}

impl client::Handler for VerifyingClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        match host_key_status(
            &self.host,
            self.port,
            server_public_key,
            &self.known_hosts_path,
        ) {
            Ok(HostKeyTrustStatus::Trusted) => Ok(true),
            Ok(HostKeyTrustStatus::Unknown) => {
                remember_rejection(
                    &self.rejection,
                    format!(
                        "SSH host key for {}:{} is not trusted yet ({})",
                        self.host,
                        self.port,
                        host_key_fingerprint(server_public_key)
                    ),
                );
                Ok(false)
            }
            Ok(HostKeyTrustStatus::Changed { line }) => {
                remember_rejection(
                    &self.rejection,
                    format!(
                        "SSH host key for {}:{} changed from the trusted key at known-hosts line {} ({})",
                        self.host,
                        self.port,
                        line,
                        host_key_fingerprint(server_public_key)
                    ),
                );
                Ok(false)
            }
            Err(error) => {
                remember_rejection(&self.rejection, error);
                Ok(false)
            }
        }
    }
}

struct InspectingClient {
    server_public_key: Arc<std::sync::Mutex<Option<russh::keys::ssh_key::PublicKey>>>,
}

impl client::Handler for InspectingClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        if let Ok(mut captured_key) = self.server_public_key.lock() {
            *captured_key = Some(server_public_key.clone());
        }
        Ok(true)
    }
}

pub fn can_start_native_terminal(
    key_path: Option<&str>,
    password: Option<&str>,
    use_agent: bool,
    proxy_jump: Option<&str>,
) -> bool {
    let has_key_path = key_path
        .map(str::trim)
        .is_some_and(|value| !value.is_empty());
    let has_password = password
        .map(str::trim)
        .is_some_and(|value| !value.is_empty());
    let has_proxy_jump = proxy_jump
        .map(str::trim)
        .is_some_and(|value| !value.is_empty());

    (has_key_path || has_password || use_agent) && !has_proxy_jump
}

pub fn start_native_terminal(
    app: AppHandle,
    request: NativeSshTerminalRequest,
) -> Result<NativeSshTerminal, String> {
    let host = request.host.trim();
    if host.is_empty() {
        return Err("host is required for SSH sessions".to_string());
    }

    let user = request.user.trim();
    if user.is_empty() {
        return Err("user is required for native SSH sessions".to_string());
    }

    let auth = normalize_native_ssh_auth(request.auth)?;
    let request = NativeSshTerminalRequest {
        session_id: request.session_id,
        host: host.to_string(),
        user: user.to_string(),
        port: request.port,
        auth,
        known_hosts_path: request.known_hosts_path,
        cols: request.cols,
        pixel_height: request.pixel_height,
        pixel_width: request.pixel_width,
        rows: request.rows,
        initial_directory: request.initial_directory,
    };
    let (control_tx, control_rx) = mpsc::unbounded_channel();
    let (ready_tx, ready_rx) = std_mpsc::sync_channel(1);
    let worker = thread::spawn(move || {
        let result = run_native_terminal_thread(app.clone(), request.clone(), control_rx, ready_tx);
        if let Err(error) = result {
            emit_terminal_output(
                &app,
                &request.session_id,
                format!("\r\n[native SSH session error: {error}]\r\n"),
            );
        }
    });

    match ready_rx
        .recv_timeout(Duration::from_secs(15))
        .map_err(|_| "timed out while starting native SSH session".to_string())?
    {
        Ok(terminal_ready_ms) => Ok(NativeSshTerminal {
            control: control_tx,
            worker: Some(worker),
            terminal_ready_ms,
        }),
        Err(error) => {
            let _ = worker.join();
            Err(error)
        }
    }
}

pub fn app_known_hosts_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?
        .join("ssh_known_hosts"))
}

pub fn inspect_host_key(
    known_hosts_path: PathBuf,
    request: InspectSshHostKeyRequest,
) -> Result<SshHostKeyPreview, String> {
    let host = required_host(request.host)?;
    let port = request.port.unwrap_or(22);
    let server_public_key = Arc::new(std::sync::Mutex::new(None));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("failed to create SSH host-key runtime: {error}"))?;

    let key = runtime.block_on(async {
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(15)),
            ..Default::default()
        });
        let capture = Arc::clone(&server_public_key);
        let session = client::connect(
            config,
            (host.as_str(), port),
            InspectingClient {
                server_public_key: capture,
            },
        )
        .await
        .map_err(|error| format!("failed to inspect SSH host key: {error}"))?;
        let _ = session
            .disconnect(Disconnect::ByApplication, "host key inspected", "en")
            .await;
        server_public_key
            .lock()
            .map_err(|_| "SSH host-key capture lock is poisoned".to_string())?
            .clone()
            .ok_or_else(|| "SSH server did not present a host key".to_string())
    })?;

    let status = host_key_status(&host, port, &key, &known_hosts_path)?;
    Ok(SshHostKeyPreview {
        host,
        port,
        algorithm: key.algorithm().to_string(),
        fingerprint: host_key_fingerprint(&key),
        public_key: key
            .to_openssh()
            .map_err(|error| format!("failed to encode SSH host key: {error}"))?,
        status: status.as_str().to_string(),
    })
}

pub fn trust_host_key(
    known_hosts_path: PathBuf,
    request: TrustSshHostKeyRequest,
) -> Result<SshHostKeyPreview, String> {
    let host = required_host(request.host)?;
    let port = request.port.unwrap_or(22);
    let key = russh::keys::ssh_key::PublicKey::from_openssh(&request.public_key)
        .map_err(|error| format!("failed to parse SSH host key: {error}"))?;
    match host_key_status(&host, port, &key, &known_hosts_path)? {
        HostKeyTrustStatus::Trusted => {}
        HostKeyTrustStatus::Unknown => {
            russh::keys::known_hosts::learn_known_hosts_path(&host, port, &key, &known_hosts_path)
                .map_err(|error| format!("failed to trust SSH host key: {error}"))?;
        }
        HostKeyTrustStatus::Changed { line } => {
            return Err(format!(
                "refusing to replace changed SSH host key at known-hosts line {line}"
            ));
        }
    }

    Ok(SshHostKeyPreview {
        host,
        port,
        algorithm: key.algorithm().to_string(),
        fingerprint: host_key_fingerprint(&key),
        public_key: key
            .to_openssh()
            .map_err(|error| format!("failed to encode SSH host key: {error}"))?,
        status: "trusted".to_string(),
    })
}

impl NativeSshTerminal {
    pub fn write_input(&self, data: String) -> Result<(), String> {
        self.control
            .send(SshTerminalControl::Input(data.into_bytes()))
            .map_err(|_| "native SSH session is closed".to_string())
    }

    pub fn resize(
        &self,
        cols: u16,
        rows: u16,
        pixel_width: u16,
        pixel_height: u16,
    ) -> Result<(), String> {
        self.control
            .send(SshTerminalControl::Resize {
                cols,
                pixel_height,
                pixel_width,
                rows,
            })
            .map_err(|_| "native SSH session is closed".to_string())
    }

    pub fn close(mut self) {
        let _ = self.control.send(SshTerminalControl::Close);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn run_native_terminal_thread(
    app: AppHandle,
    request: NativeSshTerminalRequest,
    control_rx: mpsc::UnboundedReceiver<SshTerminalControl>,
    ready_tx: std_mpsc::SyncSender<Result<u128, String>>,
) -> Result<(), String> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("failed to create native SSH runtime: {error}"))?;

    let startup_error_tx = ready_tx.clone();
    let result = runtime.block_on(run_native_terminal(app, request, control_rx, ready_tx));
    if let Err(error) = &result {
        let _ = startup_error_tx.send(Err(error.clone()));
    }
    result
}

async fn run_native_terminal(
    app: AppHandle,
    request: NativeSshTerminalRequest,
    mut control_rx: mpsc::UnboundedReceiver<SshTerminalControl>,
    ready_tx: std_mpsc::SyncSender<Result<u128, String>>,
) -> Result<(), String> {
    let session = connect_verified_client(NativeSshConnectionRequest {
        host: request.host.clone(),
        user: request.user.clone(),
        port: request.port,
        auth: request.auth.clone(),
        known_hosts_path: request.known_hosts_path.clone(),
    })
    .await?;

    let ready_start = Instant::now();
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|error| format!("failed to open SSH terminal channel: {error}"))?;
    channel
        .request_pty(
            false,
            "xterm-256color",
            request.cols.into(),
            request.rows.into(),
            request.pixel_width.into(),
            request.pixel_height.into(),
            &[],
        )
        .await
        .map_err(|error| format!("failed to allocate SSH PTY: {error}"))?;
    channel
        .request_shell(false)
        .await
        .map_err(|error| format!("failed to start SSH shell: {error}"))?;
    if let Some(directory) = initial_directory_for(&request) {
        let command = format!("cd -- {}\r", shell_single_quote(&directory));
        channel
            .data(command.as_bytes())
            .await
            .map_err(|error| format!("failed to set SSH initial directory: {error}"))?;
    }

    let _ = ready_tx.send(Ok(ready_start.elapsed().as_millis()));

    loop {
        tokio::select! {
            control = control_rx.recv() => {
                match control {
                    Some(SshTerminalControl::Input(data)) => {
                        channel
                            .data(&data[..])
                            .await
                            .map_err(|error| format!("failed to write SSH terminal input: {error}"))?;
                    }
                    Some(SshTerminalControl::Resize {
                        cols,
                        pixel_height,
                        pixel_width,
                        rows,
                    }) => {
                        channel
                            .window_change(
                                cols.into(),
                                rows.into(),
                                pixel_width.into(),
                                pixel_height.into(),
                            )
                            .await
                            .map_err(|error| format!("failed to resize SSH terminal: {error}"))?;
                    }
                    Some(SshTerminalControl::Close) | None => {
                        let _ = channel.eof().await;
                        let _ = channel.close().await;
                        break;
                    }
                }
            }
            message = channel.wait() => {
                match message {
                    Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                        emit_terminal_output(
                            &app,
                            &request.session_id,
                            String::from_utf8_lossy(&data).to_string(),
                        );
                    }
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                    _ => {}
                }
            }
        }
    }

    session
        .disconnect(Disconnect::ByApplication, "", "en")
        .await
        .map_err(|error| format!("failed to disconnect SSH session: {error}"))?;
    Ok(())
}

fn emit_terminal_output(app: &AppHandle, session_id: &str, data: String) {
    let _ = app.emit(
        "terminal-output",
        TerminalOutput {
            session_id: session_id.to_string(),
            data,
        },
    );
}

fn initial_directory_for(request: &NativeSshTerminalRequest) -> Option<String> {
    request
        .initial_directory
        .as_deref()
        .map(str::trim)
        .filter(|directory| !directory.is_empty() && *directory != "~")
        .map(str::to_string)
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[derive(Debug, PartialEq, Eq)]
enum HostKeyTrustStatus {
    Trusted,
    Unknown,
    Changed { line: usize },
}

impl HostKeyTrustStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Trusted => "trusted",
            Self::Unknown => "unknown",
            Self::Changed { .. } => "changed",
        }
    }
}

fn host_key_status(
    host: &str,
    port: u16,
    key: &russh::keys::ssh_key::PublicKey,
    known_hosts_path: &PathBuf,
) -> Result<HostKeyTrustStatus, String> {
    match russh::keys::known_hosts::check_known_hosts_path(host, port, key, known_hosts_path) {
        Ok(true) => Ok(HostKeyTrustStatus::Trusted),
        Ok(false) => Ok(HostKeyTrustStatus::Unknown),
        Err(russh::keys::Error::KeyChanged { line }) => Ok(HostKeyTrustStatus::Changed { line }),
        Err(error) => Err(format!("failed to check SSH known hosts: {error}")),
    }
}

fn host_key_fingerprint(key: &russh::keys::ssh_key::PublicKey) -> String {
    key.fingerprint(russh::keys::ssh_key::HashAlg::Sha256)
        .to_string()
}

fn required_host(host: String) -> Result<String, String> {
    let host = host.trim().to_string();
    if host.is_empty() {
        Err("host is required for SSH host-key verification".to_string())
    } else {
        Ok(host)
    }
}

fn remember_rejection(rejection: &Arc<std::sync::Mutex<Option<String>>>, message: String) {
    if let Ok(mut rejection) = rejection.lock() {
        *rejection = Some(message);
    }
}

fn remembered_rejection(rejection: &Arc<std::sync::Mutex<Option<String>>>) -> Option<String> {
    rejection.lock().ok().and_then(|message| message.clone())
}

fn normalize_native_ssh_auth(auth: NativeSshAuth) -> Result<NativeSshAuth, String> {
    match auth {
        NativeSshAuth::KeyFile { key_path } => {
            let key_path = key_path.trim().to_string();
            if key_path.is_empty() {
                Err("key path is required for SSH key-file authentication".to_string())
            } else {
                Ok(NativeSshAuth::KeyFile { key_path })
            }
        }
        NativeSshAuth::Password { password } => {
            if password.is_empty() {
                Err("password is required for SSH password authentication".to_string())
            } else {
                Ok(NativeSshAuth::Password { password })
            }
        }
        NativeSshAuth::Agent => Ok(NativeSshAuth::Agent),
    }
}

pub(crate) async fn connect_verified_client(
    request: NativeSshConnectionRequest,
) -> Result<client::Handle<VerifyingClient>, String> {
    let host = request.host.trim();
    if host.is_empty() {
        return Err("host is required for native SSH sessions".to_string());
    }

    let user = request.user.trim();
    if user.is_empty() {
        return Err("user is required for native SSH sessions".to_string());
    }

    let auth = normalize_native_ssh_auth(request.auth)?;
    let config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(30)),
        ..Default::default()
    });
    let host_key_rejection = Arc::new(std::sync::Mutex::new(None));
    let mut session = client::connect(
        config,
        (host, request.port),
        VerifyingClient {
            host: host.to_string(),
            port: request.port,
            known_hosts_path: request.known_hosts_path,
            rejection: Arc::clone(&host_key_rejection),
        },
    )
    .await
    .map_err(|error| {
        remembered_rejection(&host_key_rejection)
            .unwrap_or_else(|| format!("failed to connect to SSH server: {error}"))
    })?;

    authenticate_native_ssh(&mut session, user, &auth).await?;
    Ok(session)
}

pub(crate) async fn authenticate_native_ssh(
    session: &mut client::Handle<VerifyingClient>,
    user: &str,
    auth: &NativeSshAuth,
) -> Result<(), String> {
    let auth_result = match auth {
        NativeSshAuth::KeyFile { key_path } => {
            let key_pair = load_secret_key(key_path, None)
                .map_err(|error| format!("failed to load SSH key: {error}"))?;
            session
                .authenticate_publickey(
                    user.to_string(),
                    PrivateKeyWithHashAlg::new(
                        Arc::new(key_pair),
                        session
                            .best_supported_rsa_hash()
                            .await
                            .map_err(|error| {
                                format!("failed to negotiate SSH key algorithm: {error}")
                            })?
                            .flatten(),
                    ),
                )
                .await
                .map_err(|error| format!("SSH key-file authentication failed: {error}"))?
        }
        NativeSshAuth::Password { password } => session
            .authenticate_password(user.to_string(), password.clone())
            .await
            .map_err(|error| format!("SSH password authentication failed: {error}"))?,
        NativeSshAuth::Agent => {
            authenticate_with_agent(session, user).await?;
            return Ok(());
        }
    };

    if !auth_result.success() {
        let method = match auth {
            NativeSshAuth::KeyFile { .. } => "key-file",
            NativeSshAuth::Password { .. } => "password",
            NativeSshAuth::Agent => "agent",
        };
        return Err(format!("SSH {method} authentication was rejected"));
    }

    Ok(())
}

async fn authenticate_with_agent(
    session: &mut client::Handle<VerifyingClient>,
    user: &str,
) -> Result<(), String> {
    let rsa_hash = session
        .best_supported_rsa_hash()
        .await
        .map_err(|error| format!("failed to negotiate SSH agent key algorithm: {error}"))?
        .flatten();

    let mut agents = connect_ssh_agents().await?;
    let mut failures = Vec::new();
    for agent in &mut agents {
        let identities = match request_agent_identities(agent).await {
            Ok(identities) => identities,
            Err(error) => {
                failures.push(error);
                continue;
            }
        };
        if identities.is_empty() {
            failures.push(format!("{} has no identities loaded", agent.source));
            continue;
        }

        for identity in identities {
            let auth_result = match identity {
                AgentIdentity::PublicKey { key, comment } => session
                    .authenticate_publickey_with(user.to_string(), key, rsa_hash, &mut agent.client)
                    .await
                    .map_err(|error| {
                        format!(
                            "{} authentication failed for {comment}: {error}",
                            agent.source
                        )
                    })?,
                AgentIdentity::Certificate {
                    certificate,
                    comment,
                } => session
                    .authenticate_certificate_with(
                        user.to_string(),
                        certificate,
                        rsa_hash,
                        &mut agent.client,
                    )
                    .await
                    .map_err(|error| {
                        format!(
                            "{} certificate authentication failed for {comment}: {error}",
                            agent.source
                        )
                    })?,
            };

            if auth_result.success() {
                return Ok(());
            }
            failures.push(format!("{} identity was rejected", agent.source));
        }
    }

    Err(if failures.is_empty() {
        "SSH agent authentication was rejected".to_string()
    } else {
        format!(
            "SSH agent authentication was unavailable: {}",
            failures.join("; ")
        )
    })
}

type DynamicAgentClient =
    AgentClient<Box<dyn russh::keys::agent::client::AgentStream + Send + Unpin + 'static>>;

struct SshAgent {
    source: &'static str,
    client: DynamicAgentClient,
}

async fn request_agent_identities(agent: &mut SshAgent) -> Result<Vec<AgentIdentity>, String> {
    agent.client.request_identities().await.map_err(|error| {
        format!(
            "{} failed to list SSH agent identities: {error}",
            agent.source
        )
    })
}

#[cfg(unix)]
async fn connect_ssh_agents() -> Result<Vec<SshAgent>, String> {
    AgentClient::connect_env()
        .await
        .map(|agent| {
            vec![SshAgent {
                source: "SSH_AUTH_SOCK agent",
                client: agent.dynamic(),
            }]
        })
        .map_err(|error| format!("failed to connect to SSH agent from SSH_AUTH_SOCK: {error}"))
}

#[cfg(windows)]
async fn connect_ssh_agents() -> Result<Vec<SshAgent>, String> {
    let mut agents = Vec::new();
    let mut failures = Vec::new();

    match AgentClient::connect_named_pipe(r"\\.\pipe\openssh-ssh-agent").await {
        Ok(agent) => agents.push(SshAgent {
            source: "Windows OpenSSH agent",
            client: agent.dynamic(),
        }),
        Err(error) => failures.push(format!("Windows OpenSSH agent: {error}")),
    }

    match AgentClient::connect_pageant().await {
        Ok(agent) => agents.push(SshAgent {
            source: "Pageant agent",
            client: agent.dynamic(),
        }),
        Err(error) => failures.push(format!("Pageant agent: {error}")),
    }

    if agents.is_empty() {
        Err(format!(
            "failed to connect to Windows SSH agents: {}",
            failures.join("; ")
        ))
    } else {
        Ok(agents)
    }
}

#[cfg(not(any(unix, windows)))]
async fn connect_ssh_agents() -> Result<Vec<SshAgent>, String> {
    Err("SSH agent authentication is not supported on this platform yet".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, io::Write};

    #[test]
    fn milestone_b_prefers_in_process_rust_ssh() {
        let plan = transport_plan();

        assert_eq!(plan.primary_library, "russh");
        assert_eq!(plan.sftp_candidate, "russh-sftp");
        assert_eq!(plan.fallback_library, "ssh2");
        assert_eq!(plan.system_ssh_role, "debug-fallback");
    }

    #[test]
    fn native_terminal_lifecycle_starts_for_credentials_without_proxy_jump() {
        assert!(can_start_native_terminal(
            Some("C:\\Users\\ryan\\.ssh\\id_ed25519"),
            None,
            false,
            None
        ));
        assert!(can_start_native_terminal(
            None,
            Some("not-for-sqlite"),
            false,
            None
        ));
        assert!(can_start_native_terminal(None, None, true, None));
        assert!(!can_start_native_terminal(None, None, false, None));
        assert!(!can_start_native_terminal(Some("  "), None, false, None));
        assert!(!can_start_native_terminal(None, Some("  "), false, None));
        assert!(!can_start_native_terminal(
            Some("C:\\Users\\ryan\\.ssh\\id_ed25519"),
            None,
            false,
            Some("bastion")
        ));
    }

    #[test]
    fn host_key_status_reports_unknown_trusted_and_changed() {
        let path = temp_known_hosts_path("status");
        let host_key = russh::keys::ssh_key::PublicKey::from_openssh(
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJdD7y3aLq454yWBdwLWbieU1ebz9/cu7/QEXn9OIeZJ",
        )
        .expect("host key parses");
        let changed_key = russh::keys::ssh_key::PublicKey::from_openssh(
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA6rWI3G1sz07DnfFlrouTcysQlj2P+jpNSOEWD9OJ3X",
        )
        .expect("changed host key parses");

        assert_eq!(
            host_key_status("localhost", 2222, &host_key, &path).expect("status loads"),
            HostKeyTrustStatus::Unknown
        );

        russh::keys::known_hosts::learn_known_hosts_path("localhost", 2222, &host_key, &path)
            .expect("host key is trusted");

        assert_eq!(
            host_key_status("localhost", 2222, &host_key, &path).expect("status loads"),
            HostKeyTrustStatus::Trusted
        );
        assert_eq!(
            host_key_status("localhost", 2222, &changed_key, &path).expect("status loads"),
            HostKeyTrustStatus::Changed { line: 2 }
        );
    }

    #[test]
    fn host_key_status_reads_hashed_known_hosts_entries() {
        let path = temp_known_hosts_path("hashed");
        let host_key = russh::keys::ssh_key::PublicKey::from_openssh(
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILIG2T/B0l0gaqj3puu510tu9N1OkQ4znY3LYuEm5zCF",
        )
        .expect("host key parses");
        let mut file = fs::File::create(&path).expect("known-hosts file is created");
        writeln!(
            file,
            "|1|O33ESRMWPVkMYIwJ1Uw+n877jTo=|nuuC5vEqXlEZ/8BXQR7m619W6Ak= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILIG2T/B0l0gaqj3puu510tu9N1OkQ4znY3LYuEm5zCF"
        )
        .expect("known-hosts entry is written");

        assert_eq!(
            host_key_status("example.com", 22, &host_key, &path).expect("status loads"),
            HostKeyTrustStatus::Trusted
        );
    }

    #[test]
    fn agent_identity_listing_error_mentions_the_agent_source() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime is created");

        let error = runtime.block_on(async {
            let (client_stream, server_stream) = tokio::io::duplex(64);
            drop(server_stream);
            let mut agent = SshAgent {
                source: "test SSH agent",
                client: AgentClient::connect(client_stream).dynamic(),
            };

            request_agent_identities(&mut agent)
                .await
                .expect_err("closed agent stream fails")
        });

        assert!(error.contains("test SSH agent"));
        assert!(error.contains("failed to list SSH agent identities"));
    }

    fn temp_known_hosts_path(name: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is after Unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("admin-deck-known-hosts-{name}-{unique}"));
        fs::create_dir_all(&dir).expect("temp directory is created");
        dir.join("known_hosts")
    }
}
