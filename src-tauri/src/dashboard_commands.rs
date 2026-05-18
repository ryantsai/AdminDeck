use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::dashboard_ids::new_dashboard_id;
use crate::dashboard_storage::{
    self as ds, CustomWidgetPatch, DashboardCustomWidget, DashboardLoadState, DashboardView,
    DashboardWidgetInstance, InstancePatch, LayoutEntry, ViewPatch,
};
use crate::secrets;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DashboardCommandError {
    Validation {
        reason: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
    },
    NotFound,
    InstancesExist {
        instance_ids: Vec<String>,
    },
    Internal {
        message: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardCreatedWidget {
    pub custom_widget: DashboardCustomWidget,
    pub instance: DashboardWidgetInstance,
}

impl From<ds::DashboardStorageError> for DashboardCommandError {
    fn from(value: ds::DashboardStorageError) -> Self {
        match value {
            ds::DashboardStorageError::Validation { kind, detail } => {
                DashboardCommandError::Validation {
                    reason: format!("{:?}", kind),
                    detail,
                }
            }
            ds::DashboardStorageError::NotFound => DashboardCommandError::NotFound,
            ds::DashboardStorageError::InstancesExist { instance_ids } => {
                DashboardCommandError::InstancesExist { instance_ids }
            }
            ds::DashboardStorageError::Sqlite(e) => DashboardCommandError::Internal {
                message: e.to_string(),
            },
        }
    }
}

fn storage(app: &AppHandle) -> State<'_, crate::storage::Storage> {
    app.state::<crate::storage::Storage>()
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
    let id = new_dashboard_id("view");
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
    let result = storage(&app).with_connection_infallible(
        |conn| -> Result<DashboardView, DashboardCommandError> {
            ds::update_view(conn, &id, &patch).map_err(Into::into)
        },
    )?;
    crate::prune_unreferenced_backgrounds(&app);
    Ok(result)
}

#[tauri::command]
pub fn dashboard_remove_view(app: AppHandle, id: String) -> Result<(), DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| -> Result<(), DashboardCommandError> {
        ds::remove_view(conn, &id).map_err(Into::into)
    })?;
    crate::prune_unreferenced_backgrounds(&app);
    Ok(())
}

#[tauri::command]
pub fn dashboard_reorder_views(
    app: AppHandle,
    ordered_ids: Vec<String>,
) -> Result<(), DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| {
        ds::reorder_views(conn, &ordered_ids).map_err(Into::into)
    })
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
    let id = new_dashboard_id("inst");
    storage(&app).with_connection_infallible(|conn| {
        ds::add_instance(
            conn,
            &id,
            &view_id,
            &kind,
            &source_id,
            &preset,
            &accent_name,
            &icon_name,
            grid_x,
            grid_y,
            grid_w,
            grid_h,
        )
        .map_err(Into::into)
    })
}

#[tauri::command]
pub fn dashboard_update_instance(
    app: AppHandle,
    id: String,
    patch: InstancePatch,
) -> Result<DashboardWidgetInstance, DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| {
        ds::update_instance(conn, &id, &patch).map_err(Into::into)
    })
}

#[tauri::command]
pub fn dashboard_read_widget_secret(
    app: AppHandle,
    secrets: State<'_, secrets::Secrets>,
    instance_id: String,
    key: String,
) -> Result<Option<String>, DashboardCommandError> {
    let owner_id = storage(&app).with_connection_infallible(|conn| {
        ds::widget_secret_owner_id_for_instance(conn, &instance_id, &key)
            .map_err(DashboardCommandError::from)
    })?;
    match owner_id {
        Some(owner_id) => secrets
            .read_widget_secret(owner_id)
            .map_err(|message| DashboardCommandError::Internal { message }),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn dashboard_remove_instance(app: AppHandle, id: String) -> Result<(), DashboardCommandError> {
    storage(&app)
        .with_connection_infallible(|conn| ds::remove_instance(conn, &id).map_err(Into::into))
}

#[tauri::command]
pub fn dashboard_apply_layout(
    app: AppHandle,
    view_id: String,
    layout: Vec<LayoutEntry>,
) -> Result<(), DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| {
        ds::apply_layout(conn, &view_id, &layout).map_err(Into::into)
    })
}

