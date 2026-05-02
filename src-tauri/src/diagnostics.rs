use crate::{logging, performance};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsBundle {
    pub path: String,
    pub files: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsManifest {
    product_name: &'static str,
    version: &'static str,
    created_at_unix_seconds: u64,
    target_os: &'static str,
    target_arch: &'static str,
    privacy_note: &'static str,
    performance: performance::PerformanceSnapshot,
    included_files: Vec<String>,
    excluded_by_default: Vec<&'static str>,
}

pub fn create_bundle(
    app: &AppHandle,
    performance: &performance::PerformanceMonitor,
) -> Result<DiagnosticsBundle, String> {
    let created_at_unix_seconds = unix_seconds();
    let bundle_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?
        .join("diagnostics")
        .join(format!("admin-deck-diagnostics-{created_at_unix_seconds}"));
    fs::create_dir_all(&bundle_dir)
        .map_err(|error| format!("failed to create diagnostics directory: {error}"))?;

    let mut files = Vec::new();
    let mut warnings = Vec::new();

    write_text_file(
        &bundle_dir,
        "README.txt",
        [
            "AdminDeck diagnostics bundle",
            "",
            "This bundle is local-only and is not uploaded automatically.",
            "It excludes terminal output, connection secrets, API keys, and the SQLite database by default.",
            "Review files before sharing them.",
            "",
        ]
        .join("\n"),
        &mut files,
    )?;

    if let Some(log_path) = logging::log_path() {
        match copy_file(&log_path, &bundle_dir.join("admin-deck.log")) {
            Ok(()) => files.push("admin-deck.log".to_string()),
            Err(error) => warnings.push(format!("local log was not included: {error}")),
        }
    } else {
        warnings.push("local log path is unavailable".to_string());
    }

    let mut included_files = files.clone();
    included_files.push("manifest.json".to_string());
    let manifest = DiagnosticsManifest {
        product_name: "AdminDeck",
        version: env!("CARGO_PKG_VERSION"),
        created_at_unix_seconds,
        target_os: std::env::consts::OS,
        target_arch: std::env::consts::ARCH,
        privacy_note:
            "Local-only diagnostics; no telemetry, terminal output, secrets, or database copy included by default.",
        performance: performance.snapshot(),
        included_files,
        excluded_by_default: vec![
            "terminal output",
            "connection passwords and passphrases",
            "AI API keys",
            "SQLite connection database",
            "known-host material",
        ],
    };
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("failed to serialize diagnostics manifest: {error}"))?;
    write_text_file(&bundle_dir, "manifest.json", manifest_json, &mut files)?;

    Ok(DiagnosticsBundle {
        path: bundle_dir.display().to_string(),
        files,
        warnings,
    })
}

fn write_text_file(
    bundle_dir: &Path,
    name: &str,
    contents: String,
    files: &mut Vec<String>,
) -> Result<(), String> {
    fs::write(bundle_dir.join(name), contents)
        .map_err(|error| format!("failed to write {name}: {error}"))?;
    files.push(name.to_string());
    Ok(())
}

fn copy_file(source: &Path, destination: &PathBuf) -> Result<(), String> {
    fs::copy(source, destination)
        .map(|_| ())
        .map_err(|error| format!("failed to copy {}: {error}", source.display()))
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}
