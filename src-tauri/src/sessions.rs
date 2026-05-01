use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
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
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
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
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionStarted {
    session_id: String,
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
        request: StartTerminalSessionRequest,
    ) -> Result<TerminalSessionStarted, String> {
        let session_id = request
            .session_id
            .clone()
            .unwrap_or_else(|| make_session_id(&request.title));
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: request.rows.unwrap_or(24),
                cols: request.cols.unwrap_or(80),
                pixel_width: 0,
                pixel_height: 0,
            })
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
            master: pair.master,
            writer,
            child,
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

        Ok(TerminalSessionStarted { session_id })
    }

    pub fn write_terminal_input(&self, request: TerminalInputRequest) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "terminal session lock is poisoned".to_string())?;
        let session = sessions
            .get_mut(&request.session_id)
            .ok_or_else(|| "terminal session was not found".to_string())?;
        session
            .writer
            .write_all(request.data.as_bytes())
            .map_err(|error| format!("failed to write terminal input: {error}"))?;
        session
            .writer
            .flush()
            .map_err(|error| format!("failed to flush terminal input: {error}"))
    }

    pub fn resize_terminal(&self, request: ResizeTerminalRequest) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "terminal session lock is poisoned".to_string())?;
        let session = sessions
            .get(&request.session_id)
            .ok_or_else(|| "terminal session was not found".to_string())?;
        session
            .master
            .resize(PtySize {
                rows: request.rows,
                cols: request.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("failed to resize terminal: {error}"))
    }

    pub fn close_terminal_session(&self, session_id: String) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "terminal session lock is poisoned".to_string())?;
        if let Some(mut session) = sessions.remove(&session_id) {
            let _ = session.child.kill();
        }
        Ok(())
    }
}

fn command_for(request: &StartTerminalSessionRequest) -> Result<CommandBuilder, String> {
    match request.connection_type.trim().to_lowercase().as_str() {
        "local" => {
            let program = if cfg!(target_os = "windows") {
                "powershell.exe".to_string()
            } else {
                std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
            };
            Ok(CommandBuilder::new(program))
        }
        "ssh" => {
            let host = request.host.trim();
            if host.is_empty() {
                return Err("host is required for SSH sessions".to_string());
            }

            let mut command = CommandBuilder::new("ssh");
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

            let target = match request.user.trim() {
                "" => host.to_string(),
                user => format!("{user}@{host}"),
            };
            command.arg(target);
            Ok(command)
        }
        other => Err(format!(
            "{other} sessions do not have a terminal transport yet"
        )),
    }
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
