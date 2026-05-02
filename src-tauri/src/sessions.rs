use crate::{secrets, ssh};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    ffi::OsString,
    io::{Read, Write},
    sync::Mutex,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

pub struct SessionManager {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct TerminalSession {
    transport: TerminalTransport,
}

enum TerminalTransport {
    Pty {
        master: Box<dyn MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        child: Box<dyn Child + Send + Sync>,
    },
    NativeSsh(ssh::NativeSshTerminal),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTerminalSessionRequest {
    pub session_id: Option<String>,
    pub title: String,
    #[serde(rename = "type")]
    pub connection_type: String,
    pub host: String,
    pub user: String,
    pub port: Option<u16>,
    pub key_path: Option<String>,
    pub proxy_jump: Option<String>,
    pub auth_method: Option<String>,
    pub secret_owner_id: Option<String>,
    pub shell: Option<String>,
    pub initial_directory: Option<String>,
    pub cols: Option<u16>,
    pub pixel_height: Option<u16>,
    pub pixel_width: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionStarted {
    session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminal_ready_ms: Option<u128>,
}

impl TerminalSessionStarted {
    pub fn terminal_ready_ms(&self) -> Option<u128> {
        self.terminal_ready_ms
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    session_id: String,
    data: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInputRequest {
    session_id: String,
    data: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeTerminalRequest {
    session_id: String,
    cols: u16,
    pixel_height: Option<u16>,
    pixel_width: Option<u16>,
    rows: u16,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn start_terminal_session(
        &self,
        app: AppHandle,
        secrets: &secrets::Secrets,
        request: StartTerminalSessionRequest,
    ) -> Result<TerminalSessionStarted, String> {
        let session_id = request
            .session_id
            .clone()
            .unwrap_or_else(|| make_session_id(&request.title));
        let password = connection_password_for(secrets, &request);
        let auth_method = ssh_auth_method_for(&request, password.as_deref())?;
        if uses_native_ssh(&request, password.as_deref(), &auth_method) {
            let known_hosts_path = ssh::app_known_hosts_path(&app)?;
            let auth = native_ssh_auth_for(&request, password, &auth_method)?;
            let session = ssh::start_native_terminal(
                app,
                ssh::NativeSshTerminalRequest {
                    session_id: session_id.clone(),
                    host: request.host.clone(),
                    user: request.user.clone(),
                    port: request.port.unwrap_or(22),
                    auth,
                    known_hosts_path,
                    cols: request.cols.unwrap_or(80),
                    pixel_height: request.pixel_height.unwrap_or(0),
                    pixel_width: request.pixel_width.unwrap_or(0),
                    rows: request.rows.unwrap_or(24),
                    initial_directory: request.initial_directory.clone(),
                },
            )?;
            let terminal_ready_ms = session.terminal_ready_ms();
            self.sessions
                .lock()
                .map_err(|_| "terminal session lock is poisoned".to_string())?
                .insert(
                    session_id.clone(),
                    TerminalSession {
                        transport: TerminalTransport::NativeSsh(session),
                    },
                );
            return Ok(TerminalSessionStarted {
                session_id,
                terminal_ready_ms: Some(terminal_ready_ms),
            });
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(pty_size_for(&request))
            .map_err(|error| format!("failed to open PTY: {error}"))?;

        let command = command_for(&request)?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| format!("failed to create PTY reader: {error}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| format!("failed to create PTY writer: {error}"))?;
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| format!("failed to start terminal process: {error}"))?;
        drop(pair.slave);

        let session = TerminalSession {
            transport: TerminalTransport::Pty {
                master: pair.master,
                writer,
                child,
            },
        };
        self.sessions
            .lock()
            .map_err(|_| "terminal session lock is poisoned".to_string())?
            .insert(session_id.clone(), session);

        let output_session_id = session_id.clone();
        thread::spawn(move || {
            let mut buffer = [0_u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                        let _ = app.emit(
                            "terminal-output",
                            TerminalOutput {
                                session_id: output_session_id.clone(),
                                data,
                            },
                        );
                    }
                    Err(error) => {
                        let _ = app.emit(
                            "terminal-output",
                            TerminalOutput {
                                session_id: output_session_id.clone(),
                                data: format!("\r\n[session read error: {error}]\r\n"),
                            },
                        );
                        break;
                    }
                }
            }
        });

        Ok(TerminalSessionStarted {
            session_id,
            terminal_ready_ms: None,
        })
    }

    pub fn write_terminal_input(&self, request: TerminalInputRequest) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "terminal session lock is poisoned".to_string())?;
        let session = sessions
            .get_mut(&request.session_id)
            .ok_or_else(|| "terminal session was not found".to_string())?;
        match &mut session.transport {
            TerminalTransport::Pty { writer, .. } => {
                writer
                    .write_all(request.data.as_bytes())
                    .map_err(|error| format!("failed to write terminal input: {error}"))?;
                writer
                    .flush()
                    .map_err(|error| format!("failed to flush terminal input: {error}"))
            }
            TerminalTransport::NativeSsh(session) => session.write_input(request.data),
        }
    }

    pub fn resize_terminal(&self, request: ResizeTerminalRequest) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "terminal session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "terminal session was not found".to_string())?;
        match &session.transport {
            TerminalTransport::Pty { master, .. } => master
                .resize(resize_pty_size(&request))
                .map_err(|error| format!("failed to resize terminal: {error}")),
            TerminalTransport::NativeSsh(session) => session.resize(
                request.cols,
                request.rows,
                request.pixel_width.unwrap_or(0),
                request.pixel_height.unwrap_or(0),
            ),
        }
    }

    pub fn close_terminal_session(&self, session_id: String) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "terminal session lock is poisoned".to_string())?
            .remove(&session_id);
        if let Some(mut session) = session {
            match session.transport {
                TerminalTransport::Pty { ref mut child, .. } => {
                    let _ = child.kill();
                }
                TerminalTransport::NativeSsh(session) => session.close(),
            }
        }
        Ok(())
    }
}

