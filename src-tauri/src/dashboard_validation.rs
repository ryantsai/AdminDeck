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
pub const MAX_SCRIPT_SOURCE_BYTES: usize = 64 * 1024;
pub const MAX_CONTENT_BODY_BYTES: usize = 32 * 1024;
pub const MAX_SETTINGS_SCHEMA_BYTES: usize = 16 * 1024;
pub const MAX_SETTINGS_VALUES_BYTES: usize = 32 * 1024;
pub const MAX_SETTINGS_FIELDS: usize = 20;
pub const MAX_SELECT_OPTIONS: usize = 40;
pub const MIN_POLL_SECONDS: u64 = 1;
pub const MAX_WIDGET_LIBRARIES: usize = 8;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptBody {
    pub source: String,
    pub permissions: ScriptPermissions,
    #[serde(default)]
    pub html_shim: Option<String>,
    #[serde(default)]
    pub libraries: Option<Vec<String>>,
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
    }
    Ok(parsed)
}

#[allow(dead_code)]
pub fn validate_script_body_json(json: &str) -> Result<ScriptBody, ValidationError> {
    validate_script_body_json_detailed(json).map_err(|(kind, _)| kind)
}

/// Same as `validate_script_body_json`, but also surfaces a human-readable
/// detail string explaining which check failed. The detail is passed back to
/// agents/clients so they can correct widget source without re-guessing.
pub fn validate_script_body_json_detailed(
    json: &str,
) -> Result<ScriptBody, (ValidationError, Option<String>)> {
    if json.len() > MAX_SCRIPT_SOURCE_BYTES + 4096 {
        return Err((
            ValidationError::ScriptTooLarge,
            Some(format!(
                "script bodyJson is {} bytes; envelope limit is {} bytes",
                json.len(),
                MAX_SCRIPT_SOURCE_BYTES + 4096
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
    // Harden 1: validate script source for dangerous patterns. The returned
    // `code_only` view has strings and comments blanked out, which we reuse
    // below so a library declared `matter` but only mentioned in a comment
    // is still rejected as unused.
    let code_only = validate_script_source_inner(&parsed.source)
        .map_err(|detail| (ValidationError::InvalidScriptSource, Some(detail)))?;
    validate_script_dom_mounts(&parsed.source, parsed.html_shim.as_deref())
        .map_err(|detail| (ValidationError::InvalidScriptSource, Some(detail)))?;
    if let Some(libs) = &parsed.libraries {
        // Harden 4: validate that every listed library is referenced in the source.
        // A library that loads but is never called wastes ~80KB+ and adds GC pressure.
        // Word-boundary matching is required so short globals like `L` (Leaflet)
        // don't pass through `null`, `let`, `class`, etc.
        for entry in libs {
            if let Some(&(_, global)) = KNOWN_LIBRARY_GLOBALS
                .iter()
                .find(|&&(key, _)| key == entry.as_str())
            {
                if !source_references_identifier(&code_only, global) {
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

/// Harden 1: validate script source for dangerous patterns that can freeze the app.
///
/// This is a heuristic textual check, not a real JS parser. It runs a single
/// pass that strips strings, template literals, and comments to a "code-only"
/// view, then runs three rejections against that view:
///   * delimiter imbalance (parens / braces / brackets)
///   * `while(true)`, `while(1)`, `for(;;)` infinite loops
///   * null bytes
///
/// Known limitations (kept intentional so the check stays cheap):
///   * Regex literals (`/foo(/`) are not tracked. A widget using a regex with
///     unbalanced delimiters in source order can trigger a false reject.
///   * `${expr}` interpolation inside template literals is treated as part of
///     the string, so a `while(true)` hidden there would not be caught. The
///     active-widget cap and visibility throttle still apply, so the impact
///     is bounded.
/// Runs the pattern checks and returns the "code-only" view of `source` so
/// that downstream checks (such as the unused-library cross-reference in
/// [`validate_script_body_json_detailed`]) can reuse it without re-scanning.
fn validate_script_source_inner(source: &str) -> Result<String, String> {
    if source.contains('\0') {
        return Err("script source contains null bytes".to_string());
    }
    let code_only = strip_strings_and_comments(source)?;
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
    Ok(code_only)
}

/// Returns the source with strings, template literals, and comments replaced by
/// spaces (same character count, so byte offsets are preserved for any future
/// diagnostic use). Errors when paren / brace / bracket delimiters are
/// unbalanced *outside* string and comment regions.
fn strip_strings_and_comments(source: &str) -> Result<String, String> {
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
    let mut parens: i32 = 0;
    let mut braces: i32 = 0;
    let mut brackets: i32 = 0;
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
                '(' => {
                    parens += 1;
                    out.push(ch);
                }
                ')' => {
                    parens -= 1;
                    out.push(ch);
                }
                '{' => {
                    braces += 1;
                    out.push(ch);
                }
                '}' => {
                    braces -= 1;
                    out.push(ch);
                }
                '[' => {
                    brackets += 1;
                    out.push(ch);
                }
                ']' => {
                    brackets -= 1;
                    out.push(ch);
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
        if parens < 0 || braces < 0 || brackets < 0 {
            return Err(format!(
                "unbalanced delimiter: parens={parens} braces={braces} brackets={brackets}"
            ));
        }
        i += 1;
    }
    if parens != 0 || braces != 0 || brackets != 0 {
        return Err(format!(
            "unbalanced delimiter at end: parens={parens} braces={braces} brackets={brackets}"
        ));
    }
    Ok(out)
}

/// Returns true if `identifier` appears in `source` as a whole-word token
/// (preceded and followed by non-identifier characters or string boundaries).
/// Used by the unused-library check so short globals like `L` (Leaflet) do
/// not match unrelated identifiers like `null` or `let`.
fn source_references_identifier(source: &str, identifier: &str) -> bool {
    if identifier.is_empty() {
        return false;
    }
    let bytes = source.as_bytes();
    let pat = identifier.as_bytes();
    let n = pat.len();
    let is_ident_byte = |b: u8| b.is_ascii_alphanumeric() || b == b'_' || b == b'$';
    let mut i = 0;
    while i + n <= bytes.len() {
        if &bytes[i..i + n] == pat {
            let before_ok = i == 0 || !is_ident_byte(bytes[i - 1]);
            let after_ok = i + n == bytes.len() || !is_ident_byte(bytes[i + n]);
            if before_ok && after_ok {
                return true;
            }
        }
        i += 1;
    }
    false
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
    fn script_source_rejects_unbalanced_delimiters() {
        assert!(validate_script_source_inner("function f() { return 1;").is_err());
        assert!(validate_script_source_inner("const a = [1, 2, 3").is_err());
        assert!(validate_script_source_inner("const a = (1 + 2;").is_err());
    }

    #[test]
    fn script_source_allows_braces_inside_template_literals() {
        // We treat template literals as opaque strings — `${expr}` braces inside
        // do not affect the outer delimiter balance.
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
    fn unused_library_accepts_matter_called() {
        let json = r#"{"source":"const engine = Matter.Engine.create(); Matter.Runner.run(engine);","libraries":["matter"],"permissions":{"network":false}}"#;
        assert!(validate_script_body_json(json).is_ok());
    }

    #[test]
    fn unused_library_accepts_mermaid_called() {
        let json = r#"{"source":"mermaid.initialize({startOnLoad:true}); mermaid.run();","libraries":["mermaid"],"permissions":{"network":false}}"#;
        assert!(validate_script_body_json(json).is_ok());
    }

    // --- delimiter-stripping internals --------------------------------------

    #[test]
    fn strip_treats_template_literal_as_opaque() {
        let out = strip_strings_and_comments("const s = `a {b} c`; foo();").unwrap();
        // Inside the backticks the `{` and `}` should not affect balance and
        // should be blanked out.
        assert!(!out.contains('{'));
        assert!(!out.contains('}'));
    }

    #[test]
    fn source_references_identifier_is_word_boundary() {
        assert!(super::source_references_identifier("L.map()", "L"));
        assert!(!super::source_references_identifier("const null = 0;", "L"));
        assert!(!super::source_references_identifier("console.log(x);", "L"));
        assert!(super::source_references_identifier(
            "THREE.Scene()",
            "THREE"
        ));
        assert!(!super::source_references_identifier("THREEMore", "THREE"));
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
