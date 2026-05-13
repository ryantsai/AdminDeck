use serde::{Deserialize, Serialize};

pub const PRESETS: &[&str] = &[
    "panel", "ambient", "tile", "hero",
    "mono", "action",
];

pub const ACCENTS: &[&str] = &[
    "blue", "indigo", "teal", "green", "amber",
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

pub const GRID_COLUMNS: i64 = 12;
pub const MAX_SCRIPT_SOURCE_BYTES: usize = 64 * 1024;
pub const MAX_CONTENT_BODY_BYTES: usize = 32 * 1024;
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
}
