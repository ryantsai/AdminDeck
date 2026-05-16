use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use serde_json::{json, Value};

static LOG_STATUS: OnceLock<String> = OnceLock::new();
static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

pub fn init() {
    let status = match write_startup_line() {
        Ok(path) => {
            let status = format!("Local logs: {}", path.display());
            let _ = LOG_PATH.set(path);
            status
        }
        Err(error) => format!("Local logging unavailable: {error}"),
    };

    let _ = LOG_STATUS.set(status);
}

pub fn log_path() -> Option<PathBuf> {
    LOG_PATH.get().cloned()
}

pub fn status() -> String {
    LOG_STATUS
        .get()
        .cloned()
        .unwrap_or_else(|| "Local logging pending".to_string())
}

pub fn ai_assistant_debug(event: &str, payload: &Value) {
    #[cfg(debug_assertions)]
    {
        let Some(log_path) = LOG_PATH
            .get()
            .map(|path| ai_assistant_debug_log_path_for(path))
        else {
            return;
        };
        let line = format_ai_assistant_debug_log_entry(event, payload);
        if let Err(error) = append_ai_assistant_debug_line(&log_path, &line) {
            eprintln!("failed to write AI Assistant debug log: {error}");
        }
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = event;
        let _ = payload;
    }
}

fn write_startup_line() -> std::io::Result<PathBuf> {
    let log_dir = std::env::current_dir()?.join("logs");
    fs::create_dir_all(&log_dir)?;

    let log_path = log_dir.join("kkterm.log");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;

    writeln!(file, "KKTerm runtime started")?;
    Ok(log_path)
}

fn ai_assistant_debug_log_path_for(runtime_log_path: &Path) -> PathBuf {
    runtime_log_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("aiassistant.debug.log")
}

fn format_ai_assistant_debug_log_entry(event: &str, payload: &Value) -> String {
    let timestamp = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| time::OffsetDateTime::now_utc().unix_timestamp().to_string());
    let line = json!({
        "timestamp": timestamp,
        "event": event,
        "payload": payload,
    });
    format!("{line}\n")
}

#[cfg(debug_assertions)]
fn append_ai_assistant_debug_line(path: &Path, line: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(line.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn ai_assistant_debug_log_path_uses_runtime_log_directory() {
        let path = ai_assistant_debug_log_path_for(Path::new("logs/kkterm.log"));

        assert_eq!(path, PathBuf::from("logs").join("aiassistant.debug.log"));
    }

    #[test]
    fn ai_assistant_debug_log_entry_is_json_line_with_raw_payload() {
        let line = format_ai_assistant_debug_log_entry(
            "tool.request",
            &json!({
                "toolName": "dashboard_create_widget",
                "arguments": {
                    "title": "Git Workflow Diagram",
                    "body": {
                        "source": "mermaid.initialize({ startOnLoad: true });"
                    }
                }
            }),
        );

        assert!(line.ends_with('\n'));
        let parsed: serde_json::Value =
            serde_json::from_str(line.trim_end()).expect("log entry should be valid JSON");
        assert_eq!(parsed["event"], "tool.request");
        assert_eq!(parsed["payload"]["toolName"], "dashboard_create_widget");
        assert_eq!(
            parsed["payload"]["arguments"]["body"]["source"],
            "mermaid.initialize({ startOnLoad: true });"
        );
        assert!(parsed["timestamp"].as_str().is_some_and(|value| !value.is_empty()));
    }
}
