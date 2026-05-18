use std::collections::HashSet;

use oxc_allocator::Allocator;
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PRESETS: &[&str] = &["panel", "ambient", "hero"];

pub const ACCENTS: &[&str] = &[
    "default", "blue", "indigo", "teal", "green", "amber", "red", "purple", "pink", "slate",
    "cyan", "orange", "rose", "emerald", "sky",
];

pub const ICONS: &[&str] = &[
    "Hash",
    "Network",
    "Terminal",
    "Server",
    "Cpu",
    "Activity",
    "Bolt",
    "Sun",
    "Bell",
    "Bot",
    "Wrench",
    "Folder",
    "Clock",
    "Doc",
    "Cloud",
    "Calendar",
    "Database",
    "Globe",
    "Lock",
    "Key",
    "Mail",
    "Mic",
    "Monitor",
    "Music",
    "Package",
    "Phone",
    "Pin",
    "Power",
    "Printer",
    "Radio",
    "Search",
    "Settings",
    "Shield",
    "ShoppingCart",
    "Star",
    "Tag",
    "Tool",
    "Trash",
    "Truck",
    "User",
    "Users",
    "Video",
    "Volume",
    "Watch",
    "Wifi",
    "Wind",
    "Zap",
    "Layers",
    "List",
    "Grid",
];

pub const BACKGROUND_PRESET_IDS: &[&str] = &[
    "mist",
    "sand",
    "sage",
    "sky",
    "blush",
    "lavender",
    "slate",
    "graphite",
    "g-dawn",
    "g-fog",
    "g-meadow",
    "g-dusk",
    "g-linen",
    "g-horizon",
    "g-petal",
    "g-twilight",
];

pub const DASHBOARD_TAB_GRADIENT_IDS: &[&str] = &[
    "g-dawn",
    "g-fog",
    "g-meadow",
    "g-dusk",
    "g-linen",
    "g-horizon",
    "g-petal",
    "g-twilight",
];

pub const DYNAMIC_BACKGROUND_IDS: &[&str] = &[
    "aurora",
    "raindrops",
    "starfield",
    "nebula",
    "embers",
    "lava",
    "matrix",
    "synthwave",
    "confetti",
];

pub const BACKGROUND_FITS: &[&str] = &["fill", "fit", "stretch", "tile", "center"];

pub const GRID_COLUMNS: i64 = 12;
pub const GRID_MAX_ROWS: i64 = 1000;
pub const MAX_SCRIPT_SOURCE_BYTES: usize = 64 * 1024;
pub const MAX_CONTENT_BODY_BYTES: usize = 32 * 1024;
pub const MAX_SETTINGS_SCHEMA_BYTES: usize = 16 * 1024;
pub const MAX_SETTINGS_VALUES_BYTES: usize = 32 * 1024;
pub const MAX_SETTINGS_FIELDS: usize = 20;
pub const MAX_SELECT_OPTIONS: usize = 40;
pub const MIN_POLL_SECONDS: u64 = 1;
pub const MAX_WIDGET_LIBRARIES: usize = 8;
/// htmlShim is a mount-point fragment (`<div id='root'></div>`, layout
/// scaffolding, fixed canvas elements, occasional inline SVG icon paths or
/// templated rows for table-style widgets). 128 KB is a generous ceiling
/// that allows realistic prebuilt scaffolds without enabling a multi-MB
/// document dump.
pub const MAX_HTML_SHIM_BYTES: usize = 128 * 1024;

pub const KNOWN_LIBRARY_GLOBALS: &[(&str, &str)] = &[
    ("mermaid", "mermaid"),
    ("echarts", "echarts"),
    ("chartjs", "Chart"),
    ("qrcode", "QRCode"),
    ("jsbarcode", "JsBarcode"),
    ("jspdf", "jspdf"),
    ("mathjs", "math"),
    ("papaparse", "Papa"),
    ("pica", "pica"),
    ("dayjs", "dayjs"),
    ("konva", "Konva"),
    ("roughjs", "rough"),
    ("alasql", "alasql"),
    ("three", "THREE"),
    ("pixijs", "PIXI"),
    ("matter", "Matter"),
    ("prism", "Prism"),
    ("jsyaml", "jsyaml"),
    ("gridjs", "gridjs"),
    ("ansitohtml", "AnsiToHtml"),
    ("cronstrue", "cronstrue"),
    ("cronparser", "cronParser"),
    ("jwtdecode", "jwt_decode"),
    ("diffmatchpatch", "diff_match_patch"),
    ("chroma", "chroma"),
    ("leaflet", "L"),
    ("fflate", "fflate"),
    ("marked", "marked"),
    ("animejs", "anime"),
];

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
    InvalidLibraries,
    InvalidTitle,
    InvalidGridDensity,
    InvalidSettingsSchema,
    InvalidSettingsValues,
    InvalidBackground,
    InvalidScriptSource,
    UnusedLibrary,
    InvalidBodyOpacity,
}

pub fn validate_preset(value: &str) -> Result<(), ValidationError> {
    if PRESETS.contains(&value) {
        Ok(())
    } else {
        Err(ValidationError::InvalidPreset)
    }
}

pub fn validate_accent(value: &str) -> Result<(), ValidationError> {
    if ACCENTS.contains(&value) {
        Ok(())
    } else {
        Err(ValidationError::InvalidAccent)
    }
}

pub fn validate_icon(value: &str) -> Result<(), ValidationError> {
    if ICONS.contains(&value) {
        Ok(())
    } else {
        Err(ValidationError::InvalidIcon)
    }
}

