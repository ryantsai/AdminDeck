use rusqlite::{params, Connection as SqliteConnection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};

const SCHEMA_USER_VERSION: i32 = 3;

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
    connection_type TEXT NOT NULL CHECK (connection_type IN ('local', 'ssh', 'url')),
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
"#;

pub struct Storage {
    db_path: PathBuf,
    connection: Mutex<SqliteConnection>,
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
pub struct SshSettings {
    default_user: String,
    default_port: u16,
    default_key_path: Option<String>,
    default_proxy_jump: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpSettings {
    overwrite_behavior: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderSettings {
    enabled: bool,
    base_url: String,
    #[serde(default = "default_ai_model")]
    model: String,
    #[serde(default = "default_ai_cli_execution_policy")]
    cli_execution_policy: String,
    #[serde(default)]
    claude_cli_path: Option<String>,
    #[serde(default)]
    codex_cli_path: Option<String>,
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

        let connection = SqliteConnection::open(&db_path)
            .map_err(|error| format!("failed to open SQLite database: {error}"))?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(|error| format!("failed to enable SQLite foreign keys: {error}"))?;

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

    pub fn list_connection_tree(&self) -> Result<ConnectionTree, String> {
        let connection = self.lock()?;
        Ok(ConnectionTree {
            connections: list_connections_for_folder(&connection, None)?,
            folders: list_folders_for_parent(&connection, None)?,
        })
    }

    pub fn list_connection_groups(&self) -> Result<ConnectionTree, String> {
        self.list_connection_tree()
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
        let host = if connection_type == "url" {
            url.as_deref()
                .and_then(|value| extract_url_host(value))
                .unwrap_or_default()
        } else {
            required_field("host", request.host)?
        };
        let user = if connection_type == "url" {
            String::new()
        } else {
            required_field("user", request.user)?
        };
        let folder_id = normalize_optional_id(request.folder_id);
        let key_path = request.key_path.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        });
        let proxy_jump = request.proxy_jump.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        });
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
                    id, folder_id, name, host, username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type, status, sort_order
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'idle', ?16)",
                params![
                    id,
                    folder_id,
                    name,
                    host,
                    user,
                    request.port,
                    key_path,
                    proxy_jump,
                    auth_method,
                    local_shell,
                    url,
                    data_partition,
                    use_tmux_sessions,
                    tmux_connection_id,
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
            port: request.port,
            key_path,
            proxy_jump,
            auth_method,
            local_shell,
            url,
            data_partition,
            use_tmux_sessions,
            tmux_connection_id,
            url_credential_username: None,
            has_url_credential: false,
            connection_type,
            tags,
            status: "idle".to_string(),
        })
    }

    pub fn upsert_url_credential(
        &self,
        request: UpsertUrlCredentialRequest,
    ) -> Result<SavedConnection, String> {
        let connection_id = required_field("connection id", request.connection_id)?;
        let username = required_field("URL credential username", request.username)?;
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
                "INSERT INTO url_credentials (connection_id, username, updated_at)
                 VALUES (?1, ?2, CURRENT_TIMESTAMP)
                 ON CONFLICT(connection_id) DO UPDATE SET
                    username = excluded.username,
                    updated_at = CURRENT_TIMESTAMP",
                params![&connection_id, &username],
            )
            .map_err(to_storage_error)?;

        get_connection_by_id(&connection, &connection_id)
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
                "SELECT folder_id, name, host, username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, connection_type
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
                        row.get::<_, String>(12)?,
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
                    id, folder_id, name, host, username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type, status, sort_order
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'idle', ?16)",
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

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, SqliteConnection>, String> {
        self.connection
            .lock()
            .map_err(|_| "SQLite connection lock is poisoned".to_string())
    }
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
            "SELECT connections.id, name, host, connections.username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type,
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
            "SELECT connections.id, name, host, connections.username, port, key_path, proxy_jump, auth_method, local_shell, url, data_partition, use_tmux_sessions, tmux_connection_id, connection_type,
                    url_credentials.username
             FROM connections
             LEFT JOIN url_credentials ON url_credentials.connection_id = connections.id
             WHERE connections.id = ?1",
            params![connection_id],
            |row| {
                let url_credential_username: Option<String> = row.get(14)?;
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
    let url_credential_username: Option<String> = row.get(14)?;
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

    connection
        .execute_batch(&format!("PRAGMA user_version = {SCHEMA_USER_VERSION}"))
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

fn ensure_url_credentials_table(connection: &mut SqliteConnection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS url_credentials (
                connection_id TEXT PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
                username TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_url_credentials_connection
                ON url_credentials(connection_id);
            "#,
        )
        .map_err(to_storage_error)
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
        "local" | "ssh" | "url" => Ok(value.trim().to_lowercase()),
        _ => Err("connection type must be local, ssh, or url".to_string()),
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
        return Ok(trimmed);
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
    if connection_type == "local" || connection_type == "url" {
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

fn default_terminal_settings() -> TerminalSettings {
    TerminalSettings {
        font_family: "\"Cascadia Mono\", \"JetBrains Mono\", Consolas, monospace".to_string(),
        font_size: 12,
        line_height: 1.25,
        cursor_style: "block".to_string(),
        scrollback_lines: 5000,
        copy_on_select: false,
        confirm_multiline_paste: true,
        default_shell: if cfg!(target_os = "windows") {
            "powershell.exe".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
        },
    }
}

fn default_ssh_settings() -> SshSettings {
    SshSettings {
        default_user: default_ssh_user(),
        default_port: 22,
        default_key_path: default_ssh_key_path(),
        default_proxy_jump: None,
    }
}

fn default_sftp_settings() -> SftpSettings {
    SftpSettings {
        overwrite_behavior: "fail".to_string(),
    }
}

fn default_ai_provider_settings() -> AiProviderSettings {
    AiProviderSettings {
        enabled: false,
        base_url: "https://api.openai.com/v1".to_string(),
        model: default_ai_model(),
        cli_execution_policy: default_ai_cli_execution_policy(),
        claude_cli_path: None,
        codex_cli_path: None,
    }
}

fn default_ai_model() -> String {
    "gpt-5-mini".to_string()
}

fn default_ai_cli_execution_policy() -> String {
    "suggestOnly".to_string()
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

fn validate_ssh_settings(mut settings: SshSettings) -> Result<SshSettings, String> {
    settings.default_user = required_field("default SSH user", settings.default_user)?;

    if settings.default_port == 0 {
        return Err("default SSH port must be between 1 and 65535".to_string());
    }

    settings.default_key_path = trim_optional(settings.default_key_path);
    settings.default_proxy_jump = trim_optional(settings.default_proxy_jump);
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

fn validate_ai_provider_settings(
    mut settings: AiProviderSettings,
) -> Result<AiProviderSettings, String> {
    settings.base_url = required_field("OpenAI-compatible endpoint", settings.base_url)?;
    settings.base_url = settings.base_url.trim_end_matches('/').to_string();
    settings.model = required_field("AI model", settings.model)?;
    settings.cli_execution_policy = match settings.cli_execution_policy.trim() {
        "" | "suggestOnly" | "suggest-only" | "suggest_only" => "suggestOnly".to_string(),
        _ => {
            return Err(
                "CLI adapter policy must remain suggest-only for approval-based execution"
                    .to_string(),
            )
        }
    };
    settings.claude_cli_path = trim_optional(settings.claude_cli_path);
    settings.codex_cli_path = trim_optional(settings.codex_cli_path);

    if !(settings.base_url.starts_with("https://") || settings.base_url.starts_with("http://")) {
        return Err("OpenAI-compatible endpoint must start with https:// or http://".to_string());
    }

    if settings.base_url.chars().any(char::is_whitespace) {
        return Err("OpenAI-compatible endpoint cannot contain whitespace".to_string());
    }

    if settings.base_url.contains('?') || settings.base_url.contains('#') {
        return Err(
            "OpenAI-compatible endpoint must be a base URL without query or fragment".to_string(),
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
            })
            .expect("local connection is created")
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
            })
            .expect("URL connection is created");

        assert_eq!(created.url.as_deref(), Some("https://router.internal/"));
        assert!(!created.has_url_credential);

        let updated = storage
            .upsert_url_credential(UpsertUrlCredentialRequest {
                connection_id: created.id.clone(),
                username: "admin".to_string(),
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
    fn terminal_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("terminal-settings")).expect("storage opens");

        let defaults = storage
            .terminal_settings()
            .expect("default terminal settings load");
        assert_eq!(defaults.font_size, 12);
        assert!(defaults.confirm_multiline_paste);

        let updated = storage
            .update_terminal_settings(TerminalSettings {
                font_family: "Cascadia Mono".to_string(),
                font_size: 14,
                line_height: 1.35,
                cursor_style: "bar".to_string(),
                scrollback_lines: 10_000,
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
    fn ssh_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("ssh-settings")).expect("storage opens");

        let defaults = storage.ssh_settings().expect("default SSH settings load");
        assert_eq!(defaults.default_port, 22);
        assert!(defaults.default_key_path.is_some());

        let updated = storage
            .update_ssh_settings(SshSettings {
                default_user: "deploy".to_string(),
                default_port: 2200,
                default_key_path: Some("  C:\\Users\\ryan\\.ssh\\deploy_ed25519  ".to_string()),
                default_proxy_jump: Some("  bastion.internal  ".to_string()),
            })
            .expect("SSH settings update");

        assert_eq!(updated.default_user, "deploy");
        assert_eq!(
            updated.default_key_path.as_deref(),
            Some("C:\\Users\\ryan\\.ssh\\deploy_ed25519")
        );

        let reloaded = storage.ssh_settings().expect("SSH settings reload");
        assert_eq!(reloaded.default_port, 2200);
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
    fn ai_provider_settings_round_trip_through_settings_table() {
        let storage = Storage::open(temp_db_path("ai-provider-settings")).expect("storage opens");

        let defaults = storage
            .ai_provider_settings()
            .expect("default AI provider settings load");
        assert!(!defaults.enabled);
        assert_eq!(defaults.base_url, "https://api.openai.com/v1");
        assert_eq!(defaults.model, "gpt-5-mini");
        assert_eq!(defaults.cli_execution_policy, "suggestOnly");

        let updated = storage
            .update_ai_provider_settings(AiProviderSettings {
                enabled: true,
                base_url: "  https://llm-gateway.internal/v1/  ".to_string(),
                model: " gpt-5 ".to_string(),
                cli_execution_policy: "suggest-only".to_string(),
                claude_cli_path: Some("  C:\\Tools\\claude.exe  ".to_string()),
                codex_cli_path: Some("  codex  ".to_string()),
            })
            .expect("AI provider settings update");

        assert!(updated.enabled);
        assert_eq!(updated.base_url, "https://llm-gateway.internal/v1");
        assert_eq!(updated.model, "gpt-5");
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
        assert_eq!(reloaded.model, "gpt-5");
    }

    #[test]
    fn ai_provider_settings_reject_invalid_base_url() {
        let storage = Storage::open(temp_db_path("ai-provider-invalid")).expect("storage opens");

        let error = storage
            .update_ai_provider_settings(AiProviderSettings {
                enabled: true,
                base_url: "api.openai.com/v1".to_string(),
                model: "gpt-5-mini".to_string(),
                cli_execution_policy: "suggestOnly".to_string(),
                claude_cli_path: None,
                codex_cli_path: None,
            })
            .expect_err("scheme-less endpoint is rejected");

        assert_eq!(
            error,
            "OpenAI-compatible endpoint must start with https:// or http://"
        );
    }

    #[test]
    fn ai_provider_settings_reject_blank_model() {
        let storage =
            Storage::open(temp_db_path("ai-provider-blank-model")).expect("storage opens");

        let error = storage
            .update_ai_provider_settings(AiProviderSettings {
                enabled: true,
                base_url: "https://api.openai.com/v1".to_string(),
                model: "   ".to_string(),
                cli_execution_policy: "suggestOnly".to_string(),
                claude_cli_path: None,
                codex_cli_path: None,
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
                base_url: "https://api.openai.com/v1".to_string(),
                model: "gpt-5-mini".to_string(),
                cli_execution_policy: "executeAutomatically".to_string(),
                claude_cli_path: Some("claude".to_string()),
                codex_cli_path: Some("codex".to_string()),
            })
            .expect_err("auto-execution policy is rejected");

        assert_eq!(
            error,
            "CLI adapter policy must remain suggest-only for approval-based execution"
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
