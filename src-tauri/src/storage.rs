use rusqlite::{params, Connection as SqliteConnection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};

const MIGRATION_001: &str = r#"
CREATE TABLE IF NOT EXISTS connection_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES connection_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    username TEXT NOT NULL,
    port INTEGER,
    key_path TEXT,
    connection_type TEXT NOT NULL CHECK (connection_type IN ('local', 'ssh', 'sftp')),
    status TEXT NOT NULL CHECK (status IN ('connected', 'idle', 'offline')),
    sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connection_tags (
    connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (connection_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_connections_folder_sort
    ON connections(folder_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_connection_tags_connection_sort
    ON connection_tags(connection_id, sort_order);

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionGroup {
    id: String,
    name: String,
    connections: Vec<SavedConnection>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedConnection {
    id: String,
    name: String,
    host: String,
    user: String,
    port: Option<u16>,
    key_path: Option<String>,
    #[serde(rename = "type")]
    connection_type: String,
    tags: Vec<String>,
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConnectionRequest {
    name: String,
    host: String,
    user: String,
    #[serde(rename = "type")]
    connection_type: String,
    folder_id: Option<String>,
    port: Option<u16>,
    key_path: Option<String>,
    tags: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConnectionFolderRequest {
    name: String,
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
    target_index: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveConnectionRequest {
    id: String,
    folder_id: String,
    target_index: usize,
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
        storage.migrate()?;
        storage.seed_starter_connections()?;
        Ok(storage)
    }

    pub fn status(&self) -> String {
        format!("SQLite: {}", self.db_path.display())
    }

    pub fn list_connection_groups(&self) -> Result<Vec<ConnectionGroup>, String> {
        let connection = self.lock()?;
        let mut folder_statement = connection
            .prepare(
                "SELECT id, name
                 FROM connection_folders
                 ORDER BY sort_order, name",
            )
            .map_err(to_storage_error)?;

        let folder_rows = folder_statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(to_storage_error)?;

        let mut groups = Vec::new();
        for folder_row in folder_rows {
            let (id, name) = folder_row.map_err(to_storage_error)?;
            let connections = list_connections_for_folder(&connection, &id)?;
            groups.push(ConnectionGroup {
                id,
                name,
                connections,
            });
        }

        Ok(groups)
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

    fn migrate(&self) -> Result<(), String> {
        let connection = self.lock()?;
        connection
            .execute_batch(MIGRATION_001)
            .map_err(to_storage_error)?;
        add_optional_column(
            &connection,
            "ALTER TABLE connections ADD COLUMN port INTEGER",
        )?;
        add_optional_column(
            &connection,
            "ALTER TABLE connections ADD COLUMN key_path TEXT",
        )?;
        Ok(())
    }

    pub fn create_connection(
        &self,
        request: CreateConnectionRequest,
    ) -> Result<SavedConnection, String> {
        let connection_type = normalize_connection_type(&request.connection_type)?;
        let name = required_field("name", request.name)?;
        let host = required_field("host", request.host)?;
        let user = required_field("user", request.user)?;
        let folder_id = request
            .folder_id
            .unwrap_or_else(|| default_folder_for(&connection_type));
        let key_path = request.key_path.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        });
        let id = make_connection_id(&name);
        let tags = normalize_tags(request.tags);

        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(to_storage_error)?;
        ensure_folder_exists(&transaction, &folder_id, folder_name_for(&folder_id))?;
        let next_sort_order: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM connections WHERE folder_id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .map_err(to_storage_error)?;

        transaction
            .execute(
                "INSERT INTO connections (
                    id, folder_id, name, host, username, port, key_path, connection_type, status, sort_order
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'idle', ?9)",
                params![
                    id,
                    folder_id,
                    name,
                    host,
                    user,
                    request.port,
                    key_path,
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
            connection_type,
            tags,
            status: "idle".to_string(),
        })
    }

    pub fn create_connection_folder(
        &self,
        request: CreateConnectionFolderRequest,
    ) -> Result<ConnectionGroup, String> {
        let name = required_field("folder name", request.name)?;
        let id = make_folder_id(&name);
        let connection = self.lock()?;
        let next_sort_order: i64 = connection
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM connection_folders",
                [],
                |row| row.get(0),
            )
            .map_err(to_storage_error)?;

        connection
            .execute(
                "INSERT INTO connection_folders (id, name, sort_order) VALUES (?1, ?2, ?3)",
                params![id, name, next_sort_order],
            )
            .map_err(to_storage_error)?;

        Ok(ConnectionGroup {
            id,
            name,
            connections: Vec::new(),
        })
    }

    pub fn rename_connection_folder(
        &self,
        request: RenameConnectionFolderRequest,
    ) -> Result<ConnectionGroup, String> {
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

        Ok(ConnectionGroup {
            connections: list_connections_for_folder(&connection, &id)?,
            id,
            name,
        })
    }

    pub fn delete_connection_folder(&self, folder_id: String) -> Result<(), String> {
        let folder_id = required_field("folder id", folder_id)?;
        if folder_id == "local" {
            return Err("the local workspace folder cannot be deleted".to_string());
        }

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
                "SELECT folder_id, name, host, username, port, key_path, connection_type
                 FROM connections
                 WHERE id = ?1",
                params![source_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        optional_port(row.get::<_, Option<i64>>(4)?)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, String>(6)?,
                    ))
                },
            )
            .optional()
            .map_err(to_storage_error)?
            .ok_or_else(|| "connection was not found".to_string())?;
        let (folder_id, source_name, host, user, port, key_path, connection_type) = source;
        let duplicate_name = request
            .name
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| format!("Copy of {source_name}"));
        let duplicate_id = make_connection_id(&duplicate_name);
        let next_sort_order: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM connections WHERE folder_id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .map_err(to_storage_error)?;

        transaction
            .execute(
                "INSERT INTO connections (
                    id, folder_id, name, host, username, port, key_path, connection_type, status, sort_order
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'idle', ?9)",
                params![
                    duplicate_id,
                    folder_id,
                    duplicate_name,
                    host,
                    user,
                    port,
                    key_path,
                    connection_type,
                    next_sort_order
                ],
            )
            .map_err(to_storage_error)?;

        let tags = list_tags(&transaction, &source_id)?;
        for (index, tag) in tags.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO connection_tags (connection_id, tag, sort_order)
                     VALUES (?1, ?2, ?3)",
                    params![duplicate_id, tag, index as i64],
                )
                .map_err(to_storage_error)?;
        }

        transaction.commit().map_err(to_storage_error)?;
        get_connection_by_id(&connection, &duplicate_id)
    }

    pub fn move_connection_folder(
        &self,
        request: MoveConnectionFolderRequest,
    ) -> Result<Vec<ConnectionGroup>, String> {
        let id = required_field("folder id", request.id)?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(to_storage_error)?;
        let mut folder_ids = list_folder_ids(&transaction)?;
        let current_index = folder_ids
            .iter()
            .position(|folder_id| folder_id == &id)
            .ok_or_else(|| "connection folder was not found".to_string())?;
        let folder_id = folder_ids.remove(current_index);
        let target_index = if current_index < request.target_index {
            request.target_index.saturating_sub(1)
        } else {
            request.target_index
        }
        .min(folder_ids.len());
        folder_ids.insert(target_index, folder_id);
        update_folder_sort_order(&transaction, &folder_ids)?;
        transaction.commit().map_err(to_storage_error)?;
        drop(connection);
        self.list_connection_groups()
    }

    pub fn move_connection(
        &self,
        request: MoveConnectionRequest,
    ) -> Result<Vec<ConnectionGroup>, String> {
        let id = required_field("connection id", request.id)?;
        let target_folder_id = required_field("folder id", request.folder_id)?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(to_storage_error)?;

        let source_folder_id = transaction
            .query_row(
                "SELECT folder_id FROM connections WHERE id = ?1",
                params![id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(to_storage_error)?
            .ok_or_else(|| "connection was not found".to_string())?;

        let target_index = if source_folder_id == target_folder_id {
            let connection_ids = list_connection_ids_for_folder(&transaction, &source_folder_id)?;
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

        ensure_folder_exists(
            &transaction,
            &target_folder_id,
            folder_name_for(&target_folder_id),
        )?;

        transaction
            .execute(
                "UPDATE connections SET folder_id = ?1 WHERE id = ?2",
                params![target_folder_id, id],
            )
            .map_err(to_storage_error)?;

        reorder_connection_ids(&transaction, &source_folder_id, None)?;
        reorder_connection_ids(&transaction, &target_folder_id, Some((&id, target_index)))?;
        transaction.commit().map_err(to_storage_error)?;
        drop(connection);
        self.list_connection_groups()
    }

    fn seed_starter_connections(&self) -> Result<(), String> {
        let mut connection = self.lock()?;
        let existing_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM connection_folders", [], |row| {
                row.get(0)
            })
            .map_err(to_storage_error)?;

        if existing_count > 0 {
            return Ok(());
        }

        let transaction = connection.transaction().map_err(to_storage_error)?;

        seed_folder(&transaction, "local", "Local workspace", 0)?;
        seed_folder(&transaction, "production", "Production", 1)?;
        seed_folder(&transaction, "staging", "Staging", 2)?;

        seed_connection(
            &transaction,
            NewConnection {
                id: "local-pwsh",
                folder_id: "local",
                name: "PowerShell",
                host: "localhost",
                username: "ryan",
                connection_type: "local",
                status: "idle",
                sort_order: 0,
                tags: &["local", "shell"],
            },
        )?;
        seed_connection(
            &transaction,
            NewConnection {
                id: "local-wsl",
                folder_id: "local",
                name: "WSL Ubuntu",
                host: "wsl.local",
                username: "ryan",
                connection_type: "local",
                status: "idle",
                sort_order: 1,
                tags: &["local", "linux"],
            },
        )?;
        seed_connection(
            &transaction,
            NewConnection {
                id: "bastion-east",
                folder_id: "production",
                name: "Bastion East",
                host: "bastion-east.internal",
                username: "admin",
                connection_type: "ssh",
                status: "idle",
                sort_order: 0,
                tags: &["prod", "ssh", "jump"],
            },
        )?;
        seed_connection(
            &transaction,
            NewConnection {
                id: "files-prod",
                folder_id: "production",
                name: "Release Files",
                host: "files01.internal",
                username: "deploy",
                connection_type: "sftp",
                status: "idle",
                sort_order: 1,
                tags: &["prod", "sftp"],
            },
        )?;
        seed_connection(
            &transaction,
            NewConnection {
                id: "api-stage",
                folder_id: "staging",
                name: "API Stage",
                host: "api-stage.internal",
                username: "ops",
                connection_type: "ssh",
                status: "idle",
                sort_order: 0,
                tags: &["stage", "api"],
            },
        )?;

        transaction.commit().map_err(to_storage_error)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, SqliteConnection>, String> {
        self.connection
            .lock()
            .map_err(|_| "SQLite connection lock is poisoned".to_string())
    }
}

fn list_connections_for_folder(
    connection: &SqliteConnection,
    folder_id: &str,
) -> Result<Vec<SavedConnection>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, host, username, port, key_path, connection_type
             FROM connections
             WHERE folder_id = ?1
             ORDER BY sort_order, name",
        )
        .map_err(to_storage_error)?;

    let rows = statement
        .query_map(params![folder_id], |row| {
            Ok(SavedConnection {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                user: row.get(3)?,
                port: optional_port(row.get::<_, Option<i64>>(4)?)?,
                key_path: row.get(5)?,
                connection_type: row.get(6)?,
                status: "idle".to_string(),
                tags: Vec::new(),
            })
        })
        .map_err(to_storage_error)?;

    let mut connections = Vec::new();
    for row in rows {
        let mut saved_connection = row.map_err(to_storage_error)?;
        saved_connection.tags = list_tags(connection, &saved_connection.id)?;
        connections.push(saved_connection);
    }

    Ok(connections)
}