fn pty_size_for(request: &StartTerminalSessionRequest) -> PtySize {
    PtySize {
        rows: request.rows.unwrap_or(24),
        cols: request.cols.unwrap_or(80),
        pixel_width: request.pixel_width.unwrap_or(0),
        pixel_height: request.pixel_height.unwrap_or(0),
    }
}

fn resize_pty_size(request: &ResizeTerminalRequest) -> PtySize {
    PtySize {
        rows: request.rows,
        cols: request.cols,
        pixel_width: request.pixel_width.unwrap_or(0),
        pixel_height: request.pixel_height.unwrap_or(0),
    }
}

fn uses_native_ssh(
    request: &StartTerminalSessionRequest,
    password: Option<&str>,
    auth_method: &SshAuthMethod,
) -> bool {
    request.connection_type.trim().eq_ignore_ascii_case("ssh")
        && ssh::can_start_native_terminal(
            request.key_path.as_deref(),
            password,
            matches!(auth_method, SshAuthMethod::Agent),
            request.proxy_jump.as_deref(),
        )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SshAuthMethod {
    KeyFile,
    Password,
    Agent,
}

fn ssh_auth_method_for(
    request: &StartTerminalSessionRequest,
    password: Option<&str>,
) -> Result<SshAuthMethod, String> {
    match request
        .auth_method
        .as_deref()
        .map(str::trim)
        .filter(|method| !method.is_empty())
    {
        Some("keyFile") | Some("key-file") | Some("key") => Ok(SshAuthMethod::KeyFile),
        Some("password") => Ok(SshAuthMethod::Password),
        Some("agent") | Some("sshAgent") | Some("ssh-agent") => Ok(SshAuthMethod::Agent),
        Some(_) => Err("SSH auth method must be keyFile, password, or agent".to_string()),
        None if request
            .key_path
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty()) =>
        {
            Ok(SshAuthMethod::KeyFile)
        }
        None if password.is_some() => Ok(SshAuthMethod::Password),
        None => Ok(SshAuthMethod::Agent),
    }
}

fn native_ssh_auth_for(
    request: &StartTerminalSessionRequest,
    password: Option<String>,
    auth_method: &SshAuthMethod,
) -> Result<ssh::NativeSshAuth, String> {
    match auth_method {
        SshAuthMethod::KeyFile => Ok(ssh::NativeSshAuth::KeyFile {
            key_path: request.key_path.clone().unwrap_or_default(),
        }),
        SshAuthMethod::Password => Ok(ssh::NativeSshAuth::Password {
            password: password
                .ok_or_else(|| "password is required for native SSH sessions".to_string())?,
        }),
        SshAuthMethod::Agent => Ok(ssh::NativeSshAuth::Agent),
    }
}

fn connection_password_for(
    secrets: &secrets::Secrets,
    request: &StartTerminalSessionRequest,
) -> Option<String> {
    if !request.connection_type.trim().eq_ignore_ascii_case("ssh") {
        return None;
    }
    if !matches!(
        ssh_auth_method_for(request, None),
        Ok(SshAuthMethod::Password)
    ) {
        return None;
    }
    if request
        .proxy_jump
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
    {
        return None;
    }
    if request
        .key_path
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
    {
        return None;
    }

    request.secret_owner_id.as_ref().and_then(|owner_id| {
        secrets
            .read_connection_password(owner_id.clone())
            .ok()
            .flatten()
    })
}

