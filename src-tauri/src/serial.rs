use crate::sessions::TerminalOutput;
use serial2::SerialPort;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};

pub struct NativeSerialTerminal {
    writer: SerialPort,
    closed: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct NativeSerialTerminalRequest {
    pub session_id: String,
    pub line: String,
    pub speed: u32,
}

impl NativeSerialTerminal {
    pub fn write_input(&mut self, data: String) -> Result<(), String> {
        self.writer
            .write_all(data.as_bytes())
            .map_err(|error| format!("failed to write serial input: {error}"))?;
        self.writer
            .flush()
            .map_err(|error| format!("failed to flush serial input: {error}"))
    }

    pub fn close(self) {
        self.closed.store(true, Ordering::Relaxed);
    }
}

pub fn start_native_terminal(
    app: AppHandle,
    request: NativeSerialTerminalRequest,
) -> Result<NativeSerialTerminal, String> {
    let line = request.line.trim();
    if line.is_empty() {
        return Err("serial line is required".to_string());
    }
    if request.speed == 0 {
        return Err("serial speed must be greater than 0".to_string());
    }

    let mut port = SerialPort::open(line, request.speed)
        .map_err(|error| format!("failed to open serial line {line}: {error}"))?;
    port.set_read_timeout(Duration::from_millis(250))
        .map_err(|error| format!("failed to configure serial read timeout: {error}"))?;
    port.set_write_timeout(Duration::from_secs(5))
        .map_err(|error| format!("failed to configure serial write timeout: {error}"))?;
    let _ = port.set_dtr(true);
    let _ = port.set_rts(true);

    let reader = port
        .try_clone()
        .map_err(|error| format!("failed to create serial reader: {error}"))?;
    let closed = Arc::new(AtomicBool::new(false));
    let reader_closed = Arc::clone(&closed);
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        while !reader_closed.load(Ordering::Relaxed) {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: request.session_id.clone(),
                            data: terminal_text_from_bytes(&buffer[..count]),
                        },
                    );
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
                            data: format!("\r\n[serial read error: {error}]\r\n"),
                        },
                    );
                    break;
                }
            }
        }
    });

    Ok(NativeSerialTerminal {
        writer: port,
        closed,
    })
}

fn terminal_text_from_bytes(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| char::from(*byte)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serial_output_preserves_single_byte_control_and_high_bytes() {
        assert_eq!(
            terminal_text_from_bytes(&[0x1b, b'[', b'A', 0xff]),
            "\u{1b}[A\u{ff}"
        );
    }
}
