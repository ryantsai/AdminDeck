use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::OnceLock,
};

static LOG_STATUS: OnceLock<String> = OnceLock::new();

pub fn init() {
    let status = match write_startup_line() {
        Ok(path) => format!("Local logs: {}", path.display()),
        Err(error) => format!("Local logging unavailable: {error}"),
    };

    let _ = LOG_STATUS.set(status);
}

pub fn status() -> String {
    LOG_STATUS
        .get()
        .cloned()
        .unwrap_or_else(|| "Local logging pending".to_string())
}

fn write_startup_line() -> std::io::Result<PathBuf> {
    let log_dir = std::env::current_dir()?.join("logs");
    fs::create_dir_all(&log_dir)?;

    let log_path = log_dir.join("admin-deck.log");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;

    writeln!(file, "AdminDeck runtime started")?;
    Ok(log_path)
}