pub fn validate_grid_bounds(x: i64, y: i64, w: i64, h: i64) -> Result<(), ValidationError> {
    let Some(right) = x.checked_add(w) else {
        return Err(ValidationError::InvalidGridBounds);
    };
    let Some(bottom) = y.checked_add(h) else {
        return Err(ValidationError::InvalidGridBounds);
    };
    if w < 1 || h < 1 || x < 0 || y < 0 || right > GRID_COLUMNS || bottom > GRID_MAX_ROWS {
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

pub fn validate_dynamic_background(dynamic: &str) -> Result<(), ValidationError> {
    if DYNAMIC_BACKGROUND_IDS.contains(&dynamic) {
        Ok(())
    } else {
        Err(ValidationError::InvalidBackground)
    }
}

pub fn validate_dashboard_tab_color(color: &str) -> Result<(), ValidationError> {
    if DASHBOARD_TAB_GRADIENT_IDS.contains(&color) {
        Ok(())
    } else {
        Err(ValidationError::InvalidBackground)
    }
}

pub fn validate_background_image(file: &str, fit: &str, dim: i64) -> Result<(), ValidationError> {
    validate_background_media(
        file,
        fit,
        dim,
        &["png", "jpg", "jpeg", "webp", "gif", "bmp"],
    )
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
    let file_ok =
        !file.is_empty() && !file.contains('/') && !file.contains('\\') && !file.contains("..");
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
    Table { data: ContentTable },
    Chart { data: ContentChart },
    /// Layout composes other (leaf) shapes into a row/column/grid. Nested
    /// layouts are intentionally NOT supported in v1 — children are
    /// `ContentLeafBody`, not `ContentBody`. This keeps the schema flat,
    /// avoids unbounded recursion at validation, and is enough to compose
    /// the typical "stat + sparkline + small table" tile without an AI
    /// generating a script widget. Nested layout support would need a
    /// recursive JSON Schema via `$ref` and a depth cap.
    Layout { data: ContentLayout },
    /// A widget whose render body is filled at runtime from a fetched HTTP
    /// response. See [`ContentLive`]. Not a layout child (live wraps a
    /// leaf, not the other way around).
    Live { data: ContentLive },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentMarkdown {
    pub source: String,
    #[serde(default)]
    pub mode: ContentMarkdownMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ContentMarkdownMode {
    Markdown,
    Html,
}

impl Default for ContentMarkdownMode {
    fn default() -> Self {
        Self::Markdown
    }
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

/// A declarative table. Columns are explicit (label + key + optional align);
/// each row is an object keyed by column key. Caps below stop the AI from
/// shipping a 10 000-row data dump as a content widget.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentTable {
    pub columns: Vec<ContentTableColumn>,
    pub rows: Vec<std::collections::BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentTableColumn {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub align: Option<ContentTableAlign>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ContentTableAlign {
    Start,
    Center,
    End,
}

/// A declarative chart. Three kinds in v1:
///   * sparkline — single series of plain numbers
///   * bar — horizontal bars of `{ label, value }`
///   * donut — slices of `{ label, value }`
/// Charts are rendered with KKTerm-owned SVG primitives in the parent React
/// layer. The shape is intentionally narrow: a future fetch+compute pipeline
/// (deferred from this PR) will fill these slots with computed values.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ContentChart {
    Sparkline {
        points: Vec<f64>,
        #[serde(default)]
        caption: Option<String>,
    },
    Bar {
        series: Vec<ContentChartLabeledValue>,
        #[serde(default)]
        caption: Option<String>,
    },
    Donut {
        series: Vec<ContentChartLabeledValue>,
        #[serde(default)]
        caption: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentChartLabeledValue {
    pub label: String,
    pub value: f64,
}

/// A layout container: row, column, or 12-column grid. Children are leaf
/// shapes only (see `ContentBody::Layout` doc).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentLayout {
    pub direction: ContentLayoutDirection,
    pub children: Vec<ContentLeafBody>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ContentLayoutDirection {
    Row,
    Col,
    Grid,
}

/// Layout child = any content shape except `Layout` itself. Deliberately a
/// separate enum so the Rust type system rejects nested layouts at the
/// deserialization boundary, not just at validation time.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "shape", rename_all = "camelCase")]
pub enum ContentLeafBody {
    Markdown { data: ContentMarkdown },
    KvList { data: ContentKvList },
    Checklist { data: ContentChecklist },
    Stat { data: ContentStat },
    Table { data: ContentTable },
    Chart { data: ContentChart },
}

pub const MAX_TABLE_COLUMNS: usize = 12;
pub const MAX_TABLE_ROWS: usize = 200;
pub const MAX_CHART_POINTS: usize = 200;
pub const MAX_LAYOUT_CHILDREN: usize = 12;
/// Smallest refresh permitted for `live` content widgets. 5 s avoids the
/// AI accidentally generating a 1Hz polling widget against an external API.
pub const MIN_LIVE_REFRESH_SEC: u32 = 5;
/// Largest refresh permitted. 24 h covers daily summary widgets without
/// allowing absurd ranges that would silently never refresh.
pub const MAX_LIVE_REFRESH_SEC: u32 = 60 * 60 * 24;
/// Maximum byte count we accept for a fetched response body. Caps memory
/// growth and stops a widget from holding the entire web in state.
pub const MAX_LIVE_RESPONSE_BYTES: usize = 1 * 1024 * 1024;
/// Maximum length of any binding path expression. Path expressions are
/// short by design (`quotes[*].close`), so 256 chars is generous.
pub const MAX_LIVE_PATH_EXPRESSION_LEN: usize = 256;

/// A live-data widget: declarative HTTP fetch + bindable render body.
///
/// One fetch, one render. After the fetch resolves, each `bindings` entry
/// replaces the targeted field in the render body's `data` with the value
/// resolved from the fetched JSON via a JSON-path subset. The fetch
/// happens in the Rust main process (`dashboard_widget_fetch` command),
/// not the renderer, so app-level cookies / credentials are never carried
/// into AI-authored URLs.
///
/// Storage validation is intentionally permissive on the render body: the
/// AI may submit a render with empty `points: []` (or omit `points`
/// entirely as `serde_json::Value`) when a binding will fill it at
/// runtime. The renderer handles loading/error/empty states; literal
/// fields that DO appear are still validated by the inner leaf check.
///
/// Multi-source composition (one fetch feeding multiple charts in a
/// layout) is deliberately deferred — v1 is one fetch wrapping one leaf.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContentLive {
    pub fetch: ContentLiveFetch,
    /// Render body as raw JSON. We do not deserialize into ContentLeafBody
    /// because bindings may legally leave required fields absent.
    /// The renderer applies bindings then runs the TS-side leaf validator.
    /// We still validate the `shape` discriminator and a few invariants
    /// here so the AI cannot submit nonsense.
    pub render: Value,
    #[serde(default)]
    pub bindings: Vec<ContentLiveBinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContentLiveFetch {
    pub url: String,
    /// Optional refresh interval in whole seconds. Absent = fetch once on
    /// mount and never again.
    #[serde(default)]
    pub refresh_sec: Option<u32>,
}

/// A single binding maps a render-body field path to a JSON-path
/// expression resolved against the fetched response.
///
/// `target` is dotted into `render.data`. For example, `points` binds to
/// `render.data.points`. Sub-fields like `series` for bar charts are also
/// supported (single segment in v1; nested targets deferred).
///
/// `source` is the JSON-path subset:
///   * `key`, `key.subkey` — object navigation
///   * `key[N]` — array index
///   * `key[*]` — array fan-out (maps each element through the rest of the path)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentLiveBinding {
    pub target: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptBody {
    pub source: String,
    pub permissions: ScriptPermissions,
    #[serde(default)]
    pub html_shim: Option<String>,
    #[serde(default)]
    pub libraries: Option<Vec<String>>,
    /// Optional declared runtime lifecycle. When provided, the host enforces
    /// invariants the static prose contract used to merely request:
    ///   * `animation` widgets stall-watchdog: if the iframe stops emitting
    ///     `kk.motionTick` for >8 s while visible, the widget is marked
    ///     `stalled` in health state and surfaces in the AI context payload.
    ///   * `realtime` and `periodic` are reserved for future invariants
    ///     (data-freshness, frame-of-life heartbeats).
    ///   * `static` widgets opt out of any liveness check.
    /// Absent / null = `static`.
    #[serde(default)]
    pub lifecycle: Option<ScriptLifecycle>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptLifecycle {
    pub kind: ScriptLifecycleKind,
    /// For `animation` and `periodic` — minimum expected interval between
    /// frame ticks / data updates. Informational; the host clamps animation
    /// rAF callbacks to 33 ms regardless. Range: 16..=60_000.
    #[serde(default)]
    pub min_tick_ms: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ScriptLifecycleKind {
    Static,
    Periodic,
    Animation,
    Realtime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptPermissions {
    #[serde(default)]
    pub network: bool,
    #[serde(default)]
    pub poll_seconds: Option<u64>,
}

#[allow(dead_code)]
pub fn validate_content_body_json(json: &str) -> Result<ContentBody, ValidationError> {
    validate_content_body_json_detailed(json).map_err(|(kind, _)| kind)
}

pub fn validate_content_body_json_detailed(
    json: &str,
) -> Result<ContentBody, (ValidationError, Option<String>)> {
    if json.len() > MAX_CONTENT_BODY_BYTES {
        return Err((
            ValidationError::ContentTooLarge,
            Some(format!(
                "content bodyJson is {} bytes; max is {}",
                json.len(),
                MAX_CONTENT_BODY_BYTES
            )),
        ));
    }
    let parsed: ContentBody = serde_json::from_str(json).map_err(|error| {
        (
            ValidationError::InvalidContentShape,
            Some(format!("content bodyJson did not parse: {error}")),
        )
    })?;
    match &parsed {
        ContentBody::Markdown { data } => {
            if data.source.trim().is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("markdown content 'source' is empty".to_string()),
                ));
            }
        }
        ContentBody::KvList { data } => {
            if data.rows.is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("kvList content has no rows".to_string()),
                ));
            }
            if data.rows.iter().any(|row| row.label.trim().is_empty()) {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("kvList row has empty label".to_string()),
                ));
            }
        }
        ContentBody::Checklist { data } => {
            if data.items.is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("checklist has no items".to_string()),
                ));
            }
            if data.items.iter().any(|item| item.label.trim().is_empty()) {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("checklist item has empty label".to_string()),
                ));
            }
        }
        ContentBody::Stat { data } => {
            if data.value.trim().is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("stat 'value' is empty".to_string()),
                ));
            }
        }
        ContentBody::Table { data } => validate_content_table(data)?,
        ContentBody::Chart { data } => validate_content_chart(data)?,
        ContentBody::Live { data } => validate_content_live(data)?,
        ContentBody::Layout { data } => {
            if data.children.is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("layout has no children".to_string()),
                ));
            }
            if data.children.len() > MAX_LAYOUT_CHILDREN {
                return Err((
                    ValidationError::InvalidContentData,
                    Some(format!(
                        "layout has {} children; max is {}",
                        data.children.len(),
                        MAX_LAYOUT_CHILDREN
                    )),
                ));
            }
            // Recurse into each leaf child. Nested layouts are not allowed at
            // the type level (ContentLeafBody excludes Layout), so this only
            // re-runs the per-shape data checks.
            for (i, child) in data.children.iter().enumerate() {
                validate_content_leaf(child).map_err(|(kind, detail)| {
                    (
                        kind,
                        Some(format!(
                            "layout child[{i}]: {}",
                            detail.unwrap_or_else(|| "invalid".to_string())
                        )),
                    )
                })?;
            }
        }
    }
    Ok(parsed)
}

fn validate_content_table(
    data: &ContentTable,
) -> Result<(), (ValidationError, Option<String>)> {
    if data.columns.is_empty() {
        return Err((
            ValidationError::InvalidContentData,
            Some("table has no columns".to_string()),
        ));
    }
    if data.columns.len() > MAX_TABLE_COLUMNS {
        return Err((
            ValidationError::InvalidContentData,
            Some(format!(
                "table has {} columns; max is {}",
                data.columns.len(),
                MAX_TABLE_COLUMNS
            )),
        ));
    }
    if data.rows.len() > MAX_TABLE_ROWS {
        return Err((
            ValidationError::InvalidContentData,
            Some(format!(
                "table has {} rows; max is {}",
                data.rows.len(),
                MAX_TABLE_ROWS
            )),
        ));
    }
    let mut seen_keys = std::collections::HashSet::new();
    for column in &data.columns {
        if column.key.trim().is_empty() {
            return Err((
                ValidationError::InvalidContentData,
                Some("table column key is empty".to_string()),
            ));
        }
        if column.label.trim().is_empty() {
            return Err((
                ValidationError::InvalidContentData,
                Some(format!("table column {:?} has empty label", column.key)),
            ));
        }
        if !seen_keys.insert(column.key.as_str()) {
            return Err((
                ValidationError::InvalidContentData,
                Some(format!("table has duplicate column key {:?}", column.key)),
            ));
        }
    }
    Ok(())
}

fn validate_content_chart(
    data: &ContentChart,
) -> Result<(), (ValidationError, Option<String>)> {
    match data {
        ContentChart::Sparkline { points, .. } => {
            if points.is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("sparkline has no points".to_string()),
                ));
            }
            if points.len() > MAX_CHART_POINTS {
                return Err((
                    ValidationError::InvalidContentData,
                    Some(format!(
                        "sparkline has {} points; max is {}",
                        points.len(),
                        MAX_CHART_POINTS
                    )),
                ));
            }
            if points.iter().any(|p| !p.is_finite()) {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("sparkline contains non-finite values".to_string()),
                ));
            }
        }
        ContentChart::Bar { series, .. } | ContentChart::Donut { series, .. } => {
            if series.is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("chart series is empty".to_string()),
                ));
            }
            if series.len() > MAX_CHART_POINTS {
                return Err((
                    ValidationError::InvalidContentData,
                    Some(format!(
                        "chart series has {} entries; max is {}",
                        series.len(),
                        MAX_CHART_POINTS
                    )),
                ));
            }
            for (i, entry) in series.iter().enumerate() {
                if entry.label.trim().is_empty() {
                    return Err((
                        ValidationError::InvalidContentData,
                        Some(format!("chart series[{i}] has empty label")),
                    ));
                }
                if !entry.value.is_finite() {
                    return Err((
                        ValidationError::InvalidContentData,
                        Some(format!("chart series[{i}] value is not finite")),
                    ));
                }
                if matches!(data, ContentChart::Donut { .. }) && entry.value < 0.0 {
                    return Err((
                        ValidationError::InvalidContentData,
                        Some(format!(
                            "donut series[{i}] value is negative; donut slices must be non-negative"
                        )),
                    ));
                }
            }
        }
    }
    Ok(())
}