fn list_folder_ids(connection: &SqliteConnection) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id
             FROM connection_folders
             ORDER BY sort_order, name",
        )
        .map_err(to_storage_error)?;

    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(to_storage_error)?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(to_storage_error)
}

fn update_folder_sort_order(
    connection: &SqliteConnection,
    folder_ids: &[String],
) -> Result<(), String> {
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
    folder_id: &str,
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
    folder_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id
             FROM connections
             WHERE folder_id = ?1
             ORDER BY sort_order, name",
        )
        .map_err(to_storage_error)?;

    let rows = statement
        .query_map(params![folder_id], |row| row.get::<_, String>(0))
        .map_err(to_storage_error)?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(to_storage_error)
}

fn get_connection_by_id(
    connection: &SqliteConnection,
    connection_id: &str,
) -> Result<SavedConnection, String> {
    let saved_connection = connection
        .query_row(
            "SELECT id, name, host, username, port, key_path, connection_type
             FROM connections
             WHERE id = ?1",
            params![connection_id],
            |row| {
                Ok(SavedConnection {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    host: row.get(2)?,
                    user: row.get(3)?,
                    port: optional_port(row.get::<_, Option<i64>>(4)?)?,
                    key_path: row.get(5)?,
                    connection_type: row.get(6)?,
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

fn seed_folder(
    connection: &SqliteConnection,
    id: &str,
    name: &str,
    sort_order: i64,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO connection_folders (id, name, sort_order) VALUES (?1, ?2, ?3)",
            params![id, name, sort_order],
        )
        .map(|_| ())
        .map_err(to_storage_error)
}

struct NewConnection<'a> {
    id: &'a str,
    folder_id: &'a str,
    name: &'a str,
    host: &'a str,
    username: &'a str,
    connection_type: &'a str,
    status: &'a str,
    sort_order: i64,
    tags: &'a [&'a str],
}

fn seed_connection(
    connection: &SqliteConnection,
    new_connection: NewConnection<'_>,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO connections (
                id, folder_id, name, host, username, connection_type, status, sort_order
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                new_connection.id,
                new_connection.folder_id,
                new_connection.name,
                new_connection.host,
                new_connection.username,
                new_connection.connection_type,
                new_connection.status,
                new_connection.sort_order
            ],
        )
        .map_err(to_storage_error)?;

    for (index, tag) in new_connection.tags.iter().enumerate() {
        connection
            .execute(
                "INSERT INTO connection_tags (connection_id, tag, sort_order)
                 VALUES (?1, ?2, ?3)",
                params![new_connection.id, tag, index as i64],
            )
            .map_err(to_storage_error)?;
    }

    Ok(())
}

