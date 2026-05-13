use rusqlite::{params, Connection as SqliteConnection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::dashboard_validation::{
    validate_accent, validate_custom_body_for_kind, validate_custom_widget_kind,
    validate_grid_bounds, validate_grid_density, validate_icon, validate_kind, validate_preset,
    validate_title, ValidationError,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardView {
    pub id: String,
    pub title: String,
    pub sort_order: i64,
    pub grid_density: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardWidgetInstance {
    pub id: String,
    pub view_id: String,
    pub kind: String,
    pub source_id: String,
    pub preset: String,
    pub accent_name: String,
    pub icon_name: String,
    pub custom_title: Option<String>,
    pub glass: bool,
    pub action_direction: Option<String>,
    pub grid_x: i64,
    pub grid_y: i64,
    pub grid_w: i64,
    pub grid_h: i64,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardCustomWidget {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub category: String,
    pub body_json: String,
    pub created_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardLoadState {
    pub views: Vec<DashboardView>,
    pub instances: Vec<DashboardWidgetInstance>,
    pub custom_widgets: Vec<DashboardCustomWidget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstancePatch {
    #[serde(default)] pub preset: Option<String>,
    #[serde(default)] pub accent_name: Option<String>,
    #[serde(default)] pub icon_name: Option<String>,
    #[serde(default)] pub custom_title: Option<Option<String>>,
    #[serde(default)] pub glass: Option<bool>,
    #[serde(default)] pub action_direction: Option<Option<String>>,
    #[serde(default)] pub grid_x: Option<i64>,
    #[serde(default)] pub grid_y: Option<i64>,
    #[serde(default)] pub grid_w: Option<i64>,
    #[serde(default)] pub grid_h: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewPatch {
    #[serde(default)] pub title: Option<String>,
    #[serde(default)] pub grid_density: Option<String>,
    #[serde(default)] pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomWidgetPatch {
    #[serde(default)] pub title: Option<String>,
    #[serde(default)] pub summary: Option<String>,
    #[serde(default)] pub category: Option<String>,
    #[serde(default)] pub body_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutEntry {
    pub id: String,
    pub grid_x: i64,
    pub grid_y: i64,
    pub grid_w: i64,
    pub grid_h: i64,
}

#[derive(Debug)]
pub enum DashboardStorageError {
    Validation(ValidationError),
    Sqlite(rusqlite::Error),
    NotFound,
    InstancesExist { instance_ids: Vec<String> },
}

impl From<rusqlite::Error> for DashboardStorageError {
    fn from(value: rusqlite::Error) -> Self { Self::Sqlite(value) }
}

impl From<ValidationError> for DashboardStorageError {
    fn from(value: ValidationError) -> Self { Self::Validation(value) }
}

pub fn load_state(conn: &SqliteConnection) -> Result<DashboardLoadState, DashboardStorageError> {
    let mut views_stmt = conn.prepare(
        "SELECT id, title, sort_order, grid_density FROM dashboard_views ORDER BY sort_order"
    )?;
    let views = views_stmt
        .query_map([], |row| {
            Ok(DashboardView {
                id: row.get(0)?,
                title: row.get(1)?,
                sort_order: row.get(2)?,
                grid_density: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut inst_stmt = conn.prepare(
        "SELECT id, view_id, kind, source_id, preset, accent_name, icon_name, custom_title,
                glass, action_direction, grid_x, grid_y, grid_w, grid_h, sort_order
         FROM dashboard_widget_instances
         ORDER BY view_id, sort_order"
    )?;
    let instances = inst_stmt
        .query_map([], |row| {
            Ok(DashboardWidgetInstance {
                id: row.get(0)?,
                view_id: row.get(1)?,
                kind: row.get(2)?,
                source_id: row.get(3)?,
                preset: row.get(4)?,
                accent_name: row.get(5)?,
                icon_name: row.get(6)?,
                custom_title: row.get(7)?,
                glass: row.get::<_, i64>(8)? != 0,
                action_direction: row.get(9)?,
                grid_x: row.get(10)?,
                grid_y: row.get(11)?,
                grid_w: row.get(12)?,
                grid_h: row.get(13)?,
                sort_order: row.get(14)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut custom_stmt = conn.prepare(
        "SELECT id, kind, title, summary, category, body_json, created_by FROM dashboard_custom_widgets"
    )?;
    let custom_widgets = custom_stmt
        .query_map([], |row| {
            Ok(DashboardCustomWidget {
                id: row.get(0)?,
                kind: row.get(1)?,
                title: row.get(2)?,
                summary: row.get(3)?,
                category: row.get(4)?,
                body_json: row.get(5)?,
                created_by: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(DashboardLoadState { views, instances, custom_widgets })
}

pub fn create_view(
    conn: &SqliteConnection,
    id: &str,
    title: &str,
    grid_density: Option<&str>,
) -> Result<DashboardView, DashboardStorageError> {
    validate_title(title)?;
    let density = grid_density.unwrap_or("default");
    validate_grid_density(density)?;

    let next_sort: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM dashboard_views",
        [],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT INTO dashboard_views (id, title, sort_order, grid_density) VALUES (?, ?, ?, ?)",
        params![id, title, next_sort, density],
    )?;
    Ok(DashboardView {
        id: id.to_string(),
        title: title.to_string(),
        sort_order: next_sort,
        grid_density: density.to_string(),
    })
}

pub fn update_view(
    conn: &SqliteConnection,
    id: &str,
    patch: &ViewPatch,
) -> Result<DashboardView, DashboardStorageError> {
    if let Some(ref title) = patch.title { validate_title(title)?; }
    if let Some(ref d) = patch.grid_density { validate_grid_density(d)?; }

    let current: Option<DashboardView> = conn.query_row(
        "SELECT id, title, sort_order, grid_density FROM dashboard_views WHERE id = ?",
        params![id],
        |row| Ok(DashboardView {
            id: row.get(0)?,
            title: row.get(1)?,
            sort_order: row.get(2)?,
            grid_density: row.get(3)?,
        }),
    ).optional()?;
    let mut current = current.ok_or(DashboardStorageError::NotFound)?;

    if let Some(t) = patch.title.clone()        { current.title = t; }
    if let Some(d) = patch.grid_density.clone() { current.grid_density = d; }
    if let Some(s) = patch.sort_order           { current.sort_order = s; }

    conn.execute(
        "UPDATE dashboard_views SET title = ?, sort_order = ?, grid_density = ? WHERE id = ?",
        params![current.title, current.sort_order, current.grid_density, current.id],
    )?;
    Ok(current)
}

pub fn remove_view(conn: &SqliteConnection, id: &str) -> Result<(), DashboardStorageError> {
    let affected = conn.execute("DELETE FROM dashboard_views WHERE id = ?", params![id])?;
    if affected == 0 { return Err(DashboardStorageError::NotFound); }
    Ok(())
}

pub fn reorder_views(
    conn: &SqliteConnection,
    ordered_ids: &[String],
) -> Result<(), DashboardStorageError> {
    for (idx, id) in ordered_ids.iter().enumerate() {
        conn.execute(
            "UPDATE dashboard_views SET sort_order = ? WHERE id = ?",
            params![idx as i64, id],
        )?;
    }
    Ok(())
}

pub fn add_instance(
    conn: &SqliteConnection,
    id: &str,
    view_id: &str,
    kind: &str,
    source_id: &str,
    preset: &str,
    accent_name: &str,
    icon_name: &str,
    x: i64,
    y: i64,
    w: i64,
    h: i64,
) -> Result<DashboardWidgetInstance, DashboardStorageError> {
    validate_kind(kind)?;
    validate_preset(preset)?;
    validate_accent(accent_name)?;
    validate_icon(icon_name)?;
    validate_grid_bounds(x, y, w, h)?;

    let next_sort: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM dashboard_widget_instances WHERE view_id = ?",
        params![view_id],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT INTO dashboard_widget_instances
            (id, view_id, kind, source_id, preset, accent_name, icon_name, custom_title,
             glass, action_direction, grid_x, grid_y, grid_w, grid_h, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?, ?, ?, ?)",
        params![id, view_id, kind, source_id, preset, accent_name, icon_name, x, y, w, h, next_sort],
    )?;
    Ok(DashboardWidgetInstance {
        id: id.to_string(),
        view_id: view_id.to_string(),
        kind: kind.to_string(),
        source_id: source_id.to_string(),
        preset: preset.to_string(),
        accent_name: accent_name.to_string(),
        icon_name: icon_name.to_string(),
        custom_title: None,
        glass: false,
        action_direction: None,
        grid_x: x,
        grid_y: y,
        grid_w: w,
        grid_h: h,
        sort_order: next_sort,
    })
}

pub fn update_instance(
    conn: &SqliteConnection,
    id: &str,
    patch: &InstancePatch,
) -> Result<DashboardWidgetInstance, DashboardStorageError> {
    if let Some(ref p) = patch.preset      { validate_preset(p)?; }
    if let Some(ref a) = patch.accent_name { validate_accent(a)?; }
    if let Some(ref i) = patch.icon_name   { validate_icon(i)?; }

    let mut current: DashboardWidgetInstance = conn.query_row(
        "SELECT id, view_id, kind, source_id, preset, accent_name, icon_name, custom_title,
                glass, action_direction, grid_x, grid_y, grid_w, grid_h, sort_order
         FROM dashboard_widget_instances WHERE id = ?",
        params![id],
        |row| Ok(DashboardWidgetInstance {
            id: row.get(0)?,
            view_id: row.get(1)?,
            kind: row.get(2)?,
            source_id: row.get(3)?,
            preset: row.get(4)?,
            accent_name: row.get(5)?,
            icon_name: row.get(6)?,
            custom_title: row.get(7)?,
            glass: row.get::<_, i64>(8)? != 0,
            action_direction: row.get(9)?,
            grid_x: row.get(10)?,
            grid_y: row.get(11)?,
            grid_w: row.get(12)?,
            grid_h: row.get(13)?,
            sort_order: row.get(14)?,
        }),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => DashboardStorageError::NotFound,
        other => DashboardStorageError::Sqlite(other),
    })?;

    if let Some(p) = patch.preset.clone()         { current.preset = p; }
    if let Some(a) = patch.accent_name.clone()    { current.accent_name = a; }
    if let Some(i) = patch.icon_name.clone()      { current.icon_name = i; }
    if let Some(ct) = patch.custom_title.clone()  { current.custom_title = ct; }
    if let Some(g) = patch.glass                  { current.glass = g; }
    if let Some(ad) = patch.action_direction.clone() { current.action_direction = ad; }
    if let Some(x) = patch.grid_x                 { current.grid_x = x; }
    if let Some(y) = patch.grid_y                 { current.grid_y = y; }
    if let Some(w) = patch.grid_w                 { current.grid_w = w; }
    if let Some(h) = patch.grid_h                 { current.grid_h = h; }

    validate_grid_bounds(current.grid_x, current.grid_y, current.grid_w, current.grid_h)?;

    conn.execute(
        "UPDATE dashboard_widget_instances
            SET preset = ?, accent_name = ?, icon_name = ?, custom_title = ?,
                glass = ?, action_direction = ?,
                grid_x = ?, grid_y = ?, grid_w = ?, grid_h = ?
            WHERE id = ?",
        params![
            current.preset, current.accent_name, current.icon_name, current.custom_title,
            current.glass as i64, current.action_direction,
            current.grid_x, current.grid_y, current.grid_w, current.grid_h,
            current.id,
        ],
    )?;
    Ok(current)
}

pub fn remove_instance(conn: &SqliteConnection, id: &str) -> Result<(), DashboardStorageError> {
    let affected = conn.execute(
        "DELETE FROM dashboard_widget_instances WHERE id = ?", params![id]
    )?;
    if affected == 0 { return Err(DashboardStorageError::NotFound); }
    Ok(())
}

pub fn apply_layout(
    conn: &SqliteConnection,
    view_id: &str,
    layout: &[LayoutEntry],
) -> Result<(), DashboardStorageError> {
    for entry in layout {
        validate_grid_bounds(entry.grid_x, entry.grid_y, entry.grid_w, entry.grid_h)?;
    }
    let tx_savepoint = conn.unchecked_transaction()?;
    for (idx, entry) in layout.iter().enumerate() {
        tx_savepoint.execute(
            "UPDATE dashboard_widget_instances
                SET grid_x = ?, grid_y = ?, grid_w = ?, grid_h = ?, sort_order = ?
                WHERE id = ? AND view_id = ?",
            params![entry.grid_x, entry.grid_y, entry.grid_w, entry.grid_h, idx as i64, entry.id, view_id],
        )?;
    }
    tx_savepoint.commit()?;
    Ok(())
}

pub fn create_custom_widget(
    conn: &SqliteConnection,
    id: &str,
    kind: &str,
    title: &str,
    summary: &str,
    category: &str,
    body_json: &str,
    created_by: &str,
) -> Result<DashboardCustomWidget, DashboardStorageError> {
    validate_custom_widget_kind(kind)?;
    validate_title(title)?;
    validate_custom_body_for_kind(kind, body_json)?;
    if !matches!(created_by, "user" | "agent") {
        return Err(DashboardStorageError::Validation(ValidationError::InvalidContentData));
    }
    conn.execute(
        "INSERT INTO dashboard_custom_widgets
            (id, kind, title, summary, category, body_json, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![id, kind, title, summary, category, body_json, created_by],
    )?;
    Ok(DashboardCustomWidget {
        id: id.to_string(),
        kind: kind.to_string(),
        title: title.to_string(),
        summary: summary.to_string(),
        category: category.to_string(),
        body_json: body_json.to_string(),
        created_by: created_by.to_string(),
    })
}

pub fn update_custom_widget(
    conn: &SqliteConnection,
    id: &str,
    patch: &CustomWidgetPatch,
) -> Result<DashboardCustomWidget, DashboardStorageError> {
    let mut current: DashboardCustomWidget = conn.query_row(
        "SELECT id, kind, title, summary, category, body_json, created_by
         FROM dashboard_custom_widgets WHERE id = ?",
        params![id],
        |row| Ok(DashboardCustomWidget {
            id: row.get(0)?,
            kind: row.get(1)?,
            title: row.get(2)?,
            summary: row.get(3)?,
            category: row.get(4)?,
            body_json: row.get(5)?,
            created_by: row.get(6)?,
        }),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => DashboardStorageError::NotFound,
        other => DashboardStorageError::Sqlite(other),
    })?;

    if let Some(t) = patch.title.clone()    { validate_title(&t)?; current.title = t; }
    if let Some(s) = patch.summary.clone()  { current.summary = s; }
    if let Some(c) = patch.category.clone() { current.category = c; }
    if let Some(b) = patch.body_json.clone() {
        validate_custom_body_for_kind(&current.kind, &b)?;
        current.body_json = b;
    }

    conn.execute(
        "UPDATE dashboard_custom_widgets
            SET title = ?, summary = ?, category = ?, body_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?",
        params![current.title, current.summary, current.category, current.body_json, current.id],
    )?;
    Ok(current)
}

pub fn remove_custom_widget(
    conn: &SqliteConnection,
    id: &str,
    force_delete_instances: bool,
) -> Result<(), DashboardStorageError> {
    let mut stmt = conn.prepare(
        "SELECT id FROM dashboard_widget_instances WHERE source_id = ? AND kind IN ('content', 'script')"
    )?;
    let instance_ids: Vec<String> = stmt
        .query_map(params![id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    if !instance_ids.is_empty() && !force_delete_instances {
        return Err(DashboardStorageError::InstancesExist { instance_ids });
    }
    let tx = conn.unchecked_transaction()?;
    if !instance_ids.is_empty() {
        for inst_id in &instance_ids {
            tx.execute("DELETE FROM dashboard_widget_instances WHERE id = ?", params![inst_id])?;
        }
    }
    tx.execute("DELETE FROM dashboard_custom_widgets WHERE id = ?", params![id])?;
    tx.commit()?;
    Ok(())
}

pub fn reset_dashboard(conn: &SqliteConnection) -> Result<(), DashboardStorageError> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM dashboard_widget_instances", [])?;
    tx.execute("DELETE FROM dashboard_custom_widgets", [])?;
    tx.execute("DELETE FROM dashboard_views", [])?;
    tx.commit()?;
    seed_default(conn)?;
    Ok(())
}

pub fn seed_default(conn: &SqliteConnection) -> Result<(), DashboardStorageError> {
    let view_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM dashboard_views", [], |row| row.get(0)
    )?;
    if view_exists > 0 { return Ok(()); }
    create_view(conn, "default", "Default", Some("default"))?;
    add_instance(
        conn, "inst-app-launcher", "default",
        "builtIn", "appLauncher",
        "panel", "blue", "Wrench",
        0, 0, 4, 3,
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db() -> SqliteConnection {
        let conn = SqliteConnection::open_in_memory().unwrap();
        // Apply the relevant subset of CURRENT_SCHEMA needed for these tests.
        conn.execute_batch(r#"
            CREATE TABLE dashboard_views (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, sort_order INTEGER NOT NULL,
                grid_density TEXT NOT NULL DEFAULT 'default'
                    CHECK (grid_density IN ('compact', 'default', 'roomy'))
            );
            CREATE TABLE dashboard_custom_widgets (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK (kind IN ('content','script')),
                title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'custom',
                body_json TEXT NOT NULL,
                created_by TEXT NOT NULL CHECK (created_by IN ('user','agent')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE dashboard_widget_instances (
                id TEXT PRIMARY KEY,
                view_id TEXT NOT NULL REFERENCES dashboard_views(id) ON DELETE CASCADE,
                kind TEXT NOT NULL CHECK (kind IN ('builtIn','content','script')),
                source_id TEXT NOT NULL, preset TEXT NOT NULL, accent_name TEXT NOT NULL,
                icon_name TEXT NOT NULL, custom_title TEXT,
                glass INTEGER NOT NULL DEFAULT 0,
                action_direction TEXT,
                grid_x INTEGER NOT NULL, grid_y INTEGER NOT NULL,
                grid_w INTEGER NOT NULL, grid_h INTEGER NOT NULL,
                sort_order INTEGER NOT NULL
            );
        "#).unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();
        conn
    }

    #[test]
    fn seed_creates_default_view_and_app_launcher() {
        let conn = open_test_db();
        seed_default(&conn).unwrap();
        let state = load_state(&conn).unwrap();
        assert_eq!(state.views.len(), 1);
        assert_eq!(state.views[0].id, "default");
        assert_eq!(state.instances.len(), 1);
        assert_eq!(state.instances[0].source_id, "appLauncher");
    }

    #[test]
    fn seed_is_idempotent() {
        let conn = open_test_db();
        seed_default(&conn).unwrap();
        seed_default(&conn).unwrap();
        let state = load_state(&conn).unwrap();
        assert_eq!(state.views.len(), 1);
    }

    #[test]
    fn add_and_update_instance_round_trip() {
        let conn = open_test_db();
        create_view(&conn, "v1", "First", None).unwrap();
        let inst = add_instance(
            &conn, "i1", "v1", "builtIn", "hashCalculator",
            "panel", "indigo", "Hash", 0, 0, 3, 2
        ).unwrap();
        assert_eq!(inst.grid_w, 3);
        let updated = update_instance(&conn, "i1", &InstancePatch {
            preset: Some("ambient".into()),
            accent_name: None, icon_name: None, custom_title: None,
            glass: None, action_direction: None,
            grid_x: None, grid_y: None, grid_w: None, grid_h: None,
        }).unwrap();
        assert_eq!(updated.preset, "ambient");
    }

    #[test]
    fn invalid_grid_rejected() {
        let conn = open_test_db();
        create_view(&conn, "v1", "First", None).unwrap();
        let err = add_instance(
            &conn, "i-bad", "v1", "builtIn", "x",
            "panel", "blue", "Hash", 10, 0, 5, 1
        );
        assert!(matches!(err, Err(DashboardStorageError::Validation(
            ValidationError::InvalidGridBounds
        ))));
    }

    #[test]
    fn cascade_on_view_delete() {
        let conn = open_test_db();
        create_view(&conn, "v1", "First", None).unwrap();
        add_instance(
            &conn, "i1", "v1", "builtIn", "x",
            "panel", "blue", "Hash", 0, 0, 3, 2
        ).unwrap();
        remove_view(&conn, "v1").unwrap();
        let state = load_state(&conn).unwrap();
        assert_eq!(state.instances.len(), 0);
    }

    #[test]
    fn remove_custom_widget_blocks_when_referenced() {
        let conn = open_test_db();
        create_view(&conn, "v1", "First", None).unwrap();
        create_custom_widget(
            &conn, "cw1", "content", "My Markdown", "", "custom",
            r#"{"shape":"markdown","data":{"source":"hi"}}"#, "agent",
        ).unwrap();
        add_instance(
            &conn, "inst", "v1", "content", "cw1",
            "panel", "blue", "Hash", 0, 0, 3, 2
        ).unwrap();
        let err = remove_custom_widget(&conn, "cw1", false);
        assert!(matches!(err, Err(DashboardStorageError::InstancesExist { .. })));
        remove_custom_widget(&conn, "cw1", true).unwrap();
        let state = load_state(&conn).unwrap();
        assert_eq!(state.instances.len(), 0);
        assert_eq!(state.custom_widgets.len(), 0);
    }

    #[test]
    fn apply_layout_updates_in_one_pass() {
        let conn = open_test_db();
        create_view(&conn, "v1", "First", None).unwrap();
        add_instance(&conn, "i1", "v1", "builtIn", "x", "panel", "blue", "Hash", 0, 0, 3, 2).unwrap();
        add_instance(&conn, "i2", "v1", "builtIn", "x", "panel", "blue", "Hash", 3, 0, 3, 2).unwrap();
        apply_layout(&conn, "v1", &[
            LayoutEntry { id: "i1".into(), grid_x: 4, grid_y: 1, grid_w: 4, grid_h: 2 },
            LayoutEntry { id: "i2".into(), grid_x: 0, grid_y: 0, grid_w: 4, grid_h: 1 },
        ]).unwrap();
        let state = load_state(&conn).unwrap();
        let i1 = state.instances.iter().find(|i| i.id == "i1").unwrap();
        assert_eq!((i1.grid_x, i1.grid_y, i1.grid_w, i1.grid_h), (4, 1, 4, 2));
    }
}