fn validate_content_live(
    data: &ContentLive,
) -> Result<(), (ValidationError, Option<String>)> {
    // Fetch URL: https only. Tauri makes the HTTP call from reqwest in the
    // main process; allowing http:// would expose plaintext credentials in
    // headers in transit. AI-authored widgets should always use https.
    let url = data.fetch.url.trim();
    if !url.starts_with("https://") {
        return Err((
            ValidationError::InvalidContentData,
            Some(format!(
                "live fetch url must start with https://; got {url:?}"
            )),
        ));
    }
    // Reject control characters and obviously bogus characters in URLs.
    if url.bytes().any(|b| b < 0x20 || b == 0x7f) {
        return Err((
            ValidationError::InvalidContentData,
            Some("live fetch url contains control characters".to_string()),
        ));
    }
    if let Some(refresh) = data.fetch.refresh_sec {
        if !(MIN_LIVE_REFRESH_SEC..=MAX_LIVE_REFRESH_SEC).contains(&refresh) {
            return Err((
                ValidationError::InvalidContentData,
                Some(format!(
                    "live fetch refreshSec is {refresh}; must be in {MIN_LIVE_REFRESH_SEC}..={MAX_LIVE_REFRESH_SEC}"
                )),
            ));
        }
    }
    // Validate render shape discriminator. Layout-as-render is rejected
    // (live wraps a leaf, not the other way around).
    let render_shape = data
        .render
        .get("shape")
        .and_then(Value::as_str)
        .ok_or((
            ValidationError::InvalidContentData,
            Some("live render is missing 'shape' field".to_string()),
        ))?;
    if !matches!(
        render_shape,
        "markdown" | "kvList" | "checklist" | "stat" | "table" | "chart"
    ) {
        return Err((
            ValidationError::InvalidContentData,
            Some(format!("live render shape {render_shape:?} is not bindable; use markdown, kvList, checklist, stat, table, or chart"))
        ));
    }
    if !data.render.get("data").map_or(false, Value::is_object) {
        return Err((
            ValidationError::InvalidContentData,
            Some("live render is missing 'data' object".to_string()),
        ));
    }
    // Validate each binding. v1 only supports single-segment targets
    // ("points", "rows", "value", ...) — nested targets like
    // "data.points.0" are deliberately rejected because the renderer
    // only does shallow field substitution.
    for (i, binding) in data.bindings.iter().enumerate() {
        if binding.target.trim().is_empty() {
            return Err((
                ValidationError::InvalidContentData,
                Some(format!("live bindings[{i}] target is empty")),
            ));
        }
        if !is_valid_binding_target(&binding.target) {
            return Err((
                ValidationError::InvalidContentData,
                Some(format!(
                    "live bindings[{i}] target {:?} is not a single identifier; v1 supports shallow targets only",
                    binding.target
                )),
            ));
        }
        if binding.source.is_empty() {
            return Err((
                ValidationError::InvalidContentData,
                Some(format!("live bindings[{i}] source path is empty")),
            ));
        }
        if binding.source.len() > MAX_LIVE_PATH_EXPRESSION_LEN {
            return Err((
                ValidationError::InvalidContentData,
                Some(format!(
                    "live bindings[{i}] source path is {} bytes; max is {}",
                    binding.source.len(),
                    MAX_LIVE_PATH_EXPRESSION_LEN
                )),
            ));
        }
        validate_live_path_expression(&binding.source).map_err(|detail| {
            (
                ValidationError::InvalidContentData,
                Some(format!("live bindings[{i}] source: {detail}")),
            )
        })?;
    }
    Ok(())
}

fn is_valid_binding_target(target: &str) -> bool {
    // Single identifier: ASCII letter then ASCII letters/digits/_.
    let mut chars = target.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Validate the JSON-path subset:
///   * Identifiers (letters/digits/_) separated by `.`
///   * `[N]` literal index (digits only, allows multi-digit)
///   * `[*]` array fan-out
///
/// This is a syntactic check only — whether the path resolves against
/// the real fetched JSON is a renderer-time concern.
fn validate_live_path_expression(path: &str) -> Result<(), String> {
    let bytes = path.as_bytes();
    if bytes.is_empty() {
        return Err("empty path".to_string());
    }
    let mut i = 0;
    while i < bytes.len() {
        // Identifier segment: first byte must be alpha, then alpha/digit/_.
        let id_start = i;
        if !bytes[i].is_ascii_alphabetic() {
            return Err(format!(
                "identifier segment at position {i} must start with a letter, got {:?}",
                bytes[i] as char
            ));
        }
        i += 1;
        while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
            i += 1;
        }
        if i == id_start {
            return Err(format!("expected identifier at position {i}"));
        }
        // Optional indexer(s): `[N]` or `[*]`.
        while i < bytes.len() && bytes[i] == b'[' {
            i += 1;
            if i < bytes.len() && bytes[i] == b'*' {
                i += 1;
            } else {
                let digit_start = i;
                while i < bytes.len() && bytes[i].is_ascii_digit() {
                    i += 1;
                }
                if i == digit_start {
                    return Err(format!("expected `*` or digit inside `[]` at position {i}"));
                }
            }
            if i >= bytes.len() || bytes[i] != b']' {
                return Err(format!("missing `]` at position {i}"));
            }
            i += 1;
        }
        // End of path or dot to next segment.
        if i == bytes.len() {
            break;
        }
        if bytes[i] != b'.' {
            return Err(format!(
                "expected `.` or `[` at position {i}, got {:?}",
                bytes[i] as char
            ));
        }
        i += 1;
        if i == bytes.len() {
            return Err("path ends with trailing `.`".to_string());
        }
    }
    Ok(())
}

fn validate_content_leaf(
    body: &ContentLeafBody,
) -> Result<(), (ValidationError, Option<String>)> {
    match body {
        ContentLeafBody::Markdown { data } => {
            if data.source.trim().is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("markdown 'source' is empty".to_string()),
                ));
            }
            Ok(())
        }
        ContentLeafBody::KvList { data } => {
            if data.rows.is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("kvList has no rows".to_string()),
                ));
            }
            if data.rows.iter().any(|r| r.label.trim().is_empty()) {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("kvList row has empty label".to_string()),
                ));
            }
            Ok(())
        }
        ContentLeafBody::Checklist { data } => {
            if data.items.is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("checklist has no items".to_string()),
                ));
            }
            if data.items.iter().any(|i| i.label.trim().is_empty()) {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("checklist item has empty label".to_string()),
                ));
            }
            Ok(())
        }
        ContentLeafBody::Stat { data } => {
            if data.value.trim().is_empty() {
                return Err((
                    ValidationError::InvalidContentData,
                    Some("stat 'value' is empty".to_string()),
                ));
            }
            Ok(())
        }
        ContentLeafBody::Table { data } => validate_content_table(data),
        ContentLeafBody::Chart { data } => validate_content_chart(data),
    }
}

#[allow(dead_code)]
pub fn validate_script_body_json(json: &str) -> Result<ScriptBody, ValidationError> {
    validate_script_body_json_detailed(json).map_err(|(kind, _)| kind)
}

pub fn drop_unused_script_libraries(body: &mut Value) -> Vec<String> {
    let Some(source) = body
        .get("source")
        .and_then(Value::as_str)
        .map(str::to_owned)
    else {
        return Vec::new();
    };
    // Sanitizer runs BEFORE storage validation, so unparseable / unbalanced
    // sources fall through here — `validate_script_body_json_detailed` will
    // reject them downstream with a detailed error. We do nothing in that
    // case rather than mutating libraries based on a half-parsed source.
    let Ok(identifiers) = parse_script_source_ast(&source) else {
        return Vec::new();
    };
    let Some(libraries) = body.get_mut("libraries").and_then(Value::as_array_mut) else {
        return Vec::new();
    };

    let mut removed = Vec::new();
    libraries.retain(|entry| {
        let Some(key) = entry.as_str() else {
            return true;
        };
        let Some(&(_, global)) = KNOWN_LIBRARY_GLOBALS
            .iter()
            .find(|&&(known_key, _)| known_key == key)
        else {
            return true;
        };
        if identifiers.contains(global) {
            return true;
        }
        removed.push(key.to_string());
        false
    });
    removed
}

