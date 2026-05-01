use russh::{
    client,
    keys::{load_secret_key, PrivateKeyWithHashAlg},
    ChannelMsg, Disconnect,
};
use serde::Serialize;
use std::{
    sync::{mpsc as std_mpsc, Arc},
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::{AppHandle, Emitter};
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
}

#[derive(Clone)]
pub struct NativeSshTerminalRequest {
    pub session_id: String,
    pub host: String,
    pub user: String,
    pub port: u16,
    pub key_path: String,
    pub cols: u16,
    pub rows: u16,
}

enum SshTerminalControl {
    Input(Vec<u8>),
    Resize { cols: u16, rows: u16 },
    Close,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: String,
}

struct TrustingClient;

impl client::Handler for TrustingClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Temporary Milestone B lifecycle behavior. Durable known-host checks
        // are added in the host-key verification milestone.
        Ok(true)
    }
}

pub fn can_start_native_terminal(key_path: Option<&str>, proxy_jump: Option<&str>) -> bool {
    let has_key_path = key_path
        .map(str::trim)
        .is_some_and(|value| !value.is_empty());
    let has_proxy_jump = proxy_jump
        .map(str::trim)
        .is_some_and(|value| !value.is_empty());

    has_key_path && !has_proxy_jump
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

    let key_path = request.key_path.trim();
    if key_path.is_empty() {
        return Err("key path is required for native SSH sessions".to_string());
    }

    let request = NativeSshTerminalRequest {
        session_id: request.session_id,
        host: host.to_string(),
        user: user.to_string(),
        port: request.port,
        key_path: key_path.to_string(),
        cols: request.cols,
        rows: request.rows,
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
        Ok(()) => Ok(NativeSshTerminal {
            control: control_tx,
            worker: Some(worker),
        }),
        Err(error) => {
            let _ = worker.join();
            Err(error)
        }
    }
}

impl NativeSshTerminal {
    pub fn write_input(&self, data: String) -> Result<(), String> {
        self.control
            .send(SshTerminalControl::Input(data.into_bytes()))
            .map_err(|_| "native SSH session is closed".to_string())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.control
            .send(SshTerminalControl::Resize { cols, rows })
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
    ready_tx: std_mpsc::SyncSender<Result<(), String>>,
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
    ready_tx: std_mpsc::SyncSender<Result<(), String>>,
) -> Result<(), String> {
    let key_pair = load_secret_key(&request.key_path, None)
        .map_err(|error| format!("failed to load SSH key: {error}"))?;
    let config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(30)),
        ..Default::default()
    });
    let mut session = client::connect(config, (request.host.as_str(), request.port), TrustingClient)
        .await
        .map_err(|error| format!("failed to connect to SSH server: {error}"))?;

    let auth_result = session
        .authenticate_publickey(
            request.user.clone(),
            PrivateKeyWithHashAlg::new(
                Arc::new(key_pair),
                session
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|error| format!("failed to negotiate SSH key algorithm: {error}"))?
                    .flatten(),
            ),
        )
        .await
        .map_err(|error| format!("SSH key-file authentication failed: {error}"))?;

    if !auth_result.success() {
        return Err("SSH key-file authentication was rejected".to_string());
    }

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
            0,
            0,
            &[],
        )
        .await
        .map_err(|error| format!("failed to allocate SSH PTY: {error}"))?;
    channel
        .request_shell(false)
        .await
        .map_err(|error| format!("failed to start SSH shell: {error}"))?;

    let _ = ready_tx.send(Ok(()));

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
                    Some(SshTerminalControl::Resize { cols, rows }) => {
                        channel
                            .window_change(cols.into(), rows.into(), 0, 0)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn milestone_b_prefers_in_process_rust_ssh() {
        let plan = transport_plan();

        assert_eq!(plan.primary_library, "russh");
        assert_eq!(plan.sftp_candidate, "russh-sftp");
        assert_eq!(plan.fallback_library, "ssh2");
        assert_eq!(plan.system_ssh_role, "debug-fallback");
    }

    #[test]
    fn native_terminal_lifecycle_starts_only_for_key_path_without_proxy_jump() {
        assert!(can_start_native_terminal(Some("C:\\Users\\ryan\\.ssh\\id_ed25519"), None));
        assert!(!can_start_native_terminal(None, None));
        assert!(!can_start_native_terminal(Some("  "), None));
        assert!(!can_start_native_terminal(
            Some("C:\\Users\\ryan\\.ssh\\id_ed25519"),
            Some("bastion")
        ));
    }
}
