use crate::sessions::TerminalOutput;
use std::{
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    time::Duration,
};
use tauri::{AppHandle, Emitter};

const IAC: u8 = 255;
const DONT: u8 = 254;
const DO: u8 = 253;
const WONT: u8 = 252;
const WILL: u8 = 251;
const SB: u8 = 250;
const SE: u8 = 240;

pub struct NativeTelnetTerminal {
    writer: TcpStream,
}

#[derive(Clone)]
pub struct NativeTelnetTerminalRequest {
    pub session_id: String,
    pub host: String,
    pub user: String,
    pub port: u16,
    pub password: String,
}

enum TelnetParseState {
    Data,
    Command,
    Option(u8),
    Subnegotiation,
    SubnegotiationCommand,
}

struct LoginPrompts {
    sent_user: bool,
    sent_password: bool,
    recent_output: String,
}

impl NativeTelnetTerminal {
    pub fn write_input(&mut self, data: String) -> Result<(), String> {
        self.writer
            .write_all(data.as_bytes())
            .map_err(|error| format!("failed to write Telnet input: {error}"))?;
        self.writer
            .flush()
            .map_err(|error| format!("failed to flush Telnet input: {error}"))
    }

    pub fn close(self) {
        let _ = self.writer.shutdown(std::net::Shutdown::Both);
    }
}

pub fn start_native_terminal(
    app: AppHandle,
    request: NativeTelnetTerminalRequest,
) -> Result<NativeTelnetTerminal, String> {
    let host = request.host.trim();
    if host.is_empty() {
        return Err("host is required for Telnet sessions".to_string());
    }
    if request.user.trim().is_empty() {
        return Err("user is required for Telnet sessions".to_string());
    }
    if request.password.is_empty() {
        return Err("password is required for Telnet sessions".to_string());
    }

    let address = (host, request.port)
        .to_socket_addrs()
        .map_err(|error| format!("failed to resolve Telnet host {host}: {error}"))?
        .next()
        .ok_or_else(|| format!("Telnet host {host} did not resolve to an address"))?;
    let stream = TcpStream::connect_timeout(&address, Duration::from_secs(10))
        .map_err(|error| format!("failed to connect Telnet session: {error}"))?;
    stream
        .set_nodelay(true)
        .map_err(|error| format!("failed to configure Telnet socket: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(250)))
        .map_err(|error| format!("failed to configure Telnet read timeout: {error}"))?;

    let mut reader = stream
        .try_clone()
        .map_err(|error| format!("failed to create Telnet reader: {error}"))?;
    let mut prompt_writer = stream
        .try_clone()
        .map_err(|error| format!("failed to create Telnet login writer: {error}"))?;
    let writer = stream
        .try_clone()
        .map_err(|error| format!("failed to create Telnet writer: {error}"))?;
    std::thread::spawn(move || {
        let mut state = TelnetParseState::Data;
        let mut prompts = LoginPrompts {
            sent_user: false,
            sent_password: false,
            recent_output: String::new(),
        };
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let (data, replies) = parse_telnet_bytes(&buffer[..count], &mut state);
                    if !replies.is_empty() {
                        let _ = prompt_writer.write_all(&replies);
                        let _ = prompt_writer.flush();
                    }
                    if !data.is_empty() {
                        maybe_answer_login_prompt(
                            &mut prompt_writer,
                            &request,
                            &mut prompts,
                            &data,
                        );
                        let _ = app.emit(
                            "terminal-output",
                            TerminalOutput {
                                session_id: request.session_id.clone(),
                                data: String::from_utf8_lossy(&data).to_string(),
                            },
                        );
                    }
                }
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                    ) =>
                {
                    continue;
                }
                Err(error) => {
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: request.session_id.clone(),
                            data: format!("\r\n[Telnet read error: {error}]\r\n"),
                        },
                    );
                    break;
                }
            }
        }
    });

    Ok(NativeTelnetTerminal { writer })
}

fn parse_telnet_bytes(input: &[u8], state: &mut TelnetParseState) -> (Vec<u8>, Vec<u8>) {
    let mut output = Vec::with_capacity(input.len());
    let mut replies = Vec::new();
    for byte in input {
        match *state {
            TelnetParseState::Data => {
                if *byte == IAC {
                    *state = TelnetParseState::Command;
                } else {
                    output.push(*byte);
                }
            }
            TelnetParseState::Command => match *byte {
                IAC => {
                    output.push(IAC);
                    *state = TelnetParseState::Data;
                }
                WILL | WONT | DO | DONT => *state = TelnetParseState::Option(*byte),
                SB => *state = TelnetParseState::Subnegotiation,
                _ => *state = TelnetParseState::Data,
            },
            TelnetParseState::Option(command) => {
                match command {
                    WILL => replies.extend_from_slice(&[IAC, DONT, *byte]),
                    DO => replies.extend_from_slice(&[IAC, WONT, *byte]),
                    _ => {}
                }
                *state = TelnetParseState::Data;
            }
            TelnetParseState::Subnegotiation => {
                if *byte == IAC {
                    *state = TelnetParseState::SubnegotiationCommand;
                }
            }
            TelnetParseState::SubnegotiationCommand => {
                *state = if *byte == SE {
                    TelnetParseState::Data
                } else {
                    TelnetParseState::Subnegotiation
                };
            }
        }
    }
    (output, replies)
}

fn maybe_answer_login_prompt(
    writer: &mut TcpStream,
    request: &NativeTelnetTerminalRequest,
    prompts: &mut LoginPrompts,
    data: &[u8],
) {
    prompts
        .recent_output
        .push_str(&String::from_utf8_lossy(data).to_lowercase());
    if prompts.recent_output.len() > 2048 {
        let keep_from = prompts.recent_output.len().saturating_sub(1024);
        prompts.recent_output = prompts.recent_output[keep_from..].to_string();
    }

    if !prompts.sent_user
        && (prompts.recent_output.contains("login:") || prompts.recent_output.contains("username:"))
    {
        let _ = writer.write_all(format!("{}\r\n", request.user.trim()).as_bytes());
        let _ = writer.flush();
        prompts.sent_user = true;
        prompts.recent_output.clear();
        return;
    }

    if prompts.sent_user && !prompts.sent_password && prompts.recent_output.contains("password:") {
        let _ = writer.write_all(format!("{}\r\n", request.password).as_bytes());
        let _ = writer.flush();
        prompts.sent_password = true;
        prompts.recent_output.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telnet_parser_strips_negotiation_and_replies_refuse_options() {
        let mut state = TelnetParseState::Data;
        let (data, replies) =
            parse_telnet_bytes(&[b'h', b'i', IAC, WILL, 1, IAC, DO, 3, b'!'], &mut state);

        assert_eq!(data, b"hi!");
        assert_eq!(replies, vec![IAC, DONT, 1, IAC, WONT, 3]);
    }

    #[test]
    fn telnet_parser_preserves_escaped_iac_data() {
        let mut state = TelnetParseState::Data;
        let (data, replies) = parse_telnet_bytes(&[b'a', IAC, IAC, b'b'], &mut state);

        assert_eq!(data, vec![b'a', IAC, b'b']);
        assert!(replies.is_empty());
    }
}