fn to_storage_error(error: rusqlite::Error) -> String {
    format!("SQLite storage error: {error}")
}

fn add_optional_column(connection: &SqliteConnection, sql: &str) -> Result<(), String> {
    match connection.execute(sql, []) {
        Ok(_) => Ok(()),
        Err(rusqlite::Error::SqliteFailure(_, Some(message)))
            if message.contains("duplicate column name") =>
        {
            Ok(())
        }
        Err(error) => Err(to_storage_error(error)),
    }
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

    let next_sort_order: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM connection_folders",
            [],
            |row| row.get(0),
        )
        .map_err(to_storage_error)?;
    seed_folder(connection, id, fallback_name, next_sort_order)
}

fn normalize_connection_type(value: &str) -> Result<String, String> {
    match value.trim().to_lowercase().as_str() {
        "local" | "ssh" | "sftp" => Ok(value.trim().to_lowercase()),
        _ => Err("connection type must be local, ssh, or sftp".to_string()),
    }
}

fn default_folder_for(connection_type: &str) -> String {
    if connection_type == "local" {
        "local".to_string()
    } else {
        "manual".to_string()
    }
}

fn folder_name_for(folder_id: &str) -> &str {
    match folder_id {
        "local" => "Local workspace",
        "manual" => "Manual",
        other => other,
    }
}

