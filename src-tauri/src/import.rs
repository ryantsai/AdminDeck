use serde::{Deserialize, Serialize};
use std::{
    fs,
    net::Ipv4Addr,
    path::Path,
    str::FromStr,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tokio::{net::TcpStream, runtime::Runtime, sync::Semaphore, time::timeout};

const MAX_SCAN_HOSTS: usize = 1024;
const SCAN_CONCURRENCY: usize = 64;
const SCAN_TIMEOUT_MS: u64 = 500;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedConnectionDraft {
    pub name: String,
    pub host: String,
    pub user: String,
    pub port: Option<u16>,
    #[serde(rename = "type")]
    pub connection_type: &'static str,
    pub folder_path: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFilePreview {
    pub format: &'static str,
    pub drafts: Vec<ImportedConnectionDraft>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseImportFileRequest {
    path: String,
}

pub fn parse_import_file(
    request: ParseImportFileRequest,
) -> Result<ImportFilePreview, String> {
    let path = Path::new(&request.path);
    let bytes = fs::read(path).map_err(|err| format!("failed to read file: {err}"))?;
    let text = decode_text(&bytes);
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    parse_import_text(&text, &extension)
}

pub fn parse_import_text(text: &str, extension: &str) -> Result<ImportFilePreview, String> {
    let trimmed = text.trim_start();

    if extension == "rdg" || trimmed.starts_with("<?xml") || trimmed.starts_with("<RDCMan") {
        return Ok(parse_rdcman(text));
    }
    if extension == "mxtsessions"
        || trimmed.starts_with("[Bookmarks")
        || trimmed.starts_with("[bookmarks")
    {
        return Ok(parse_mobaxterm(text));
    }
    if extension == "reg" || trimmed.starts_with("Windows Registry Editor") {
        return Ok(parse_putty_reg(text));
    }
    Ok(parse_csv_or_tsv(text))
}

fn decode_text(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(&bytes[3..]).into_owned();
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return decode_utf16_le(&bytes[2..]);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return decode_utf16_be(&bytes[2..]);
    }
    String::from_utf8_lossy(bytes).into_owned()
}

fn decode_utf16_le(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}

fn decode_utf16_be(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}

// ===== CSV / TSV parser =====================================================

fn parse_csv_or_tsv(text: &str) -> ImportFilePreview {
    let delimiter = detect_delimiter(text);
    let rows = parse_delimited(text, delimiter);
    let mut drafts: Vec<ImportedConnectionDraft> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    if rows.is_empty() {
        return ImportFilePreview {
            format: "csv",
            drafts,
            warnings,
        };
    }

    let header_row = rows
        .first()
        .map(|row| row.iter().map(|cell| cell.trim().to_ascii_lowercase()).collect::<Vec<_>>())
        .unwrap_or_default();

    let header_indexes = header_indexes(&header_row);
    let has_header = !header_indexes.is_empty();

    let data_rows: &[Vec<String>] = if has_header {
        &rows[1..]
    } else {
        &rows[..]
    };

    for (index, row) in data_rows.iter().enumerate() {
        if row.iter().all(|cell| cell.trim().is_empty()) {
            continue;
        }
        let row_number = if has_header { index + 2 } else { index + 1 };
        match draft_from_row(row, &header_indexes, has_header) {
            Ok(Some(draft)) => drafts.push(draft),
            Ok(None) => {}
            Err(message) => warnings.push(format!("Row {row_number}: {message}")),
        }
    }

    ImportFilePreview {
        format: if delimiter == '\t' { "tsv" } else { "csv" },
        drafts,
        warnings,
    }
}

fn detect_delimiter(text: &str) -> char {
    let first_line = text.lines().next().unwrap_or("");
    let candidates = [',', '\t', ';', '|'];
    candidates
        .into_iter()
        .max_by_key(|delimiter| first_line.matches(*delimiter).count())
        .unwrap_or(',')
}

fn parse_delimited(text: &str, delimiter: char) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut current = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = text.chars().peekable();

    while let Some(character) = chars.next() {
        if in_quotes {
            if character == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(character);
            }
        } else {
            match character {
                '"' => in_quotes = true,
                c if c == delimiter => {
                    current.push(std::mem::take(&mut field));
                }
                '\r' => {
                    if chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    current.push(std::mem::take(&mut field));
                    rows.push(std::mem::take(&mut current));
                }
                '\n' => {
                    current.push(std::mem::take(&mut field));
                    rows.push(std::mem::take(&mut current));
                }
                _ => field.push(character),
            }
        }
    }

    if !field.is_empty() || !current.is_empty() {
        current.push(field);
        rows.push(current);
    }

    rows
}

