use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PRESETS: &[&str] = &[
    "panel", "ambient", "tile", "hero",
    "mono", "action",
];

pub const ACCENTS: &[&str] = &[
    "default", "blue", "indigo", "teal", "green", "amber",
    "red", "purple", "pink", "slate", "cyan",
    "orange", "rose", "emerald", "sky",
];

pub const ICONS: &[&str] = &[
    "Hash", "Network", "Terminal", "Server", "Cpu", "Activity", "Bolt", "Sun",
    "Bell", "Bot", "Wrench", "Folder", "Clock", "Doc", "Cloud", "Calendar",
    "Database", "Globe", "Lock", "Key", "Mail", "Mic", "Monitor", "Music",
    "Package", "Phone", "Pin", "Power", "Printer", "Radio", "Search",
    "Settings", "Shield", "ShoppingCart", "Star", "Tag", "Tool", "Trash",
    "Truck", "User", "Users", "Video", "Volume", "Watch", "Wifi", "Wind",
    "Zap", "Layers", "List", "Grid",
];

pub const BACKGROUND_PRESET_IDS: &[&str] = &[
    "mist", "sand", "sage", "sky", "blush", "lavender", "slate", "graphite",
    "g-dawn", "g-fog", "g-meadow", "g-dusk", "g-linen", "g-horizon", "g-petal", "g-twilight",
];

pub const BACKGROUND_FITS: &[&str] = &["fill", "fit", "stretch", "tile", "center"];

pub const GRID_COLUMNS: i64 = 12;
pub const MAX_SCRIPT_SOURCE_BYTES: usize = 64 * 1024;
pub const MAX_CONTENT_BODY_BYTES: usize = 32 * 1024;
pub const MAX_SETTINGS_SCHEMA_BYTES: usize = 16 * 1024;
pub const MAX_SETTINGS_VALUES_BYTES: usize = 32 * 1024;
pub const MAX_SETTINGS_FIELDS: usize = 20;
pub const MAX_SELECT_OPTIONS: usize = 40;
pub const MIN_POLL_SECONDS: u64 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ValidationError {
    InvalidPreset,
    InvalidAccent,
    InvalidIcon,
    InvalidGridBounds,
    InvalidKind,
    InvalidCustomWidgetKind,
    InvalidContentShape,
    InvalidContentData,
    ContentTooLarge,
    InvalidScriptBody,
    ScriptTooLarge,
    InvalidPermission,
    InvalidPollSeconds,
    InvalidTitle,
    InvalidGridDensity,
    InvalidSettingsSchema,
    InvalidSettingsValues,
    InvalidBackground,
}

pub fn validate_preset(value: &str) -> Result<(), ValidationError> {
    if PRESETS.contains(&value) { Ok(()) } else { Err(ValidationError::InvalidPreset) }
}

pub fn validate_accent(value: &str) -> Result<(), ValidationError> {
    if ACCENTS.contains(&value) { Ok(()) } else { Err(ValidationError::InvalidAccent) }
}

pub fn validate_icon(value: &str) -> Result<(), ValidationError> {
    if ICONS.contains(&value) { Ok(()) } else { Err(ValidationError::InvalidIcon) }
}

pub fn validate_grid_bounds(x: i64, y: i64, w: i64, h: i64) -> Result<(), ValidationError> {
    if w < 1 || h < 1 || x < 0 || y < 0 || x + w > GRID_COLUMNS {
        Err(ValidationError::InvalidGridBounds)
    } else {
        Ok(())
    }
}

pub fn validate_kind(kind: &str) -> Result<(), ValidationError> {
    if matches!(kind, "builtIn" | "content" | "script") {
        Ok(())
    } else {
        Err(ValidationError::InvalidKind)
    }
}

pub fn validate_custom_widget_kind(kind: &str) -> Result<(), ValidationError> {
    if matches!(kind, "content" | "script") {
        Ok(())
    } else {
        Err(ValidationError::InvalidCustomWidgetKind)
    }
}

pub fn validate_grid_density(value: &str) -> Result<(), ValidationError> {
    if matches!(value, "compact" | "default" | "roomy") {
        Ok(())
    } else {
        Err(ValidationError::InvalidGridDensity)
    }
}

pub fn validate_title(value: &str) -> Result<(), ValidationError> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 120 {
        Err(ValidationError::InvalidTitle)
    } else {
        Ok(())
    }
}

pub fn validate_background_preset(preset: &str) -> Result<(), ValidationError> {
    if BACKGROUND_PRESET_IDS.contains(&preset) {
        Ok(())
    } else {
        Err(ValidationError::InvalidBackground)
    }
}