#[tauri::command]
pub fn dashboard_create_widget(
    app: AppHandle,
    view_id: String,
    kind: String,
    title: String,
    summary: String,
    category: String,
    body: Value,
    settings_schema: Option<Value>,
    preset: String,
    accent_name: String,
    icon_name: String,
    grid_x: i64,
    grid_y: i64,
    grid_w: i64,
    grid_h: i64,
) -> Result<DashboardCreatedWidget, DashboardCommandError> {
    let body_json =
        serde_json::to_string(&body).map_err(|error| DashboardCommandError::Internal {
            message: error.to_string(),
        })?;
    let settings_schema_json = settings_schema
        .map(|schema| {
            serde_json::to_string(&schema).map_err(|error| DashboardCommandError::Internal {
                message: error.to_string(),
            })
        })
        .transpose()?;
    let custom_widget_id = new_dashboard_id("cw");
    let instance_id = new_dashboard_id("inst");
    storage(&app).with_connection_infallible(|conn| {
        let custom_widget = ds::create_custom_widget(
            conn,
            &custom_widget_id,
            &kind,
            &title,
            &summary,
            &category,
            &body_json,
            settings_schema_json.as_deref(),
            "agent",
        )?;
        let instance = match ds::add_instance(
            conn,
            &instance_id,
            &view_id,
            &kind,
            &custom_widget_id,
            &preset,
            &accent_name,
            &icon_name,
            grid_x,
            grid_y,
            grid_w,
            grid_h,
        ) {
            Ok(instance) => instance,
            Err(error) => {
                let _ = ds::remove_custom_widget(conn, &custom_widget_id, true);
                return Err(error.into());
            }
        };
        Ok(DashboardCreatedWidget {
            custom_widget,
            instance,
        })
    })
}

#[tauri::command]
pub fn dashboard_create_custom_widget(
    app: AppHandle,
    kind: String,
    title: String,
    summary: String,
    category: String,
    body_json: String,
    settings_schema_json: Option<String>,
    created_by: String,
) -> Result<DashboardCustomWidget, DashboardCommandError> {
    let id = new_dashboard_id("cw");
    storage(&app).with_connection_infallible(|conn| {
        ds::create_custom_widget(
            conn,
            &id,
            &kind,
            &title,
            &summary,
            &category,
            &body_json,
            settings_schema_json.as_deref(),
            &created_by,
        )
        .map_err(Into::into)
    })
}