#[derive(Default)]
struct HeaderIndexes {
    name: Option<usize>,
    connection_type: Option<usize>,
    host: Option<usize>,
    port: Option<usize>,
    user: Option<usize>,
    folder: Option<usize>,
}

impl HeaderIndexes {
    fn is_empty(&self) -> bool {
        self.name.is_none()
            && self.connection_type.is_none()
            && self.host.is_none()
            && self.port.is_none()
            && self.user.is_none()
            && self.folder.is_none()
    }
}

fn header_indexes(header: &[String]) -> HeaderIndexes {
    let mut indexes = HeaderIndexes::default();
    for (column, value) in header.iter().enumerate() {
        match value.as_str() {
            "name" | "label" | "title" | "displayname" => indexes.name = Some(column),
            "type" | "kind" | "protocol" => indexes.connection_type = Some(column),
            "host" | "hostname" | "address" | "ip" => indexes.host = Some(column),
            "port" => indexes.port = Some(column),
            "user" | "username" | "login" => indexes.user = Some(column),
            "folder" | "group" | "category" | "path" => indexes.folder = Some(column),
            _ => {}
        }
    }
    indexes
}

fn draft_from_row(
    row: &[String],
    indexes: &HeaderIndexes,
    has_header: bool,
) -> Result<Option<ImportedConnectionDraft>, String> {
    let name_index = indexes.name.unwrap_or(if has_header { usize::MAX } else { 0 });
    let type_index = indexes
        .connection_type
        .unwrap_or(if has_header { usize::MAX } else { 1 });
    let host_index = indexes.host.unwrap_or(if has_header { usize::MAX } else { 2 });
    let port_index = indexes.port.unwrap_or(if has_header { usize::MAX } else { 3 });
    let user_index = indexes.user.unwrap_or(if has_header { usize::MAX } else { 4 });
    let folder_index = indexes
        .folder
        .unwrap_or(if has_header { usize::MAX } else { 5 });

    let host = row
        .get(host_index)
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let raw_type = row
        .get(type_index)
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let connection_type = normalize_connection_type(&raw_type)
        .ok_or_else(|| format!("unknown connection type \"{raw_type}\""))?;

    if host.is_empty() && connection_type != "local" {
        return Err("missing host".to_string());
    }

    let name = row
        .get(name_index)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| host.clone());

    let port = row
        .get(port_index)
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                trimmed.parse::<u16>().ok()
            }
        });

    let user = row
        .get(user_index)
        .map(|value| value.trim().to_string())
        .unwrap_or_default();

    let folder_path = row
        .get(folder_index)
        .map(|value| split_folder_path(value))
        .unwrap_or_default();

    Ok(Some(ImportedConnectionDraft {
        name,
        host,
        user,
        port,
        connection_type,
        folder_path,
    }))
}

fn normalize_connection_type(value: &str) -> Option<&'static str> {
    if value.is_empty() {
        return Some("ssh");
    }
    match value.to_ascii_lowercase().as_str() {
        "ssh" | "sftp" => Some("ssh"),
        "telnet" => Some("telnet"),
        "serial" | "com" => Some("serial"),
        "url" | "web" | "http" | "https" => Some("url"),
        "rdp" | "remotedesktop" | "remote-desktop" | "mstsc" => Some("rdp"),
        "vnc" => Some("vnc"),
        "local" | "shell" => Some("local"),
        _ => None,
    }
}

fn split_folder_path(value: &str) -> Vec<String> {
    value
        .split(|character: char| character == '/' || character == '\\')
        .map(|segment| segment.trim().to_string())
        .filter(|segment| !segment.is_empty())
        .collect()
}