fn required_field(field: &str, value: String) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(trimmed)
    }
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for tag in tags {
        let trimmed = tag.trim().to_lowercase();
        if !trimmed.is_empty() && !normalized.contains(&trimmed) {
            normalized.push(trimmed);
        }
    }
    normalized
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

fn make_connection_id(name: &str) -> String {
    make_unique_id("connection", name)
}

fn make_folder_id(name: &str) -> String {
    make_unique_id("folder", name)
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

    #[test]
    fn migrations_seed_the_starter_connection_tree() {
        let storage = Storage::open(temp_db_path("seed")).expect("storage opens");

        let groups = storage
            .list_connection_groups()
            .expect("connection groups load");

        assert_eq!(groups.len(), 3);
        assert_eq!(groups[0].id, "local");
        assert_eq!(groups[0].connections[0].name, "PowerShell");
        assert_eq!(groups[1].connections[0].tags, ["prod", "ssh", "jump"]);
        assert!(groups
            .iter()
            .flat_map(|group| group.connections.iter())
            .all(|connection| connection.status == "idle"));
    }

    #[test]
    fn migrations_do_not_duplicate_seed_data() {
        let db_path = temp_db_path("idempotent");
        let storage = Storage::open(db_path.clone()).expect("first open succeeds");
        drop(storage);

        let reopened_storage = Storage::open(db_path).expect("second open succeeds");
        let groups = reopened_storage
            .list_connection_groups()
            .expect("connection groups load");
        let connection_count: usize = groups.iter().map(|group| group.connections.len()).sum();

        assert_eq!(connection_count, 5);
    }

    #[test]
    fn create_connection_persists_manual_ssh_connection() {
        let storage = Storage::open(temp_db_path("create")).expect("storage opens");

        let created = storage
            .create_connection(CreateConnectionRequest {
                name: "Lab Host".to_string(),
                host: "lab.internal".to_string(),
                user: "admin".to_string(),
                connection_type: "ssh".to_string(),
                folder_id: Some("manual".to_string()),
                port: Some(2222),
                key_path: Some("C:\\Users\\ryan\\.ssh\\id_ed25519".to_string()),
                tags: vec!["Lab".to_string(), " ssh ".to_string()],
            })
            .expect("connection is created");

        assert_eq!(created.name, "Lab Host");
        assert_eq!(created.port, Some(2222));

        let groups = storage
            .list_connection_groups()
            .expect("connection groups load");
        let manual = groups
            .iter()
            .find(|group| group.id == "manual")
            .expect("manual folder exists");

        assert_eq!(manual.name, "Manual");
        assert_eq!(manual.connections[0].host, "lab.internal");
        assert_eq!(manual.connections[0].tags, ["lab", "ssh"]);
    }

    #[test]
    fn rename_connection_updates_durable_connection_name() {
        let storage = Storage::open(temp_db_path("rename")).expect("storage opens");

        let renamed = storage
            .rename_connection(RenameConnectionRequest {
                id: "api-stage".to_string(),
                name: "API Stage Blue".to_string(),
            })
            .expect("connection is renamed");

        assert_eq!(renamed.id, "api-stage");
        assert_eq!(renamed.name, "API Stage Blue");

        let groups = storage
            .list_connection_groups()
            .expect("connection groups load");
        let staging = groups
            .iter()
            .find(|group| group.id == "staging")
            .expect("staging folder exists");

        assert_eq!(staging.connections[0].name, "API Stage Blue");
    }

    #[test]
    fn delete_connection_removes_connection_and_tags() {
        let storage = Storage::open(temp_db_path("delete")).expect("storage opens");

        storage
            .delete_connection("bastion-east".to_string())
            .expect("connection is deleted");

        let groups = storage
            .list_connection_groups()
            .expect("connection groups load");
        let production = groups
            .iter()
            .find(|group| group.id == "production")
            .expect("production folder exists");

        assert_eq!(production.connections.len(), 1);
        assert_eq!(production.connections[0].id, "files-prod");
    }

    #[test]
    fn duplicate_connection_copies_non_secret_connection_data_and_tags() {
        let storage = Storage::open(temp_db_path("duplicate")).expect("storage opens");

        let duplicated = storage
            .duplicate_connection(DuplicateConnectionRequest {
                id: "bastion-east".to_string(),
                name: Some("Bastion East Copy".to_string()),
            })
            .expect("connection is duplicated");

        assert_ne!(duplicated.id, "bastion-east");
        assert_eq!(duplicated.name, "Bastion East Copy");
        assert_eq!(duplicated.host, "bastion-east.internal");
        assert_eq!(duplicated.user, "admin");
        assert_eq!(duplicated.tags, ["prod", "ssh", "jump"]);
        assert_eq!(duplicated.status, "idle");

        let groups = storage
            .list_connection_groups()
            .expect("connection groups load");
        let production = groups
            .iter()
            .find(|group| group.id == "production")
            .expect("production folder exists");

        assert_eq!(production.connections.len(), 3);
        assert_eq!(production.connections[2].id, duplicated.id);
    }

    #[test]
    fn create_rename_and_delete_connection_folder() {
        let storage = Storage::open(temp_db_path("folder-crud")).expect("storage opens");

        let created = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Customer A".to_string(),
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
            .delete_connection_folder(created.id)
            .expect("folder is deleted");

        let groups = storage
            .list_connection_groups()
            .expect("connection groups load");
        assert!(!groups
            .iter()
            .any(|group| group.name == "Customer A Production"));
    }

    #[test]
    fn deleting_folder_removes_connections_in_that_folder() {
        let storage = Storage::open(temp_db_path("folder-delete-cascade")).expect("storage opens");
        let folder = storage
            .create_connection_folder(CreateConnectionFolderRequest {
                name: "Ephemeral".to_string(),
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
                tags: vec!["temp".to_string()],
            })
            .expect("connection is created in folder");

        storage
            .delete_connection_folder(folder.id)
            .expect("folder is deleted");

        let groups = storage
            .list_connection_groups()
            .expect("connection groups load");
        assert!(!groups.iter().any(|group| {
            group
                .connections
                .iter()
                .any(|connection| connection.host == "throwaway.internal")
        }));
    }

    #[test]
    fn local_workspace_folder_cannot_be_deleted() {
        let storage = Storage::open(temp_db_path("folder-delete-local")).expect("storage opens");

        let error = storage
            .delete_connection_folder("local".to_string())
            .expect_err("local workspace delete is rejected");

        assert_eq!(error, "the local workspace folder cannot be deleted");
    }

    #[test]
    fn move_connection_folder_updates_durable_folder_order() {
        let storage = Storage::open(temp_db_path("folder-move")).expect("storage opens");

        let groups = storage
            .move_connection_folder(MoveConnectionFolderRequest {
                id: "staging".to_string(),
                target_index: 0,
            })
            .expect("folder is moved");

        assert_eq!(groups[0].id, "staging");
        assert_eq!(groups[1].id, "local");

        let reloaded = storage
            .list_connection_groups()
            .expect("connection groups reload");
        assert_eq!(reloaded[0].id, "staging");
    }

    #[test]
    fn move_connection_reorders_within_target_folder() {
        let storage = Storage::open(temp_db_path("connection-move")).expect("storage opens");

        let groups = storage
            .move_connection(MoveConnectionRequest {
                id: "api-stage".to_string(),
                folder_id: "production".to_string(),
                target_index: 1,
            })
            .expect("connection is moved");

        let production = groups
            .iter()
            .find(|group| group.id == "production")
            .expect("production folder exists");
        assert_eq!(production.connections[1].id, "api-stage");
        assert_eq!(production.connections.len(), 3);

        let staging = groups
            .iter()
            .find(|group| group.id == "staging")
            .expect("staging folder exists");
        assert!(staging.connections.is_empty());
    }

    #[test]
    fn move_connection_before_later_connection_in_same_folder() {
        let storage =
            Storage::open(temp_db_path("connection-move-same-folder")).expect("storage opens");

        let groups = storage
            .move_connection(MoveConnectionRequest {
                id: "bastion-east".to_string(),
                folder_id: "production".to_string(),
                target_index: 1,
            })
            .expect("connection order is normalized");

        let production = groups
            .iter()
            .find(|group| group.id == "production")
            .expect("production folder exists");
        assert_eq!(production.connections[0].id, "bastion-east");
        assert_eq!(production.connections[1].id, "files-prod");
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