pub fn validate_background_image(file: &str, fit: &str, dim: i64) -> Result<(), ValidationError> {
    validate_background_media(file, fit, dim, &["png", "jpg", "jpeg", "webp", "gif", "bmp"])
}

pub fn validate_background_video(file: &str, fit: &str, dim: i64) -> Result<(), ValidationError> {
    validate_background_media(file, fit, dim, &["mp4", "webm", "mov", "m4v", "ogv"])
}

fn validate_background_media(
    file: &str,
    fit: &str,
    dim: i64,
    extensions: &[&str],
) -> Result<(), ValidationError> {
    let file_ok = !file.is_empty()
        && !file.contains('/')
        && !file.contains('\\')
        && !file.contains("..");
    if !file_ok {
        return Err(ValidationError::InvalidBackground);
    }
    if !BACKGROUND_FITS.contains(&fit) {
        return Err(ValidationError::InvalidBackground);
    }
    if !(-100..=100).contains(&dim) {
        return Err(ValidationError::InvalidBackground);
    }
    let extension = file
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_lowercase())
        .ok_or(ValidationError::InvalidBackground)?;
    if !extensions.contains(&extension.as_str()) {
        return Err(ValidationError::InvalidBackground);
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "shape", rename_all = "camelCase")]
pub enum ContentBody {
    Markdown { data: ContentMarkdown },
    KvList { data: ContentKvList },
    Checklist { data: ContentChecklist },
    Stat { data: ContentStat },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentMarkdown {
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentKvList {
    pub rows: Vec<ContentKvRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentKvRow {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentChecklist {
    pub items: Vec<ContentChecklistItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentChecklistItem {
    pub label: String,
    #[serde(default)]
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentStat {
    pub value: String,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub delta: Option<String>,
    #[serde(default)]
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptBody {
    pub source: String,
    pub permissions: ScriptPermissions,
    #[serde(default)]
    pub html_shim: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptPermissions {
    #[serde(default)]
    pub network: bool,
    #[serde(default)]
    pub poll_seconds: Option<u64>,
}

pub fn validate_content_body_json(json: &str) -> Result<ContentBody, ValidationError> {
    if json.len() > MAX_CONTENT_BODY_BYTES {
        return Err(ValidationError::ContentTooLarge);
    }
    let parsed: ContentBody = serde_json::from_str(json)
        .map_err(|_| ValidationError::InvalidContentShape)?;
    match &parsed {
        ContentBody::Markdown { data } => {
            if data.source.trim().is_empty() {
                return Err(ValidationError::InvalidContentData);
            }
        }
        ContentBody::KvList { data } => {
            if data.rows.is_empty() || data.rows.iter().any(|row| row.label.trim().is_empty()) {
                return Err(ValidationError::InvalidContentData);
            }
        }
        ContentBody::Checklist { data } => {
            if data.items.is_empty() || data.items.iter().any(|item| item.label.trim().is_empty()) {
                return Err(ValidationError::InvalidContentData);
            }
        }
        ContentBody::Stat { data } => {
            if data.value.trim().is_empty() {
                return Err(ValidationError::InvalidContentData);
            }
        }
    }
    Ok(parsed)
}

pub fn validate_script_body_json(json: &str) -> Result<ScriptBody, ValidationError> {
    if json.len() > MAX_SCRIPT_SOURCE_BYTES + 4096 {
        return Err(ValidationError::ScriptTooLarge);
    }
    let parsed: ScriptBody = serde_json::from_str(json)
        .map_err(|_| ValidationError::InvalidScriptBody)?;
    if parsed.source.trim().is_empty() {
        return Err(ValidationError::InvalidScriptBody);
    }
    if parsed.source.len() > MAX_SCRIPT_SOURCE_BYTES {
        return Err(ValidationError::ScriptTooLarge);
    }
    if let Some(secs) = parsed.permissions.poll_seconds {
        if secs < MIN_POLL_SECONDS {
            return Err(ValidationError::InvalidPollSeconds);
        }
    }
    Ok(parsed)
}

pub fn validate_custom_body_for_kind(kind: &str, body_json: &str) -> Result<(), ValidationError> {
    match kind {
        "content" => { validate_content_body_json(body_json)?; Ok(()) }
        "script"  => { validate_script_body_json(body_json)?; Ok(()) }
        _ => Err(ValidationError::InvalidCustomWidgetKind),
    }
}

fn valid_settings_key(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() => {}
        _ => return false,
    }
    value.len() <= 64 && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

pub fn validate_settings_schema_json(json: &str) -> Result<(), ValidationError> {
    if json.len() > MAX_SETTINGS_SCHEMA_BYTES {
        return Err(ValidationError::InvalidSettingsSchema);
    }
    let parsed: Value = serde_json::from_str(json)
        .map_err(|_| ValidationError::InvalidSettingsSchema)?;
    let fields = parsed
        .get("fields")
        .and_then(Value::as_array)
        .ok_or(ValidationError::InvalidSettingsSchema)?;
    if fields.len() > MAX_SETTINGS_FIELDS {
        return Err(ValidationError::InvalidSettingsSchema);
    }
    let mut keys = std::collections::HashSet::new();
    for field in fields {
        let object = field.as_object().ok_or(ValidationError::InvalidSettingsSchema)?;
        let field_type = object
            .get("type")
            .and_then(Value::as_str)
            .ok_or(ValidationError::InvalidSettingsSchema)?;
        let key = object
            .get("key")
            .and_then(Value::as_str)
            .ok_or(ValidationError::InvalidSettingsSchema)?;
        let label = object
            .get("label")
            .and_then(Value::as_str)
            .ok_or(ValidationError::InvalidSettingsSchema)?;
        if !valid_settings_key(key) || label.trim().is_empty() || !keys.insert(key.to_string()) {
            return Err(ValidationError::InvalidSettingsSchema);
        }
        match field_type {
            "text" => {
                if object.get("placeholder").is_some_and(|value| !value.is_string() && !value.is_null()) {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
                if object.get("defaultValue").is_some_and(|value| !value.is_string() && !value.is_null()) {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
            }
            "number" => {
                for key in ["min", "max", "defaultValue"] {
                    if object.get(key).is_some_and(|value| !value.is_number() && !value.is_null()) {
                        return Err(ValidationError::InvalidSettingsSchema);
                    }
                }
                if object.get("step").is_some_and(|value| {
                    value.is_null() || value.as_f64().is_some_and(|number| number > 0.0)
                }) {
                    // Valid optional step.
                } else if object.contains_key("step") {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
            }
            "boolean" => {
                if object.get("defaultValue").is_some_and(|value| !value.is_boolean() && !value.is_null()) {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
            }
            "secret" => {
                if object.get("placeholder").is_some_and(|value| !value.is_string() && !value.is_null()) {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
                if object.contains_key("defaultValue") {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
            }
            "select" => {
                if object.get("defaultValue").is_some_and(|value| !value.is_string() && !value.is_null()) {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
                let options = object
                    .get("options")
                    .and_then(Value::as_array)
                    .ok_or(ValidationError::InvalidSettingsSchema)?;
                if options.is_empty() || options.len() > MAX_SELECT_OPTIONS {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
                for option in options {
                    let option = option.as_object().ok_or(ValidationError::InvalidSettingsSchema)?;
                    let label = option
                        .get("label")
                        .and_then(Value::as_str)
                        .ok_or(ValidationError::InvalidSettingsSchema)?;
                    if label.trim().is_empty() || !option.get("value").is_some_and(Value::is_string) {
                        return Err(ValidationError::InvalidSettingsSchema);
                    }
                }
            }
            _ => return Err(ValidationError::InvalidSettingsSchema),
        }
    }
    Ok(())
}

pub fn dashboard_widget_secret_owner_id(instance_id: &str, key: &str) -> String {
    format!("dashboard-widget-secret:{instance_id}:{key}")
}

pub fn validate_settings_values_for_schema_json(
    schema_json: &str,
    values_json: &str,
    instance_id: &str,
) -> Result<(), ValidationError> {
    validate_settings_schema_json(schema_json)?;
    validate_settings_values_json(values_json)?;

    let schema: Value = serde_json::from_str(schema_json)
        .map_err(|_| ValidationError::InvalidSettingsSchema)?;
    let values: Value = serde_json::from_str(values_json)
        .map_err(|_| ValidationError::InvalidSettingsValues)?;
    let Some(value_object) = values.as_object() else {
        return Err(ValidationError::InvalidSettingsValues);
    };

    let fields = schema
        .get("fields")
        .and_then(Value::as_array)
        .ok_or(ValidationError::InvalidSettingsSchema)?;
    for field in fields {
        let object = field.as_object().ok_or(ValidationError::InvalidSettingsSchema)?;
        if object.get("type").and_then(Value::as_str) != Some("secret") {
            continue;
        }
        let key = object
            .get("key")
            .and_then(Value::as_str)
            .ok_or(ValidationError::InvalidSettingsSchema)?;
        let Some(value) = value_object.get(key) else {
            continue;
        };
        if value.is_null() {
            continue;
        }
        let Some(secret_ref) = value.as_object() else {
            return Err(ValidationError::InvalidSettingsValues);
        };
        let expected_owner_id = dashboard_widget_secret_owner_id(instance_id, key);
        let valid_ref =
            secret_ref.get("type").and_then(Value::as_str) == Some("secretRef") &&
            secret_ref.get("ownerId").and_then(Value::as_str) == Some(expected_owner_id.as_str()) &&
            secret_ref.get("hasSecret").and_then(Value::as_bool) == Some(true) &&
            secret_ref.get("updatedAt").is_none_or(|value| value.is_string());
        if !valid_ref {
            return Err(ValidationError::InvalidSettingsValues);
        }
    }
    Ok(())
}

pub fn validate_settings_values_json(json: &str) -> Result<(), ValidationError> {
    if json.len() > MAX_SETTINGS_VALUES_BYTES {
        return Err(ValidationError::InvalidSettingsValues);
    }
    let parsed: Value = serde_json::from_str(json)
        .map_err(|_| ValidationError::InvalidSettingsValues)?;
    if parsed.is_object() {
        Ok(())
    } else {
        Err(ValidationError::InvalidSettingsValues)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_known() { assert!(validate_preset("panel").is_ok()); }

    #[test]
    fn preset_unknown() {
        assert_eq!(validate_preset("does-not-exist"), Err(ValidationError::InvalidPreset));
    }

    #[test]
    fn accent_unknown() {
        assert_eq!(validate_accent("neon"), Err(ValidationError::InvalidAccent));
    }

    #[test]
    fn accent_default_uses_theme_accent() {
        assert!(validate_accent("default").is_ok());
    }

    #[test]
    fn icon_unknown() {
        assert_eq!(validate_icon("NotAnIcon"), Err(ValidationError::InvalidIcon));
    }

    #[test]
    fn grid_bounds_in_range() { assert!(validate_grid_bounds(0, 0, 4, 3).is_ok()); }

    #[test]
    fn grid_bounds_overflow() {
        assert_eq!(
            validate_grid_bounds(10, 0, 4, 1),
            Err(ValidationError::InvalidGridBounds),
        );
    }

    #[test]
    fn grid_bounds_zero_size() {
        assert_eq!(
            validate_grid_bounds(0, 0, 0, 1),
            Err(ValidationError::InvalidGridBounds),
        );
    }

    #[test]
    fn grid_density_known() { assert!(validate_grid_density("compact").is_ok()); }

    #[test]
    fn grid_density_unknown() {
        assert_eq!(validate_grid_density("huge"), Err(ValidationError::InvalidGridDensity));
    }

    #[test]
    fn title_empty_rejected() {
        assert_eq!(validate_title("   "), Err(ValidationError::InvalidTitle));
    }

    #[test]
    fn content_markdown_ok() {
        let json = r##"{"shape":"markdown","data":{"source":"# Hello"}}"##;
        assert!(validate_content_body_json(json).is_ok());
    }

    #[test]
    fn content_markdown_empty_rejected() {
        let json = r##"{"shape":"markdown","data":{"source":"   "}}"##;
        assert_eq!(
            validate_content_body_json(json),
            Err(ValidationError::InvalidContentData),
        );
    }

    #[test]
    fn content_kv_ok() {
        let json = r#"{"shape":"kvList","data":{"rows":[{"label":"a","value":"b"}]}}"#;
        assert!(validate_content_body_json(json).is_ok());
    }

    #[test]
    fn content_unknown_shape_rejected() {
        let json = r#"{"shape":"chart","data":{}}"#;
        assert_eq!(
            validate_content_body_json(json),
            Err(ValidationError::InvalidContentShape),
        );
    }

    #[test]
    fn content_kv_empty_label_rejected() {
        let json = r#"{"shape":"kvList","data":{"rows":[{"label":"   ","value":"b"}]}}"#;
        assert_eq!(
            validate_content_body_json(json),
            Err(ValidationError::InvalidContentData),
        );
    }

    #[test]
    fn script_ok() {
        let json = r#"{"source":"console.log(1)","permissions":{"network":false}}"#;
        assert!(validate_script_body_json(json).is_ok());
    }

    #[test]
    fn script_poll_zero_rejected() {
        let json = r#"{"source":"x","permissions":{"network":false,"pollSeconds":0}}"#;
        assert_eq!(
            validate_script_body_json(&json),
            Err(ValidationError::InvalidPollSeconds),
        );
    }

    #[test]
    fn script_empty_source_rejected() {
        let json = r#"{"source":"   ","permissions":{"network":false}}"#;
        assert_eq!(
            validate_script_body_json(&json),
            Err(ValidationError::InvalidScriptBody),
        );
    }

    #[test]
    fn script_too_large_rejected() {
        let big = "x".repeat(MAX_SCRIPT_SOURCE_BYTES + 1);
        let json = format!(
            r#"{{"source":{:?},"permissions":{{"network":false}}}}"#,
            big
        );
        assert_eq!(
            validate_script_body_json(&json),
            Err(ValidationError::ScriptTooLarge),
        );
    }

    #[test]
    fn settings_schema_ok() {
        let json = r#"{"fields":[{"type":"text","key":"username","label":"Name"},{"type":"select","key":"mode","label":"Mode","options":[{"label":"A","value":"a"}]},{"type":"secret","key":"apiKey","label":"API key"}]}"#;
        assert!(validate_settings_schema_json(json).is_ok());
    }

    #[test]
    fn settings_schema_rejects_duplicate_keys() {
        let json = r#"{"fields":[{"type":"text","key":"name","label":"Name"},{"type":"boolean","key":"name","label":"Enabled"}]}"#;
        assert_eq!(
            validate_settings_schema_json(json),
            Err(ValidationError::InvalidSettingsSchema),
        );
    }

    #[test]
    fn settings_values_must_be_object() {
        assert_eq!(
            validate_settings_values_json("[]"),
            Err(ValidationError::InvalidSettingsValues),
        );
    }

    #[test]
    fn background_preset_known() {
        assert!(validate_background_preset("mist").is_ok());
        assert!(validate_background_preset("g-twilight").is_ok());
    }

    #[test]
    fn background_preset_unknown() {
        assert_eq!(
            validate_background_preset("neon-explosion"),
            Err(ValidationError::InvalidBackground),
        );
    }

    #[test]
    fn background_image_ok() {
        assert!(validate_background_image("bg-abc123.jpg", "fill", 0).is_ok());
        assert!(validate_background_image("bg-abc123.jpg", "center", -100).is_ok());
        assert!(validate_background_image("bg-abc123.jpg", "tile", 100).is_ok());
    }

    #[test]
    fn background_video_ok() {
        assert!(validate_background_video("bg-abc123.mp4", "fill", 0).is_ok());
        assert!(validate_background_video("bg-abc123.webm", "fit", -20).is_ok());
        assert!(validate_background_video("bg-abc123.mov", "stretch", 30).is_ok());
    }

    #[test]
    fn background_image_rejects_path_separators() {
        assert_eq!(
            validate_background_image("../secret.jpg", "fill", 0),
            Err(ValidationError::InvalidBackground),
        );
        assert_eq!(
            validate_background_image("sub/dir.jpg", "fill", 0),
            Err(ValidationError::InvalidBackground),
        );
        assert_eq!(
            validate_background_image("a\\b.jpg", "fill", 0),
            Err(ValidationError::InvalidBackground),
        );
        assert_eq!(
            validate_background_image("", "fill", 0),
            Err(ValidationError::InvalidBackground),
        );
    }

    #[test]
    fn background_image_rejects_bad_fit() {
        assert_eq!(
            validate_background_image("bg.jpg", "zoom", 0),
            Err(ValidationError::InvalidBackground),
        );
    }

    #[test]
    fn background_media_rejects_wrong_kind_extension() {
        assert_eq!(
            validate_background_image("bg.mp4", "fill", 0),
            Err(ValidationError::InvalidBackground),
        );
        assert_eq!(
            validate_background_video("bg.jpg", "fill", 0),
            Err(ValidationError::InvalidBackground),
        );
    }

    #[test]
    fn background_image_rejects_dim_out_of_range() {
        assert_eq!(
            validate_background_image("bg.jpg", "fill", 101),
            Err(ValidationError::InvalidBackground),
        );
        assert_eq!(
            validate_background_image("bg.jpg", "fill", -101),
            Err(ValidationError::InvalidBackground),
        );
    }

    #[test]
    fn secret_settings_values_must_be_references() {
        let schema = r#"{"fields":[{"type":"secret","key":"apiKey","label":"API key"}]}"#;
        assert_eq!(
            validate_settings_values_for_schema_json(schema, r#"{"apiKey":"plain-text"}"#, "inst-1"),
            Err(ValidationError::InvalidSettingsValues),
        );
        assert!(validate_settings_values_for_schema_json(
            schema,
            r#"{"apiKey":{"type":"secretRef","ownerId":"dashboard-widget-secret:inst-1:apiKey","hasSecret":true}}"#,
            "inst-1",
        ).is_ok());
    }
}