// ===== RDCMan (.rdg) parser =================================================

fn parse_rdcman(text: &str) -> ImportFilePreview {
    let mut drafts: Vec<ImportedConnectionDraft> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    let mut folder_stack: Vec<String> = Vec::new();
    let mut group_pending_name = false;
    let mut server_pending_name = false;
    let mut in_server = false;
    let mut current_server: Option<RdcmanServer> = None;

    for event in iter_xml_events(text) {
        match event {
            XmlEvent::OpenTag { name, self_closing } => {
                let tag = name.to_ascii_lowercase();
                if self_closing {
                    continue;
                }
                if tag == "group" {
                    folder_stack.push(String::new());
                    group_pending_name = true;
                } else if tag == "server" {
                    in_server = true;
                    current_server = Some(RdcmanServer::default());
                } else if tag == "properties" && (group_pending_name || in_server) {
                    if in_server {
                        server_pending_name = true;
                    }
                } else if in_server {
                    if let Some(ref mut server) = current_server {
                        server.current_tag = Some(tag);
                    }
                }
            }
            XmlEvent::Text(text) => {
                if group_pending_name {
                    if let Some(slot) = folder_stack.last_mut() {
                        if slot.is_empty() {
                            *slot = text.trim().to_string();
                        }
                    }
                } else if in_server {
                    if let Some(ref mut server) = current_server {
                        if let Some(tag) = server.current_tag.clone() {
                            server.assign(&tag, text.trim());
                        }
                    }
                }
            }
            XmlEvent::CloseTag { name } => {
                let tag = name.to_ascii_lowercase();
                if tag == "properties" {
                    if group_pending_name {
                        group_pending_name = false;
                    }
                    if server_pending_name {
                        server_pending_name = false;
                    }
                } else if tag == "group" {
                    if !folder_stack.is_empty() {
                        folder_stack.pop();
                    }
                } else if tag == "server" {
                    if let Some(server) = current_server.take() {
                        match server.into_draft(&folder_stack) {
                            Ok(draft) => drafts.push(draft),
                            Err(message) => warnings.push(message),
                        }
                    }
                    in_server = false;
                } else if in_server {
                    if let Some(ref mut server) = current_server {
                        server.current_tag = None;
                    }
                }
            }
        }
    }

    ImportFilePreview {
        format: "rdcman",
        drafts,
        warnings,
    }
}

#[derive(Default)]
struct RdcmanServer {
    current_tag: Option<String>,
    display_name: Option<String>,
    name: Option<String>,
    user_name: Option<String>,
    domain: Option<String>,
    port: Option<u16>,
}

impl RdcmanServer {
    fn assign(&mut self, tag: &str, value: &str) {
        if value.is_empty() {
            return;
        }
        match tag {
            "displayname" => self.display_name = Some(value.to_string()),
            "name" => self.name = Some(value.to_string()),
            "username" => self.user_name = Some(value.to_string()),
            "domain" => self.domain = Some(value.to_string()),
            "port" => {
                if let Ok(parsed) = value.parse::<u16>() {
                    self.port = Some(parsed);
                }
            }
            _ => {}
        }
    }

    fn into_draft(self, folder_stack: &[String]) -> Result<ImportedConnectionDraft, String> {
        let host = self
            .name
            .clone()
            .ok_or_else(|| "RDCMan server missing <name>".to_string())?;
        let display = self
            .display_name
            .clone()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| host.clone());
        let user = match (self.user_name, self.domain) {
            (Some(user), Some(domain)) if !user.is_empty() && !domain.is_empty() => {
                format!("{domain}\\{user}")
            }
            (Some(user), _) => user,
            _ => String::new(),
        };
        let folder_path = folder_stack
            .iter()
            .filter(|segment| !segment.is_empty())
            .cloned()
            .collect();
        Ok(ImportedConnectionDraft {
            name: display,
            host,
            user,
            port: self.port,
            connection_type: "rdp",
            folder_path,
        })
    }
}

