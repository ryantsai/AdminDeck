use rusqlite::{params, Connection as SqliteConnection};
use serde::Serialize;
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
    #[serde(rename = "type")]
    connection_type: String,
    tags: Vec<String>,
    status: String,
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

    fn migrate(&self) -> Result<(), String> {
        let connection = self.lock()?;
        connection
            .execute_batch(MIGRATION_001)
            .map_err(to_storage_error)
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
                status: "connected",
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
                status: "connected",
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
                status: "offline",
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
            "SELECT id, name, host, username, connection_type, status
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
                connection_type: row.get(4)?,
                status: row.get(5)?,
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