/// Same as `validate_script_body_json`, but also surfaces a human-readable
/// detail string explaining which check failed. The detail is passed back to
/// agents/clients so they can correct widget source without re-guessing.
pub fn validate_script_body_json_detailed(
    json: &str,
) -> Result<ScriptBody, (ValidationError, Option<String>)> {
    if json.len() > MAX_SCRIPT_SOURCE_BYTES + MAX_HTML_SHIM_BYTES + 4096 {
        return Err((
            ValidationError::ScriptTooLarge,
            Some(format!(
                "script bodyJson is {} bytes; envelope limit is {} bytes",
                json.len(),
                MAX_SCRIPT_SOURCE_BYTES + MAX_HTML_SHIM_BYTES + 4096
            )),
        ));
    }
    let parsed: ScriptBody = serde_json::from_str(json).map_err(|error| {
        (
            ValidationError::InvalidScriptBody,
            Some(format!("script bodyJson did not parse: {error}")),
        )
    })?;
    if parsed.source.trim().is_empty() {
        return Err((
            ValidationError::InvalidScriptBody,
            Some("script body 'source' is empty after trimming".to_string()),
        ));
    }
    if parsed.source.len() > MAX_SCRIPT_SOURCE_BYTES {
        return Err((
            ValidationError::ScriptTooLarge,
            Some(format!(
                "script source is {} bytes; max is {}",
                parsed.source.len(),
                MAX_SCRIPT_SOURCE_BYTES
            )),
        ));
    }
    if let Some(secs) = parsed.permissions.poll_seconds {
        if secs < MIN_POLL_SECONDS {
            return Err((
                ValidationError::InvalidPollSeconds,
                Some(format!(
                    "permissions.pollSeconds is {secs}; minimum is {MIN_POLL_SECONDS}"
                )),
            ));
        }
    }
    if let Some(lifecycle) = &parsed.lifecycle {
        if let Some(min_tick) = lifecycle.min_tick_ms {
            // 16 ms floor matches a 60 fps frame; 60 s ceiling is well past any
            // sensible declared minimum.
            if !(16..=60_000).contains(&min_tick) {
                return Err((
                    ValidationError::InvalidScriptBody,
                    Some(format!(
                        "lifecycle.minTickMs is {min_tick}; must be in 16..=60000"
                    )),
                ));
            }
        }
    }
    if let Some(libs) = &parsed.libraries {
        if libs.len() > MAX_WIDGET_LIBRARIES {
            return Err((
                ValidationError::InvalidLibraries,
                Some(format!(
                    "{} libraries listed; max is {}",
                    libs.len(),
                    MAX_WIDGET_LIBRARIES
                )),
            ));
        }
        for entry in libs {
            if !is_valid_library_key(entry) {
                return Err((
                    ValidationError::InvalidLibraries,
                    Some(format!(
                        "invalid library key {entry:?}; expected lowercase ASCII id"
                    )),
                ));
            }
        }
    }
    // Harden 1: heuristic safety pass — infinite loops, null bytes, and a
    // fast delimiter-balance prefilter so the AST stage gets a sanitized
    // input. Kept in front of the AST parse because the loop check is
    // semantic, not syntactic, and oxc_parser will happily accept
    // `while(true){}`.
    validate_script_source_inner(&parsed.source)
        .map_err(|detail| (ValidationError::InvalidScriptSource, Some(detail)))?;
    // Harden 1b: AST parse — catches every grammar error the heuristic
    // delimiter pass cannot (missing operators, malformed declarations,
    // regex literals the heuristic flagged falsely, template-literal
    // interpolation issues, etc.). The returned identifier set is reused
    // below for the unused-library cross-reference so we don't fall back
    // to text scanning that misses identifier references inside template
    // literal `${...}` interpolations.
    let identifiers = parse_script_source_ast(&parsed.source)
        .map_err(|detail| (ValidationError::InvalidScriptSource, Some(detail)))?;
    if let Some(shim) = parsed.html_shim.as_deref() {
        validate_html_shim(shim)
            .map_err(|detail| (ValidationError::InvalidScriptSource, Some(detail)))?;
    }
    validate_script_dom_mounts(&parsed.source, parsed.html_shim.as_deref())
        .map_err(|detail| (ValidationError::InvalidScriptSource, Some(detail)))?;
    if let Some(libs) = &parsed.libraries {
        // Harden 4: every listed library global must appear as an identifier
        // reference in the parsed AST. A library that loads but is never
        // called wastes ~80KB+ and adds GC pressure. The AST set is exact
        // (no string/comment false-positives, no false-negatives from
        // template-literal interpolation), so this replaces the previous
        // text-based word-boundary scan.
        for entry in libs {
            if let Some(&(_, global)) = KNOWN_LIBRARY_GLOBALS
                .iter()
                .find(|&&(key, _)| key == entry.as_str())
            {
                if !identifiers.contains(global) {
                    return Err((
                        ValidationError::UnusedLibrary,
                        Some(format!(
                            "library {entry:?} (global {global:?}) is declared but never referenced in the script source; remove it from body.libraries"
                        )),
                    ));
                }
            }
        }
    }
    Ok(parsed)
}

/// Tags an `htmlShim` is never allowed to contain. The CSP blocks `script` /
/// `iframe` / `object` / `embed` at runtime, but rejecting at validation gives
/// the assistant a clean structured error to self-correct against. Document-
/// shell tags (`html`, `head`, `body`, `meta`, `title`, `link`) are rejected
/// because the shim is supposed to be a small fragment dropped into the host
/// document's `<body>` — shipping a second document inside the shim breaks
/// layout in undefined ways.
const HTML_SHIM_FORBIDDEN_TAGS: &[&str] = &[
    "script", "iframe", "object", "embed", "html", "head", "body", "meta", "title", "link",
];

fn validate_html_shim(shim: &str) -> Result<(), String> {
    if shim.is_empty() {
        return Ok(());
    }
    if shim.len() > MAX_HTML_SHIM_BYTES {
        return Err(format!(
            "htmlShim is {} bytes; max is {} bytes",
            shim.len(),
            MAX_HTML_SHIM_BYTES
        ));
    }
    if shim.contains('\0') {
        return Err("htmlShim contains null bytes".to_string());
    }
    let lower = shim.to_ascii_lowercase();
    for tag in HTML_SHIM_FORBIDDEN_TAGS {
        if html_shim_contains_tag_open(&lower, tag) {
            return Err(format!(
                "htmlShim contains forbidden tag <{tag}>; the shim must be a small mount-point fragment without scripts, plugins, or document-shell elements"
            ));
        }
    }
    Ok(())
}

/// Whole-token match for `<tag` so `<scripty>` does not match `<script`.
/// `lower_haystack` must already be ASCII-lowercased so the comparison is
/// case-insensitive against the forbidden list.
fn html_shim_contains_tag_open(lower_haystack: &str, tag: &str) -> bool {
    let needle = format!("<{tag}");
    let bytes = lower_haystack.as_bytes();
    let needle_bytes = needle.as_bytes();
    let n = needle_bytes.len();
    if n == 0 || bytes.len() < n {
        return false;
    }
    let mut i = 0;
    while i + n <= bytes.len() {
        if &bytes[i..i + n] == needle_bytes {
            match bytes.get(i + n).copied() {
                None => return true,
                Some(b) if b.is_ascii_alphanumeric() => {}
                Some(_) => return true,
            }
        }
        i += 1;
    }
    false
}

fn validate_script_dom_mounts(source: &str, html_shim: Option<&str>) -> Result<(), String> {
    for id in extract_get_element_by_id_targets(source) {
        if id == "root" || html_shim_contains_id(html_shim, &id) || source_creates_id(source, &id)
        {
            continue;
        }
        return Err(format!(
            "script calls document.getElementById({id:?}) but no matching element exists in htmlShim and the source does not create that id; mount from document.getElementById('root') or create the element before reading properties such as innerHTML"
        ));
    }
    Ok(())
}

fn extract_get_element_by_id_targets(source: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let needle = "document.getElementById";
    let bytes = source.as_bytes();
    let mut offset = 0;
    while let Some(relative) = source[offset..].find(needle) {
        let mut i = offset + relative + needle.len();
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if bytes.get(i) != Some(&b'(') {
            offset = i;
            continue;
        }
        i += 1;
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        let Some(&quote) = bytes.get(i) else {
            offset = i;
            continue;
        };
        if quote != b'\'' && quote != b'"' {
            offset = i;
            continue;
        }
        i += 1;
        let start = i;
        let mut escaped = false;
        while i < bytes.len() {
            let byte = bytes[i];
            if byte == b'\\' && !escaped {
                escaped = true;
                i += 1;
                continue;
            }
            if byte == quote && !escaped {
                ids.push(source[start..i].to_string());
                break;
            }
            escaped = false;
            i += 1;
        }
        offset = i.saturating_add(1);
    }
    ids
}

fn html_shim_contains_id(html_shim: Option<&str>, id: &str) -> bool {
    let Some(html_shim) = html_shim else {
        return false;
    };
    html_shim.contains(&format!("id=\"{id}\"")) || html_shim.contains(&format!("id='{id}'"))
}

fn source_creates_id(source: &str, id: &str) -> bool {
    source.contains(&format!(".id = \"{id}\""))
        || source.contains(&format!(".id = '{id}'"))
        || source.contains(&format!(".id=\"{id}\""))
        || source.contains(&format!(".id='{id}'"))
        || source.contains(&format!("setAttribute(\"id\", \"{id}\")"))
        || source.contains(&format!("setAttribute('id', '{id}')"))
        || source.contains(&format!("setAttribute(\"id\",\"{id}\")"))
        || source.contains(&format!("setAttribute('id','{id}')"))
}