// ===== MobaXterm (.mxtsessions) parser ======================================

fn parse_mobaxterm(text: &str) -> ImportFilePreview {
    let mut drafts: Vec<ImportedConnectionDraft> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut folder_path: Vec<String> = Vec::new();

    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            let raw = line[1..line.len() - 1].to_string();
            folder_path = mobaxterm_section_to_folder(&raw);
            continue;
        }
        if line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        let Some(equals_index) = line.find('=') else {
            continue;
        };
        let name = line[..equals_index].trim().to_string();
        let value = &line[equals_index + 1..];
        if name.is_empty() {
            continue;
        }
        let lowered_name = name.to_ascii_lowercase();
        if matches!(
            lowered_name.as_str(),
            "subrep" | "imgnum" | "options" | "version"
        ) {
            continue;
        }
        match parse_mobaxterm_session(&name, value, &folder_path) {
            Ok(Some(draft)) => drafts.push(draft),
            Ok(None) => {}
            Err(message) => warnings.push(format!("\"{name}\": {message}")),
        }
    }

    ImportFilePreview {
        format: "mobaxterm",
        drafts,
        warnings,
    }
}

fn mobaxterm_section_to_folder(raw: &str) -> Vec<String> {
    if raw.eq_ignore_ascii_case("Bookmarks") {
        return Vec::new();
    }
    let cleaned = raw.strip_prefix("Bookmarks_").unwrap_or(raw);
    cleaned
        .split(|character: char| character == '\\' || character == '/')
        .map(|segment| segment.trim().to_string())
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn parse_mobaxterm_session(
    name: &str,
    value: &str,
    folder_path: &[String],
) -> Result<Option<ImportedConnectionDraft>, String> {
    let body = value.trim_start_matches('#');
    let mut parts = body.split('#');
    let type_id_text = parts.next().unwrap_or("").trim();
    let after_type = parts.next().unwrap_or("");

    let connection_type = match type_id_text {
        "0" | "109" => "ssh",
        "1" | "8" => "telnet",
        "91" | "98" => "rdp",
        "96" => "vnc",
        "5" => "local",
        "" => return Ok(None),
        other => return Err(format!("unsupported MobaXterm session type {other}")),
    };

    if connection_type == "local" {
        return Ok(Some(ImportedConnectionDraft {
            name: name.to_string(),
            host: String::new(),
            user: String::new(),
            port: None,
            connection_type,
            folder_path: folder_path.to_vec(),
        }));
    }

    let params: Vec<&str> = after_type.split('%').collect();
    let host = params.get(1).map(|value| value.trim()).unwrap_or("").to_string();
    let port = params
        .get(2)
        .and_then(|value| value.trim().parse::<u16>().ok());
    let user = params
        .get(3)
        .map(|value| value.trim().to_string())
        .unwrap_or_default();

    if host.is_empty() {
        return Err("missing host".to_string());
    }

    Ok(Some(ImportedConnectionDraft {
        name: name.to_string(),
        host,
        user,
        port,
        connection_type,
        folder_path: folder_path.to_vec(),
    }))
}

// ===== PuTTY .reg parser ====================================================

fn parse_putty_reg(text: &str) -> ImportFilePreview {
    let mut drafts: Vec<ImportedConnectionDraft> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    let mut current_session: Option<String> = None;
    let mut current_values: PuttyValues = PuttyValues::default();

    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            finalize_putty_session(
                &mut drafts,
                &mut warnings,
                current_session.take(),
                std::mem::take(&mut current_values),
            );
            current_session = putty_session_name(line);
            continue;
        }
        if current_session.is_none() {
            continue;
        }
        let Some(equals_index) = line.find('=') else {
            continue;
        };
        let key_raw = line[..equals_index].trim();
        let value_raw = line[equals_index + 1..].trim();
        let Some(key) = strip_quotes(key_raw) else {
            continue;
        };
        match key.as_str() {
            "HostName" => {
                if let Some(value) = strip_quotes(value_raw) {
                    current_values.host = Some(value);
                }
            }
            "PortNumber" => {
                if let Some(rest) = value_raw.strip_prefix("dword:") {
                    if let Ok(parsed) = u32::from_str_radix(rest.trim(), 16) {
                        if let Ok(port) = u16::try_from(parsed) {
                            current_values.port = Some(port);
                        }
                    }
                }
            }
            "Protocol" => {
                if let Some(value) = strip_quotes(value_raw) {
                    current_values.protocol = Some(value.to_ascii_lowercase());
                }
            }
            "UserName" => {
                if let Some(value) = strip_quotes(value_raw) {
                    current_values.user = Some(value);
                }
            }
            _ => {}
        }
    }

    finalize_putty_session(
        &mut drafts,
        &mut warnings,
        current_session,
        current_values,
    );

    ImportFilePreview {
        format: "putty",
        drafts,
        warnings,
    }
}