fn command_for(request: &StartTerminalSessionRequest) -> Result<CommandBuilder, String> {
    match request.connection_type.trim().to_lowercase().as_str() {
        "local" => {
            let program = request
                .shell
                .as_ref()
                .map(|shell| shell.trim())
                .filter(|shell| !shell.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| {
                    if cfg!(target_os = "windows") {
                        "powershell.exe".to_string()
                    } else {
                        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
                    }
                });
            let mut command = CommandBuilder::new(program);
            set_terminal_environment(&mut command);
            if let Some(directory) = initial_directory_for(request) {
                command.cwd(OsString::from(directory));
            }
            Ok(command)
        }
        "ssh" => {
            let host = request.host.trim();
            if host.is_empty() {
                return Err("host is required for SSH sessions".to_string());
            }

            let mut command = CommandBuilder::new("ssh");
            set_terminal_environment(&mut command);
            command.arg("-tt");
            if let Some(port) = request.port {
                command.arg("-p");
                command.arg(port.to_string());
            }
            if let Some(key_path) = request.key_path.as_ref().map(|value| value.trim()) {
                if !key_path.is_empty() {
                    command.arg("-i");
                    command.arg(key_path);
                }
            }
            if let Some(proxy_jump) = request.proxy_jump.as_ref().map(|value| value.trim()) {
                if !proxy_jump.is_empty() {
                    command.arg("-J");
                    command.arg(proxy_jump);
                }
            }

            let target = match request.user.trim() {
                "" => host.to_string(),
                user => format!("{user}@{host}"),
            };
            command.arg(target);
            if let Some(directory) = initial_directory_for(request) {
                command.arg(remote_shell_command_for_initial_directory(&directory));
            }
            Ok(command)
        }
        other => Err(format!(
            "{other} sessions do not have a terminal transport yet"
        )),
    }
}

fn set_terminal_environment(command: &mut CommandBuilder) {
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
}

fn initial_directory_for(request: &StartTerminalSessionRequest) -> Option<String> {
    request
        .initial_directory
        .as_deref()
        .map(str::trim)
        .filter(|directory| !directory.is_empty() && *directory != "~")
        .map(str::to_string)
}

fn remote_shell_command_for_initial_directory(directory: &str) -> String {
    format!(
        "cd -- {} && exec \"${{SHELL:-sh}}\" -i",
        shell_single_quote(directory)
    )
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
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
    format!(
        "{}-{unique}",
        if slug.is_empty() { "session" } else { &slug }
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssh_auth_method_prefers_explicit_agent_and_key_file() {
        let mut request = ssh_request();

        request.auth_method = Some("agent".to_string());
        assert!(matches!(
            ssh_auth_method_for(&request, None),
            Ok(SshAuthMethod::Agent)
        ));

        request.auth_method = Some("keyFile".to_string());
        request.key_path = Some("C:\\Users\\ryan\\.ssh\\id_ed25519".to_string());
        assert!(matches!(
            ssh_auth_method_for(&request, None),
            Ok(SshAuthMethod::KeyFile)
        ));
    }

    #[test]
    fn password_auth_requires_explicit_password_method_before_reading_keychain() {
        let mut request = ssh_request();
        request.auth_method = Some("password".to_string());
        assert!(matches!(
            ssh_auth_method_for(&request, Some("not-for-sqlite")),
            Ok(SshAuthMethod::Password)
        ));

        request.auth_method = Some("keyboardInteractive".to_string());
        assert!(ssh_auth_method_for(&request, None).is_err());
    }

    fn ssh_request() -> StartTerminalSessionRequest {
        StartTerminalSessionRequest {
            session_id: None,
            title: "Test SSH".to_string(),
            connection_type: "ssh".to_string(),
            host: "example.internal".to_string(),
            user: "admin".to_string(),
            port: Some(22),
            key_path: None,
            proxy_jump: None,
            auth_method: None,
            secret_owner_id: None,
            shell: None,
            initial_directory: None,
            cols: None,
            pixel_height: None,
            pixel_width: None,
            rows: None,
        }
    }

    #[test]
    fn remote_initial_directory_command_quotes_shell_path() {
        assert_eq!(
            remote_shell_command_for_initial_directory("/srv/releases"),
            "cd -- '/srv/releases' && exec \"${SHELL:-sh}\" -i"
        );
        assert_eq!(
            remote_shell_command_for_initial_directory("/srv/app's current"),
            "cd -- '/srv/app'\\''s current' && exec \"${SHELL:-sh}\" -i"
        );
    }

    #[test]
    fn terminal_commands_advertise_xterm_truecolor_capabilities() {
        let mut command = CommandBuilder::new("shell");
        set_terminal_environment(&mut command);

        assert_eq!(
            command.get_env("TERM").and_then(|value| value.to_str()),
            Some("xterm-256color")
        );
        assert_eq!(
            command
                .get_env("COLORTERM")
                .and_then(|value| value.to_str()),
            Some("truecolor")
        );
    }

    #[test]
    fn terminal_pty_size_preserves_pixel_dimensions() {
        let mut request = ssh_request();
        request.cols = Some(132);
        request.rows = Some(43);
        request.pixel_width = Some(1200);
        request.pixel_height = Some(720);

        let size = pty_size_for(&request);

        assert_eq!(size.cols, 132);
        assert_eq!(size.rows, 43);
        assert_eq!(size.pixel_width, 1200);
        assert_eq!(size.pixel_height, 720);
    }
}