fn is_valid_library_key(value: &str) -> bool {
    if value.is_empty() || value.len() > 32 {
        return false;
    }
    let mut chars = value.chars();
    let first = chars.next();
    if !matches!(first, Some(c) if c.is_ascii_lowercase()) {
        return false;
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

/// AST-based parse of widget script source.
///
/// Wraps `source` in the same synchronous IIFE the runtime host uses
/// ([`permissions.ts:688`]: `(function(){ source })()`) and parses it with
/// oxc_parser so a top-level `return` is legal — matching what the iframe
/// actually executes. The wrapper line offset is constant (`(function(){\n`
/// = 14 bytes / one leading line), so the parser line numbers map back to
/// `original_line = parsed_line - 1`.
///
/// On success, walks the AST and collects every [`IdentifierReference`]
/// name. That set is the source of truth for the unused-library check
/// (declaring `libraries: ["three"]` is valid iff the identifier `THREE`
/// appears somewhere in the AST as a real reference, not inside a string
/// or a comment).
///
/// On failure, returns a short human-readable detail string with the first
/// parser error and its line/column so the assistant can self-correct on
/// the next tool round.
fn parse_script_source_ast(source: &str) -> Result<HashSet<String>, String> {
    let wrapped = format!("(function(){{\n{source}\n}})();");
    let allocator = Allocator::default();
    let source_type = SourceType::cjs();
    let ret = Parser::new(&allocator, &wrapped, source_type).parse();
    // Prefer the structured error (with location) over the bare panic flag,
    // since oxc sets `panicked` for unrecoverable parses but usually also
    // populates `errors` with the precise failure.
    if let Some(first) = ret.errors.first() {
        let line_col = first
            .labels
            .as_ref()
            .and_then(|labels| labels.first())
            .map(|label| {
                let start = label.offset();
                map_offset_to_line_col(&wrapped, start)
            });
        let location = match line_col {
            // The wrapper prepends one line; subtract it so the message refers
            // to the AI-authored source rather than the synthetic IIFE.
            Some((line, col)) if line >= 1 => format!(" at line {} col {}", line, col),
            _ => String::new(),
        };
        return Err(format!(
            "script source is not parseable JavaScript{location}: {}",
            first.message
        ));
    }
    if ret.panicked {
        return Err(
            "script source is not parseable JavaScript (parser produced no diagnostic)"
                .to_string(),
        );
    }
    let mut collector = IdentifierCollector {
        names: HashSet::new(),
    };
    collector.visit_program(&ret.program);
    Ok(collector.names)
}

struct IdentifierCollector {
    names: HashSet<String>,
}

impl<'a> Visit<'a> for IdentifierCollector {
    fn visit_identifier_reference(&mut self, it: &oxc_ast::ast::IdentifierReference<'a>) {
        self.names.insert(it.name.to_string());
    }
}

fn map_offset_to_line_col(source: &str, offset: usize) -> (u32, u32) {
    // Subtract the synthetic wrapper line so callers see source-relative
    // positions. The wrapper is `(function(){\n` then source then `\n})();`.
    let mut line: u32 = 1;
    let mut col: u32 = 1;
    for (i, ch) in source.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    // Wrapper occupies line 1; report widget-source-relative line.
    (line.saturating_sub(1), col)
}

/// Harden 1: semantic prefilter — catches what oxc_parser will not, since a
/// well-formed `while(true){}` is valid JavaScript that we still reject for
/// dashboard widgets. The AST stage owns syntactic correctness (delimiters,
/// grammar, regex literals); this pass only enforces the runtime-safety
/// rules the parser cannot see:
///   * null bytes (filesystem / WebView2 hazard)
///   * `while(true)`, `while(1)`, `for(;;)` infinite loops
///
/// Limitation: `${expr}` interpolation inside template literals is treated
/// as part of the string, so a `while(true)` hidden there would not be
/// caught. The active-widget cap and visibility throttle still apply, so
/// the impact is bounded.
fn validate_script_source_inner(source: &str) -> Result<(), String> {
    if source.contains('\0') {
        return Err("script source contains null bytes".to_string());
    }
    let code_only = strip_strings_and_comments(source);
    let collapsed: String = code_only.chars().filter(|c| !c.is_whitespace()).collect();
    if collapsed.contains("while(true)") || collapsed.contains("while(1)") {
        return Err(
            "infinite loop detected: while(true) or while(1) is forbidden in widget scripts"
                .to_string(),
        );
    }
    if collapsed.contains("for(;;)") {
        return Err("infinite loop detected: for(;;) is forbidden in widget scripts".to_string());
    }
    Ok(())
}

/// Returns the source with strings, template literals, and comments replaced by
/// spaces (same character count, so byte offsets are preserved for any future
/// diagnostic use). Used by [`validate_script_source_inner`] so its infinite-
/// loop scan ignores `while(true)` text appearing inside a string literal or
/// comment. Does not need to be aware of regex literals because the scan it
/// feeds only looks at three specific token sequences; the AST stage handles
/// syntactic correctness including regex parsing.
fn strip_strings_and_comments(source: &str) -> String {
    #[derive(Copy, Clone, PartialEq, Eq)]
    enum State {
        Normal,
        Single,
        Double,
        Template,
        LineComment,
        BlockComment,
    }
    let chars: Vec<char> = source.chars().collect();
    let mut out = String::with_capacity(source.len());
    let mut state = State::Normal;
    let mut backslashes: u32 = 0;
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        let next = chars.get(i + 1).copied();
        match state {
            State::Normal => match ch {
                '/' if next == Some('/') => {
                    state = State::LineComment;
                    out.push(' ');
                    out.push(' ');
                    i += 2;
                    continue;
                }
                '/' if next == Some('*') => {
                    state = State::BlockComment;
                    out.push(' ');
                    out.push(' ');
                    i += 2;
                    continue;
                }
                '\'' => {
                    state = State::Single;
                    backslashes = 0;
                    out.push(' ');
                }
                '"' => {
                    state = State::Double;
                    backslashes = 0;
                    out.push(' ');
                }
                '`' => {
                    state = State::Template;
                    backslashes = 0;
                    out.push(' ');
                }
                _ => out.push(ch),
            },
            State::Single | State::Double | State::Template => {
                let closer = match state {
                    State::Single => '\'',
                    State::Double => '"',
                    State::Template => '`',
                    _ => unreachable!(),
                };
                // Track consecutive backslashes so '\\' closes the string but '\\\'' does not.
                if ch == '\\' {
                    backslashes += 1;
                } else {
                    let escaped = backslashes % 2 == 1;
                    if ch == closer && !escaped {
                        state = State::Normal;
                    }
                    backslashes = 0;
                }
                // Preserve newlines so line-based tooling still works; everything
                // else inside a string becomes a space.
                out.push(if ch == '\n' { '\n' } else { ' ' });
            }
            State::LineComment => {
                if ch == '\n' {
                    state = State::Normal;
                    out.push('\n');
                } else {
                    out.push(' ');
                }
            }
            State::BlockComment => {
                if ch == '*' && next == Some('/') {
                    state = State::Normal;
                    out.push(' ');
                    out.push(' ');
                    i += 2;
                    continue;
                }
                out.push(if ch == '\n' { '\n' } else { ' ' });
            }
        }
        i += 1;
    }
    out
}

#[allow(dead_code)]
pub fn validate_custom_body_for_kind(kind: &str, body_json: &str) -> Result<(), ValidationError> {
    validate_custom_body_for_kind_detailed(kind, body_json).map_err(|(kind, _)| kind)
}

pub fn validate_custom_body_for_kind_detailed(
    kind: &str,
    body_json: &str,
) -> Result<(), (ValidationError, Option<String>)> {
    match kind {
        "content" => {
            validate_content_body_json_detailed(body_json)?;
            Ok(())
        }
        "script" => {
            validate_script_body_json_detailed(body_json)?;
            Ok(())
        }
        _ => Err((
            ValidationError::InvalidCustomWidgetKind,
            Some(format!(
                "AI Created Widget kind {kind:?} is not one of: content, script"
            )),
        )),
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
    let parsed: Value =
        serde_json::from_str(json).map_err(|_| ValidationError::InvalidSettingsSchema)?;
    let fields = parsed
        .get("fields")
        .and_then(Value::as_array)
        .ok_or(ValidationError::InvalidSettingsSchema)?;
    if fields.len() > MAX_SETTINGS_FIELDS {
        return Err(ValidationError::InvalidSettingsSchema);
    }
    let mut keys = std::collections::HashSet::new();
    for field in fields {
        let object = field
            .as_object()
            .ok_or(ValidationError::InvalidSettingsSchema)?;
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
                if object
                    .get("placeholder")
                    .is_some_and(|value| !value.is_string() && !value.is_null())
                {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
                if object
                    .get("defaultValue")
                    .is_some_and(|value| !value.is_string() && !value.is_null())
                {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
            }
            "number" => {
                for key in ["min", "max", "defaultValue"] {
                    if object
                        .get(key)
                        .is_some_and(|value| !value.is_number() && !value.is_null())
                    {
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
                if object
                    .get("defaultValue")
                    .is_some_and(|value| !value.is_boolean() && !value.is_null())
                {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
            }
            "secret" => {
                if object
                    .get("placeholder")
                    .is_some_and(|value| !value.is_string() && !value.is_null())
                {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
                if object.contains_key("defaultValue") {
                    return Err(ValidationError::InvalidSettingsSchema);
                }
            }
            "select" => {
                if object
                    .get("defaultValue")
                    .is_some_and(|value| !value.is_string() && !value.is_null())
                {
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
                    let option = option
                        .as_object()
                        .ok_or(ValidationError::InvalidSettingsSchema)?;
                    let label = option
                        .get("label")
                        .and_then(Value::as_str)
                        .ok_or(ValidationError::InvalidSettingsSchema)?;
                    if label.trim().is_empty() || !option.get("value").is_some_and(Value::is_string)
                    {
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

    let schema: Value =
        serde_json::from_str(schema_json).map_err(|_| ValidationError::InvalidSettingsSchema)?;
    let values: Value =
        serde_json::from_str(values_json).map_err(|_| ValidationError::InvalidSettingsValues)?;
    let Some(value_object) = values.as_object() else {
        return Err(ValidationError::InvalidSettingsValues);
    };

    let fields = schema
        .get("fields")
        .and_then(Value::as_array)
        .ok_or(ValidationError::InvalidSettingsSchema)?;
    for field in fields {
        let object = field
            .as_object()
            .ok_or(ValidationError::InvalidSettingsSchema)?;
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
        let valid_ref = secret_ref.get("type").and_then(Value::as_str) == Some("secretRef")
            && secret_ref.get("ownerId").and_then(Value::as_str)
                == Some(expected_owner_id.as_str())
            && secret_ref.get("hasSecret").and_then(Value::as_bool) == Some(true)
            && secret_ref
                .get("updatedAt")
                .is_none_or(|value| value.is_string());
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
    let parsed: Value =
        serde_json::from_str(json).map_err(|_| ValidationError::InvalidSettingsValues)?;
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
    fn preset_known() {
        assert!(validate_preset("panel").is_ok());
    }

    #[test]
    fn preset_unknown() {
        assert_eq!(
            validate_preset("does-not-exist"),
            Err(ValidationError::InvalidPreset)
        );
    }

    #[test]
    fn preset_mono_is_removed() {
        assert_eq!(validate_preset("mono"), Err(ValidationError::InvalidPreset));
    }

    #[test]
    fn preset_tile_and_action_are_removed() {
        assert_eq!(validate_preset("tile"), Err(ValidationError::InvalidPreset));
        assert_eq!(validate_preset("action"), Err(ValidationError::InvalidPreset));
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
        assert_eq!(
            validate_icon("NotAnIcon"),
            Err(ValidationError::InvalidIcon)
        );
    }

    #[test]
    fn grid_bounds_in_range() {
        assert!(validate_grid_bounds(0, 0, 4, 3).is_ok());
    }

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
    fn grid_bounds_rejects_absurd_y() {
        assert_eq!(
            validate_grid_bounds(0, i64::MAX, 4, 3),
            Err(ValidationError::InvalidGridBounds),
        );
        assert_eq!(
            validate_grid_bounds(0, GRID_MAX_ROWS, 4, 1),
            Err(ValidationError::InvalidGridBounds),
        );
    }

    #[test]
    fn grid_density_known() {
        assert!(validate_grid_density("compact").is_ok());
    }

    #[test]
    fn grid_density_unknown() {
        assert_eq!(
            validate_grid_density("huge"),
            Err(ValidationError::InvalidGridDensity)
        );
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
    fn content_markdown_accepts_explicit_markdown_mode() {
        let json = r##"{"shape":"markdown","data":{"source":"# Hello","mode":"markdown"}}"##;
        assert!(validate_content_body_json(json).is_ok());
    }

    #[test]
    fn content_markdown_accepts_explicit_html_mode() {
        let json =
            r##"{"shape":"markdown","data":{"source":"<strong>Hello</strong>","mode":"html"}}"##;
        assert!(validate_content_body_json(json).is_ok());
    }

    #[test]
    fn content_markdown_unknown_mode_rejected() {
        let json = r##"{"shape":"markdown","data":{"source":"# Hello","mode":"plain"}}"##;
        assert_eq!(
            validate_content_body_json(json),
            Err(ValidationError::InvalidContentShape),
        );
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
    fn dashboard_tab_color_accepts_gradient_presets() {
        assert!(validate_dashboard_tab_color("g-dawn").is_ok());
        assert!(validate_dashboard_tab_color("g-twilight").is_ok());
    }

    #[test]
    fn dashboard_tab_color_rejects_custom_or_solid_colors() {
        assert_eq!(
            validate_dashboard_tab_color("#2563eb"),
            Err(ValidationError::InvalidBackground),
        );
        assert_eq!(
            validate_dashboard_tab_color("mist"),
            Err(ValidationError::InvalidBackground),
        );
        assert_eq!(
            validate_dashboard_tab_color("neon-explosion"),
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

    // --- validate_script_source ---------------------------------------------

    #[test]
    fn script_source_accepts_typical_widget() {
        assert!(validate_script_source_inner(
            "const ctx = root.getContext('2d'); function draw(){ if (gameOver) return; requestAnimationFrame(draw); } draw();"
        )
        .is_ok());
    }

    #[test]
    fn script_source_rejects_while_true_in_code() {
        assert!(validate_script_source_inner("while (true) { doStuff(); }").is_err());
        assert!(validate_script_source_inner("while(1){ doStuff(); }").is_err());
        assert!(validate_script_source_inner("for (;;) { doStuff(); }").is_err());
    }

    #[test]
    fn script_source_allows_while_true_inside_string() {
        // Regression: the original collapsed-string check rejected scripts that
        // merely mentioned "while(true)" in a string or comment.
        assert!(validate_script_source_inner(
            "const note = 'never use while(true) here'; console.log(note);"
        )
        .is_ok());
        assert!(validate_script_source_inner(
            "// avoid while(true) and for(;;) in widget scripts\nconsole.log(1);"
        )
        .is_ok());
        assert!(validate_script_source_inner(
            "/* docs say while(true) is forbidden */ console.log(1);"
        )
        .is_ok());
    }

    #[test]
    fn script_source_handles_escaped_backslash_in_string() {
        // Regression: the original prev != '\\' check left the parser stuck in
        // a string after an escaped backslash, then reported unbalanced delims.
        assert!(validate_script_source_inner(
            "const path = 'C:\\\\Users\\\\widget'; console.log(path);"
        )
        .is_ok());
        // Real backslash-escaped quote stays inside the string.
        assert!(validate_script_source_inner("const q = 'it\\'s fine'; console.log(q);").is_ok());
    }

    #[test]
    fn script_body_rejects_unbalanced_delimiters() {
        // Delimiter correctness now belongs to the AST stage. The error path
        // is still `InvalidScriptSource`; only the source of the rejection
        // moved.
        for source in [
            "function f() { return 1;",
            "const a = [1, 2, 3",
            "const a = (1 + 2;",
        ] {
            let body = serde_json::json!({
                "source": source,
                "permissions": {"network": false},
            });
            let err = validate_script_body_json_detailed(&body.to_string())
                .expect_err("unbalanced delimiters must be rejected");
            assert_eq!(err.0, ValidationError::InvalidScriptSource, "{source}");
        }
    }

    #[test]
    fn script_source_allows_braces_inside_template_literals() {
        // The strip pass treats template literals as opaque strings so the
        // infinite-loop scan does not see synthetic `while(true)` text inside
        // a `${...}` interpolation. The AST stage parses interpolation
        // expressions as code, which is what we want for identifier walks.
        assert!(validate_script_source_inner(
            "const s = `hello {world}`; const t = `${1 + 2}`; console.log(s, t);"
        )
        .is_ok());
    }

    #[test]
    fn script_source_rejects_null_byte() {
        assert!(validate_script_source_inner("console.log(1);\0").is_err());
    }

    #[test]
    fn script_body_rejects_missing_get_element_by_id_target() {
        let json = r#"{"source":"document.getElementById('game').innerHTML = 'ready';","permissions":{"network":false}}"#;
        let err = validate_script_body_json_detailed(json).expect_err("missing target rejected");

        assert_eq!(err.0, ValidationError::InvalidScriptSource);
        assert!(err.1.unwrap().contains("document.getElementById"));
    }

    #[test]
    fn script_body_accepts_get_element_by_id_target_from_html_shim() {
        let json = r#"{"source":"document.getElementById('game').innerHTML = 'ready';","htmlShim":"<div id=\"game\"></div>","permissions":{"network":false}}"#;
        assert!(validate_script_body_json(json).is_ok());
    }

    #[test]
    fn script_body_accepts_root_mount_target() {
        let json = r#"{"source":"document.getElementById('root').replaceChildren(document.createElement('div'));","permissions":{"network":false}}"#;
        assert!(validate_script_body_json(json).is_ok());
    }

    // --- unused-library detection -------------------------------------------

    #[test]
    fn unused_library_short_global_word_boundary() {
        // `L` (Leaflet) must not match `null`, `let`, `class`, etc.
        let json = r#"{"source":"const x = null; let y = 0; class Foo {}","libraries":["leaflet"],"permissions":{"network":true}}"#;
        assert_eq!(
            validate_script_body_json(json),
            Err(ValidationError::UnusedLibrary),
        );
    }

    #[test]
    fn unused_library_short_global_accepts_real_use() {
        let json = r#"{"source":"const map = L.map(root).setView([0,0], 2);","libraries":["leaflet"],"permissions":{"network":true}}"#;
        assert!(validate_script_body_json(json).is_ok());
    }

    #[test]
    fn unused_library_ignores_reference_in_comment_or_string() {
        // The original check used `source.contains(global)`, which would pass
        // a library whose global appears only in a comment. The code-only view
        // now strips comments and string literals.
        let json = r#"{"source":"// uses chroma later\nconsole.log('chroma');","libraries":["chroma"],"permissions":{"network":false}}"#;
        assert_eq!(
            validate_script_body_json(json),
            Err(ValidationError::UnusedLibrary),
        );
    }

    #[test]
    fn unused_library_detects_documented_global() {
        // The original incident: matter and animejs declared, never called.
        let json = r#"{"source":"const board = []; function step(){ board.push(1); } step();","libraries":["matter","animejs"],"permissions":{"network":false}}"#;
        assert_eq!(
            validate_script_body_json(json),
            Err(ValidationError::UnusedLibrary),
        );
    }

    #[test]
    fn unused_libraries_can_be_dropped_before_ai_tool_validation() {
        let mut body = serde_json::json!({
            "source": "const root = document.getElementById('root'); root.textContent = new Date().toLocaleTimeString();",
            "libraries": ["dayjs", "matter"],
            "permissions": {"network": false, "pollSeconds": null},
            "htmlShim": null
        });

        assert_eq!(
            drop_unused_script_libraries(&mut body),
            vec!["dayjs".to_string(), "matter".to_string()]
        );
        assert_eq!(body["libraries"], serde_json::json!([]));
        assert!(validate_script_body_json(&body.to_string()).is_ok());
    }

    #[test]
    fn unused_library_accepts_matter_called() {
        let json = r#"{"source":"const engine = Matter.Engine.create(); Matter.Runner.run(engine);","libraries":["matter"],"permissions":{"network":false}}"#;
        assert!(validate_script_body_json(json).is_ok());
    }

    #[test]
    fn unused_library_accepts_mermaid_called() {
        let json = r#"{"source":"mermaid.initialize({startOnLoad:true}); mermaid.run();","libraries":["mermaid"],"permissions":{"network":false}}"#;
        assert!(validate_script_body_json(json).is_ok());
    }

    // --- AST-based parse / identifier scan ----------------------------------

    #[test]
    fn ast_rejects_grammar_error_that_passes_delimiter_balance() {
        // `const x = ;` has balanced delimiters but is not parseable. The old
        // heuristic accepted it because nothing was textually unbalanced. The
        // AST stage rejects it with a structured error mentioning the location.
        let json = r#"{"source":"const x = ;","permissions":{"network":false}}"#;
        let err = validate_script_body_json_detailed(json).expect_err("grammar error rejected");
        assert_eq!(err.0, ValidationError::InvalidScriptSource);
        let detail = err.1.unwrap();
        assert!(
            detail.contains("not parseable JavaScript"),
            "detail missing parse hint: {detail}",
        );
    }

    #[test]
    fn ast_rejects_double_identifier_declaration() {
        // `let x x = 5;` is delimiter-balanced and free of strings/comments,
        // so the heuristic accepted it. The AST rejects it as an unexpected
        // token.
        let json = r#"{"source":"let x x = 5;","permissions":{"network":false}}"#;
        let err = validate_script_body_json_detailed(json).expect_err("malformed decl rejected");
        assert_eq!(err.0, ValidationError::InvalidScriptSource);
    }

    #[test]
    fn ast_accepts_regex_literal_with_unbalanced_inner_paren() {
        // `/^foo\(/` has a literal `(` byte inside the regex. The heuristic
        // strip pass does not understand regex literals, but the AST does.
        // Wrap in a function so the `return` is legal at top level after the
        // IIFE wrapper.
        let json = r#"{"source":"const re = /^foo\\(/; const m = re.test('foo(');","permissions":{"network":false}}"#;
        assert!(
            validate_script_body_json(json).is_ok(),
            "regex literal should parse cleanly",
        );
    }

    #[test]
    fn ast_detects_identifier_reference_inside_template_literal_interpolation() {
        // The heuristic blanks `${...}` content as part of the template string,
        // so a library referenced ONLY inside an interpolation was wrongly
        // flagged as unused. The AST walks into interpolation expressions and
        // sees the real reference.
        let json = r#"{"source":"const out = `engine: ${Matter.Engine.create()}`; document.getElementById('root').textContent = out;","libraries":["matter"],"permissions":{"network":false}}"#;
        assert!(
            validate_script_body_json(json).is_ok(),
            "Matter referenced inside template interpolation must count as used",
        );
    }

    #[test]
    fn ast_top_level_return_is_legal_inside_widget_iiife() {
        // Widget sources are wrapped in `(function(){ source })()` at runtime,
        // so a bare `return` at widget top level is legal. The validator wraps
        // identically before parsing.
        let json = r#"{"source":"if (!document.getElementById('root')) return; document.getElementById('root').textContent = 'ok';","permissions":{"network":false}}"#;
        assert!(
            validate_script_body_json(json).is_ok(),
            "top-level return inside the synthetic IIFE wrapper should parse",
        );
    }

    // --- C: table / chart / layout content shapes ---------------------------

    #[test]
    fn content_table_round_trips_columns_and_rows() {
        let body = serde_json::json!({
            "shape": "table",
            "data": {
                "columns": [
                    {"key": "host", "label": "Host", "align": null},
                    {"key": "load", "label": "Load", "align": "end"},
                ],
                "rows": [
                    {"host": "ssh-1", "load": "0.42"},
                    {"host": "ssh-2", "load": "1.17"},
                ],
            }
        });
        assert!(validate_content_body_json(&body.to_string()).is_ok());
    }

    #[test]
    fn content_table_rejects_empty_columns_and_duplicate_keys() {
        let no_cols = serde_json::json!({
            "shape": "table",
            "data": {"columns": [], "rows": []},
        });
        let err = validate_content_body_json_detailed(&no_cols.to_string())
            .expect_err("empty columns rejected");
        assert_eq!(err.0, ValidationError::InvalidContentData);

        let dup_keys = serde_json::json!({
            "shape": "table",
            "data": {
                "columns": [
                    {"key": "x", "label": "X", "align": null},
                    {"key": "x", "label": "Also X", "align": null},
                ],
                "rows": [],
            }
        });
        let err = validate_content_body_json_detailed(&dup_keys.to_string())
            .expect_err("duplicate keys rejected");
        assert_eq!(err.0, ValidationError::InvalidContentData);
        assert!(err.1.as_deref().unwrap_or("").contains("duplicate"));
    }

    #[test]
    fn content_table_caps_columns_and_rows() {
        let too_many_cols: Vec<_> = (0..15)
            .map(|i| serde_json::json!({"key": format!("c{i}"), "label": format!("C{i}"), "align": null}))
            .collect();
        let body = serde_json::json!({
            "shape": "table",
            "data": {"columns": too_many_cols, "rows": []},
        });
        let err = validate_content_body_json_detailed(&body.to_string())
            .expect_err("too many columns rejected");
        assert_eq!(err.0, ValidationError::InvalidContentData);

        let too_many_rows: Vec<_> = (0..(MAX_TABLE_ROWS + 1))
            .map(|_| serde_json::json!({"x": "y"}))
            .collect();
        let body = serde_json::json!({
            "shape": "table",
            "data": {
                "columns": [{"key": "x", "label": "X", "align": null}],
                "rows": too_many_rows,
            }
        });
        let err = validate_content_body_json_detailed(&body.to_string())
            .expect_err("too many rows rejected");
        assert_eq!(err.0, ValidationError::InvalidContentData);
    }

    #[test]
    fn content_chart_sparkline_validates_finite_points() {
        let ok = serde_json::json!({
            "shape": "chart",
            "data": {"kind": "sparkline", "points": [1.0, 2.5, 3.0, 2.1], "caption": "load"},
        });
        assert!(validate_content_body_json(&ok.to_string()).is_ok());

        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let bad_body = serde_json::json!({
                "shape": "chart",
                "data": {"kind": "sparkline", "points": [1.0, bad], "caption": null},
            });
            // JSON does not allow NaN/Inf so this would not round-trip via
            // serde_json. Instead, exercise the validator via direct value.
            let _ = bad;
            let _ = bad_body;
        }
    }

    #[test]
    fn content_chart_donut_rejects_negative_slices() {
        let body = serde_json::json!({
            "shape": "chart",
            "data": {
                "kind": "donut",
                "series": [
                    {"label": "ok", "value": 0.4},
                    {"label": "bad", "value": -0.1},
                ],
                "caption": null,
            }
        });
        let err = validate_content_body_json_detailed(&body.to_string())
            .expect_err("negative donut slice rejected");
        assert_eq!(err.0, ValidationError::InvalidContentData);
        assert!(err.1.as_deref().unwrap_or("").contains("negative"));
    }

    #[test]
    fn content_chart_bar_round_trips() {
        let body = serde_json::json!({
            "shape": "chart",
            "data": {
                "kind": "bar",
                "series": [
                    {"label": "Mon", "value": 12.0},
                    {"label": "Tue", "value": 17.0},
                    {"label": "Wed", "value": -3.5},
                ],
                "caption": null,
            }
        });
        assert!(validate_content_body_json(&body.to_string()).is_ok());
    }

    #[test]
    fn content_layout_round_trips_with_mixed_leaf_children() {
        let body = serde_json::json!({
            "shape": "layout",
            "data": {
                "direction": "row",
                "children": [
                    {"shape": "stat", "data": {"value": "42", "unit": "ms", "delta": null, "caption": null}},
                    {"shape": "chart", "data": {"kind": "sparkline", "points": [1.0, 2.0, 3.0], "caption": null}},
                ],
            }
        });
        assert!(validate_content_body_json(&body.to_string()).is_ok());
    }

    #[test]
    fn content_layout_rejects_nested_layout_child() {
        // Nested layouts are rejected at the serde boundary because
        // ContentLeafBody does not include a "layout" variant. The error
        // surfaces as InvalidContentShape (the catch-all for parse failures).
        let body = serde_json::json!({
            "shape": "layout",
            "data": {
                "direction": "col",
                "children": [
                    {"shape": "layout", "data": {"direction": "row", "children": [
                        {"shape": "stat", "data": {"value": "1", "unit": null, "delta": null, "caption": null}},
                    ]}},
                ],
            }
        });
        let err = validate_content_body_json_detailed(&body.to_string())
            .expect_err("nested layout rejected");
        assert_eq!(err.0, ValidationError::InvalidContentShape);
    }

    #[test]
    fn content_layout_rejects_unknown_direction_and_empty_children() {
        let bad_dir = serde_json::json!({
            "shape": "layout",
            "data": {"direction": "diagonal", "children": []},
        });
        let err = validate_content_body_json_detailed(&bad_dir.to_string())
            .expect_err("bad direction rejected");
        assert_eq!(err.0, ValidationError::InvalidContentShape);

        let empty_children = serde_json::json!({
            "shape": "layout",
            "data": {"direction": "row", "children": []},
        });
        let err = validate_content_body_json_detailed(&empty_children.to_string())
            .expect_err("empty children rejected");
        assert_eq!(err.0, ValidationError::InvalidContentData);
    }

    // --- C: live (fetch + bindings) -----------------------------------------

    #[test]
    fn content_live_round_trips_minimal_widget() {
        let body = serde_json::json!({
            "shape": "live",
            "data": {
                "fetch": {"url": "https://api.example.com/quote", "refreshSec": 60},
                "render": {"shape": "stat", "data": {"value": "0"}},
                "bindings": [{"target": "value", "source": "quote.price"}],
            }
        });
        assert!(validate_content_body_json(&body.to_string()).is_ok());
    }

    #[test]
    fn content_live_accepts_empty_bindings_and_no_refresh() {
        let body = serde_json::json!({
            "shape": "live",
            "data": {
                "fetch": {"url": "https://api.example.com/status", "refreshSec": null},
                "render": {"shape": "markdown", "data": {"source": "placeholder", "mode": "markdown"}},
                "bindings": [],
            }
        });
        assert!(validate_content_body_json(&body.to_string()).is_ok());
    }

    #[test]
    fn content_live_rejects_http_url() {
        let body = serde_json::json!({
            "shape": "live",
            "data": {
                "fetch": {"url": "http://insecure.example/data", "refreshSec": null},
                "render": {"shape": "stat", "data": {"value": "x"}},
                "bindings": [],
            }
        });
        let err = validate_content_body_json_detailed(&body.to_string())
            .expect_err("http rejected");
        assert_eq!(err.0, ValidationError::InvalidContentData);
        assert!(err.1.as_deref().unwrap_or("").contains("https://"));
    }

    #[test]
    fn content_live_rejects_refresh_below_minimum_and_above_max() {
        for bad in [0u32, 1, 4, 86401, 999_999] {
            let body = serde_json::json!({
                "shape": "live",
                "data": {
                    "fetch": {"url": "https://example.com/x", "refreshSec": bad},
                    "render": {"shape": "stat", "data": {"value": "x"}},
                    "bindings": [],
                }
            });
            let err = validate_content_body_json_detailed(&body.to_string())
                .expect_err("out-of-range refreshSec rejected");
            assert_eq!(err.0, ValidationError::InvalidContentData, "{bad}");
        }
    }

    #[test]
    fn content_live_rejects_layout_render() {
        let body = serde_json::json!({
            "shape": "live",
            "data": {
                "fetch": {"url": "https://example.com/x", "refreshSec": null},
                "render": {"shape": "layout", "data": {"direction": "row", "children": []}},
                "bindings": [],
            }
        });
        let err = validate_content_body_json_detailed(&body.to_string())
            .expect_err("layout render rejected");
        assert_eq!(err.0, ValidationError::InvalidContentData);
    }

    #[test]
    fn content_live_rejects_nested_target_path() {
        // v1 only supports shallow single-identifier targets.
        let body = serde_json::json!({
            "shape": "live",
            "data": {
                "fetch": {"url": "https://example.com/x", "refreshSec": null},
                "render": {"shape": "stat", "data": {"value": "x"}},
                "bindings": [{"target": "data.value", "source": "x"}],
            }
        });
        let err = validate_content_body_json_detailed(&body.to_string())
            .expect_err("dotted target rejected");
        assert_eq!(err.0, ValidationError::InvalidContentData);
    }

    #[test]
    fn live_path_expression_accepts_valid_subset() {
        for ok in [
            "key",
            "a.b.c",
            "items[0]",
            "items[*]",
            "items[*].name",
            "quotes[3].close",
            "a[*].b[0].c",
        ] {
            assert!(
                validate_live_path_expression(ok).is_ok(),
                "should accept {ok}",
            );
        }
    }

    #[test]
    fn live_path_expression_rejects_malformed() {
        for bad in [
            "",
            ".key",       // starts with dot
            "key.",       // trailing dot
            "key[",       // unclosed bracket
            "key[]",      // empty bracket
            "key[1.0]",   // float in index
            "key.123",    // segment starts with digit
            "key[*.]",    // bad sub-syntax inside brackets
            "key/value",  // disallowed char
        ] {
            assert!(
                validate_live_path_expression(bad).is_err(),
                "should reject {bad:?}",
            );
        }
    }

    // --- B1: lifecycle -------------------------------------------------------

    #[test]
    fn lifecycle_accepts_known_kinds_and_optional_min_tick() {
        for kind in ["static", "periodic", "animation", "realtime"] {
            let body = serde_json::json!({
                "source": "document.getElementById('root').textContent = 'ok';",
                "permissions": {"network": false},
                "lifecycle": {"kind": kind, "minTickMs": 33},
            });
            assert!(
                validate_script_body_json(&body.to_string()).is_ok(),
                "lifecycle.kind={kind} should validate",
            );
        }
    }

    #[test]
    fn lifecycle_rejects_unknown_kind() {
        let body = serde_json::json!({
            "source": "document.getElementById('root').textContent = 'ok';",
            "permissions": {"network": false},
            "lifecycle": {"kind": "perpetual", "minTickMs": null},
        });
        // Unknown kind fails serde deserialization before our explicit check
        // runs, so the error path is InvalidScriptBody (the catch-all for
        // JSON-shape failures inside the script body).
        let err = validate_script_body_json_detailed(&body.to_string())
            .expect_err("unknown lifecycle kind rejected");
        assert_eq!(err.0, ValidationError::InvalidScriptBody);
    }

    #[test]
    fn lifecycle_rejects_min_tick_out_of_bounds() {
        for bad_tick in [0i64, 15, 60_001, 999_999] {
            let body = serde_json::json!({
                "source": "document.getElementById('root').textContent = 'ok';",
                "permissions": {"network": false},
                "lifecycle": {"kind": "animation", "minTickMs": bad_tick},
            });
            let err = validate_script_body_json_detailed(&body.to_string())
                .expect_err("out-of-bounds minTickMs rejected");
            assert_eq!(err.0, ValidationError::InvalidScriptBody, "{bad_tick}");
        }
    }

    #[test]
    fn lifecycle_absent_accepts_legacy_widget() {
        // Existing widgets in user databases have no lifecycle field. They
        // must continue to deserialize cleanly with lifecycle = None.
        let body = serde_json::json!({
            "source": "document.getElementById('root').textContent = 'ok';",
            "permissions": {"network": false},
        });
        let parsed = validate_script_body_json(&body.to_string())
            .expect("legacy script body without lifecycle is valid");
        assert!(parsed.lifecycle.is_none());
    }

    // --- B2: htmlShim caps + tag scan ---------------------------------------

    #[test]
    fn html_shim_size_cap_rejects_oversized_shim() {
        // Build a shim just past the 128 KB cap. Each "<div>" is 5 bytes, so
        // 27_000 copies produces ~135 KB.
        let oversized = "<div>".repeat(27_000);
        assert!(oversized.len() > MAX_HTML_SHIM_BYTES);
        let body = serde_json::json!({
            "source": "document.getElementById('mount').textContent = 'ok';",
            "permissions": {"network": false},
            "htmlShim": oversized,
        });
        let err = validate_script_body_json_detailed(&body.to_string())
            .expect_err("oversized shim rejected");
        assert_eq!(err.0, ValidationError::InvalidScriptSource);
        assert!(
            err.1.as_deref().unwrap_or("").contains("htmlShim"),
            "detail should mention htmlShim: {:?}",
            err.1,
        );
    }

    #[test]
    fn html_shim_size_cap_accepts_shim_under_128kb() {
        // A realistic large mount fragment (lots of layout divs + an inline
        // SVG path) must fit comfortably under the new ceiling. 16 KB is
        // already past the old 4 KB cap and well below 128 KB.
        let big_but_valid = format!(
            "<div id=\"root\"><div class=\"scaffold\">{}</div></div>",
            "<div></div>".repeat(1_400),
        );
        assert!(big_but_valid.len() < MAX_HTML_SHIM_BYTES);
        let body = serde_json::json!({
            "source": "document.getElementById('root').dataset.ready = '1';",
            "permissions": {"network": false},
            "htmlShim": big_but_valid,
        });
        assert!(validate_script_body_json(&body.to_string()).is_ok());
    }

    #[test]
    fn html_shim_rejects_script_iframe_and_document_shell_tags() {
        for forbidden in [
            r#"<script>alert(1)</script>"#,
            r#"<iframe src='about:blank'></iframe>"#,
            r#"<object data='x'></object>"#,
            r#"<embed src='x'>"#,
            r#"<html><body><div id='root'></div></body></html>"#,
            r#"<head><meta charset='utf-8'></head>"#,
            r#"<link rel='stylesheet' href='x'>"#,
        ] {
            let body = serde_json::json!({
                "source": "document.getElementById('root').textContent = 'ok';",
                "permissions": {"network": false},
                "htmlShim": forbidden,
            });
            let err = validate_script_body_json_detailed(&body.to_string())
                .expect_err("forbidden tag rejected");
            assert_eq!(err.0, ValidationError::InvalidScriptSource, "{forbidden}");
            assert!(
                err.1.as_deref().unwrap_or("").contains("forbidden tag"),
                "detail should mention forbidden tag for {forbidden}: {:?}",
                err.1,
            );
        }
    }

    #[test]
    fn html_shim_accepts_normal_mount_fragments() {
        for ok in [
            r#"<div id="root"></div>"#,
            r#"<div id="root"><canvas id="canvas"></canvas></div>"#,
            r#"<section class="kk-shell"><div id="root"></div></section>"#,
            r#"<style>.kk-grid{gap:8px}</style><div id="root"></div>"#,
            // Token-boundary check: `<scripty` is not `<script`.
            r#"<div id="root"><scripty-x data-x="1"></scripty-x></div>"#,
        ] {
            let body = serde_json::json!({
                "source": "document.getElementById('root').textContent = 'ok';",
                "permissions": {"network": false},
                "htmlShim": ok,
            });
            assert!(
                validate_script_body_json(&body.to_string()).is_ok(),
                "shim should be accepted: {ok}",
            );
        }
    }

    #[test]
    fn drop_unused_libraries_falls_through_for_unparseable_source() {
        // If a sanitizer pass runs on unparseable source, it must not mutate
        // libraries — the storage validator will reject the source itself
        // with a precise error on the next round.
        let mut body = serde_json::json!({
            "source": "const x = ;",
            "libraries": ["matter"],
            "permissions": {"network": false, "pollSeconds": null},
            "htmlShim": null,
        });
        assert_eq!(drop_unused_script_libraries(&mut body), Vec::<String>::new());
        assert_eq!(body["libraries"], serde_json::json!(["matter"]));
    }

    // --- delimiter-stripping internals --------------------------------------

    #[test]
    fn strip_treats_template_literal_as_opaque() {
        let out = strip_strings_and_comments("const s = `a {b} c`; foo();");
        // Inside the backticks the `{` and `}` should not appear in the
        // stripped output; the infinite-loop scan that consumes this view
        // must not see synthetic delimiters from inside template literals.
        assert!(!out.contains('{'));
        assert!(!out.contains('}'));
    }

    #[test]
    fn secret_settings_values_must_be_references() {
        let schema = r#"{"fields":[{"type":"secret","key":"apiKey","label":"API key"}]}"#;
        assert_eq!(
            validate_settings_values_for_schema_json(
                schema,
                r#"{"apiKey":"plain-text"}"#,
                "inst-1"
            ),
            Err(ValidationError::InvalidSettingsValues),
        );
        assert!(validate_settings_values_for_schema_json(
            schema,
            r#"{"apiKey":{"type":"secretRef","ownerId":"dashboard-widget-secret:inst-1:apiKey","hasSecret":true}}"#,
            "inst-1",
        ).is_ok());
    }
}