#[derive(Default)]
struct PuttyValues {
    host: Option<String>,
    port: Option<u16>,
    protocol: Option<String>,
    user: Option<String>,
}

fn finalize_putty_session(
    drafts: &mut Vec<ImportedConnectionDraft>,
    warnings: &mut Vec<String>,
    session: Option<String>,
    values: PuttyValues,
) {
    let Some(name) = session else { return };
    let Some(host) = values.host.filter(|value| !value.is_empty()) else {
        warnings.push(format!("PuTTY session \"{name}\" missing HostName"));
        return;
    };
    let connection_type = match values.protocol.as_deref() {
        Some("ssh") | None => "ssh",
        Some("telnet") => "telnet",
        Some("serial") => "serial",
        Some(other) => {
            warnings.push(format!(
                "PuTTY session \"{name}\" uses unsupported protocol \"{other}\""
            ));
            return;
        }
    };
    drafts.push(ImportedConnectionDraft {
        name,
        host,
        user: values.user.unwrap_or_default(),
        port: values.port,
        connection_type,
        folder_path: Vec::new(),
    });
}

fn putty_session_name(section_line: &str) -> Option<String> {
    let inside = &section_line[1..section_line.len() - 1];
    let last_separator = inside.rfind('\\')?;
    let raw_name = &inside[last_separator + 1..];
    let parent = &inside[..last_separator];
    if !parent.contains("PuTTY")
        && !parent.contains("Sessions")
        && !parent.contains("SimonTatham")
    {
        return None;
    }
    if !parent.contains("Sessions") {
        return None;
    }
    Some(decode_registry_name(raw_name))
}

fn decode_registry_name(value: &str) -> String {
    let mut output = String::new();
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(decoded) = u8::from_str_radix(
                std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or(""),
                16,
            ) {
                output.push(decoded as char);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index] as char);
        index += 1;
    }
    output
}

fn strip_quotes(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
        Some(trimmed[1..trimmed.len() - 1].replace("\\\"", "\""))
    } else {
        None
    }
}

// ===== Lightweight XML event scanner ========================================

enum XmlEvent {
    OpenTag { name: String, self_closing: bool },
    CloseTag { name: String },
    Text(String),
}

fn iter_xml_events(text: &str) -> Vec<XmlEvent> {
    let mut events = Vec::new();
    let bytes = text.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'<' {
            let Some(end) = find_byte(bytes, b'>', index + 1) else {
                break;
            };
            let raw = &text[index + 1..end];
            if raw.starts_with('?') || raw.starts_with('!') {
                index = end + 1;
                continue;
            }
            if let Some(stripped) = raw.strip_prefix('/') {
                let name = take_tag_name(stripped);
                events.push(XmlEvent::CloseTag { name });
            } else {
                let self_closing = raw.ends_with('/');
                let body = if self_closing {
                    &raw[..raw.len() - 1]
                } else {
                    raw
                };
                let name = take_tag_name(body);
                events.push(XmlEvent::OpenTag { name, self_closing });
            }
            index = end + 1;
        } else {
            let next = find_byte(bytes, b'<', index).unwrap_or(bytes.len());
            let chunk = &text[index..next];
            let decoded = decode_xml_entities(chunk);
            if !decoded.trim().is_empty() {
                events.push(XmlEvent::Text(decoded));
            }
            index = next;
        }
    }
    events
}