#[tauri::command]
pub fn dashboard_update_custom_widget(
    app: AppHandle,
    id: String,
    patch: CustomWidgetPatch,
) -> Result<DashboardCustomWidget, DashboardCommandError> {
    storage(&app).with_connection_infallible(|conn| {
        ds::update_custom_widget(conn, &id, &patch).map_err(Into::into)
    })
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
    storage(&app).with_connection_infallible(|conn| -> Result<(), DashboardCommandError> {
        ds::reset_dashboard(conn).map_err(Into::into)
    })?;
    crate::prune_unreferenced_backgrounds(&app);
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardWidgetFetchResult {
    /// HTTP status code from the upstream response.
    pub status: u16,
    /// Parsed JSON body. Always populated on success even when the upstream
    /// returns non-2xx — the renderer surfaces the status to the user.
    pub body: Value,
}

/// HTTP fetch for `live` content widgets. The renderer calls this once on
/// mount and again on each refresh interval; reqwest runs in the Rust main
/// process so app-level WebView2 cookies / credentials are never carried
/// into AI-authored URLs.
///
/// Security model:
///   * `instance_id` must resolve to a content widget whose stored body
///     declares `shape: "live"` and whose `fetch.url` exactly matches the
///     requested `url`. A renderer with a tampered URL cannot fetch
///     anything not authored into the persisted widget.
///   * `url` must start with `https://`. Plaintext `http://` is rejected
///     here AND at storage-validation time.
///   * 10-second wall clock cap.
///   * Response body capped at `MAX_LIVE_RESPONSE_BYTES`. Larger responses
///     return a structured `bodyTooLarge` validation error.
///   * Response must be parseable as JSON. Non-JSON responses return a
///     `notJson` validation error. v1 does not support text-mode bodies;
///     that's a future addition alongside `parse: "text" | "json"`.
#[tauri::command]
pub async fn dashboard_widget_fetch(
    app: AppHandle,
    instance_id: String,
    url: String,
) -> Result<DashboardWidgetFetchResult, DashboardCommandError> {
    use crate::dashboard_validation::MAX_LIVE_RESPONSE_BYTES;

    // Look up the stored widget body so we can verify the requested URL
    // matches what was authored. Done synchronously off the async runtime.
    let body_json = {
        let app = app.clone();
        let instance_id = instance_id.clone();
        tauri::async_runtime::spawn_blocking(move || {
            storage(&app).with_connection_infallible(
                |conn| -> Result<String, DashboardCommandError> {
                    ds::content_widget_body_json_for_instance(conn, &instance_id)
                        .map_err(Into::into)
                },
            )
        })
        .await
        .map_err(|error| DashboardCommandError::Internal {
            message: format!("widget body lookup join failed: {error}"),
        })??
    };

    let parsed_body: Value =
        serde_json::from_str(&body_json).map_err(|error| DashboardCommandError::Internal {
            message: format!("stored widget body did not parse as JSON: {error}"),
        })?;
    let stored_url = parsed_body
        .get("data")
        .and_then(|d| d.get("fetch"))
        .and_then(|f| f.get("url"))
        .and_then(Value::as_str);
    if parsed_body.get("shape").and_then(Value::as_str) != Some("live") {
        return Err(DashboardCommandError::Validation {
            reason: "notLiveWidget".to_string(),
            detail: Some("widget instance does not declare shape: live".to_string()),
        });
    }
    if stored_url != Some(url.as_str()) {
        return Err(DashboardCommandError::Validation {
            reason: "urlMismatch".to_string(),
            detail: Some(
                "requested url does not match the widget's stored fetch.url".to_string(),
            ),
        });
    }
    if !url.starts_with("https://") {
        return Err(DashboardCommandError::Validation {
            reason: "insecureScheme".to_string(),
            detail: Some("only https:// is allowed".to_string()),
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| DashboardCommandError::Internal {
            message: format!("failed to build HTTP client: {error}"),
        })?;
    let response = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| DashboardCommandError::Validation {
            reason: "networkError".to_string(),
            detail: Some(error.to_string()),
        })?;
    let status = response.status().as_u16();
    // Stream the body with a hard cap so a multi-GB response cannot exhaust
    // memory. `bytes()` would buffer the entire body; we instead iterate.
    let bytes = {
        use futures::StreamExt;
        let mut acc: Vec<u8> = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| DashboardCommandError::Validation {
                reason: "networkError".to_string(),
                detail: Some(error.to_string()),
            })?;
            if acc.len() + chunk.len() > MAX_LIVE_RESPONSE_BYTES {
                return Err(DashboardCommandError::Validation {
                    reason: "bodyTooLarge".to_string(),
                    detail: Some(format!(
                        "response exceeded {MAX_LIVE_RESPONSE_BYTES} bytes"
                    )),
                });
            }
            acc.extend_from_slice(&chunk);
        }
        acc
    };
    let body: Value = serde_json::from_slice(&bytes).map_err(|error| {
        DashboardCommandError::Validation {
            reason: "notJson".to_string(),
            detail: Some(format!(
                "response did not parse as JSON: {error}; v1 supports JSON only"
            )),
        }
    })?;
    Ok(DashboardWidgetFetchResult { status, body })
}
