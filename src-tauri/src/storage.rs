use crate::window_state::{validate_main_window_settings, MainWindowSettings};
use rusqlite::{params, Connection as SqliteConnection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    fs::{File, OpenOptions},
    io::{copy, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime},
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

const SCHEMA_USER_VERSION: i32 = 7;

const CURRENT_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS connection_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_folder_id TEXT REFERENCES connection_folders(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    folder_id TEXT REFERENCES connection_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    username TEXT NOT NULL,
    port INTEGER,
    key_path TEXT,
    proxy_jump TEXT,
    auth_method TEXT NOT NULL DEFAULT 'keyFile',
    local_shell TEXT,
    url TEXT,
    data_partition TEXT,
    use_tmux_sessions INTEGER NOT NULL DEFAULT 1,
    tmux_connection_id TEXT,
    serial_line TEXT,
    serial_speed INTEGER,
    connection_type TEXT NOT NULL CHECK (connection_type IN ('local', 'ssh', 'telnet', 'serial', 'url', 'rdp', 'vnc')),
    status TEXT NOT NULL CHECK (status IN ('connected', 'idle', 'offline')),
    sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connection_tags (
    connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (connection_id, tag)
);

CREATE TABLE IF NOT EXISTS url_credentials (
    connection_id TEXT PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    page_url TEXT,
    username_selector TEXT,
    password_selector TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_connections_folder_sort
    ON connections(folder_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_connection_folders_parent_sort
    ON connection_folders(parent_folder_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_connection_tags_connection_sort
    ON connection_tags(connection_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_url_credentials_connection
    ON url_credentials(connection_id);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wiki_pages (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES wiki_pages(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    body_md TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_parent_sort
    ON wiki_pages(parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_slug
    ON wiki_pages(slug);

CREATE TABLE IF NOT EXISTS wiki_page_links (
    page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    target_page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    PRIMARY KEY (page_id, target_page_id)
);

CREATE INDEX IF NOT EXISTS idx_wiki_page_links_target
    ON wiki_page_links(target_page_id);

CREATE TABLE IF NOT EXISTS wiki_page_connections (
    page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    PRIMARY KEY (page_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_wiki_page_connections_connection
    ON wiki_page_connections(connection_id);

CREATE VIRTUAL TABLE IF NOT EXISTS wiki_pages_fts USING fts5(
    title,
    body_md,
    content='wiki_pages',
    content_rowid='rowid',
    tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS wiki_pages_ai AFTER INSERT ON wiki_pages BEGIN
    INSERT INTO wiki_pages_fts(rowid, title, body_md) VALUES (new.rowid, new.title, new.body_md);
END;

CREATE TRIGGER IF NOT EXISTS wiki_pages_ad AFTER DELETE ON wiki_pages BEGIN
    INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, body_md) VALUES('delete', old.rowid, old.title, old.body_md);
END;

CREATE TRIGGER IF NOT EXISTS wiki_pages_au AFTER UPDATE ON wiki_pages BEGIN
    INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, body_md) VALUES('delete', old.rowid, old.title, old.body_md);
    INSERT INTO wiki_pages_fts(rowid, title, body_md) VALUES (new.rowid, new.title, new.body_md);
END;

CREATE TABLE IF NOT EXISTS wiki_attachments (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    mime TEXT,
    bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wiki_attachments_page
    ON wiki_attachments(page_id);
"#;

pub struct Storage {
    db_path: PathBuf,
    connection: Mutex<SqliteConnection>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    auto_backup_enabled: bool,
    #[serde(default)]
    last_backup_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseBackupInfo {
    path: String,
    filename: String,
    created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedDatabaseSnapshot {
    general_settings: GeneralSettings,
    terminal_settings: TerminalSettings,
    appearance_settings: AppearanceSettings,
    ssh_settings: SshSettings,
    sftp_settings: SftpSettings,
    url_settings: UrlSettings,
    ai_provider_settings: AiProviderSettings,
    connection_tree: ConnectionTree,
    backup: DatabaseBackupInfo,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettings {
    font_family: String,
    font_size: u16,
    line_height: f32,
    cursor_style: String,
    scrollback_lines: u32,
    copy_on_select: bool,
    confirm_multiline_paste: bool,
    default_shell: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    app_font_family: String,
    color_scheme: String,
    #[serde(default)]
    custom_font_path: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshSettings {
    default_user: String,
    default_port: u16,
    default_key_path: Option<String>,
    default_proxy_jump: Option<String>,
    #[serde(default = "default_ssh_buffer_lines")]
    buffer_lines: u32,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpSettings {
    overwrite_behavior: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlSettings {
    #[serde(default)]
    ignore_certificate_errors: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistantToolSettings {
    #[serde(default)]
    web_search: bool,
    #[serde(default)]
    web_fetch: bool,
    #[serde(default)]
    shell_command: bool,
    #[serde(default)]
    app_data_file_search: bool,
    #[serde(default)]
    app_data_file_read: bool,
    #[serde(default = "default_ai_current_time_tool_enabled")]
    current_time: bool,
}

impl AiAssistantToolSettings {
    pub(crate) fn web_search(&self) -> bool {
        self.web_search
    }
    pub(crate) fn web_fetch(&self) -> bool {
        self.web_fetch
    }
    pub(crate) fn shell_command(&self) -> bool {
        self.shell_command
    }
    pub(crate) fn app_data_file_search(&self) -> bool {
        self.app_data_file_search
    }
    pub(crate) fn app_data_file_read(&self) -> bool {
        self.app_data_file_read
    }
    pub(crate) fn current_time(&self) -> bool {
        self.current_time
    }
    pub(crate) fn any_enabled(&self) -> bool {
        self.web_search
            || self.web_fetch
            || self.shell_command
            || self.app_data_file_search
            || self.app_data_file_read
            || self.current_time
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderSettings {
    #[serde(default)]
    enabled: bool,
    #[serde(default = "default_ai_provider_kind")]
    provider_kind: String,
    base_url: String,
    #[serde(default = "default_ai_model")]
    model: String,
    #[serde(default = "default_ai_reasoning_effort")]
    reasoning_effort: String,
    #[serde(default)]
    output_language: String,
    #[serde(default = "default_ai_cli_execution_policy")]
    cli_execution_policy: String,
    #[serde(default)]
    claude_cli_path: Option<String>,
    #[serde(default)]
    codex_cli_path: Option<String>,
    #[serde(default = "default_ai_assistant_tool_settings")]
    tools: AiAssistantToolSettings,
}

impl AiProviderSettings {
    pub(crate) fn provider_kind(&self) -> &str {
        &self.provider_kind
    }

    pub(crate) fn base_url(&self) -> &str {
        &self.base_url
    }

    pub(crate) fn model(&self) -> &str {
        &self.model
    }

    pub(crate) fn reasoning_effort(&self) -> &str {
        &self.reasoning_effort
    }

    pub(crate) fn tools(&self) -> &AiAssistantToolSettings {
        &self.tools
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTree {
    connections: Vec<SavedConnection>,
    folders: Vec<ConnectionFolder>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionFolder {
    id: String,
    name: String,
    connections: Vec<SavedConnection>,
    folders: Vec<ConnectionFolder>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedConnection {
    id: String,
    name: String,
    host: String,
    user: String,
    port: Option<u16>,
    key_path: Option<String>,
    proxy_jump: Option<String>,
    auth_method: String,
    local_shell: Option<String>,
    url: Option<String>,
    data_partition: Option<String>,
    use_tmux_sessions: bool,
    tmux_connection_id: Option<String>,
    serial_line: Option<String>,
    serial_speed: Option<u32>,
    url_credential_username: Option<String>,
    has_url_credential: bool,
    #[serde(rename = "type")]
    connection_type: String,
    tags: Vec<String>,
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConnectionRequest {
    name: String,
    #[serde(default)]
    host: String,
    #[serde(default)]
    user: String,
    #[serde(rename = "type")]
    connection_type: String,
    folder_id: Option<String>,
    port: Option<u16>,
    key_path: Option<String>,
    proxy_jump: Option<String>,
    auth_method: Option<String>,
    local_shell: Option<String>,
    url: Option<String>,
    data_partition: Option<String>,
    use_tmux_sessions: Option<bool>,
    serial_line: Option<String>,
    serial_speed: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConnectionRequest {
    id: String,
    name: String,
    #[serde(default)]
    host: String,
    #[serde(default)]
    user: String,
    #[serde(rename = "type")]
    connection_type: String,
    folder_id: Option<String>,
    port: Option<u16>,
    key_path: Option<String>,
    proxy_jump: Option<String>,
    auth_method: Option<String>,
    local_shell: Option<String>,
    url: Option<String>,
    data_partition: Option<String>,
    use_tmux_sessions: Option<bool>,
    serial_line: Option<String>,
    serial_speed: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConnectionFolderRequest {
    name: String,
    parent_folder_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameConnectionFolderRequest {
    id: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameConnectionRequest {
    id: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateConnectionRequest {
    id: String,
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveConnectionFolderRequest {
    id: String,
    parent_folder_id: Option<String>,
    target_index: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveConnectionRequest {
    id: String,
    folder_id: Option<String>,
    target_index: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertUrlCredentialRequest {
    connection_id: String,
    username: String,
    #[serde(default)]
    page_url: Option<String>,
    #[serde(default)]
    username_selector: Option<String>,
    #[serde(default)]
    password_selector: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlCredentialSummary {
    connection_id: String,
    connection_name: String,
    url: Option<String>,
    username: String,
    username_selector: Option<String>,
    password_selector: Option<String>,
    updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlDataPartitionSummary {
    name: String,
    connection_count: u32,
}

#[derive(Clone)]
pub(crate) struct UrlCredentialFill {
    pub(crate) username: String,
    pub(crate) username_selector: Option<String>,
    pub(crate) password_selector: Option<String>,
}

impl Storage {
    pub fn open(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "failed to create data directory {}: {error}",
                    parent.display()
                )
            })?;
        }

        let connection = open_initialized_connection(&db_path)?;

        let storage = Self {
            db_path,
            connection: Mutex::new(connection),
        };
        storage.initialize_schema()?;
        Ok(storage)
    }

    pub fn status(&self) -> String {
        format!("SQLite: {}", self.db_path.display())
    }

    pub fn database_folder(&self) -> Result<String, String> {
        let parent = self
            .db_path
            .parent()
            .ok_or_else(|| "database path must include a parent directory".to_string())?;
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create database directory {}: {error}",
                parent.display()
            )
        })?;
        Ok(parent.display().to_string())
    }

    pub fn backup_if_enabled_for_startup(&self) -> Result<Option<DatabaseBackupInfo>, String> {
        if self.general_settings()?.auto_backup_enabled {
            let backup = self.backup_database()?;
            self.delete_old_backups()?;
            Ok(Some(backup))
        } else {
            Ok(None)
        }
    }

    pub fn backup_database(&self) -> Result<DatabaseBackupInfo, String> {
        let backup_dir = self.backup_dir()?;
        fs::create_dir_all(&backup_dir).map_err(|error| {
            format!(
                "failed to create backup directory {}: {error}",
                backup_dir.display()
            )
        })?;
        let path = self.next_backup_path(&backup_dir)?;
        self.write_database_zip(&path, "backup", true)?;
        let created_at = OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_else(|_| "unknown".to_string());
        let backup = DatabaseBackupInfo {
            filename: path
                .file_name()
                .and_then(|filename| filename.to_str())
                .ok_or_else(|| "backup filename is not valid UTF-8".to_string())?
                .to_string(),
            path: path.display().to_string(),
            created_at,
        };
        self.record_last_backup_at(&backup.created_at)?;
        Ok(backup)
    }

    fn write_database_zip(
        &self,
        export_path: &Path,
        temp_prefix: &str,
        create_new: bool,
    ) -> Result<(), String> {
        let temp_db_path = self.temp_database_path(temp_prefix);
        remove_file_if_exists(&temp_db_path)?;
        {
            let connection = self.lock()?;
            let sql_path = temp_db_path
                .to_str()
                .ok_or_else(|| "temporary export path is not valid UTF-8".to_string())?
                .replace("'", "''");
            connection
                .execute_batch(&format!("VACUUM INTO '{}';", sql_path))
                .map_err(|error| format!("failed to snapshot database for export: {error}"))?;
        }

        let export_file = if create_new {
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(export_path)
        } else {
            File::create(export_path)
        }
        .map_err(|error| {
            format!(
                "failed to create export file {}: {error}",
                export_path.display()
            )
        })?;
        let mut zip = ZipWriter::new(export_file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("admin-deck.sqlite3", options)
            .map_err(|error| format!("failed to add database to export: {error}"))?;
        let mut temp_db = File::open(&temp_db_path).map_err(|error| {
            format!(
                "failed to read database snapshot {}: {error}",
                temp_db_path.display()
            )
        })?;
        copy(&mut temp_db, &mut zip)
            .map_err(|error| format!("failed to write database export: {error}"))?;
        zip.start_file("manifest.json", options)
            .map_err(|error| format!("failed to add export manifest: {error}"))?;
        let manifest = serde_json::json!({
            "product": "AdminDeck",
            "format": "admindeck-settings-export",
            "version": 1,
            "createdAt": OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_else(|_| "unknown".to_string()),
        });
        zip.write_all(manifest.to_string().as_bytes())
            .map_err(|error| format!("failed to write export manifest: {error}"))?;
        zip.finish()
            .map_err(|error| format!("failed to finish database export: {error}"))?;
        remove_file_if_exists(&temp_db_path)?;
        Ok(())
    }

    pub fn import_database_zip(
        &self,
        import_path: PathBuf,
    ) -> Result<ImportedDatabaseSnapshot, String> {
        let temp_import_path = self.temp_database_path("import");
        remove_file_if_exists(&temp_import_path)?;
        extract_imported_database(&import_path, &temp_import_path)?;
        validate_import_database(&temp_import_path)?;

        let backup = self.backup_database()?;
        {
            let mut connection = self.lock()?;
            let placeholder = SqliteConnection::open_in_memory()
                .map_err(|error| format!("failed to prepare database replacement: {error}"))?;
            let old_connection = std::mem::replace(&mut *connection, placeholder);
            drop(old_connection);
            fs::copy(&temp_import_path, &self.db_path).map_err(|error| {
                format!(
                    "failed to replace database {} with import {}: {error}",
                    self.db_path.display(),
                    temp_import_path.display()
                )
            })?;
            let new_connection = open_initialized_connection(&self.db_path)?;
            *connection = new_connection;
        }
        remove_file_if_exists(&temp_import_path)?;
        self.record_last_backup_at(&backup.created_at)?;
        Ok(ImportedDatabaseSnapshot {
            general_settings: self.general_settings()?,
            terminal_settings: self.terminal_settings()?,
            appearance_settings: self.appearance_settings()?,
            ssh_settings: self.ssh_settings()?,
            sftp_settings: self.sftp_settings()?,
            url_settings: self.url_settings()?,
            ai_provider_settings: self.ai_provider_settings()?,
            connection_tree: self.list_connection_tree()?,
            backup,
        })
    }

    pub fn list_connection_tree(&self) -> Result<ConnectionTree, String> {
        let connection = self.lock()?;
        Ok(ConnectionTree {
            connections: list_connections_for_folder(&connection, None)?,
            folders: list_folders_for_parent(&connection, None)?,
        })
    }

    pub fn general_settings(&self) -> Result<GeneralSettings, String> {
        let connection = self.lock()?;
        let value = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'general'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(to_storage_error)?;

        match value {
            Some(value) => serde_json::from_str(&value)
                .map(validate_general_settings)
                .map_err(|error| format!("general settings are invalid: {error}"))?,
            None => Ok(default_general_settings()),
        }
    }

    pub fn update_general_settings(
        &self,
        request: GeneralSettings,
    ) -> Result<GeneralSettings, String> {
        let settings = validate_general_settings(request)?;
        let value = serde_json::to_string(&settings)
            .map_err(|error| format!("failed to serialize general settings: {error}"))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('general', ?1, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP",
                params![value],
            )
            .map_err(to_storage_error)?;
        Ok(settings)
    }

    fn record_last_backup_at(&self, created_at: &str) -> Result<GeneralSettings, String> {
        let mut settings = self.general_settings()?;
        settings.last_backup_at = Some(created_at.to_string());
        self.update_general_settings(settings)
    }

    pub fn terminal_settings(&self) -> Result<TerminalSettings, String> {
        let connection = self.lock()?;
        let value = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'terminal'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(to_storage_error)?;

        match value {
            Some(value) => serde_json::from_str(&value)
                .map(validate_terminal_settings)
                .map_err(|error| format!("terminal settings are invalid: {error}"))?,
            None => Ok(default_terminal_settings()),
        }
    }

    pub fn update_terminal_settings(
        &self,
        request: TerminalSettings,
    ) -> Result<TerminalSettings, String> {
        let settings = validate_terminal_settings(request)?;
        let value = serde_json::to_string(&settings)
            .map_err(|error| format!("failed to serialize terminal settings: {error}"))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('terminal', ?1, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP",
                params![value],
            )
            .map_err(to_storage_error)?;
        Ok(settings)
    }

    pub fn appearance_settings(&self) -> Result<AppearanceSettings, String> {
        let connection = self.lock()?;
        let value = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'appearance'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(to_storage_error)?;

        match value {
            Some(value) => serde_json::from_str(&value)
                .map(validate_appearance_settings)
                .map_err(|error| format!("appearance settings are invalid: {error}"))?,
            None => Ok(default_appearance_settings()),
        }
    }

    pub fn update_appearance_settings(
        &self,
        request: AppearanceSettings,
    ) -> Result<AppearanceSettings, String> {
        let settings = validate_appearance_settings(request)?;
        let value = serde_json::to_string(&settings)
            .map_err(|error| format!("failed to serialize appearance settings: {error}"))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('appearance', ?1, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP",
                params![value],
            )
            .map_err(to_storage_error)?;
        Ok(settings)
    }

    pub fn ssh_settings(&self) -> Result<SshSettings, String> {
        let connection = self.lock()?;
        let value = connection
            .query_row("SELECT value FROM settings WHERE key = 'ssh'", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(to_storage_error)?;

        match value {
            Some(value) => serde_json::from_str(&value)
                .map(validate_ssh_settings)
                .map_err(|error| format!("SSH settings are invalid: {error}"))?,
            None => Ok(default_ssh_settings()),
        }
    }

    pub fn update_ssh_settings(&self, request: SshSettings) -> Result<SshSettings, String> {
        let settings = validate_ssh_settings(request)?;
        let value = serde_json::to_string(&settings)
            .map_err(|error| format!("failed to serialize SSH settings: {error}"))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('ssh', ?1, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP",
                params![value],
            )
            .map_err(to_storage_error)?;
        Ok(settings)
    }

    pub fn sftp_settings(&self) -> Result<SftpSettings, String> {
        let connection = self.lock()?;
        let value = connection
            .query_row("SELECT value FROM settings WHERE key = 'sftp'", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(to_storage_error)?;

        match value {
            Some(value) => serde_json::from_str(&value)
                .map(validate_sftp_settings)
                .map_err(|error| format!("SFTP settings are invalid: {error}"))?,
            None => Ok(default_sftp_settings()),
        }
    }

    pub fn update_sftp_settings(&self, request: SftpSettings) -> Result<SftpSettings, String> {
        let settings = validate_sftp_settings(request)?;
        let value = serde_json::to_string(&settings)
            .map_err(|error| format!("failed to serialize SFTP settings: {error}"))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('sftp', ?1, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP",
                params![value],
            )
            .map_err(to_storage_error)?;
        Ok(settings)
    }

    pub fn url_settings(&self) -> Result<UrlSettings, String> {
        let connection = self.lock()?;
        let value = connection
            .query_row("SELECT value FROM settings WHERE key = 'url'", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(to_storage_error)?;

        match value {
            Some(value) => serde_json::from_str(&value)
                .map(validate_url_settings)
                .map_err(|error| format!("URL settings are invalid: {error}"))?,
            None => Ok(default_url_settings()),
        }
    }

    pub fn update_url_settings(&self, request: UrlSettings) -> Result<UrlSettings, String> {
        let settings = validate_url_settings(request)?;
        let value = serde_json::to_string(&settings)
            .map_err(|error| format!("failed to serialize URL settings: {error}"))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('url', ?1, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP",
                params![value],
            )
            .map_err(to_storage_error)?;
        Ok(settings)
    }

    pub fn ai_provider_settings(&self) -> Result<AiProviderSettings, String> {
        let connection = self.lock()?;
        let value = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'ai_provider'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(to_storage_error)?;

        match value {
            Some(value) => serde_json::from_str(&value)
                .map(validate_ai_provider_settings)
                .map_err(|error| format!("AI provider settings are invalid: {error}"))?,
            None => Ok(default_ai_provider_settings()),
        }
    }

    pub fn update_ai_provider_settings(
        &self,
        request: AiProviderSettings,
    ) -> Result<AiProviderSettings, String> {
        let settings = validate_ai_provider_settings(request)?;
        let value = serde_json::to_string(&settings)
            .map_err(|error| format!("failed to serialize AI provider settings: {error}"))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('ai_provider', ?1, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP",
                params![value],
            )
            .map_err(to_storage_error)?;
        Ok(settings)
    }

    pub(crate) fn main_window_settings(&self) -> Result<Option<MainWindowSettings>, String> {
        let connection = self.lock()?;
        let value = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'main_window'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| format!("failed to load main window settings: {error}"))?;

        value
            .map(|value| {
                serde_json::from_str::<MainWindowSettings>(&value)
                    .map_err(|error| format!("main window settings are invalid JSON: {error}"))
                    .and_then(validate_main_window_settings)
            })
            .transpose()
    }

    pub(crate) fn update_main_window_settings(
        &self,
        request: MainWindowSettings,
    ) -> Result<MainWindowSettings, String> {
        let settings = validate_main_window_settings(request)?;
        let value = serde_json::to_string(&settings)
            .map_err(|error| format!("failed to serialize main window settings: {error}"))?;
        let connection = self.lock()?;
        connection
            .execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('main_window', ?1, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP",
                params![value],
            )
            .map_err(|error| format!("failed to update main window settings: {error}"))?;

        Ok(settings)
    }

    fn initialize_schema(&self) -> Result<(), String> {
        let mut connection = self.lock()?;
        connection
            .execute_batch(CURRENT_SCHEMA)
            .map_err(to_storage_error)?;
        run_migrations(&mut connection)?;
        Ok(())
    }

    pub fn create_connection(
        &self,
        request: CreateConnectionRequest,
    ) -> Result<SavedConnection, String> {
        let connection_type = normalize_connection_type(&request.connection_type)?;
        let name = required_field("name", request.name)?;
        let url = normalize_url_field(request.url, &connection_type)?;
        let serial_line = normalize_serial_line(request.serial_line, &connection_type)?;
        let serial_speed = normalize_serial_speed(request.serial_speed, &connection_type)?;
        let port = normalize_connection_port(request.port, &connection_type);
        let host = if connection_type == "url" {
            url.as_deref()
                .and_then(|value| extract_url_host(value))
                .unwrap_or_default()
        } else if connection_type == "serial" {
            serial_line.clone().unwrap_or_else(|| "COM1".to_string())
        } else {
            required_field("host", request.host)?
        };
        let user = normalize_connection_user(request.user, &connection_type)?;
        let folder_id = normalize_optional_id(request.folder_id);
        let key_path = normalize_ssh_optional_field(request.key_path, &connection_type);
        let proxy_jump = normalize_ssh_optional_field(request.proxy_jump, &connection_type);
        let auth_method = normalize_auth_method(request.auth_method, &connection_type, &key_path)?;
        let local_shell = normalize_local_shell(request.local_shell, &connection_type)?;
        let data_partition = normalize_data_partition(request.data_partition, &connection_type)?;
        let id = make_connection_id(&name);
        let use_tmux_sessions =
            normalize_use_tmux_sessions(request.use_tmux_sessions, &connection_type);
        let tmux_connection_id = if use_tmux_sessions {
            Some(make_tmux_connection_id(&id))
        } else {
            None
        };
        let tags = Vec::new();

        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(to_storage_error)?;
        if let Some(folder_id) = folder_id.as_deref() {
            ensure_folder_exists(&transaction, folder_id, folder_name_for(folder_id))?;
        }
        let next_sort_order = next_connection_sort_order(&transaction, folder_id.as_deref())?;

        transaction
            .execute(
                "INSERT INTO connections (
                    id, folder_id, name, host, username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, serial_line, serial_speed, connection_type, status, sort_order
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, 'idle', ?18)",
                params![
                    id,
                    folder_id,
                    name,
                    host,
                    user,
                    port,
                    key_path,
                    proxy_jump,
                    auth_method,
                    local_shell,
                    url,
                    data_partition,
                    use_tmux_sessions,
                    tmux_connection_id,
                    serial_line,
                    serial_speed,
                    connection_type,
                    next_sort_order
                ],
            )
            .map_err(to_storage_error)?;

        for (index, tag) in tags.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO connection_tags (connection_id, tag, sort_order)
                     VALUES (?1, ?2, ?3)",
                    params![id, tag, index as i64],
                )
                .map_err(to_storage_error)?;
        }

        transaction.commit().map_err(to_storage_error)?;

        Ok(SavedConnection {
            id,
            name,
            host,
            user,
            port,
            key_path,
            proxy_jump,
            auth_method,
            local_shell,
            url,
            data_partition,
            use_tmux_sessions,
            tmux_connection_id,
            serial_line,
            serial_speed,
            url_credential_username: None,
            has_url_credential: false,
            connection_type,
            tags,
            status: "idle".to_string(),
        })
    }

    pub fn update_connection(
        &self,
        request: UpdateConnectionRequest,
    ) -> Result<SavedConnection, String> {
        let id = required_field("connection id", request.id)?;
        let connection_type = normalize_connection_type(&request.connection_type)?;
        let name = required_field("name", request.name)?;
        let url = normalize_url_field(request.url, &connection_type)?;
        let serial_line = normalize_serial_line(request.serial_line, &connection_type)?;
        let serial_speed = normalize_serial_speed(request.serial_speed, &connection_type)?;
        let port = normalize_connection_port(request.port, &connection_type);
        let host = if connection_type == "url" {
            url.as_deref()
                .and_then(|value| extract_url_host(value))
                .unwrap_or_default()
        } else if connection_type == "serial" {
            serial_line.clone().unwrap_or_else(|| "COM1".to_string())
        } else {
            required_field("host", request.host)?
        };
        let user = normalize_connection_user(request.user, &connection_type)?;
        let target_folder_id = normalize_optional_id(request.folder_id);
        let key_path = normalize_ssh_optional_field(request.key_path, &connection_type);
        let proxy_jump = normalize_ssh_optional_field(request.proxy_jump, &connection_type);
        let auth_method = normalize_auth_method(request.auth_method, &connection_type, &key_path)?;
        let local_shell = normalize_local_shell(request.local_shell, &connection_type)?;
        let data_partition = normalize_data_partition(request.data_partition, &connection_type)?;
        let use_tmux_sessions =
            normalize_use_tmux_sessions(request.use_tmux_sessions, &connection_type);

        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(to_storage_error)?;
        let existing = transaction
            .query_row(
                "SELECT folder_id, connection_type, tmux_connection_id FROM connections WHERE id = ?1",
                params![&id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(to_storage_error)?
            .ok_or_else(|| "connection was not found".to_string())?;

        let (source_folder_id, existing_connection_type, existing_tmux_connection_id) = existing;
        if existing_connection_type != connection_type {
            return Err("connection type cannot be changed".to_string());
        }
        if let Some(folder_id) = target_folder_id.as_deref() {
            ensure_folder_exists(&transaction, folder_id, folder_name_for(folder_id))?;
        }

        let tmux_connection_id = if use_tmux_sessions && connection_type == "ssh" {
            Some(existing_tmux_connection_id.unwrap_or_else(|| make_tmux_connection_id(&id)))
        } else {
            None
        };
        let sort_order = if source_folder_id == target_folder_id {
            transaction
                .query_row(
                    "SELECT sort_order FROM connections WHERE id = ?1",
                    params![&id],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(to_storage_error)?
        } else {
            next_connection_sort_order(&transaction, target_folder_id.as_deref())?
        };

        transaction
            .execute(
                "UPDATE connections
                 SET folder_id = ?1,
                     name = ?2,
                     host = ?3,
                     username = ?4,
                     port = ?5,
                     key_path = ?6,
                     proxy_jump = ?7,
                     auth_method = ?8,
                     local_shell = ?9,
                     url = ?10,
                     data_partition = ?11,
                     use_tmux_sessions = ?12,
                     tmux_connection_id = ?13,
                     serial_line = ?14,
                     serial_speed = ?15,
                     sort_order = ?16
                 WHERE id = ?17",
                params![
                    target_folder_id,
                    name,
                    host,
                    user,
                    port,
                    key_path,
                    proxy_jump,
                    auth_method,
                    local_shell,
                    url,
                    data_partition,
                    use_tmux_sessions,
                    tmux_connection_id,
                    serial_line,
                    serial_speed,
                    sort_order,
                    &id
                ],
            )
            .map_err(to_storage_error)?;

        if source_folder_id != target_folder_id {
            reorder_connection_ids(&transaction, source_folder_id.as_deref(), None)?;
            reorder_connection_ids(&transaction, target_folder_id.as_deref(), None)?;
        }

        transaction.commit().map_err(to_storage_error)?;
        get_connection_by_id(&connection, &id)
    }

    pub fn upsert_url_credential(
        &self,
        request: UpsertUrlCredentialRequest,
    ) -> Result<SavedConnection, String> {
        let connection_id = required_field("connection id", request.connection_id)?;
        let username = required_field("URL credential username", request.username)?;
        let page_url = normalize_optional_text(request.page_url);
        let username_selector = normalize_optional_text(request.username_selector);
        let password_selector = normalize_optional_text(request.password_selector);
        let connection = self.lock()?;
        let connection_type = connection
            .query_row(
                "SELECT connection_type FROM connections WHERE id = ?1",
                params![&connection_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(to_storage_error)?
            .ok_or_else(|| "connection was not found".to_string())?;
        if connection_type != "url" {
            return Err("URL credentials can only be stored for URL connections".to_string());
        }

        connection
            .execute(
                "INSERT INTO url_credentials (connection_id, username, page_url, username_selector, password_selector, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
                 ON CONFLICT(connection_id) DO UPDATE SET
                    username = excluded.username,
                    page_url = excluded.page_url,
                    username_selector = excluded.username_selector,
                    password_selector = excluded.password_selector,
                    updated_at = CURRENT_TIMESTAMP",
                params![&connection_id, &username, page_url, username_selector, password_selector],
            )
            .map_err(to_storage_error)?;

        get_connection_by_id(&connection, &connection_id)
    }

    pub(crate) fn url_credential_fill(
        &self,
        connection_id: &str,
    ) -> Result<Option<UrlCredentialFill>, String> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT username, username_selector, password_selector FROM url_credentials WHERE connection_id = ?1",
                params![connection_id],
                |row| {
                    Ok(UrlCredentialFill {
                        username: row.get(0)?,
                        username_selector: row.get(1)?,
                        password_selector: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(to_storage_error)
    }

    pub fn list_url_credentials(&self) -> Result<Vec<UrlCredentialSummary>, String> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT connections.id, connections.name, connections.url, url_credentials.username,
                        url_credentials.username_selector, url_credentials.password_selector, url_credentials.updated_at
                 FROM url_credentials
                 INNER JOIN connections ON connections.id = url_credentials.connection_id
                 ORDER BY lower(connections.name), lower(url_credentials.username)",
            )
            .map_err(to_storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(UrlCredentialSummary {
                    connection_id: row.get(0)?,
                    connection_name: row.get(1)?,
                    url: row.get(2)?,
                    username: row.get(3)?,
                    username_selector: row.get(4)?,
                    password_selector: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(to_storage_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(to_storage_error)
    }

    pub fn delete_url_credential(&self, connection_id: String) -> Result<(), String> {
        let connection_id = required_field("connection id", connection_id)?;
        let connection = self.lock()?;
        connection
            .execute(
                "DELETE FROM url_credentials WHERE connection_id = ?1",
                params![connection_id],
            )
            .map_err(to_storage_error)?;
        Ok(())
    }

    pub fn list_url_data_partitions(&self) -> Result<Vec<UrlDataPartitionSummary>, String> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT data_partition, COUNT(*)
                 FROM connections
                 WHERE connection_type = 'url' AND data_partition IS NOT NULL AND trim(data_partition) <> ''
                 GROUP BY data_partition
                 ORDER BY lower(data_partition)",
            )
            .map_err(to_storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(UrlDataPartitionSummary {
                    name: row.get(0)?,
                    connection_count: row.get::<_, i64>(1)?.max(0) as u32,
                })
            })
            .map_err(to_storage_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(to_storage_error)
    }

    pub fn clear_url_data_partition(&self, name: String) -> Result<(), String> {
        let name = required_field("URL data shard", name)?;
        let connection = self.lock()?;
        connection
            .execute(
                "UPDATE connections SET data_partition = NULL WHERE connection_type = 'url' AND data_partition = ?1",
                params![name],
            )
            .map_err(to_storage_error)?;
        Ok(())
    }

    pub fn create_connection_folder(
        &self,
        request: CreateConnectionFolderRequest,
    ) -> Result<ConnectionFolder, String> {
        let name = required_field("folder name", request.name)?;
        let parent_folder_id = normalize_optional_id(request.parent_folder_id);
        let id = make_folder_id(&name);
        let connection = self.lock()?;
        if let Some(parent_folder_id) = parent_folder_id.as_deref() {
            ensure_folder_exists(
                &connection,
                parent_folder_id,
                folder_name_for(parent_folder_id),
            )?;
        }
        let next_sort_order = next_folder_sort_order(&connection, parent_folder_id.as_deref())?;

        connection
            .execute(
                "INSERT INTO connection_folders (id, name, parent_folder_id, sort_order) VALUES (?1, ?2, ?3, ?4)",
                params![id, name, parent_folder_id, next_sort_order],
            )
            .map_err(to_storage_error)?;

        Ok(ConnectionFolder {
            id,
            name,
            connections: Vec::new(),
            folders: Vec::new(),
        })
    }

    pub fn rename_connection_folder(
        &self,
        request: RenameConnectionFolderRequest,
    ) -> Result<ConnectionFolder, String> {
        let id = required_field("folder id", request.id)?;
        let name = required_field("folder name", request.name)?;
        let connection = self.lock()?;
        let affected = connection
            .execute(
                "UPDATE connection_folders SET name = ?1 WHERE id = ?2",
                params![name, id],
            )
            .map_err(to_storage_error)?;

        if affected == 0 {
            return Err("connection folder was not found".to_string());
        }

        get_folder_by_id(&connection, &id, name)
    }

    pub fn delete_connection_folder(&self, folder_id: String) -> Result<(), String> {
        let folder_id = required_field("folder id", folder_id)?;
        let connection = self.lock()?;
        let affected = connection
            .execute(
                "DELETE FROM connection_folders WHERE id = ?1",
                params![folder_id],
            )
            .map_err(to_storage_error)?;

        if affected == 0 {
            return Err("connection folder was not found".to_string());
        }

        Ok(())
    }

    pub fn rename_connection(
        &self,
        request: RenameConnectionRequest,
    ) -> Result<SavedConnection, String> {
        let id = required_field("connection id", request.id)?;
        let name = required_field("name", request.name)?;
        let connection = self.lock()?;
        let affected = connection
            .execute(
                "UPDATE connections SET name = ?1 WHERE id = ?2",
                params![name, id],
            )
            .map_err(to_storage_error)?;

        if affected == 0 {
            return Err("connection was not found".to_string());
        }

        get_connection_by_id(&connection, &id)
    }

    pub fn delete_connection(&self, connection_id: String) -> Result<(), String> {
        let connection_id = required_field("connection id", connection_id)?;
        let connection = self.lock()?;
        let affected = connection
            .execute(
                "DELETE FROM connections WHERE id = ?1",
                params![connection_id],
            )
            .map_err(to_storage_error)?;

        if affected == 0 {
            return Err("connection was not found".to_string());
        }

        Ok(())
    }

    pub fn duplicate_connection(
        &self,
        request: DuplicateConnectionRequest,
    ) -> Result<SavedConnection, String> {
        let source_id = required_field("connection id", request.id)?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(to_storage_error)?;

        let source = transaction
            .query_row(
                "SELECT folder_id, name, host, username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, serial_line, serial_speed, connection_type
                 FROM connections
                 WHERE id = ?1",
                params![source_id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        optional_port(row.get::<_, Option<i64>>(4)?)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, Option<String>>(9)?,
                        row.get::<_, Option<String>>(10)?,
                        row.get::<_, bool>(11)?,
                        row.get::<_, Option<String>>(12)?,
                        optional_serial_speed(row.get::<_, Option<i64>>(13)?)?,
                        row.get::<_, String>(14)?,
                    ))
                },
            )
            .optional()
            .map_err(to_storage_error)?
            .ok_or_else(|| "connection was not found".to_string())?;
        let (
            folder_id,
            source_name,
            host,
            user,
            port,
            key_path,
            proxy_jump,
            auth_method,
            local_shell,
            url,
            data_partition,
            use_tmux_sessions,
            serial_line,
            serial_speed,
            connection_type,
        ) = source;
        let duplicate_name = request
            .name
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| format!("Copy of {source_name}"));
        let duplicate_id = make_connection_id(&duplicate_name);
        let tmux_connection_id = if use_tmux_sessions && connection_type == "ssh" {
            Some(make_tmux_connection_id(&duplicate_id))
        } else {
            None
        };
        let next_sort_order = next_connection_sort_order(&transaction, folder_id.as_deref())?;

        transaction
            .execute(
                "INSERT INTO connections (
                    id, folder_id, name, host, username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, serial_line, serial_speed, connection_type, status, sort_order
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, 'idle', ?18)",
                params![
                    duplicate_id,
                    folder_id,
                    duplicate_name,
                    host,
                    user,
                    port,
                    key_path,
                    proxy_jump,
                    auth_method,
                    local_shell,
                    url,
                    data_partition,
                    use_tmux_sessions,
                    tmux_connection_id,
                    serial_line,
                    serial_speed,
                    connection_type,
                    next_sort_order
                ],
            )
            .map_err(to_storage_error)?;

        transaction.commit().map_err(to_storage_error)?;
        get_connection_by_id(&connection, &duplicate_id)
    }

    pub fn move_connection_folder(
        &self,
        request: MoveConnectionFolderRequest,
    ) -> Result<ConnectionTree, String> {
        let id = required_field("folder id", request.id)?;
        let target_parent_folder_id = normalize_optional_id(request.parent_folder_id);
        if target_parent_folder_id.as_deref() == Some(id.as_str()) {
            return Err("a folder cannot be moved into itself".to_string());
        }
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(to_storage_error)?;
        let source_parent_folder_id = folder_parent_id(&transaction, &id)?
            .ok_or_else(|| "connection folder was not found".to_string())?;
        if let Some(parent_id) = target_parent_folder_id.as_deref() {
            ensure_folder_exists(&transaction, parent_id, folder_name_for(parent_id))?;
            if folder_has_descendant(&transaction, &id, parent_id)? {
                return Err("a folder cannot be moved into one of its subfolders".to_string());
            }
        }

        let target_index = if source_parent_folder_id == target_parent_folder_id {
            let folder_ids =
                list_folder_ids_for_parent(&transaction, source_parent_folder_id.as_deref())?;
            match folder_ids.iter().position(|folder_id| folder_id == &id) {
                Some(current_index) if current_index < request.target_index => {
                    request.target_index.saturating_sub(1)
                }
                _ => request.target_index,
            }
        } else {
            request.target_index
        };

        transaction
            .execute(
                "UPDATE connection_folders SET parent_folder_id = ?1 WHERE id = ?2",
                params![target_parent_folder_id, id],
            )
            .map_err(to_storage_error)?;
        reorder_folder_ids(&transaction, source_parent_folder_id.as_deref(), None)?;
        reorder_folder_ids(
            &transaction,
            target_parent_folder_id.as_deref(),
            Some((&id, target_index)),
        )?;
        transaction.commit().map_err(to_storage_error)?;
        drop(connection);
        self.list_connection_tree()
    }

    pub fn move_connection(
        &self,
        request: MoveConnectionRequest,
    ) -> Result<ConnectionTree, String> {
        let id = required_field("connection id", request.id)?;
        let target_folder_id = normalize_optional_id(request.folder_id);
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(to_storage_error)?;

        let source_folder_id = transaction
            .query_row(
                "SELECT folder_id FROM connections WHERE id = ?1",
                params![id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(to_storage_error)?
            .ok_or_else(|| "connection was not found".to_string())?;

        let target_index = if source_folder_id == target_folder_id {
            let connection_ids =
                list_connection_ids_for_folder(&transaction, source_folder_id.as_deref())?;
            match connection_ids
                .iter()
                .position(|connection_id| connection_id == &id)
            {
                Some(current_index) if current_index < request.target_index => {
                    request.target_index.saturating_sub(1)
                }
                _ => request.target_index,
            }
        } else {
            request.target_index
        };

        if let Some(target_folder_id) = target_folder_id.as_deref() {
            ensure_folder_exists(
                &transaction,
                target_folder_id,
                folder_name_for(target_folder_id),
            )?;
        }

        transaction
            .execute(
                "UPDATE connections SET folder_id = ?1 WHERE id = ?2",
                params![target_folder_id, id],
            )
            .map_err(to_storage_error)?;

        reorder_connection_ids(&transaction, source_folder_id.as_deref(), None)?;
        reorder_connection_ids(
            &transaction,
            target_folder_id.as_deref(),
            Some((&id, target_index)),
        )?;
        transaction.commit().map_err(to_storage_error)?;
        drop(connection);
        self.list_connection_tree()
    }

    fn temp_database_path(&self, prefix: &str) -> PathBuf {
        let parent = self.db_path.parent().unwrap_or_else(|| Path::new("."));
        parent.join(format!(
            "admin-deck-{prefix}-{}.sqlite3",
            timestamp_for_filename()
        ))
    }

    fn backup_dir(&self) -> Result<PathBuf, String> {
        let parent = self
            .db_path
            .parent()
            .ok_or_else(|| "database path must include a parent directory".to_string())?;
        Ok(parent.join("backups"))
    }

    fn next_backup_path(&self, backup_dir: &Path) -> Result<PathBuf, String> {
        let timestamp = timestamp_for_filename();
        for serial in 1..=999 {
            let filename = format!("admin-deck-{timestamp}-{serial:03}.zip");
            let path = backup_dir.join(filename);
            if !path.exists() {
                return Ok(path);
            }
        }
        Err(format!(
            "failed to choose an unused backup filename in {}",
            backup_dir.display()
        ))
    }

    fn delete_old_backups(&self) -> Result<(), String> {
        let backup_dir = self.backup_dir()?;
        let cutoff = SystemTime::now()
            .checked_sub(Duration::from_secs(7 * 24 * 60 * 60))
            .unwrap_or(SystemTime::UNIX_EPOCH);
        let entries = match fs::read_dir(&backup_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => {
                return Err(format!(
                    "failed to read backup directory {}: {error}",
                    backup_dir.display()
                ))
            }
        };

        for entry in entries {
            let entry =
                entry.map_err(|error| format!("failed to inspect backup entry: {error}"))?;
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("zip") {
                continue;
            }
            let metadata = entry
                .metadata()
                .map_err(|error| format!("failed to inspect backup {}: {error}", path.display()))?;
            if metadata.modified().unwrap_or(SystemTime::now()) < cutoff {
                remove_file_if_exists(&path)?;
            }
        }
        Ok(())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, SqliteConnection>, String> {
        self.connection
            .lock()
            .map_err(|_| "SQLite connection lock is poisoned".to_string())
    }

    pub(crate) fn with_connection<R>(
        &self,
        body: impl FnOnce(&SqliteConnection) -> Result<R, String>,
    ) -> Result<R, String> {
        let connection = self.lock()?;
        body(&connection)
    }

    pub(crate) fn with_connection_mut<R>(
        &self,
        body: impl FnOnce(&mut SqliteConnection) -> Result<R, String>,
    ) -> Result<R, String> {
        let mut connection = self.lock()?;
        body(&mut connection)
    }
}

fn open_initialized_connection(db_path: &Path) -> Result<SqliteConnection, String> {
    let connection = SqliteConnection::open(db_path)
        .map_err(|error| format!("failed to open SQLite database: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("failed to enable SQLite foreign keys: {error}"))?;
    Ok(connection)
}

fn timestamp_for_filename() -> String {
    let format = time::macros::format_description!("[year][month][day]-[hour][minute][second]");
    OffsetDateTime::now_utc()
        .format(format)
        .unwrap_or_else(|_| {
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|duration| duration.as_secs().to_string())
                .unwrap_or_else(|_| "0".to_string())
        })
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("failed to remove file {}: {error}", path.display())),
    }
}

fn extract_imported_database(import_path: &Path, temp_import_path: &Path) -> Result<(), String> {
    let import_file = File::open(import_path).map_err(|error| {
        format!(
            "failed to open import file {}: {error}",
            import_path.display()
        )
    })?;
    let mut archive = ZipArchive::new(import_file)
        .map_err(|error| format!("import file is not a valid AdminDeck export zip: {error}"))?;
    let mut db_file = archive
        .by_name("admin-deck.sqlite3")
        .map_err(|_| "import zip does not contain admin-deck.sqlite3".to_string())?;
    let mut contents = Vec::new();
    db_file
        .read_to_end(&mut contents)
        .map_err(|error| format!("failed to read imported database: {error}"))?;
    fs::write(temp_import_path, contents).map_err(|error| {
        format!(
            "failed to write imported database snapshot {}: {error}",
            temp_import_path.display()
        )
    })
}

fn validate_import_database(path: &Path) -> Result<(), String> {
    let connection = open_initialized_connection(path)?;
    let user_version: i32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| format!("failed to inspect imported database schema: {error}"))?;
    if user_version > SCHEMA_USER_VERSION {
        return Err(format!(
            "imported database schema version {user_version} is newer than this app supports ({SCHEMA_USER_VERSION})"
        ));
    }
    drop(connection);
    let storage = Storage::open(path.to_path_buf())?;
    storage.general_settings()?;
    storage.terminal_settings()?;
    storage.appearance_settings()?;
    storage.ssh_settings()?;
    storage.sftp_settings()?;
    storage.ai_provider_settings()?;
    storage.list_connection_tree()?;
    Ok(())
}

fn list_connections_for_folder(
    connection: &SqliteConnection,
    folder_id: Option<&str>,
) -> Result<Vec<SavedConnection>, String> {
    let where_clause = if folder_id.is_some() {
        "folder_id = ?1"
    } else {
        "folder_id IS NULL"
    };
    let mut statement = connection
        .prepare(&format!(
            "SELECT connections.id, name, host, connections.username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type, serial_line, serial_speed,
                    url_credentials.username
             FROM connections
             LEFT JOIN url_credentials ON url_credentials.connection_id = connections.id
             WHERE {where_clause}
             ORDER BY sort_order, name",
        ))
        .map_err(to_storage_error)?;

    let rows = if let Some(folder_id) = folder_id {
        statement
            .query_map(params![folder_id], saved_connection_from_row)
            .map_err(to_storage_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_storage_error)?
    } else {
        statement
            .query_map([], saved_connection_from_row)
            .map_err(to_storage_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_storage_error)?
    };

    let mut connections = Vec::new();
    for row in rows {
        let mut saved_connection = row;
        saved_connection.tags = list_tags(connection, &saved_connection.id)?;
        connections.push(saved_connection);
    }

    Ok(connections)
}

fn list_folders_for_parent(
    connection: &SqliteConnection,
    parent_folder_id: Option<&str>,
) -> Result<Vec<ConnectionFolder>, String> {
    let folder_ids = list_folder_ids_for_parent(connection, parent_folder_id)?;
    folder_ids
        .into_iter()
        .map(|folder_id| {
            let name = connection
                .query_row(
                    "SELECT name FROM connection_folders WHERE id = ?1",
                    params![folder_id],
                    |row| row.get::<_, String>(0),
                )
                .map_err(to_storage_error)?;
            get_folder_by_id(connection, &folder_id, name)
        })
        .collect()
}

fn get_folder_by_id(
    connection: &SqliteConnection,
    id: &str,
    name: String,
) -> Result<ConnectionFolder, String> {
    Ok(ConnectionFolder {
        id: id.to_string(),
        name,
        connections: list_connections_for_folder(connection, Some(id))?,
        folders: list_folders_for_parent(connection, Some(id))?,
    })
}

fn list_folder_ids_for_parent(
    connection: &SqliteConnection,
    parent_folder_id: Option<&str>,
) -> Result<Vec<String>, String> {
    let where_clause = if parent_folder_id.is_some() {
        "parent_folder_id = ?1"
    } else {
        "parent_folder_id IS NULL"
    };
    let mut statement = connection
        .prepare(&format!(
            "SELECT id
             FROM connection_folders
             WHERE {where_clause}
             ORDER BY sort_order, name",
        ))
        .map_err(to_storage_error)?;

    if let Some(parent_folder_id) = parent_folder_id {
        statement
            .query_map(params![parent_folder_id], |row| row.get::<_, String>(0))
            .map_err(to_storage_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_storage_error)
    } else {
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(to_storage_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_storage_error)
    }
}

fn folder_parent_id(
    connection: &SqliteConnection,
    folder_id: &str,
) -> Result<Option<Option<String>>, String> {
    connection
        .query_row(
            "SELECT parent_folder_id FROM connection_folders WHERE id = ?1",
            params![folder_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(to_storage_error)
}

fn folder_has_descendant(
    connection: &SqliteConnection,
    folder_id: &str,
    descendant_id: &str,
) -> Result<bool, String> {
    let children = list_folder_ids_for_parent(connection, Some(folder_id))?;
    for child_id in children {
        if child_id == descendant_id || folder_has_descendant(connection, &child_id, descendant_id)?
        {
            return Ok(true);
        }
    }

    Ok(false)
}

fn next_connection_sort_order(
    connection: &SqliteConnection,
    folder_id: Option<&str>,
) -> Result<i64, String> {
    if let Some(folder_id) = folder_id {
        connection
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM connections WHERE folder_id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .map_err(to_storage_error)
    } else {
        connection
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM connections WHERE folder_id IS NULL",
                [],
                |row| row.get(0),
            )
            .map_err(to_storage_error)
    }
}

fn next_folder_sort_order(
    connection: &SqliteConnection,
    parent_folder_id: Option<&str>,
) -> Result<i64, String> {
    if let Some(parent_folder_id) = parent_folder_id {
        connection
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM connection_folders WHERE parent_folder_id = ?1",
                params![parent_folder_id],
                |row| row.get(0),
            )
            .map_err(to_storage_error)
    } else {
        connection
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM connection_folders WHERE parent_folder_id IS NULL",
                [],
                |row| row.get(0),
            )
            .map_err(to_storage_error)
    }
}

fn reorder_folder_ids(
    connection: &SqliteConnection,
    parent_folder_id: Option<&str>,
    moved_folder: Option<(&str, usize)>,
) -> Result<(), String> {
    let mut folder_ids = list_folder_ids_for_parent(connection, parent_folder_id)?;
    if let Some((folder_id, target_index)) = moved_folder {
        folder_ids.retain(|id| id != folder_id);
        let target_index = target_index.min(folder_ids.len());
        folder_ids.insert(target_index, folder_id.to_string());
    }

    for (index, folder_id) in folder_ids.iter().enumerate() {
        connection
            .execute(
                "UPDATE connection_folders SET sort_order = ?1 WHERE id = ?2",
                params![index as i64, folder_id],
            )
            .map_err(to_storage_error)?;
    }

    Ok(())
}

fn reorder_connection_ids(
    connection: &SqliteConnection,
    folder_id: Option<&str>,
    moved_connection: Option<(&str, usize)>,
) -> Result<(), String> {
    let mut connection_ids = list_connection_ids_for_folder(connection, folder_id)?;
    if let Some((connection_id, target_index)) = moved_connection {
        connection_ids.retain(|id| id != connection_id);
        let target_index = target_index.min(connection_ids.len());
        connection_ids.insert(target_index, connection_id.to_string());
    }

    for (index, connection_id) in connection_ids.iter().enumerate() {
        connection
            .execute(
                "UPDATE connections SET sort_order = ?1 WHERE id = ?2",
                params![index as i64, connection_id],
            )
            .map_err(to_storage_error)?;
    }

    Ok(())
}

fn list_connection_ids_for_folder(
    connection: &SqliteConnection,
    folder_id: Option<&str>,
) -> Result<Vec<String>, String> {
    let where_clause = if folder_id.is_some() {
        "folder_id = ?1"
    } else {
        "folder_id IS NULL"
    };
    let mut statement = connection
        .prepare(&format!(
            "SELECT id
             FROM connections
             WHERE {where_clause}
             ORDER BY sort_order, name",
        ))
        .map_err(to_storage_error)?;

    if let Some(folder_id) = folder_id {
        statement
            .query_map(params![folder_id], |row| row.get::<_, String>(0))
            .map_err(to_storage_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_storage_error)
    } else {
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(to_storage_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_storage_error)
    }
}

fn get_connection_by_id(
    connection: &SqliteConnection,
    connection_id: &str,
) -> Result<SavedConnection, String> {
    let saved_connection = connection
        .query_row(
            "SELECT connections.id, name, host, connections.username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type, serial_line, serial_speed,
                    url_credentials.username
             FROM connections
             LEFT JOIN url_credentials ON url_credentials.connection_id = connections.id
             WHERE connections.id = ?1",
            params![connection_id],
            |row| {
                let url_credential_username: Option<String> = row.get(16)?;
                Ok(SavedConnection {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    host: row.get(2)?,
                    user: row.get(3)?,
                    port: optional_port(row.get::<_, Option<i64>>(4)?)?,
                    key_path: row.get(5)?,
                    proxy_jump: row.get(6)?,
                    auth_method: row.get(7)?,
                    local_shell: row.get(8)?,
                    url: row.get(9)?,
                    data_partition: row.get(10)?,
                    use_tmux_sessions: row.get(11)?,
                    tmux_connection_id: row.get(12)?,
                    connection_type: row.get(13)?,
                    serial_line: row.get(14)?,
                    serial_speed: optional_serial_speed(row.get::<_, Option<i64>>(15)?)?,
                    url_credential_username: url_credential_username.clone(),
                    has_url_credential: url_credential_username.is_some(),
                    status: "idle".to_string(),
                    tags: Vec::new(),
                })
            },
        )
        .optional()
        .map_err(to_storage_error)?
        .ok_or_else(|| "connection was not found".to_string())?;

    Ok(SavedConnection {
        tags: list_tags(connection, &saved_connection.id)?,
        ..saved_connection
    })
}

fn saved_connection_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedConnection> {
    let url_credential_username: Option<String> = row.get(16)?;
    Ok(SavedConnection {
        id: row.get(0)?,
        name: row.get(1)?,
        host: row.get(2)?,
        user: row.get(3)?,
        port: optional_port(row.get::<_, Option<i64>>(4)?)?,
        key_path: row.get(5)?,
        proxy_jump: row.get(6)?,
        auth_method: row.get(7)?,
        local_shell: row.get(8)?,
        url: row.get(9)?,
        data_partition: row.get(10)?,
        use_tmux_sessions: row.get(11)?,
        tmux_connection_id: row.get(12)?,
        connection_type: row.get(13)?,
        serial_line: row.get(14)?,
        serial_speed: optional_serial_speed(row.get::<_, Option<i64>>(15)?)?,
        url_credential_username: url_credential_username.clone(),
        has_url_credential: url_credential_username.is_some(),
        status: "idle".to_string(),
        tags: Vec::new(),
    })
}

fn list_tags(connection: &SqliteConnection, connection_id: &str) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT tag
             FROM connection_tags
             WHERE connection_id = ?1
             ORDER BY sort_order, tag",
        )
        .map_err(to_storage_error)?;

    let rows = statement
        .query_map(params![connection_id], |row| row.get::<_, String>(0))
        .map_err(to_storage_error)?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(to_storage_error)
}

fn insert_folder(
    connection: &SqliteConnection,
    id: &str,
    name: &str,
    parent_folder_id: Option<&str>,
    sort_order: i64,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO connection_folders (id, name, parent_folder_id, sort_order) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, parent_folder_id, sort_order],
        )
        .map(|_| ())
        .map_err(to_storage_error)
}

fn to_storage_error(error: rusqlite::Error) -> String {
    format!("SQLite storage error: {error}")
}

fn run_migrations(connection: &mut SqliteConnection) -> Result<(), String> {
    let current: i32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(to_storage_error)?;

    if current >= SCHEMA_USER_VERSION {
        return Ok(());
    }

    if current < 1 {
        rebuild_connections_for_url_kind(connection)?;
    }

    if current < 2 {
        ensure_url_credentials_table(connection)?;
    }

    if current < 3 {
        ensure_tmux_connection_columns(connection)?;
    }

    if current < 4 {
        rebuild_connections_for_remote_desktop_kinds(connection)?;
    }

    if current < 5 {
        rebuild_connections_for_telnet_serial_kinds(connection)?;
    }

    if current < 6 {
        ensure_url_credential_capture_columns(connection)?;
    }

    if current < 7 {
        ensure_wiki_tables(connection)?;
    }

    connection
        .execute_batch(&format!("PRAGMA user_version = {SCHEMA_USER_VERSION}"))
        .map_err(to_storage_error)?;
    Ok(())
}

fn ensure_wiki_tables(connection: &mut SqliteConnection) -> Result<(), String> {
    // CURRENT_SCHEMA already creates these with IF NOT EXISTS, but databases that
    // were initialized before v7 may have run CURRENT_SCHEMA from an older binary
    // and missed them. Run the wiki block explicitly so upgrade paths are safe.
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS wiki_pages (
                id TEXT PRIMARY KEY,
                parent_id TEXT REFERENCES wiki_pages(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                slug TEXT NOT NULL,
                body_md TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_wiki_pages_parent_sort
                ON wiki_pages(parent_id, sort_order);

            CREATE INDEX IF NOT EXISTS idx_wiki_pages_slug
                ON wiki_pages(slug);

            CREATE TABLE IF NOT EXISTS wiki_page_links (
                page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
                target_page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
                PRIMARY KEY (page_id, target_page_id)
            );

            CREATE INDEX IF NOT EXISTS idx_wiki_page_links_target
                ON wiki_page_links(target_page_id);

            CREATE TABLE IF NOT EXISTS wiki_page_connections (
                page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
                connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                PRIMARY KEY (page_id, connection_id)
            );

            CREATE INDEX IF NOT EXISTS idx_wiki_page_connections_connection
                ON wiki_page_connections(connection_id);

            CREATE VIRTUAL TABLE IF NOT EXISTS wiki_pages_fts USING fts5(
                title,
                body_md,
                content='wiki_pages',
                content_rowid='rowid',
                tokenize='unicode61'
            );

            CREATE TRIGGER IF NOT EXISTS wiki_pages_ai AFTER INSERT ON wiki_pages BEGIN
                INSERT INTO wiki_pages_fts(rowid, title, body_md) VALUES (new.rowid, new.title, new.body_md);
            END;

            CREATE TRIGGER IF NOT EXISTS wiki_pages_ad AFTER DELETE ON wiki_pages BEGIN
                INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, body_md) VALUES('delete', old.rowid, old.title, old.body_md);
            END;

            CREATE TRIGGER IF NOT EXISTS wiki_pages_au AFTER UPDATE ON wiki_pages BEGIN
                INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, body_md) VALUES('delete', old.rowid, old.title, old.body_md);
                INSERT INTO wiki_pages_fts(rowid, title, body_md) VALUES (new.rowid, new.title, new.body_md);
            END;

            CREATE TABLE IF NOT EXISTS wiki_attachments (
                id TEXT PRIMARY KEY,
                page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                mime TEXT,
                bytes INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_wiki_attachments_page
                ON wiki_attachments(page_id);
            "#,
        )
        .map_err(to_storage_error)?;
    Ok(())
}

// SQLite cannot ALTER a CHECK constraint in place. For pre-v1 databases the
// connections table still rejects 'url' rows and lacks the url/data_partition
// columns, so we copy rows into a fresh table that matches CURRENT_SCHEMA.
fn rebuild_connections_for_url_kind(connection: &mut SqliteConnection) -> Result<(), String> {
    let needs_rebuild = column_missing(connection, "connections", "url")?
        || column_missing(connection, "connections", "data_partition")?;
    if !needs_rebuild {
        return Ok(());
    }

    let transaction = connection.transaction().map_err(to_storage_error)?;
    transaction
        .execute_batch(
            r#"
            CREATE TABLE connections_new (
                id TEXT PRIMARY KEY,
                folder_id TEXT REFERENCES connection_folders(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                username TEXT NOT NULL,
                port INTEGER,
                key_path TEXT,
                proxy_jump TEXT,
                auth_method TEXT NOT NULL DEFAULT 'keyFile',
                local_shell TEXT,
                url TEXT,
                data_partition TEXT,
                use_tmux_sessions INTEGER NOT NULL DEFAULT 1,
                tmux_connection_id TEXT,
                connection_type TEXT NOT NULL CHECK (connection_type IN ('local', 'ssh', 'url')),
                status TEXT NOT NULL CHECK (status IN ('connected', 'idle', 'offline')),
                sort_order INTEGER NOT NULL
            );

            INSERT INTO connections_new (
                id, folder_id, name, host, username, port, key_path, proxy_jump,
                auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type, status, sort_order
            )
            SELECT
                id, folder_id, name, host, username, port, key_path, proxy_jump,
                auth_method, local_shell, NULL, NULL,
                CASE WHEN connection_type = 'ssh' THEN 1 ELSE 0 END,
                CASE WHEN connection_type = 'ssh' THEN 'admindeck-' || lower(hex(randomblob(5))) ELSE NULL END,
                connection_type, status, sort_order
            FROM connections;

            DROP TABLE connections;
            ALTER TABLE connections_new RENAME TO connections;

            CREATE INDEX IF NOT EXISTS idx_connections_folder_sort
                ON connections(folder_id, sort_order);
            "#,
        )
        .map_err(to_storage_error)?;
    transaction.commit().map_err(to_storage_error)?;
    Ok(())
}

// SQLite cannot ALTER a CHECK constraint in place. v4 expands the durable
// Connection kind set to include remote desktop drafts.
fn rebuild_connections_for_remote_desktop_kinds(
    connection: &mut SqliteConnection,
) -> Result<(), String> {
    let transaction = connection.transaction().map_err(to_storage_error)?;
    transaction
        .execute_batch(
            r#"
            DROP TABLE IF EXISTS temp.url_credentials_backup;
            DROP TABLE IF EXISTS temp.connection_tags_backup;

            CREATE TEMP TABLE url_credentials_backup AS
                SELECT connection_id, username, updated_at FROM url_credentials;

            CREATE TEMP TABLE connection_tags_backup AS
                SELECT connection_id, tag, sort_order FROM connection_tags;

            CREATE TABLE connections_new (
                id TEXT PRIMARY KEY,
                folder_id TEXT REFERENCES connection_folders(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                username TEXT NOT NULL,
                port INTEGER,
                key_path TEXT,
                proxy_jump TEXT,
                auth_method TEXT NOT NULL DEFAULT 'keyFile',
                local_shell TEXT,
                url TEXT,
                data_partition TEXT,
                use_tmux_sessions INTEGER NOT NULL DEFAULT 1,
                tmux_connection_id TEXT,
                connection_type TEXT NOT NULL CHECK (connection_type IN ('local', 'ssh', 'url', 'rdp', 'vnc')),
                status TEXT NOT NULL CHECK (status IN ('connected', 'idle', 'offline')),
                sort_order INTEGER NOT NULL
            );

            INSERT INTO connections_new (
                id, folder_id, name, host, username, port, key_path, proxy_jump,
                auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type, status, sort_order
            )
            SELECT
                id, folder_id, name, host, username, port, key_path, proxy_jump,
                auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type, status, sort_order
            FROM connections;

            DROP TABLE connections;
            ALTER TABLE connections_new RENAME TO connections;

            CREATE INDEX IF NOT EXISTS idx_connections_folder_sort
                ON connections(folder_id, sort_order);

            INSERT OR REPLACE INTO url_credentials (connection_id, username, updated_at)
            SELECT backup.connection_id, backup.username, backup.updated_at
            FROM url_credentials_backup backup
            INNER JOIN connections ON connections.id = backup.connection_id;

            INSERT OR REPLACE INTO connection_tags (connection_id, tag, sort_order)
            SELECT backup.connection_id, backup.tag, backup.sort_order
            FROM connection_tags_backup backup
            INNER JOIN connections ON connections.id = backup.connection_id;

            DROP TABLE url_credentials_backup;
            DROP TABLE connection_tags_backup;
            "#,
        )
        .map_err(to_storage_error)?;
    transaction.commit().map_err(to_storage_error)?;
    Ok(())
}

// SQLite cannot ALTER a CHECK constraint in place. v5 expands the durable
// Connection kind set to include Telnet and Serial, and adds Serial settings.
fn rebuild_connections_for_telnet_serial_kinds(
    connection: &mut SqliteConnection,
) -> Result<(), String> {
    let transaction = connection.transaction().map_err(to_storage_error)?;
    transaction
        .execute_batch(
            r#"
            DROP TABLE IF EXISTS temp.url_credentials_backup;
            DROP TABLE IF EXISTS temp.connection_tags_backup;

            CREATE TEMP TABLE url_credentials_backup AS
                SELECT connection_id, username, updated_at FROM url_credentials;

            CREATE TEMP TABLE connection_tags_backup AS
                SELECT connection_id, tag, sort_order FROM connection_tags;

            CREATE TABLE connections_new (
                id TEXT PRIMARY KEY,
                folder_id TEXT REFERENCES connection_folders(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                username TEXT NOT NULL,
                port INTEGER,
                key_path TEXT,
                proxy_jump TEXT,
                auth_method TEXT NOT NULL DEFAULT 'keyFile',
                local_shell TEXT,
                url TEXT,
                data_partition TEXT,
                use_tmux_sessions INTEGER NOT NULL DEFAULT 1,
                tmux_connection_id TEXT,
                serial_line TEXT,
                serial_speed INTEGER,
                connection_type TEXT NOT NULL CHECK (connection_type IN ('local', 'ssh', 'telnet', 'serial', 'url', 'rdp', 'vnc')),
                status TEXT NOT NULL CHECK (status IN ('connected', 'idle', 'offline')),
                sort_order INTEGER NOT NULL
            );

            INSERT INTO connections_new (
                id, folder_id, name, host, username, port, key_path, proxy_jump,
                auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, serial_line, serial_speed, connection_type, status, sort_order
            )
            SELECT
                id, folder_id, name, host, username, port, key_path, proxy_jump,
                auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, NULL, NULL, connection_type, status, sort_order
            FROM connections;

            DROP TABLE connections;
            ALTER TABLE connections_new RENAME TO connections;

            CREATE INDEX IF NOT EXISTS idx_connections_folder_sort
                ON connections(folder_id, sort_order);

            INSERT OR REPLACE INTO url_credentials (connection_id, username, updated_at)
            SELECT backup.connection_id, backup.username, backup.updated_at
            FROM url_credentials_backup backup
            INNER JOIN connections ON connections.id = backup.connection_id;

            INSERT OR REPLACE INTO connection_tags (connection_id, tag, sort_order)
            SELECT backup.connection_id, backup.tag, backup.sort_order
            FROM connection_tags_backup backup
            INNER JOIN connections ON connections.id = backup.connection_id;

            DROP TABLE url_credentials_backup;
            DROP TABLE connection_tags_backup;
            "#,
        )
        .map_err(to_storage_error)?;
    transaction.commit().map_err(to_storage_error)?;
    Ok(())
}

fn ensure_url_credentials_table(connection: &mut SqliteConnection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS url_credentials (
                connection_id TEXT PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
                username TEXT NOT NULL,
                page_url TEXT,
                username_selector TEXT,
                password_selector TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_url_credentials_connection
                ON url_credentials(connection_id);
            "#,
        )
        .map_err(to_storage_error)
}

fn ensure_url_credential_capture_columns(connection: &mut SqliteConnection) -> Result<(), String> {
    ensure_url_credentials_table(connection)?;
    for column in ["page_url", "username_selector", "password_selector"] {
        if column_missing(connection, "url_credentials", column)? {
            connection
                .execute_batch(&format!(
                    "ALTER TABLE url_credentials ADD COLUMN {column} TEXT;"
                ))
                .map_err(to_storage_error)?;
        }
    }
    Ok(())
}

fn ensure_tmux_connection_columns(connection: &mut SqliteConnection) -> Result<(), String> {
    if column_missing(connection, "connections", "use_tmux_sessions")? {
        connection
            .execute_batch(
                r#"
                ALTER TABLE connections
                    ADD COLUMN use_tmux_sessions INTEGER NOT NULL DEFAULT 1;
                "#,
            )
            .map_err(to_storage_error)?;
    }

    if column_missing(connection, "connections", "tmux_connection_id")? {
        connection
            .execute_batch(
                r#"
                ALTER TABLE connections
                    ADD COLUMN tmux_connection_id TEXT;
                "#,
            )
            .map_err(to_storage_error)?;
    }

    connection
        .execute_batch(
            r#"
            UPDATE connections
            SET use_tmux_sessions = CASE WHEN connection_type = 'ssh' THEN use_tmux_sessions ELSE 0 END,
                tmux_connection_id = CASE
                    WHEN connection_type = 'ssh'
                         AND use_tmux_sessions = 1
                         AND (tmux_connection_id IS NULL OR trim(tmux_connection_id) = '')
                    THEN 'admindeck-' || lower(hex(randomblob(5)))
                    WHEN connection_type = 'ssh' THEN tmux_connection_id
                    ELSE NULL
                END;
            "#,
        )
        .map_err(to_storage_error)
}

fn column_missing(
    connection: &SqliteConnection,
    table: &str,
    column: &str,
) -> Result<bool, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(to_storage_error)?;
    let mut rows = statement.query([]).map_err(to_storage_error)?;
    while let Some(row) = rows.next().map_err(to_storage_error)? {
        let name: String = row.get(1).map_err(to_storage_error)?;
        if name == column {
            return Ok(false);
        }
    }
    Ok(true)
}

fn ensure_folder_exists(
    connection: &SqliteConnection,
    id: &str,
    fallback_name: &str,
) -> Result<(), String> {
    let exists: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM connection_folders WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(to_storage_error)?;

    if exists > 0 {
        return Ok(());
    }

    let next_sort_order = next_folder_sort_order(connection, None)?;
    insert_folder(connection, id, fallback_name, None, next_sort_order)
}

fn normalize_connection_type(value: &str) -> Result<String, String> {
    match value.trim().to_lowercase().as_str() {
        "local" | "ssh" | "telnet" | "serial" | "url" | "rdp" | "vnc" => {
            Ok(value.trim().to_lowercase())
        }
        _ => {
            Err("connection type must be local, ssh, telnet, serial, url, rdp, or vnc".to_string())
        }
    }
}

fn normalize_url_field(
    value: Option<String>,
    connection_type: &str,
) -> Result<Option<String>, String> {
    let trimmed = value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if connection_type != "url" {
        return Ok(None);
    }

    let raw = trimmed.ok_or_else(|| "URL is required for URL connections".to_string())?;
    let candidate = if raw.contains("://") {
        raw.clone()
    } else {
        format!("https://{raw}")
    };
    let parsed =
        url::Url::parse(&candidate).map_err(|error| format!("URL is not valid: {error}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(Some(parsed.to_string())),
        other => Err(format!("URL scheme must be http or https, got {other}")),
    }
}

fn extract_url_host(value: &str) -> Option<String> {
    url::Url::parse(value)
        .ok()
        .and_then(|parsed| parsed.host_str().map(|host| host.to_string()))
}

fn normalize_connection_user(value: String, connection_type: &str) -> Result<String, String> {
    match connection_type {
        "serial" | "url" => Ok(String::new()),
        "vnc" => Ok(value.trim().to_string()),
        _ => required_field("user", value),
    }
}

fn normalize_ssh_optional_field(value: Option<String>, connection_type: &str) -> Option<String> {
    if connection_type != "ssh" {
        return None;
    }

    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_connection_port(value: Option<u16>, connection_type: &str) -> Option<u16> {
    if connection_type == "serial" {
        return None;
    }

    value
}

fn normalize_data_partition(
    value: Option<String>,
    connection_type: &str,
) -> Result<Option<String>, String> {
    if connection_type != "url" {
        return Ok(None);
    }

    let trimmed = value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(partition) = trimmed.as_deref() {
        if partition == "shared" {
            return Ok(Some("shared".to_string()));
        }
        if !partition
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        {
            return Err("data partition may only contain letters, digits, '-' or '_'".to_string());
        }
        if partition.len() > 64 {
            return Err("data partition must be 64 characters or fewer".to_string());
        }
    }

    Ok(trimmed)
}

fn normalize_use_tmux_sessions(value: Option<bool>, connection_type: &str) -> bool {
    connection_type == "ssh" && value.unwrap_or(true)
}

fn normalize_serial_line(
    value: Option<String>,
    connection_type: &str,
) -> Result<Option<String>, String> {
    if connection_type != "serial" {
        return Ok(None);
    }

    let line = value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "COM1".to_string());
    if line.chars().any(char::is_control) {
        return Err("serial line cannot contain control characters".to_string());
    }
    Ok(Some(line))
}

fn normalize_serial_speed(
    value: Option<u32>,
    connection_type: &str,
) -> Result<Option<u32>, String> {
    if connection_type != "serial" {
        return Ok(None);
    }

    match value.unwrap_or(9600) {
        0 => Err("serial speed must be greater than 0".to_string()),
        speed => Ok(Some(speed)),
    }
}

fn normalize_local_shell(
    value: Option<String>,
    connection_type: &str,
) -> Result<Option<String>, String> {
    if connection_type != "local" {
        return Ok(None);
    }

    match value
        .as_deref()
        .map(str::trim)
        .filter(|shell| !shell.is_empty())
    {
        Some(shell @ ("powershell.exe" | "cmd.exe" | "wsl.exe")) => Ok(Some(shell.to_string())),
        Some(_) => {
            Err("local terminal shell must be PowerShell, Command Prompt, or WSL".to_string())
        }
        None => Ok(None),
    }
}

fn normalize_auth_method(
    value: Option<String>,
    connection_type: &str,
    key_path: &Option<String>,
) -> Result<String, String> {
    if connection_type == "telnet" {
        return Ok("password".to_string());
    }

    if connection_type != "ssh" {
        return Ok("keyFile".to_string());
    }

    match value
        .as_deref()
        .map(str::trim)
        .filter(|method| !method.is_empty())
    {
        Some("keyFile") | Some("key-file") | Some("key") => Ok("keyFile".to_string()),
        Some("password") => Ok("password".to_string()),
        Some("agent") | Some("sshAgent") | Some("ssh-agent") => Ok("agent".to_string()),
        Some(_) => Err("SSH auth method must be keyFile, password, or agent".to_string()),
        None if key_path.is_some() => Ok("keyFile".to_string()),
        None => Ok("agent".to_string()),
    }
}

fn folder_name_for(folder_id: &str) -> &str {
    match folder_id {
        "local" => "Local workspace",
        "manual" => "Manual",
        other => other,
    }
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_optional_id(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn required_field(field: &str, value: String) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(trimmed)
    }
}

fn default_general_settings() -> GeneralSettings {
    GeneralSettings {
        auto_backup_enabled: true,
        last_backup_at: None,
    }
}

fn default_terminal_settings() -> TerminalSettings {
    TerminalSettings {
        font_family: "\"Cascadia Mono\", \"JetBrains Mono\", Consolas, monospace".to_string(),
        font_size: 12,
        line_height: 1.25,
        cursor_style: "block".to_string(),
        scrollback_lines: 5_000,
        copy_on_select: false,
        confirm_multiline_paste: true,
        default_shell: if cfg!(target_os = "windows") {
            "powershell.exe".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
        },
    }
}

fn default_appearance_settings() -> AppearanceSettings {
    AppearanceSettings {
        app_font_family: "\"Satoshi\", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif".to_string(),
        color_scheme: "default".to_string(),
        custom_font_path: None,
    }
}

fn default_ssh_settings() -> SshSettings {
    SshSettings {
        default_user: default_ssh_user(),
        default_port: 22,
        default_key_path: default_ssh_key_path(),
        default_proxy_jump: None,
        buffer_lines: default_ssh_buffer_lines(),
    }
}

fn default_ssh_buffer_lines() -> u32 {
    5_000
}

fn default_sftp_settings() -> SftpSettings {
    SftpSettings {
        overwrite_behavior: "fail".to_string(),
    }
}

fn default_url_settings() -> UrlSettings {
    UrlSettings {
        ignore_certificate_errors: false,
    }
}

fn default_ai_provider_settings() -> AiProviderSettings {
    AiProviderSettings {
        enabled: false,
        provider_kind: default_ai_provider_kind(),
        base_url: "https://api.openai.com/v1".to_string(),
        model: default_ai_model(),
        reasoning_effort: default_ai_reasoning_effort(),
        output_language: String::new(),
        cli_execution_policy: default_ai_cli_execution_policy(),
        claude_cli_path: None,
        codex_cli_path: None,
        tools: default_ai_assistant_tool_settings(),
    }
}

fn default_ai_assistant_tool_settings() -> AiAssistantToolSettings {
    AiAssistantToolSettings {
        web_search: false,
        web_fetch: false,
        shell_command: false,
        app_data_file_search: false,
        app_data_file_read: false,
        current_time: default_ai_current_time_tool_enabled(),
    }
}

fn default_ai_current_time_tool_enabled() -> bool {
    false
}

fn default_ai_provider_kind() -> String {
    "openai".to_string()
}

fn default_ai_model() -> String {
    "gpt-5.5".to_string()
}

fn default_ai_reasoning_effort() -> String {
    "medium".to_string()
}

fn default_ai_cli_execution_policy() -> String {
    "suggestOnly".to_string()
}

fn validate_general_settings(settings: GeneralSettings) -> Result<GeneralSettings, String> {
    Ok(settings)
}

fn validate_terminal_settings(mut settings: TerminalSettings) -> Result<TerminalSettings, String> {
    settings.font_family = required_field("font family", settings.font_family)?;
    settings.default_shell = required_field("default shell", settings.default_shell)?;

    if !(8..=32).contains(&settings.font_size) {
        return Err("terminal font size must be between 8 and 32".to_string());
    }

    if !(1.0..=2.0).contains(&settings.line_height) {
        return Err("terminal line height must be between 1.0 and 2.0".to_string());
    }

    settings.cursor_style = match settings.cursor_style.trim().to_lowercase().as_str() {
        "block" | "bar" | "underline" => settings.cursor_style.trim().to_lowercase(),
        _ => return Err("terminal cursor style must be block, bar, or underline".to_string()),
    };

    if !(100..=100_000).contains(&settings.scrollback_lines) {
        return Err("terminal scrollback must be between 100 and 100000 lines".to_string());
    }

    Ok(settings)
}

fn validate_appearance_settings(
    mut settings: AppearanceSettings,
) -> Result<AppearanceSettings, String> {
    settings.app_font_family = required_field("app font family", settings.app_font_family)?;
    settings.color_scheme = required_field("color scheme", settings.color_scheme)?;
    settings.custom_font_path = trim_optional(settings.custom_font_path);
    settings.color_scheme = match settings.color_scheme.to_lowercase().as_str() {
        "default" | "dark" | "light" | "mac" | "orange" | "purple" | "pink" => {
            settings.color_scheme.to_lowercase()
        }
        _ => {
            return Err(
                "color scheme must be one of: default, dark, light, mac, orange, purple, pink"
                    .to_string(),
            )
        }
    };
    Ok(settings)
}

fn validate_ssh_settings(mut settings: SshSettings) -> Result<SshSettings, String> {
    settings.default_user = required_field("default SSH user", settings.default_user)?;

    if settings.default_port == 0 {
        return Err("default SSH port must be between 1 and 65535".to_string());
    }

    settings.default_key_path = trim_optional(settings.default_key_path);
    settings.default_proxy_jump = trim_optional(settings.default_proxy_jump);
    if !(100..=100_000).contains(&settings.buffer_lines) {
        return Err("SSH buffer must be between 100 and 100000 lines".to_string());
    }
    Ok(settings)
}

fn validate_sftp_settings(mut settings: SftpSettings) -> Result<SftpSettings, String> {
    settings.overwrite_behavior = match settings.overwrite_behavior.trim().to_lowercase().as_str() {
        "fail" | "error" | "never" => "fail".to_string(),
        "overwrite" | "replace" => "overwrite".to_string(),
        _ => return Err("SFTP overwrite behavior must be fail or overwrite".to_string()),
    };
    Ok(settings)
}

fn validate_url_settings(settings: UrlSettings) -> Result<UrlSettings, String> {
    Ok(settings)
}

fn validate_ai_provider_settings(
    mut settings: AiProviderSettings,
) -> Result<AiProviderSettings, String> {
    settings.provider_kind = match settings.provider_kind.trim().to_lowercase().as_str() {
        "" | "openai" => "openai".to_string(),
        "anthropic" => "anthropic".to_string(),
        "openrouter" => "openrouter".to_string(),
        "deepseek" => "deepseek".to_string(),
        "grok" | "xai" => "grok".to_string(),
        "azure-openai" | "azure_openai" | "azure openai" => "azure-openai".to_string(),
        "litellm" | "lite-llm" | "lite_llm" => "litellm".to_string(),
        "github-copilot" | "github_copilot" | "github copilot" => "github-copilot".to_string(),
        "ollama" => "ollama".to_string(),
        "nvidia" => "nvidia".to_string(),
        "openai-compatible" | "openai_compatible" | "openai compatible" => {
            "openai-compatible".to_string()
        }
        _ => return Err("AI provider is not supported".to_string()),
    };
    settings.base_url = required_field("AI provider endpoint", settings.base_url)?;
    settings.base_url = settings.base_url.trim_end_matches('/').to_string();
    settings.model = required_field("AI model", settings.model)?;
    settings.reasoning_effort = match settings.reasoning_effort.trim().to_lowercase().as_str() {
        "" | "default" | "providerdefault" | "provider-default" | "provider_default" => {
            "default".to_string()
        }
        "low" => "low".to_string(),
        "medium" => "medium".to_string(),
        "high" => "high".to_string(),
        "max" | "maximum" | "xhigh" | "x-high" | "x_high" => "max".to_string(),
        _ => {
            return Err(
                "AI reasoning effort must be default, low, medium, high, or max".to_string(),
            )
        }
    };
    settings.cli_execution_policy = match settings.cli_execution_policy.trim() {
        "" | "suggestOnly" | "suggest-only" | "suggest_only" => "suggestOnly".to_string(),
        _ => {
            return Err(
                "CLI adapter policy must remain suggest-only for approval-based execution"
                    .to_string(),
            )
        }
    };
    settings.output_language = settings.output_language.trim().to_string();
    settings.claude_cli_path = trim_optional(settings.claude_cli_path);
    settings.codex_cli_path = trim_optional(settings.codex_cli_path);

    if !(settings.base_url.starts_with("https://") || settings.base_url.starts_with("http://")) {
        return Err("AI provider endpoint must start with https:// or http://".to_string());
    }

    if settings.base_url.chars().any(char::is_whitespace) {
        return Err("AI provider endpoint cannot contain whitespace".to_string());
    }

    if settings.base_url.contains('?') || settings.base_url.contains('#') {
        return Err(
            "AI provider endpoint must be a base URL without query or fragment".to_string(),
        );
    }

    if settings.model.chars().any(char::is_whitespace) {
        return Err("AI model cannot contain whitespace".to_string());
    }

    Ok(settings)
}

fn trim_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn default_ssh_user() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "admin".to_string())
}

fn default_ssh_key_path() -> Option<String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    let path = PathBuf::from(home).join(".ssh").join("id_ed25519");
    Some(path.to_string_lossy().to_string())
}

fn make_connection_id(name: &str) -> String {
    make_unique_id("connection", name)
}

fn make_folder_id(name: &str) -> String {
    make_unique_id("folder", name)
}

fn make_tmux_connection_id(connection_id: &str) -> String {
    make_unique_id("admindeck", connection_id)
}

fn make_unique_id(fallback: &str, name: &str) -> String {
    let slug = name
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
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!(
        "{}-{unique}",
        if slug.is_empty() { fallback } else { &slug }
    )
}

fn optional_port(value: Option<i64>) -> rusqlite::Result<Option<u16>> {
    match value {
        Some(port) => u16::try_from(port)
            .map(Some)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error))),
        None => Ok(None),
    }
}

fn optional_serial_speed(value: Option<i64>) -> rusqlite::Result<Option<u32>> {
    match value {
        Some(speed) => u32::try_from(speed)
            .map(Some)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error))),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn find_folder<'a>(
        folders: &'a [ConnectionFolder],
        folder_id: &str,
    ) -> Option<&'a ConnectionFolder> {
        folders.iter().find_map(|folder| {
            if folder.id == folder_id {
                Some(folder)
            } else {
                find_folder(&folder.folders, folder_id)
            }
        })
    }

    fn all_connections(tree: &ConnectionTree) -> impl Iterator<Item = &SavedConnection> {
        tree.connections
            .iter()
            .chain(tree.folders.iter().flat_map(folder_connections))
    }

    fn folder_connections(
        folder: &ConnectionFolder,
    ) -> Box<dyn Iterator<Item = &SavedConnection> + '_> {
        Box::new(
            folder
                .connections
                .iter()
                .chain(folder.folders.iter().flat_map(folder_connections)),
        )
    }

    fn create_test_ssh_connection(
        storage: &Storage,
        name: &str,
        host: &str,
        folder_id: Option<String>,
    ) -> SavedConnection {
        storage
            .create_connection(CreateConnectionRequest {
                name: name.to_string(),
                host: host.to_string(),
                user: "admin".to_string(),
                connection_type: "ssh".to_string(),
                folder_id,
                port: None,
                key_path: None,
                proxy_jump: None,
                auth_method: Some("agent".to_string()),
                local_shell: None,
                url: None,
                data_partition: None,
                use_tmux_sessions: None,
                serial_line: None,
                serial_speed: None,
            })
            .expect("SSH connection is created")
    }

    fn create_test_local_connection(storage: &Storage, name: &str, shell: &str) -> SavedConnection {
        storage
            .create_connection(CreateConnectionRequest {
                name: name.to_string(),
                host: "localhost".to_string(),
                user: "local".to_string(),
                connection_type: "local".to_string(),
                folder_id: None,
                port: None,
                key_path: None,
                proxy_jump: None,
                auth_method: Some("keyFile".to_string()),
                local_shell: Some(shell.to_string()),
                url: None,
                data_partition: None,
                use_tmux_sessions: None,
                serial_line: None,
                serial_speed: None,
            })
            .expect("local connection is created")
    }

    fn backup_filename_has_serial(filename: &str) -> bool {
        let stem = filename.strip_suffix(".zip").unwrap_or(filename);
        stem.rsplit_once('-')
            .map(|(_, serial)| serial.len() == 3 && serial.chars().all(|ch| ch.is_ascii_digit()))
            .unwrap_or(false)
    }

    #[test]
    fn schema_initializes_an_empty_connection_tree() {
        let storage = Storage::open(temp_db_path("empty")).expect("storage opens");

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");

        assert!(tree.connections.is_empty());
        assert!(tree.folders.is_empty());
    }

    #[test]
    fn schema_initialization_is_idempotent_without_initial_data() {
        let db_path = temp_db_path("idempotent");
        let storage = Storage::open(db_path.clone()).expect("first open succeeds");
        drop(storage);

        let reopened_storage = Storage::open(db_path).expect("second open succeeds");
        let tree = reopened_storage
            .list_connection_tree()
            .expect("connection tree loads");
        let connection_count = all_connections(&tree).count();

        assert_eq!(connection_count, 0);
        assert!(tree.folders.is_empty());
    }

    #[test]
    fn v4_migration_preserves_connection_children() {
        let db_path = temp_db_path("v4-migration-children");
        {
            let connection = SqliteConnection::open(&db_path).expect("legacy database opens");
            connection
                .execute_batch(
                    r#"
                    PRAGMA foreign_keys = ON;

                    CREATE TABLE connection_folders (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        parent_folder_id TEXT REFERENCES connection_folders(id) ON DELETE CASCADE,
                        sort_order INTEGER NOT NULL
                    );

                    CREATE TABLE connections (
                        id TEXT PRIMARY KEY,
                        folder_id TEXT REFERENCES connection_folders(id) ON DELETE CASCADE,
                        name TEXT NOT NULL,
                        host TEXT NOT NULL,
                        username TEXT NOT NULL,
                        port INTEGER,
                        key_path TEXT,
                        proxy_jump TEXT,
                        auth_method TEXT NOT NULL DEFAULT 'keyFile',
                        local_shell TEXT,
                        url TEXT,
                        data_partition TEXT,
                        use_tmux_sessions INTEGER NOT NULL DEFAULT 1,
                        tmux_connection_id TEXT,
                        connection_type TEXT NOT NULL CHECK (connection_type IN ('local', 'ssh', 'url')),
                        status TEXT NOT NULL CHECK (status IN ('connected', 'idle', 'offline')),
                        sort_order INTEGER NOT NULL
                    );

                    CREATE TABLE connection_tags (
                        connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                        tag TEXT NOT NULL,
                        sort_order INTEGER NOT NULL,
                        PRIMARY KEY (connection_id, tag)
                    );

                    CREATE TABLE url_credentials (
                        connection_id TEXT PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
                        username TEXT NOT NULL,
                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );

                    INSERT INTO connections (
                        id, folder_id, name, host, username, port, key_path, proxy_jump,
                        auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type, status, sort_order
                    ) VALUES (
                        'router-ui', NULL, 'Router UI', 'router.internal', '', NULL, NULL, NULL,
                        'keyFile', NULL, 'https://router.internal/', 'ops', 0, NULL, 'url', 'idle', 0
                    );

                    INSERT INTO connection_tags (connection_id, tag, sort_order)
                    VALUES ('router-ui', 'network', 0);

                    INSERT INTO url_credentials (connection_id, username)
                    VALUES ('router-ui', 'admin');

                    PRAGMA user_version = 3;
                    "#,
                )
                .expect("legacy schema is created");
        }

        let storage = Storage::open(db_path).expect("legacy database migrates");
        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads after migration");
        let migrated = tree
            .connections
            .iter()
            .find(|connection| connection.id == "router-ui")
            .expect("existing URL connection remains");

        assert_eq!(migrated.tags, vec!["network".to_string()]);
        assert!(migrated.has_url_credential);
        assert_eq!(migrated.url_credential_username.as_deref(), Some("admin"));

        storage
            .create_connection(CreateConnectionRequest {
                name: "Migrated RDP".to_string(),
                host: "jumpbox.internal".to_string(),
                user: "admin".to_string(),
                connection_type: "rdp".to_string(),
                folder_id: None,
                port: Some(3389),
                key_path: None,
                proxy_jump: None,
                auth_method: None,
                local_shell: None,
                url: None,
                data_partition: None,
                use_tmux_sessions: None,
                serial_line: None,
                serial_speed: None,
            })
            .expect("migrated database accepts RDP connections");
    }

    #[test]
    fn create_connection_can_persist_root_ssh_connection() {
        let storage = Storage::open(temp_db_path("create")).expect("storage opens");

        let created = storage
            .create_connection(CreateConnectionRequest {
                name: "Lab Host".to_string(),
                host: "lab.internal".to_string(),
                user: "admin".to_string(),
                connection_type: "ssh".to_string(),
                folder_id: None,
                port: Some(2222),
                key_path: Some("C:\\Users\\ryan\\.ssh\\id_ed25519".to_string()),
                proxy_jump: Some("jump.internal".to_string()),
                auth_method: Some("keyFile".to_string()),
                local_shell: None,
                url: None,
                data_partition: None,
                use_tmux_sessions: None,
                serial_line: None,
                serial_speed: None,
            })
            .expect("connection is created");

        assert_eq!(created.name, "Lab Host");
        assert_eq!(created.port, Some(2222));
        assert_eq!(created.proxy_jump.as_deref(), Some("jump.internal"));

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");
        let root_connection = tree
            .connections
            .iter()
            .find(|connection| connection.host == "lab.internal")
            .expect("root connection exists");

        assert_eq!(root_connection.name, "Lab Host");
        assert_eq!(root_connection.tags, Vec::<String>::new());
    }

    #[test]
    fn create_connection_can_persist_remote_desktop_connections() {
        let storage = Storage::open(temp_db_path("remote-desktop-create")).expect("storage opens");

        let rdp = storage
            .create_connection(CreateConnectionRequest {
                name: "Jump Box".to_string(),
                host: "jumpbox.internal".to_string(),
                user: "DOMAIN\\admin".to_string(),
                connection_type: "rdp".to_string(),
                folder_id: None,
                port: Some(3389),
                key_path: Some("C:\\ignored\\id_ed25519".to_string()),
                proxy_jump: Some("ignored.internal".to_string()),
                auth_method: Some("password".to_string()),
                local_shell: None,
                url: None,
                data_partition: None,
                use_tmux_sessions: Some(true),
                serial_line: None,
                serial_speed: None,
            })
            .expect("RDP connection is created");

        assert_eq!(rdp.connection_type, "rdp");
        assert_eq!(rdp.host, "jumpbox.internal");
        assert_eq!(rdp.user, "DOMAIN\\admin");
        assert_eq!(rdp.port, Some(3389));
        assert!(rdp.key_path.is_none());
        assert!(rdp.proxy_jump.is_none());
        assert!(!rdp.use_tmux_sessions);

        let vnc = storage
            .create_connection(CreateConnectionRequest {
                name: "Console VNC".to_string(),
                host: "console.internal".to_string(),
                user: "   ".to_string(),
                connection_type: "vnc".to_string(),
                folder_id: None,
                port: Some(5900),
                key_path: None,
                proxy_jump: None,
                auth_method: None,
                local_shell: None,
                url: None,
                data_partition: None,
                use_tmux_sessions: None,
                serial_line: None,
                serial_speed: None,
            })
            .expect("VNC connection is created");

        assert_eq!(vnc.connection_type, "vnc");
        assert_eq!(vnc.user, "");
        assert_eq!(vnc.port, Some(5900));
    }

    #[test]
    fn create_connection_can_persist_telnet_and_serial_connections() {
        let storage = Storage::open(temp_db_path("telnet-serial-create")).expect("storage opens");

        let telnet = storage
            .create_connection(CreateConnectionRequest {
                name: "Legacy Router".to_string(),
                host: "router.internal".to_string(),
                user: "admin".to_string(),
                connection_type: "telnet".to_string(),
                folder_id: None,
                port: Some(23),
                key_path: Some("C:\\ignored\\id_ed25519".to_string()),
                proxy_jump: Some("ignored.internal".to_string()),
                auth_method: Some("agent".to_string()),
                local_shell: None,
                url: None,
                data_partition: None,
                use_tmux_sessions: Some(true),
                serial_line: None,
                serial_speed: None,
            })
            .expect("Telnet connection is created");

        assert_eq!(telnet.connection_type, "telnet");
        assert_eq!(telnet.auth_method, "password");
        assert!(telnet.key_path.is_none());
        assert!(telnet.proxy_jump.is_none());
        assert!(!telnet.use_tmux_sessions);

        let serial = storage
            .create_connection(CreateConnectionRequest {
                name: "Console Cable".to_string(),
                host: String::new(),
                user: "ignored".to_string(),
                connection_type: "serial".to_string(),
                folder_id: None,
                port: Some(22),
                key_path: None,
                proxy_jump: None,
                auth_method: None,
                local_shell: None,
                url: None,
                data_partition: None,
                use_tmux_sessions: None,
                serial_line: Some("COM7".to_string()),
                serial_speed: Some(115200),
            })
            .expect("Serial connection is created");

        assert_eq!(serial.connection_type, "serial");
        assert_eq!(serial.host, "COM7");
        assert_eq!(serial.user, "");
        assert_eq!(serial.port, None);
        assert_eq!(serial.serial_line.as_deref(), Some("COM7"));
        assert_eq!(serial.serial_speed, Some(115200));
    }

    #[test]
    fn url_credentials_round_trip_without_storing_passwords_in_sqlite() {
        let storage = Storage::open(temp_db_path("url-credentials")).expect("storage opens");
        let created = storage
            .create_connection(CreateConnectionRequest {
                name: "Router UI".to_string(),
                host: String::new(),
                user: String::new(),
                connection_type: "url".to_string(),
                folder_id: None,
                port: None,
                key_path: None,
                proxy_jump: None,
                auth_method: None,
                local_shell: None,
                url: Some("router.internal".to_string()),
                data_partition: Some("ops".to_string()),
                use_tmux_sessions: None,
                serial_line: None,
                serial_speed: None,
            })
            .expect("URL connection is created");

        assert_eq!(created.url.as_deref(), Some("https://router.internal/"));
        assert!(!created.has_url_credential);

        let updated = storage
            .upsert_url_credential(UpsertUrlCredentialRequest {
                connection_id: created.id.clone(),
                username: "admin".to_string(),
                page_url: None,
                username_selector: None,
                password_selector: None,
            })
            .expect("URL credential metadata is stored");
        assert!(updated.has_url_credential);
        assert_eq!(updated.url_credential_username.as_deref(), Some("admin"));

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");
        let reloaded = tree
            .connections
            .iter()
            .find(|connection| connection.id == created.id)
            .expect("URL connection exists");
        assert!(reloaded.has_url_credential);
        assert_eq!(reloaded.url_credential_username.as_deref(), Some("admin"));
    }

    #[test]
    fn url_credentials_reject_non_url_connections() {
        let storage = Storage::open(temp_db_path("url-credential-type")).expect("storage opens");
        let connection = create_test_ssh_connection(&storage, "Bastion", "bastion.internal", None);

        let error = match storage.upsert_url_credential(UpsertUrlCredentialRequest {
            connection_id: connection.id,
            username: "admin".to_string(),
            page_url: None,
            username_selector: None,
            password_selector: None,
        }) {
            Ok(_) => panic!("SSH connections cannot store URL credentials"),
            Err(error) => error,
        };
        assert_eq!(
            error,
            "URL credentials can only be stored for URL connections"
        );
    }

    #[test]
    fn rename_connection_updates_durable_connection_name() {
        let storage = Storage::open(temp_db_path("rename")).expect("storage opens");
        let staging = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Staging".to_string(),
                parent_folder_id: None,
            })
            .expect("staging folder is created");
        let connection = create_test_ssh_connection(
            &storage,
            "API Stage",
            "api-stage.internal",
            Some(staging.id.clone()),
        );

        let renamed = storage
            .rename_connection(RenameConnectionRequest {
                id: connection.id.clone(),
                name: "API Stage Blue".to_string(),
            })
            .expect("connection is renamed");

        assert_eq!(renamed.id, connection.id);
        assert_eq!(renamed.name, "API Stage Blue");

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");
        let staging = find_folder(&tree.folders, &staging.id).expect("staging folder exists");

        assert_eq!(staging.connections[0].name, "API Stage Blue");
    }

    #[test]
    fn update_connection_edits_fields_and_moves_folder() {
        let storage = Storage::open(temp_db_path("update")).expect("storage opens");
        let staging = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Staging".to_string(),
                parent_folder_id: None,
            })
            .expect("staging folder is created");
        let production = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Production".to_string(),
                parent_folder_id: None,
            })
            .expect("production folder is created");
        let connection = create_test_ssh_connection(
            &storage,
            "API Stage",
            "api-stage.internal",
            Some(staging.id.clone()),
        );

        let updated = storage
            .update_connection(UpdateConnectionRequest {
                id: connection.id.clone(),
                name: "API Production".to_string(),
                host: "api-prod.internal".to_string(),
                user: "deploy".to_string(),
                connection_type: "ssh".to_string(),
                folder_id: Some(production.id.clone()),
                port: Some(2222),
                key_path: Some("C:\\Users\\ryan\\.ssh\\prod".to_string()),
                proxy_jump: Some("jump.internal".to_string()),
                auth_method: Some("keyFile".to_string()),
                local_shell: None,
                url: None,
                data_partition: None,
                use_tmux_sessions: Some(false),
                serial_line: None,
                serial_speed: None,
            })
            .expect("connection is updated");

        assert_eq!(updated.id, connection.id);
        assert_eq!(updated.name, "API Production");
        assert_eq!(updated.host, "api-prod.internal");
        assert_eq!(updated.user, "deploy");
        assert_eq!(updated.port, Some(2222));
        assert_eq!(
            updated.key_path.as_deref(),
            Some("C:\\Users\\ryan\\.ssh\\prod")
        );
        assert_eq!(updated.proxy_jump.as_deref(), Some("jump.internal"));
        assert_eq!(updated.auth_method, "keyFile");
        assert!(!updated.use_tmux_sessions);
        assert!(updated.tmux_connection_id.is_none());

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");
        let staging = find_folder(&tree.folders, &staging.id).expect("staging folder exists");
        let production =
            find_folder(&tree.folders, &production.id).expect("production folder exists");

        assert!(staging.connections.is_empty());
        assert_eq!(production.connections[0].id, connection.id);
        assert_eq!(production.connections[0].name, "API Production");
    }

    #[test]
    fn delete_connection_removes_connection_and_tags() {
        let storage = Storage::open(temp_db_path("delete")).expect("storage opens");
        let production = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Production".to_string(),
                parent_folder_id: None,
            })
            .expect("production folder is created");
        let connection = create_test_ssh_connection(
            &storage,
            "Bastion East",
            "bastion-east.internal",
            Some(production.id.clone()),
        );

        storage
            .delete_connection(connection.id)
            .expect("connection is deleted");

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");
        let production =
            find_folder(&tree.folders, &production.id).expect("production folder exists");

        assert!(production.connections.is_empty());
    }

    #[test]
    fn duplicate_connection_copies_non_secret_connection_data() {
        let storage = Storage::open(temp_db_path("duplicate")).expect("storage opens");
        let production = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Production".to_string(),
                parent_folder_id: None,
            })
            .expect("production folder is created");
        let connection = create_test_ssh_connection(
            &storage,
            "Bastion East",
            "bastion-east.internal",
            Some(production.id.clone()),
        );

        let duplicated = storage
            .duplicate_connection(DuplicateConnectionRequest {
                id: connection.id.clone(),
                name: Some("Bastion East Copy".to_string()),
            })
            .expect("connection is duplicated");

        assert_ne!(duplicated.id, connection.id);
        assert_eq!(duplicated.name, "Bastion East Copy");
        assert_eq!(duplicated.host, "bastion-east.internal");
        assert_eq!(duplicated.user, "admin");
        assert_eq!(duplicated.tags, Vec::<String>::new());
        assert_eq!(duplicated.status, "idle");

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");
        let production =
            find_folder(&tree.folders, &production.id).expect("production folder exists");

        assert_eq!(production.connections.len(), 2);
        assert_eq!(production.connections[1].id, duplicated.id);
    }

    #[test]
    fn create_rename_and_delete_connection_folder() {
        let storage = Storage::open(temp_db_path("folder-crud")).expect("storage opens");

        let created = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Customer A".to_string(),
                parent_folder_id: None,
            })
            .expect("folder is created");
        assert_eq!(created.name, "Customer A");
        assert!(created.connections.is_empty());

        let renamed = storage
            .rename_connection_folder(RenameConnectionFolderRequest {
                id: created.id.clone(),
                name: "Customer A Production".to_string(),
            })
            .expect("folder is renamed");
        assert_eq!(renamed.name, "Customer A Production");

        storage
            .delete_connection_folder(created.id.clone())
            .expect("folder is deleted");

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");
        assert!(find_folder(&tree.folders, &created.id).is_none());
    }

    #[test]
    fn folders_can_contain_subfolders() {
        let storage = Storage::open(temp_db_path("folder-nesting")).expect("storage opens");
        let parent = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Customer A".to_string(),
                parent_folder_id: None,
            })
            .expect("parent folder is created");
        let child = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Production".to_string(),
                parent_folder_id: Some(parent.id.clone()),
            })
            .expect("child folder is created");

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");
        let parent = find_folder(&tree.folders, &parent.id).expect("parent folder exists");

        assert_eq!(parent.folders[0].id, child.id);
        assert_eq!(parent.folders[0].name, "Production");
    }

    #[test]
    fn deleting_folder_removes_connections_in_that_folder() {
        let storage = Storage::open(temp_db_path("folder-delete-cascade")).expect("storage opens");
        let folder = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Ephemeral".to_string(),
                parent_folder_id: None,
            })
            .expect("folder is created");

        storage
            .create_connection(CreateConnectionRequest {
                name: "Throwaway SSH".to_string(),
                host: "throwaway.internal".to_string(),
                user: "admin".to_string(),
                connection_type: "ssh".to_string(),
                folder_id: Some(folder.id.clone()),
                port: None,
                key_path: None,
                proxy_jump: None,
                auth_method: Some("agent".to_string()),
                local_shell: None,
                url: None,
                data_partition: None,
                use_tmux_sessions: None,
                serial_line: None,
                serial_speed: None,
            })
            .expect("connection is created in folder");

        storage
            .delete_connection_folder(folder.id)
            .expect("folder is deleted");

        let tree = storage
            .list_connection_tree()
            .expect("connection tree loads");
        assert!(!all_connections(&tree).any(|connection| connection.host == "throwaway.internal"));
    }

    #[test]
    fn move_connection_folder_updates_durable_root_folder_order() {
        let storage = Storage::open(temp_db_path("folder-move")).expect("storage opens");
        let production = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Production".to_string(),
                parent_folder_id: None,
            })
            .expect("production folder is created");
        let staging = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Staging".to_string(),
                parent_folder_id: None,
            })
            .expect("staging folder is created");

        let tree = storage
            .move_connection_folder(MoveConnectionFolderRequest {
                id: staging.id.clone(),
                parent_folder_id: None,
                target_index: 0,
            })
            .expect("folder is moved");

        assert_eq!(tree.folders[0].id, staging.id);
        assert_eq!(tree.folders[1].id, production.id);

        let reloaded = storage
            .list_connection_tree()
            .expect("connection tree reloads");
        assert_eq!(reloaded.folders[0].id, staging.id);
    }

    #[test]
    fn move_connection_reorders_within_target_folder() {
        let storage = Storage::open(temp_db_path("connection-move")).expect("storage opens");
        let production = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Production".to_string(),
                parent_folder_id: None,
            })
            .expect("production folder is created");
        let staging = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Staging".to_string(),
                parent_folder_id: None,
            })
            .expect("staging folder is created");
        create_test_ssh_connection(
            &storage,
            "Bastion East",
            "bastion-east.internal",
            Some(production.id.clone()),
        );
        let api_stage = create_test_ssh_connection(
            &storage,
            "API Stage",
            "api-stage.internal",
            Some(staging.id.clone()),
        );

        let tree = storage
            .move_connection(MoveConnectionRequest {
                id: api_stage.id.clone(),
                folder_id: Some(production.id.clone()),
                target_index: 1,
            })
            .expect("connection is moved");

        let production =
            find_folder(&tree.folders, &production.id).expect("production folder exists");
        assert_eq!(production.connections[1].id, api_stage.id);
        assert_eq!(production.connections.len(), 2);

        let staging = find_folder(&tree.folders, &staging.id).expect("staging folder exists");
        assert!(staging.connections.is_empty());
    }

    #[test]
    fn move_connection_before_later_connection_in_root() {
        let storage =
            Storage::open(temp_db_path("connection-move-same-folder")).expect("storage opens");
        let powershell = create_test_local_connection(&storage, "PowerShell", "powershell.exe");
        let wsl = create_test_local_connection(&storage, "WSL", "wsl.exe");

        let tree = storage
            .move_connection(MoveConnectionRequest {
                id: wsl.id.clone(),
                folder_id: None,
                target_index: 0,
            })
            .expect("connection order is normalized");

        assert_eq!(tree.connections[0].id, wsl.id);
        assert_eq!(tree.connections[1].id, powershell.id);
    }

    #[test]
    fn general_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("general-settings")).expect("storage opens");

        let defaults = storage
            .general_settings()
            .expect("default general settings load");
        assert!(defaults.auto_backup_enabled);
        assert!(defaults.last_backup_at.is_none());

        let updated = storage
            .update_general_settings(GeneralSettings {
                auto_backup_enabled: false,
                last_backup_at: None,
            })
            .expect("general settings update");
        assert!(!updated.auto_backup_enabled);

        let reloaded = storage.general_settings().expect("general settings reload");
        assert!(!reloaded.auto_backup_enabled);
        assert!(reloaded.last_backup_at.is_none());
    }

    #[test]
    fn database_backup_import_restores_settings_and_connections() {
        let db_path = temp_db_path("database-export-import");
        let storage = Storage::open(db_path).expect("storage opens");
        storage
            .update_general_settings(GeneralSettings {
                auto_backup_enabled: false,
                last_backup_at: None,
            })
            .expect("general settings update");
        let connection = create_test_ssh_connection(&storage, "Prod SSH", "prod.internal", None);

        let backup = storage.backup_database().expect("database backup succeeds");
        storage
            .update_general_settings(GeneralSettings {
                auto_backup_enabled: true,
                last_backup_at: None,
            })
            .expect("general settings changes after export");
        storage
            .delete_connection(connection.id.clone())
            .expect("connection can be removed before import");

        let imported = storage
            .import_database_zip(PathBuf::from(&backup.path))
            .expect("database imports");

        assert!(!imported.general_settings.auto_backup_enabled);
        assert_eq!(
            imported.general_settings.last_backup_at.as_deref(),
            Some(imported.backup.created_at.as_str())
        );
        assert_eq!(imported.connection_tree.connections.len(), 1);
        assert_eq!(imported.connection_tree.connections[0].id, connection.id);
        assert!(Path::new(&imported.backup.path).exists());
        assert!(imported.backup.filename.ends_with(".zip"));
    }

    #[test]
    fn database_backup_zip_is_serialized_and_importable() {
        let db_path = temp_db_path("database-backup-importable");
        let storage = Storage::open(db_path).expect("storage opens");
        let connection = create_test_ssh_connection(&storage, "Prod SSH", "prod.internal", None);

        let first_backup = storage.backup_database().expect("database backup succeeds");
        let second_backup = storage
            .backup_database()
            .expect("second database backup succeeds");

        assert_ne!(first_backup.filename, second_backup.filename);
        assert!(backup_filename_has_serial(&first_backup.filename));
        assert!(backup_filename_has_serial(&second_backup.filename));
        assert!(Path::new(&first_backup.path).exists());
        assert!(Path::new(&second_backup.path).exists());
        let settings = storage
            .general_settings()
            .expect("general settings reloads after backup");
        assert_eq!(
            settings.last_backup_at.as_deref(),
            Some(second_backup.created_at.as_str())
        );

        storage
            .delete_connection(connection.id.clone())
            .expect("connection can be removed before import");

        let imported = storage
            .import_database_zip(PathBuf::from(&first_backup.path))
            .expect("backup imports");

        assert_eq!(imported.connection_tree.connections.len(), 1);
        assert_eq!(imported.connection_tree.connections[0].id, connection.id);
    }

    #[test]
    fn terminal_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("terminal-settings")).expect("storage opens");

        let defaults = storage
            .terminal_settings()
            .expect("default terminal settings load");
        assert_eq!(defaults.font_size, 12);
        assert_eq!(defaults.scrollback_lines, 5_000);
        assert!(defaults.confirm_multiline_paste);

        let updated = storage
            .update_terminal_settings(TerminalSettings {
                font_family: "Cascadia Mono".to_string(),
                font_size: 14,
                line_height: 1.35,
                cursor_style: "bar".to_string(),
                scrollback_lines: 5_000,
                copy_on_select: true,
                confirm_multiline_paste: false,
                default_shell: "pwsh.exe".to_string(),
            })
            .expect("terminal settings update");

        assert_eq!(updated.cursor_style, "bar");
        assert!(updated.copy_on_select);

        let reloaded = storage
            .terminal_settings()
            .expect("terminal settings reload");
        assert_eq!(reloaded.font_family, "Cascadia Mono");
        assert_eq!(reloaded.default_shell, "pwsh.exe");
    }

    #[test]
    fn appearance_settings_round_trip_through_settings_table() {
        let db_path = temp_db_path("appearance-settings");
        let storage = Storage::open(db_path.clone()).expect("storage opens");

        let defaults = storage
            .appearance_settings()
            .expect("default appearance settings load");
        assert!(defaults.app_font_family.contains("Satoshi"));

        let updated = storage
            .update_appearance_settings(AppearanceSettings {
                app_font_family: "  \"Custom UI Font\", \"Segoe UI\", sans-serif  ".to_string(),
                color_scheme: "dark".to_string(),
                custom_font_path: Some("  C:/AdminDeck/fonts/custom.ttf  ".to_string()),
            })
            .expect("appearance settings update");

        assert_eq!(
            updated.app_font_family,
            "\"Custom UI Font\", \"Segoe UI\", sans-serif"
        );
        assert_eq!(
            updated.custom_font_path.as_deref(),
            Some("C:/AdminDeck/fonts/custom.ttf")
        );

        drop(storage);

        let reopened = Storage::open(db_path).expect("storage reopens after app restart");
        let reloaded = reopened
            .appearance_settings()
            .expect("appearance settings reload after restart");
        assert_eq!(reloaded.app_font_family, updated.app_font_family);
    }

    #[test]
    fn ssh_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("ssh-settings")).expect("storage opens");

        let defaults = storage.ssh_settings().expect("default SSH settings load");
        assert_eq!(defaults.default_port, 22);
        assert_eq!(defaults.buffer_lines, 5_000);
        assert!(defaults.default_key_path.is_some());

        let updated = storage
            .update_ssh_settings(SshSettings {
                default_user: "deploy".to_string(),
                default_port: 2200,
                default_key_path: Some("  C:\\Users\\ryan\\.ssh\\deploy_ed25519  ".to_string()),
                default_proxy_jump: Some("  bastion.internal  ".to_string()),
                buffer_lines: 12_000,
            })
            .expect("SSH settings update");

        assert_eq!(updated.default_user, "deploy");
        assert_eq!(
            updated.default_key_path.as_deref(),
            Some("C:\\Users\\ryan\\.ssh\\deploy_ed25519")
        );

        let reloaded = storage.ssh_settings().expect("SSH settings reload");
        assert_eq!(reloaded.default_port, 2200);
        assert_eq!(reloaded.buffer_lines, 12_000);
        assert_eq!(
            reloaded.default_proxy_jump.as_deref(),
            Some("bastion.internal")
        );
    }

    #[test]
    fn sftp_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("sftp-settings")).expect("storage opens");

        let defaults = storage.sftp_settings().expect("default SFTP settings load");
        assert_eq!(defaults.overwrite_behavior, "fail");

        let updated = storage
            .update_sftp_settings(SftpSettings {
                overwrite_behavior: "  REPLACE  ".to_string(),
            })
            .expect("SFTP settings update");

        assert_eq!(updated.overwrite_behavior, "overwrite");

        let reloaded = storage.sftp_settings().expect("SFTP settings reload");
        assert_eq!(reloaded.overwrite_behavior, "overwrite");
    }

    #[test]
    fn url_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("url-settings")).expect("storage opens");

        let defaults = storage.url_settings().expect("default URL settings load");
        assert!(!defaults.ignore_certificate_errors);

        let updated = storage
            .update_url_settings(UrlSettings {
                ignore_certificate_errors: true,
            })
            .expect("URL settings update");

        assert!(updated.ignore_certificate_errors);

        let reloaded = storage.url_settings().expect("URL settings reload");
        assert!(reloaded.ignore_certificate_errors);
    }

    #[test]
    fn ai_provider_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("ai-provider-settings")).expect("storage opens");

        let defaults = storage
            .ai_provider_settings()
            .expect("default AI provider settings load");
        assert!(!defaults.enabled);
        assert_eq!(defaults.provider_kind, "openai");
        assert_eq!(defaults.base_url, "https://api.openai.com/v1");
        assert_eq!(defaults.model, "gpt-5.5");
        assert_eq!(defaults.reasoning_effort, "medium");
        assert_eq!(defaults.cli_execution_policy, "suggestOnly");

        let updated = storage
            .update_ai_provider_settings(AiProviderSettings {
                enabled: true,
                provider_kind: "  OpenRouter  ".to_string(),
                base_url: "  https://llm-gateway.internal/v1/  ".to_string(),
                model: " openai/gpt-5.5 ".to_string(),
                reasoning_effort: " XHIGH ".to_string(),
                output_language: String::new(),
                cli_execution_policy: "suggest-only".to_string(),
                claude_cli_path: Some("  C:\\Tools\\claude.exe  ".to_string()),
                codex_cli_path: Some("  codex  ".to_string()),
                tools: default_ai_assistant_tool_settings(),
            })
            .expect("AI provider settings update");

        assert!(updated.enabled);
        assert_eq!(updated.provider_kind, "openrouter");
        assert_eq!(updated.base_url, "https://llm-gateway.internal/v1");
        assert_eq!(updated.model, "openai/gpt-5.5");
        assert_eq!(updated.reasoning_effort, "max");
        assert_eq!(updated.cli_execution_policy, "suggestOnly");
        assert_eq!(
            updated.claude_cli_path.as_deref(),
            Some("C:\\Tools\\claude.exe")
        );
        assert_eq!(updated.codex_cli_path.as_deref(), Some("codex"));

        let reloaded = storage
            .ai_provider_settings()
            .expect("AI provider settings reload");
        assert_eq!(reloaded.base_url, "https://llm-gateway.internal/v1");
        assert_eq!(reloaded.model, "openai/gpt-5.5");
        assert_eq!(reloaded.reasoning_effort, "max");
    }

    #[test]
    fn ai_provider_settings_reject_invalid_base_url() {
        let storage = Storage::open(temp_db_path("ai-provider-invalid")).expect("storage opens");

        let error = storage
            .update_ai_provider_settings(AiProviderSettings {
                enabled: true,
                provider_kind: "openai".to_string(),
                base_url: "api.openai.com/v1".to_string(),
                model: "gpt-5.5".to_string(),
                reasoning_effort: "medium".to_string(),
                output_language: String::new(),
                cli_execution_policy: "suggestOnly".to_string(),
                claude_cli_path: None,
                codex_cli_path: None,
                tools: default_ai_assistant_tool_settings(),
            })
            .expect_err("scheme-less endpoint is rejected");

        assert_eq!(
            error,
            "AI provider endpoint must start with https:// or http://"
        );
    }

    #[test]
    fn ai_provider_settings_reject_blank_model() {
        let storage =
            Storage::open(temp_db_path("ai-provider-blank-model")).expect("storage opens");

        let error = storage
            .update_ai_provider_settings(AiProviderSettings {
                enabled: true,
                provider_kind: "openai".to_string(),
                base_url: "https://api.openai.com/v1".to_string(),
                model: "   ".to_string(),
                reasoning_effort: "medium".to_string(),
                output_language: String::new(),
                cli_execution_policy: "suggestOnly".to_string(),
                claude_cli_path: None,
                codex_cli_path: None,
                tools: default_ai_assistant_tool_settings(),
            })
            .expect_err("blank model is rejected");

        assert_eq!(error, "AI model is required");
    }

    #[test]
    fn ai_provider_settings_keep_cli_policy_suggest_only() {
        let storage = Storage::open(temp_db_path("ai-provider-cli-policy")).expect("storage opens");

        let error = storage
            .update_ai_provider_settings(AiProviderSettings {
                enabled: true,
                provider_kind: "openai".to_string(),
                base_url: "https://api.openai.com/v1".to_string(),
                model: "gpt-5.5".to_string(),
                reasoning_effort: "medium".to_string(),
                output_language: String::new(),
                cli_execution_policy: "executeAutomatically".to_string(),
                claude_cli_path: Some("claude".to_string()),
                codex_cli_path: Some("codex".to_string()),
                tools: default_ai_assistant_tool_settings(),
            })
            .expect_err("auto-execution policy is rejected");

        assert_eq!(
            error,
            "CLI adapter policy must remain suggest-only for approval-based execution"
        );
    }

    #[test]
    fn main_window_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("main-window-settings")).expect("storage opens");

        assert_eq!(
            storage
                .main_window_settings()
                .expect("missing main window settings load"),
            None
        );

        let updated = storage
            .update_main_window_settings(MainWindowSettings {
                width: 1440,
                height: 900,
                maximized: true,
            })
            .expect("main window settings update");

        assert_eq!(
            updated,
            MainWindowSettings {
                width: 1440,
                height: 900,
                maximized: true,
            }
        );
        assert_eq!(
            storage
                .main_window_settings()
                .expect("main window settings reload"),
            Some(updated)
        );
    }

    fn temp_db_path(name: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is after Unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("admin-deck-storage-{name}-{unique}"));
        fs::create_dir_all(&dir).expect("temp directory is created");
        dir.join("admin-deck.sqlite3")
    }
}