fn take_tag_name(input: &str) -> String {
    input
        .chars()
        .take_while(|character| !character.is_whitespace())
        .collect::<String>()
        .trim_end_matches('/')
        .to_string()
}

fn find_byte(bytes: &[u8], needle: u8, start: usize) -> Option<usize> {
    bytes[start..]
        .iter()
        .position(|byte| *byte == needle)
        .map(|offset| start + offset)
}

fn decode_xml_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

// ===== Network scan =========================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanNetworkRequest {
    scan_id: String,
    target: String,
    ports: Vec<u16>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressEvent {
    scan_id: String,
    completed: usize,
    total: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResultEntry {
    host: String,
    port: u16,
    #[serde(rename = "type")]
    connection_type: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanNetworkResponse {
    results: Vec<ScanResultEntry>,
    scanned_hosts: usize,
}

pub fn scan_network(
    app: AppHandle,
    request: ScanNetworkRequest,
) -> Result<ScanNetworkResponse, String> {
    let hosts = expand_targets(&request.target)?;
    let scanned_hosts = hosts.len();
    let ports = sanitized_ports(&request.ports)?;
    let total = scanned_hosts.saturating_mul(ports.len());

    let runtime = Runtime::new().map_err(|err| format!("failed to start scan runtime: {err}"))?;
    let semaphore = Arc::new(Semaphore::new(SCAN_CONCURRENCY));
    let completed = Arc::new(AtomicUsize::new(0));
    let scan_id = request.scan_id.clone();

    let _ = app.emit(
        "import-scan-progress",
        ScanProgressEvent {
            scan_id: scan_id.clone(),
            completed: 0,
            total,
        },
    );

    let results: Vec<ScanResultEntry> = runtime.block_on(async move {
        let mut handles = Vec::with_capacity(total);
        for host in hosts.iter() {
            for port in ports.iter() {
                let semaphore = semaphore.clone();
                let host = host.clone();
                let port = *port;
                let app = app.clone();
                let scan_id = scan_id.clone();
                let completed = completed.clone();
                handles.push(tokio::spawn(async move {
                    let _permit = match semaphore.acquire_owned().await {
                        Ok(permit) => permit,
                        Err(_) => return None,
                    };
                    let address = format!("{host}:{port}");
                    let connect = TcpStream::connect(address.as_str());
                    let result = match timeout(Duration::from_millis(SCAN_TIMEOUT_MS), connect)
                        .await
                    {
                        Ok(Ok(_)) => Some(ScanResultEntry {
                            host,
                            port,
                            connection_type: connection_type_for_port(port),
                        }),
                        _ => None,
                    };
                    let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
                    let _ = app.emit(
                        "import-scan-progress",
                        ScanProgressEvent {
                            scan_id,
                            completed: done,
                            total,
                        },
                    );
                    result
                }));
            }
        }
        let mut entries = Vec::new();
        for handle in handles {
            if let Ok(Some(entry)) = handle.await {
                entries.push(entry);
            }
        }
        entries
    });

    Ok(ScanNetworkResponse {
        results,
        scanned_hosts,
    })
}

fn sanitized_ports(ports: &[u16]) -> Result<Vec<u16>, String> {
    let mut sanitized: Vec<u16> = ports
        .iter()
        .copied()
        .filter(|port| *port != 0)
        .collect();
    sanitized.sort_unstable();
    sanitized.dedup();
    if sanitized.is_empty() {
        return Err("at least one port must be selected".to_string());
    }
    Ok(sanitized)
}

fn connection_type_for_port(port: u16) -> &'static str {
    match port {
        22 => "ssh",
        23 => "telnet",
        3389 => "rdp",
        5900..=5909 => "vnc",
        _ => "ssh",
    }
}

fn expand_targets(target: &str) -> Result<Vec<String>, String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("target is required".to_string());
    }
    if let Some((cidr_addr, mask)) = trimmed.split_once('/') {
        if let Ok(base) = Ipv4Addr::from_str(cidr_addr.trim()) {
            let mask_bits: u8 = mask
                .trim()
                .parse()
                .map_err(|_| format!("invalid CIDR mask \"{mask}\""))?;
            return expand_cidr(base, mask_bits);
        }
    }
    if let Some((start, end)) = trimmed.split_once('-') {
        let start = start.trim();
        let end = end.trim();
        if let (Ok(start_addr), Ok(end_addr)) =
            (Ipv4Addr::from_str(start), Ipv4Addr::from_str(end))
        {
            return expand_range(start_addr, end_addr);
        }
        if let Ok(start_addr) = Ipv4Addr::from_str(start) {
            if let Ok(end_octet) = end.parse::<u8>() {
                let mut octets = start_addr.octets();
                octets[3] = end_octet;
                let end_addr = Ipv4Addr::from(octets);
                return expand_range(start_addr, end_addr);
            }
        }
    }
    Ok(vec![trimmed.to_string()])
}

