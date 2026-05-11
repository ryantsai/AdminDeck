use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::dashboard_storage::{
    self as ds, CustomWidgetPatch, DashboardCustomWidget, DashboardLoadState, DashboardView,
    DashboardWidgetInstance, InstancePatch, LayoutEntry, ViewPatch,
};

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DashboardCommandError {
    Validation { reason: String },
    NotFound,
    InstancesExist { instance_ids: Vec<String> },
    Internal { message: String },
}

impl From<ds::DashboardStorageError> for DashboardCommandError {
    fn from(value: ds::DashboardStorageError) -> Self {
        match value {
            ds::DashboardStorageError::Validation(v) => {
                DashboardCommandError::Validation { reason: format!("{:?}", v) }
            }
            ds::DashboardStorageError::NotFound => DashboardCommandError::NotFound,
            ds::DashboardStorageError::InstancesExist { instance_ids } => {
                DashboardCommandError::InstancesExist { instance_ids }
            }
            ds::DashboardStorageError::Sqlite(e) => {
                DashboardCommandError::Internal { message: e.to_string() }
            }
        }
    }
}

fn storage(app: &AppHandle) -> State<'_, crate::storage::Storage> {
    app.state::<crate::storage::Storage>()
}

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    format!("{}-{}", prefix, ts)
}

#[tauri::command]
pub fn dashboard_load_state(app: AppHandle) -> Result<DashboardLoadState, DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| ds::load_state(conn).map_err(Into::into))
}

#[tauri::command]
pub fn dashboard_create_view(
    app: AppHandle,
    title: String,
    grid_density: Option<String>,
) -> Result<DashboardView, DashboardCommandError> {
    let id = new_id("view");
    storage(&app).with_connection_infallible(|conn| {
        ds::create_view(conn, &id, &title, grid_density.as_deref()).map_err(Into::into)
    })
}

#[tauri::command]
pub fn dashboard_update_view(
    app: AppHandle,
    id: String,
    patch: ViewPatch,
) -> Result<DashboardView, DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| ds::update_view(conn, &id, &patch).map_err(Into::into))
}

#[tauri::command]
pub fn dashboard_remove_view(
    app: AppHandle,
    id: String,
) -> Result<(), DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| ds::remove_view(conn, &id).map_err(Into::into))
}

#[tauri::command]
pub fn dashboard_reorder_views(
    app: AppHandle,
    ordered_ids: Vec<String>,
) -> Result<(), DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| ds::reorder_views(conn, &ordered_ids).map_err(Into::into))
}

#[tauri::command]
pub fn dashboard_add_instance(
    app: AppHandle,
    view_id: String,
    kind: String,
    source_id: String,
    preset: String,
    accent_name: String,
    icon_name: String,
    grid_x: i64,
    grid_y: i64,
    grid_w: i64,
    grid_h: i64,
) -> Result<DashboardWidgetInstance, DashboardCommandError> {
    let id = new_id("inst");
    storage(&app).with_connection_infallible(|conn| {
        ds::add_instance(
            conn, &id, &view_id, &kind, &source_id,
            &preset, &accent_name, &icon_name,
            grid_x, grid_y, grid_w, grid_h,
        ).map_err(Into::into)
    })
}

#[tauri::command]
pub fn dashboard_update_instance(
    app: AppHandle,
    id: String,
    patch: InstancePatch,
) -> Result<DashboardWidgetInstance, DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| ds::update_instance(conn, &id, &patch).map_err(Into::into))
}

#[tauri::command]
pub fn dashboard_remove_instance(
    app: AppHandle,
    id: String,
) -> Result<(), DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| ds::remove_instance(conn, &id).map_err(Into::into))
}

#[tauri::command]
pub fn dashboard_apply_layout(
    app: AppHandle,
    view_id: String,
    layout: Vec<LayoutEntry>,
) -> Result<(), DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| ds::apply_layout(conn, &view_id, &layout).map_err(Into::into))
}

#[tauri::command]
pub fn dashboard_create_custom_widget(
    app: AppHandle,
    kind: String,
    title: String,
    summary: String,
    category: String,
    body_json: String,
    created_by: String,
) -> Result<DashboardCustomWidget, DashboardCommandError> {
    let id = new_id("cw");
    storage(&app).with_connection_infallible(|conn| {
        ds::create_custom_widget(
            conn, &id, &kind, &title, &summary, &category, &body_json, &created_by,
        ).map_err(Into::into)
    })
}

#[tauri::command]
pub fn dashboard_update_custom_widget(
    app: AppHandle,
    id: String,
    patch: CustomWidgetPatch,
) -> Result<DashboardCustomWidget, DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| ds::update_custom_widget(conn, &id, &patch).map_err(Into::into))
}

#[tauri::command]
pub fn dashboard_remove_custom_widget(
    app: AppHandle,
    id: String,
    force_delete_instances: bool,
) -> Result<(), DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| {
        ds::remove_custom_widget(conn, &id, force_delete_instances).map_err(Into::into)
    })
}

#[tauri::command]
pub fn dashboard_reset(app: AppHandle) -> Result<(), DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| ds::reset_dashboard(conn).map_err(Into::into))
}