fn expand_cidr(base: Ipv4Addr, mask_bits: u8) -> Result<Vec<String>, String> {
    if mask_bits > 32 {
        return Err(format!("CIDR mask /{mask_bits} is invalid"));
    }
    let host_bits = 32 - mask_bits;
    let count: u64 = if host_bits >= 32 {
        return Err("CIDR mask too broad".to_string());
    } else {
        1u64 << host_bits
    };
    if count as usize > MAX_SCAN_HOSTS {
        return Err(format!(
            "CIDR /{mask_bits} expands to {count} hosts (limit is {MAX_SCAN_HOSTS})"
        ));
    }
    let base_int = u32::from(base) & (!0u32 << host_bits);
    let mut hosts = Vec::with_capacity(count as usize);
    for offset in 0..count {
        hosts.push(Ipv4Addr::from(base_int + offset as u32).to_string());
    }
    Ok(hosts)
}

fn expand_range(start: Ipv4Addr, end: Ipv4Addr) -> Result<Vec<String>, String> {
    let start_int = u32::from(start);
    let end_int = u32::from(end);
    if end_int < start_int {
        return Err("range end is before start".to_string());
    }
    let count = (end_int - start_int) as usize + 1;
    if count > MAX_SCAN_HOSTS {
        return Err(format!(
            "range covers {count} hosts (limit is {MAX_SCAN_HOSTS})"
        ));
    }
    let mut hosts = Vec::with_capacity(count);
    for offset in 0..count {
        hosts.push(Ipv4Addr::from(start_int + offset as u32).to_string());
    }
    Ok(hosts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_csv_with_header_row() {
        let text = "name,type,host,port,user\nbastion,ssh,bastion.example.com,2222,admin\nrouter,telnet,10.0.0.1,,operator\n";
        let preview = parse_csv_or_tsv(text);
        assert_eq!(preview.format, "csv");
        assert_eq!(preview.drafts.len(), 2);
        assert_eq!(preview.drafts[0].name, "bastion");
        assert_eq!(preview.drafts[0].host, "bastion.example.com");
        assert_eq!(preview.drafts[0].port, Some(2222));
        assert_eq!(preview.drafts[0].user, "admin");
        assert_eq!(preview.drafts[0].connection_type, "ssh");
        assert_eq!(preview.drafts[1].connection_type, "telnet");
    }

    #[test]
    fn parses_tsv_without_header_using_fixed_order() {
        let text = "host-a\tssh\t192.0.2.10\t22\tubuntu\nhost-b\trdp\t192.0.2.11\t3389\tadmin\n";
        let preview = parse_csv_or_tsv(text);
        assert_eq!(preview.format, "tsv");
        assert_eq!(preview.drafts.len(), 2);
        assert_eq!(preview.drafts[0].host, "192.0.2.10");
        assert_eq!(preview.drafts[1].connection_type, "rdp");
    }

    #[test]
    fn parses_quoted_csv_fields() {
        let text = "name,type,host,port,user\n\"Comma, name\",ssh,\"host with \"\"quote\"\"\",22,me\n";
        let preview = parse_csv_or_tsv(text);
        assert_eq!(preview.drafts.len(), 1);
        assert_eq!(preview.drafts[0].name, "Comma, name");
        assert_eq!(preview.drafts[0].host, "host with \"quote\"");
    }

    #[test]
    fn parses_rdcman_servers_with_group_folder_path() {
        let text = r#"<?xml version="1.0" encoding="utf-8"?>
<RDCMan>
  <file>
    <properties><name>RootFile</name></properties>
    <group>
      <properties><name>Production</name></properties>
      <server>
        <properties>
          <displayName>Web 01</displayName>
          <name>web01.example.com</name>
        </properties>
        <logonCredentials>
          <userName>admin</userName>
          <domain>CORP</domain>
        </logonCredentials>
        <connectionSettings>
          <port>3390</port>
        </connectionSettings>
      </server>
    </group>
  </file>
</RDCMan>"#;
        let preview = parse_rdcman(text);
        assert_eq!(preview.format, "rdcman");
        assert_eq!(preview.drafts.len(), 1);
        let draft = &preview.drafts[0];
        assert_eq!(draft.name, "Web 01");
        assert_eq!(draft.host, "web01.example.com");
        assert_eq!(draft.user, "CORP\\admin");
        assert_eq!(draft.port, Some(3390));
        assert_eq!(draft.connection_type, "rdp");
        assert_eq!(draft.folder_path, vec!["Production".to_string()]);
    }

    #[test]
    fn parses_putty_reg_export() {
        let text = "Windows Registry Editor Version 5.00\n\n[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\My%20Box]\n\"HostName\"=\"box.example.com\"\n\"PortNumber\"=dword:00000016\n\"Protocol\"=\"ssh\"\n\"UserName\"=\"root\"\n";
        let preview = parse_putty_reg(text);
        assert_eq!(preview.format, "putty");
        assert_eq!(preview.drafts.len(), 1);
        let draft = &preview.drafts[0];
        assert_eq!(draft.name, "My Box");
        assert_eq!(draft.host, "box.example.com");
        assert_eq!(draft.port, Some(22));
        assert_eq!(draft.user, "root");
        assert_eq!(draft.connection_type, "ssh");
    }

    #[test]
    fn parses_mobaxterm_ssh_session_with_folder() {
        let text = "[Bookmarks]\nSubRep=Servers\nImgNum=42\n\n[Bookmarks_1]\nSubRep=Servers\\Linux\nImgNum=42\nMy Linux Box=#109#0%linux.example.com%2200%ubuntu%%-1%-1%%%22\n";
        let preview = parse_mobaxterm(text);
        assert_eq!(preview.format, "mobaxterm");
        assert_eq!(preview.drafts.len(), 1);
        let draft = &preview.drafts[0];
        assert_eq!(draft.name, "My Linux Box");
        assert_eq!(draft.host, "linux.example.com");
        assert_eq!(draft.port, Some(2200));
        assert_eq!(draft.user, "ubuntu");
        assert_eq!(draft.connection_type, "ssh");
    }

    #[test]
    fn expands_cidr_within_limit() {
        let hosts = expand_targets("10.0.0.0/30").unwrap();
        assert_eq!(
            hosts,
            vec![
                "10.0.0.0".to_string(),
                "10.0.0.1".to_string(),
                "10.0.0.2".to_string(),
                "10.0.0.3".to_string(),
            ]
        );
    }

    #[test]
    fn expands_dash_range_with_short_end_octet() {
        let hosts = expand_targets("192.168.1.10-12").unwrap();
        assert_eq!(
            hosts,
            vec![
                "192.168.1.10".to_string(),
                "192.168.1.11".to_string(),
                "192.168.1.12".to_string(),
            ]
        );
    }

    #[test]
    fn rejects_too_large_cidr() {
        let err = expand_targets("10.0.0.0/8").unwrap_err();
        assert!(err.contains("limit"));
    }

    #[test]
    fn maps_well_known_ports_to_connection_types() {
        assert_eq!(connection_type_for_port(22), "ssh");
        assert_eq!(connection_type_for_port(23), "telnet");
        assert_eq!(connection_type_for_port(3389), "rdp");
        assert_eq!(connection_type_for_port(5900), "vnc");
    }
}
