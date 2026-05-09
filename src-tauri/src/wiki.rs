use crate::storage::Storage;
use rusqlite::{params, Connection as SqliteConnection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use zip::{write::SimpleFileOptions, ZipWriter};

#[derive(Clone)]
pub struct WikiPaths {
    attachments_root: PathBuf,
}

impl WikiPaths {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            attachments_root: app_data_dir.join("wiki").join("attachments"),
        }
    }

    pub fn page_dir(&self, page_id: &str) -> PathBuf {
        self.attachments_root.join(page_id)
    }

    pub fn root(&self) -> &Path {
        &self.attachments_root
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiPageSummary {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub slug: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiPageNode {
    #[serde(flatten)]
    pub page: WikiPageSummary,
    pub children: Vec<WikiPageNode>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiTree {
    pub roots: Vec<WikiPageNode>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiAttachment {
    pub id: String,
    pub page_id: String,
    pub filename: String,
    pub relative_path: String,
    pub mime: Option<String>,
    pub bytes: i64,
    pub created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiPage {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub slug: String,
    pub body_md: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub connection_ids: Vec<String>,
    pub backlinks: Vec<WikiPageReference>,
    pub tags: Vec<String>,
    pub attachments: Vec<WikiAttachment>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiSearchHit {
    pub id: String,
    pub title: String,
    pub slug: String,
    pub snippet: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiPageReference {
    pub id: String,
    pub title: String,
    pub slug: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiExportInfo {
    pub path: String,
    pub filename: String,
    pub page_count: usize,
    pub attachment_count: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWikiPageRequest {
    pub title: String,
    pub parent_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWikiPageRequest {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body_md: Option<String>,
    #[serde(default)]
    pub connection_ids: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveWikiPageRequest {
    pub id: String,
    #[serde(default)]
    pub new_parent_id: Option<String>,
    pub sort_order: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWikiAttachmentRequest {
    pub page_id: String,
    pub filename: String,
    pub data_base64: String,
    #[serde(default)]
    pub mime: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWikiAttachmentRequest {
    pub attachment_id: String,
}

pub fn list_wiki_tree(storage: &Storage) -> Result<WikiTree, String> {
    storage.with_connection(|connection| {
        let summaries = list_all_summaries(connection)?;
        Ok(WikiTree {
            roots: build_tree(summaries, None),
        })
    })
}

pub fn create_wiki_page(
    storage: &Storage,
    request: CreateWikiPageRequest,
) -> Result<WikiPage, String> {
    let title = request.title.trim().to_string();
    if title.is_empty() {
        return Err("page title is required".to_string());
    }
    let id = make_wiki_id();
    let slug = slugify(&title);
    let parent_id = request.parent_id.filter(|value| !value.is_empty());

    storage.with_connection_mut(move |connection| {
        if let Some(parent) = parent_id.as_deref() {
            ensure_page_exists(connection, parent)?;
        }
        let next_sort = next_sort_order(connection, parent_id.as_deref())?;
        connection
            .execute(
                "INSERT INTO wiki_pages (id, parent_id, title, slug, body_md, sort_order)
                 VALUES (?1, ?2, ?3, ?4, '', ?5)",
                params![id, parent_id, title, slug, next_sort],
            )
            .map_err(to_wiki_error)?;
        load_wiki_page(connection, &id)
    })
}

pub fn update_wiki_page(
    storage: &Storage,
    request: UpdateWikiPageRequest,
) -> Result<WikiPage, String> {
    let id = request.id;
    let title = request.title.map(|value| value.trim().to_string());
    let body_md = request.body_md;
    let connection_ids = request.connection_ids;

    storage.with_connection_mut(move |connection| {
        ensure_page_exists(connection, &id)?;
        let transaction = connection.transaction().map_err(to_wiki_error)?;
        if let Some(title) = title.as_ref() {
            if title.is_empty() {
                return Err("page title cannot be empty".to_string());
            }
            let slug = slugify(title);
            transaction
                .execute(
                    "UPDATE wiki_pages
                     SET title = ?1, slug = ?2, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?3",
                    params![title, slug, id],
                )
                .map_err(to_wiki_error)?;
        }
        if let Some(body) = body_md.as_ref() {
            transaction
                .execute(
                    "UPDATE wiki_pages SET body_md = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
                    params![body, id],
                )
                .map_err(to_wiki_error)?;
            sync_page_links_in_tx(&transaction, &id, body)?;
        }
        if let Some(connection_ids) = connection_ids.as_ref() {
            sync_page_connections_in_tx(&transaction, &id, connection_ids)?;
        }
        transaction.commit().map_err(to_wiki_error)?;
        load_wiki_page(connection, &id)
    })
}

pub fn delete_wiki_page(
    storage: &Storage,
    paths: &WikiPaths,
    page_id: String,
) -> Result<(), String> {
    storage.with_connection(|connection| {
        ensure_page_exists(connection, &page_id)?;
        connection
            .execute("DELETE FROM wiki_pages WHERE id = ?1", params![page_id])
            .map_err(to_wiki_error)?;
        Ok(())
    })?;
    let page_dir = paths.page_dir(&page_id);
    if page_dir.exists() {
        fs::remove_dir_all(&page_dir).map_err(|error| {
            format!(
                "failed to delete attachments directory {}: {error}",
                page_dir.display()
            )
        })?;
    }
    Ok(())
}

pub fn move_wiki_page(storage: &Storage, request: MoveWikiPageRequest) -> Result<WikiTree, String> {
    let id = request.id;
    let new_parent = request.new_parent_id.filter(|value| !value.is_empty());
    let sort_order = request.sort_order;

    storage.with_connection(move |connection| {
        ensure_page_exists(connection, &id)?;
        if let Some(parent) = new_parent.as_deref() {
            if parent == id {
                return Err("a page cannot be its own parent".to_string());
            }
            ensure_page_exists(connection, parent)?;
            ensure_no_descendant_cycle(connection, &id, parent)?;
        }
        connection
            .execute(
                "UPDATE wiki_pages SET parent_id = ?1, sort_order = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
                params![new_parent, sort_order, id],
            )
            .map_err(to_wiki_error)?;
        let summaries = list_all_summaries(connection)?;
        Ok(WikiTree {
            roots: build_tree(summaries, None),
        })
    })
}

pub fn get_wiki_page(storage: &Storage, page_id: String) -> Result<WikiPage, String> {
    storage.with_connection(|connection| load_wiki_page(connection, &page_id))
}

pub fn search_wiki(
    storage: &Storage,
    query: String,
    limit: u32,
) -> Result<Vec<WikiSearchHit>, String> {
    let trimmed = query.trim().to_string();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let cap = limit.clamp(1, 100) as i64;
    if let Some(tag) = trimmed
        .strip_prefix('#')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let tag_pattern = format!("%#{}%", escape_like(tag));
        return storage.with_connection(|connection| {
            let mut statement = connection
                .prepare(
                    "SELECT id, title, slug, body_md
                     FROM wiki_pages
                     WHERE body_md LIKE ?1 ESCAPE '\\'
                     ORDER BY updated_at DESC
                     LIMIT ?2",
                )
                .map_err(to_wiki_error)?;
            let rows = statement
                .query_map(params![tag_pattern, cap], |row| {
                    let body: String = row.get(3)?;
                    Ok(WikiSearchHit {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        slug: row.get(2)?,
                        snippet: tag_snippet(&body, tag),
                    })
                })
                .map_err(to_wiki_error)?;
            let mut hits = Vec::new();
            for row in rows {
                hits.push(row.map_err(to_wiki_error)?);
            }
            Ok(hits)
        });
    }

    let fts_query = sanitize_fts_query(&trimmed);

    storage.with_connection(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT p.id, p.title, p.slug,
                    snippet(wiki_pages_fts, 1, '<<', '>>', '…', 24) AS snippet
                 FROM wiki_pages_fts
                 JOIN wiki_pages p ON p.rowid = wiki_pages_fts.rowid
                 WHERE wiki_pages_fts MATCH ?1
                 ORDER BY bm25(wiki_pages_fts)
                 LIMIT ?2",
            )
            .map_err(to_wiki_error)?;
        let rows = statement
            .query_map(params![fts_query, cap], |row| {
                Ok(WikiSearchHit {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    slug: row.get(2)?,
                    snippet: row.get(3)?,
                })
            })
            .map_err(to_wiki_error)?;
        let mut hits = Vec::new();
        for row in rows {
            hits.push(row.map_err(to_wiki_error)?);
        }
        Ok(hits)
    })
}

pub fn list_wiki_pages_for_connection(
    storage: &Storage,
    connection_id: String,
) -> Result<Vec<WikiPageReference>, String> {
    storage.with_connection(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT p.id, p.title, p.slug
                 FROM wiki_page_connections c
                 JOIN wiki_pages p ON p.id = c.page_id
                 WHERE c.connection_id = ?1
                 ORDER BY p.title COLLATE NOCASE",
            )
            .map_err(to_wiki_error)?;
        let rows = statement
            .query_map(params![connection_id], |row| {
                Ok(WikiPageReference {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    slug: row.get(2)?,
                })
            })
            .map_err(to_wiki_error)?;
        let mut references = Vec::new();
        for row in rows {
            references.push(row.map_err(to_wiki_error)?);
        }
        Ok(references)
    })
}

pub fn save_wiki_attachment(
    storage: &Storage,
    paths: &WikiPaths,
    request: SaveWikiAttachmentRequest,
) -> Result<WikiAttachment, String> {
    let SaveWikiAttachmentRequest {
        page_id,
        filename,
        data_base64,
        mime,
    } = request;
    let safe_name = sanitize_filename(&filename);
    if safe_name.is_empty() {
        return Err("attachment filename is required".to_string());
    }
    let bytes = base64_decode(&data_base64)?;

    storage.with_connection(|connection| ensure_page_exists(connection, &page_id))?;

    let page_dir = paths.page_dir(&page_id);
    fs::create_dir_all(&page_dir).map_err(|error| {
        format!(
            "failed to create attachments directory {}: {error}",
            page_dir.display()
        )
    })?;

    let attachment_id = make_wiki_id();
    let stored_name = format!("{attachment_id}-{safe_name}");
    let stored_path = page_dir.join(&stored_name);
    fs::write(&stored_path, &bytes).map_err(|error| {
        format!(
            "failed to write attachment {}: {error}",
            stored_path.display()
        )
    })?;

    let relative_path = format!("attachments/{page_id}/{stored_name}");
    let bytes_len = bytes.len() as i64;

    let attachment_id_clone = attachment_id.clone();
    let page_id_clone = page_id.clone();
    let safe_name_clone = safe_name.clone();
    let mime_clone = mime.clone();
    let relative_clone = relative_path.clone();

    storage.with_connection(move |connection| {
        connection
            .execute(
                "INSERT INTO wiki_attachments (id, page_id, filename, relative_path, mime, bytes)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    attachment_id_clone,
                    page_id_clone,
                    safe_name_clone,
                    relative_clone,
                    mime_clone,
                    bytes_len
                ],
            )
            .map_err(to_wiki_error)?;
        Ok(())
    })?;

    storage.with_connection(|connection| load_attachment(connection, &attachment_id))
}

pub fn delete_wiki_attachment(
    storage: &Storage,
    paths: &WikiPaths,
    request: DeleteWikiAttachmentRequest,
) -> Result<(), String> {
    let attachment_id = request.attachment_id;
    let attachment =
        storage.with_connection(|connection| load_attachment(connection, &attachment_id))?;
    let stored_name = attachment
        .relative_path
        .rsplit('/')
        .next()
        .unwrap_or(&attachment.filename)
        .to_string();
    let path = paths.page_dir(&attachment.page_id).join(stored_name);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("failed to remove attachment {}: {error}", path.display()))?;
    }
    storage.with_connection(|connection| {
        connection
            .execute(
                "DELETE FROM wiki_attachments WHERE id = ?1",
                params![attachment_id],
            )
            .map_err(to_wiki_error)?;
        Ok(())
    })
}

pub fn export_wiki_zip(
    storage: &Storage,
    paths: &WikiPaths,
    dest_path: PathBuf,
) -> Result<WikiExportInfo, String> {
    let summaries = storage.with_connection(list_all_summaries)?;
    let page_count = summaries.len();

    let zip_file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&dest_path)
        .map_err(|error| {
            format!(
                "failed to create export file {}: {error}",
                dest_path.display()
            )
        })?;
    let mut zip = ZipWriter::new(zip_file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut id_to_path = std::collections::HashMap::<String, String>::new();
    for summary in &summaries {
        let folder = build_export_folder(&summaries, summary);
        let file_path = if folder.is_empty() {
            format!("{}.md", &summary.slug)
        } else {
            format!("{}/{}.md", folder, &summary.slug)
        };
        id_to_path.insert(summary.id.clone(), file_path);
    }

    let mut attachment_count = 0usize;
    let mut manifest_pages = Vec::new();

    for summary in &summaries {
        let page = storage.with_connection(|connection| load_wiki_page(connection, &summary.id))?;
        let file_path = id_to_path
            .get(&summary.id)
            .cloned()
            .unwrap_or_else(|| format!("{}.md", &summary.slug));
        let header = format!(
            "---\nid: {}\ntitle: {}\nslug: {}\nupdatedAt: {}\n---\n\n",
            page.id,
            page.title.replace('\n', " "),
            page.slug,
            page.updated_at,
        );
        let mut body = String::with_capacity(header.len() + page.body_md.len());
        body.push_str(&header);
        body.push_str(&page.body_md);

        zip.start_file(&file_path, options)
            .map_err(|error| format!("failed to add page {file_path} to export: {error}"))?;
        zip.write_all(body.as_bytes())
            .map_err(|error| format!("failed to write page {file_path} to export: {error}"))?;

        for attachment in &page.attachments {
            let source = paths
                .page_dir(&page.id)
                .join(attachment_stored_name(attachment));
            if !source.exists() {
                continue;
            }
            let mut file = File::open(&source).map_err(|error| {
                format!("failed to read attachment {}: {error}", source.display())
            })?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer).map_err(|error| {
                format!("failed to read attachment {}: {error}", source.display())
            })?;
            let entry_name = attachment.relative_path.clone();
            zip.start_file(&entry_name, options).map_err(|error| {
                format!("failed to add attachment {entry_name} to export: {error}")
            })?;
            zip.write_all(&buffer).map_err(|error| {
                format!("failed to write attachment {entry_name} to export: {error}")
            })?;
            attachment_count += 1;
        }

        manifest_pages.push(serde_json::json!({
            "id": page.id,
            "title": page.title,
            "slug": page.slug,
            "parentId": page.parent_id,
            "filePath": file_path,
            "connectionIds": page.connection_ids,
            "attachments": page
                .attachments
                .iter()
                .map(|attachment| {
                    serde_json::json!({
                        "id": attachment.id,
                        "filename": attachment.filename,
                        "relativePath": attachment.relative_path,
                        "mime": attachment.mime,
                        "bytes": attachment.bytes,
                    })
                })
                .collect::<Vec<_>>(),
        }));
    }

    let manifest = serde_json::json!({
        "product": "KKTerm",
        "format": "kkterm-wiki-export",
        "version": 1,
        "createdAt": OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_else(|_| "unknown".to_string()),
        "pages": manifest_pages,
    });
    zip.start_file("manifest.json", options)
        .map_err(|error| format!("failed to add export manifest: {error}"))?;
    zip.write_all(manifest.to_string().as_bytes())
        .map_err(|error| format!("failed to write export manifest: {error}"))?;
    zip.finish()
        .map_err(|error| format!("failed to finish wiki export: {error}"))?;

    let filename = dest_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("kkterm-wiki.zip")
        .to_string();
    Ok(WikiExportInfo {
        path: dest_path.display().to_string(),
        filename,
        page_count,
        attachment_count,
    })
}

fn list_all_summaries(connection: &SqliteConnection) -> Result<Vec<WikiPageSummary>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, parent_id, title, slug, sort_order, created_at, updated_at
             FROM wiki_pages
             ORDER BY parent_id IS NOT NULL, parent_id, sort_order, title COLLATE NOCASE",
        )
        .map_err(to_wiki_error)?;
    let rows = statement
        .query_map([], summary_from_row)
        .map_err(to_wiki_error)?;
    let mut summaries = Vec::new();
    for row in rows {
        summaries.push(row.map_err(to_wiki_error)?);
    }
    Ok(summaries)
}

fn build_tree(summaries: Vec<WikiPageSummary>, parent: Option<&str>) -> Vec<WikiPageNode> {
    let parent_key = parent.map(|value| value.to_string());
    let (matches, others): (Vec<_>, Vec<_>) = summaries
        .into_iter()
        .partition(|page| page.parent_id == parent_key);
    let mut nodes = Vec::with_capacity(matches.len());
    for summary in matches {
        let id = summary.id.clone();
        nodes.push(WikiPageNode {
            page: summary,
            children: build_tree(others.clone(), Some(&id)),
        });
    }
    nodes.sort_by(|a, b| a.page.sort_order.cmp(&b.page.sort_order));
    nodes
}

fn build_export_folder(summaries: &[WikiPageSummary], summary: &WikiPageSummary) -> String {
    let mut parts = Vec::new();
    let mut current = summary.parent_id.clone();
    while let Some(parent_id) = current {
        match summaries.iter().find(|page| page.id == parent_id) {
            Some(parent) => {
                parts.push(parent.slug.clone());
                current = parent.parent_id.clone();
            }
            None => break,
        }
    }
    parts.reverse();
    parts.join("/")
}

fn load_wiki_page(connection: &SqliteConnection, page_id: &str) -> Result<WikiPage, String> {
    let row = connection
        .query_row(
            "SELECT id, parent_id, title, slug, body_md, sort_order, created_at, updated_at
             FROM wiki_pages WHERE id = ?1",
            params![page_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .optional()
        .map_err(to_wiki_error)?
        .ok_or_else(|| format!("wiki page {page_id} not found"))?;

    let connection_ids = list_connection_ids(connection, page_id)?;
    let backlinks = list_backlinks(connection, page_id)?;
    let tags = extract_wiki_tags(&row.4);
    let attachments = list_attachments(connection, page_id)?;

    Ok(WikiPage {
        id: row.0,
        parent_id: row.1,
        title: row.2,
        slug: row.3,
        body_md: row.4,
        sort_order: row.5,
        created_at: row.6,
        updated_at: row.7,
        connection_ids,
        backlinks,
        tags,
        attachments,
    })
}

fn load_attachment(
    connection: &SqliteConnection,
    attachment_id: &str,
) -> Result<WikiAttachment, String> {
    connection
        .query_row(
            "SELECT id, page_id, filename, relative_path, mime, bytes, created_at
             FROM wiki_attachments WHERE id = ?1",
            params![attachment_id],
            attachment_from_row,
        )
        .optional()
        .map_err(to_wiki_error)?
        .ok_or_else(|| format!("attachment {attachment_id} not found"))
}

fn list_attachments(
    connection: &SqliteConnection,
    page_id: &str,
) -> Result<Vec<WikiAttachment>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, page_id, filename, relative_path, mime, bytes, created_at
             FROM wiki_attachments
             WHERE page_id = ?1
             ORDER BY created_at",
        )
        .map_err(to_wiki_error)?;
    let rows = statement
        .query_map(params![page_id], attachment_from_row)
        .map_err(to_wiki_error)?;
    let mut attachments = Vec::new();
    for row in rows {
        attachments.push(row.map_err(to_wiki_error)?);
    }
    Ok(attachments)
}

fn list_backlinks(
    connection: &SqliteConnection,
    page_id: &str,
) -> Result<Vec<WikiPageReference>, String> {
    let mut statement = connection
        .prepare(
            "SELECT p.id, p.title, p.slug
             FROM wiki_page_links l
             JOIN wiki_pages p ON p.id = l.page_id
             WHERE l.target_page_id = ?1
             ORDER BY p.title COLLATE NOCASE",
        )
        .map_err(to_wiki_error)?;
    let rows = statement
        .query_map(params![page_id], |row| {
            Ok(WikiPageReference {
                id: row.get(0)?,
                title: row.get(1)?,
                slug: row.get(2)?,
            })
        })
        .map_err(to_wiki_error)?;
    let mut backlinks = Vec::new();
    for row in rows {
        backlinks.push(row.map_err(to_wiki_error)?);
    }
    Ok(backlinks)
}

fn list_connection_ids(
    connection: &SqliteConnection,
    page_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT connection_id FROM wiki_page_connections
             WHERE page_id = ?1 ORDER BY connection_id",
        )
        .map_err(to_wiki_error)?;
    let rows = statement
        .query_map(params![page_id], |row| row.get::<_, String>(0))
        .map_err(to_wiki_error)?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(to_wiki_error)?);
    }
    Ok(ids)
}

fn ensure_page_exists(connection: &SqliteConnection, page_id: &str) -> Result<(), String> {
    let exists: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM wiki_pages WHERE id = ?1",
            params![page_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_wiki_error)?;
    if exists.is_none() {
        return Err(format!("wiki page {page_id} not found"));
    }
    Ok(())
}

fn ensure_no_descendant_cycle(
    connection: &SqliteConnection,
    page_id: &str,
    candidate_parent: &str,
) -> Result<(), String> {
    // Walk upward from candidate_parent. If we hit page_id we'd create a cycle.
    let mut cursor: Option<String> = Some(candidate_parent.to_string());
    while let Some(current) = cursor {
        if current == page_id {
            return Err("moving the page would create a cycle".to_string());
        }
        let parent: Option<Option<String>> = connection
            .query_row(
                "SELECT parent_id FROM wiki_pages WHERE id = ?1",
                params![current],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(to_wiki_error)?;
        cursor = parent.flatten();
    }
    Ok(())
}

fn next_sort_order(connection: &SqliteConnection, parent_id: Option<&str>) -> Result<i64, String> {
    let next: Option<i64> = match parent_id {
        Some(parent) => connection
            .query_row(
                "SELECT MAX(sort_order) FROM wiki_pages WHERE parent_id = ?1",
                params![parent],
                |row| row.get::<_, Option<i64>>(0),
            )
            .map_err(to_wiki_error)?,
        None => connection
            .query_row(
                "SELECT MAX(sort_order) FROM wiki_pages WHERE parent_id IS NULL",
                [],
                |row| row.get::<_, Option<i64>>(0),
            )
            .map_err(to_wiki_error)?,
    };
    Ok(next.map(|value| value + 1).unwrap_or(0))
}

fn sync_page_links_in_tx(
    transaction: &rusqlite::Transaction<'_>,
    page_id: &str,
    body: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM wiki_page_links WHERE page_id = ?1",
            params![page_id],
        )
        .map_err(to_wiki_error)?;
    let targets = extract_wiki_link_targets(body);
    for target in targets {
        let Some(target_id) = resolve_wiki_link_target(transaction, &target)? else {
            continue;
        };
        if target_id == page_id {
            continue;
        }
        transaction
            .execute(
                "INSERT OR IGNORE INTO wiki_page_links (page_id, target_page_id) VALUES (?1, ?2)",
                params![page_id, target_id],
            )
            .map_err(to_wiki_error)?;
    }
    Ok(())
}

fn sync_page_connections_in_tx(
    transaction: &rusqlite::Transaction<'_>,
    page_id: &str,
    connection_ids: &[String],
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM wiki_page_connections WHERE page_id = ?1",
            params![page_id],
        )
        .map_err(to_wiki_error)?;
    for connection_id in connection_ids {
        let exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM connections WHERE id = ?1",
                params![connection_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(to_wiki_error)?;
        if exists.is_none() {
            continue;
        }
        transaction
            .execute(
                "INSERT OR IGNORE INTO wiki_page_connections (page_id, connection_id) VALUES (?1, ?2)",
                params![page_id, connection_id],
            )
            .map_err(to_wiki_error)?;
    }
    Ok(())
}

fn extract_wiki_tags(body: &str) -> Vec<String> {
    let mut tags = Vec::new();
    for word in body.split(|character: char| character.is_whitespace()) {
        let candidate = word
            .trim_start_matches(|character: char| {
                !character.is_ascii_alphanumeric() && character != '#'
            })
            .trim_end_matches(|character: char| {
                !character.is_ascii_alphanumeric() && character != '-' && character != '_'
            });
        let Some(tag) = candidate.strip_prefix('#') else {
            continue;
        };
        if tag.is_empty() {
            continue;
        }
        if tag.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        }) && !tags.iter().any(|existing| existing == tag)
        {
            tags.push(tag.to_string());
        }
    }
    tags.sort_by_key(|tag| tag.to_ascii_lowercase());
    tags
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn tag_snippet(body: &str, tag: &str) -> String {
    let needle = format!("#{}", tag);
    let lower_body = body.to_ascii_lowercase();
    let lower_needle = needle.to_ascii_lowercase();
    let Some(index) = lower_body.find(&lower_needle) else {
        return body.chars().take(96).collect();
    };
    let match_end = index + needle.len();
    let start = floor_char_boundary(body, index.saturating_sub(48));
    let end = ceil_char_boundary(body, (match_end + 48).min(body.len()));
    let mut snippet = String::new();
    if start > 0 {
        snippet.push('…');
    }
    snippet.push_str(&body[start..index]);
    snippet.push_str("<<");
    snippet.push_str(&body[index..match_end]);
    snippet.push_str(">>");
    snippet.push_str(&body[match_end..end]);
    if end < body.len() {
        snippet.push('…');
    }
    snippet
}

fn floor_char_boundary(value: &str, mut index: usize) -> usize {
    while index > 0 && !value.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char_boundary(value: &str, mut index: usize) -> usize {
    while index < value.len() && !value.is_char_boundary(index) {
        index += 1;
    }
    index
}

fn extract_wiki_link_targets(body: &str) -> Vec<String> {
    // Recognizes [[Page Name]], [[page-id]], [[slug]], and [[target|label]] forms.
    // Triple-bracket tokens are reserved for Connection links and must not become page links.
    let mut results = Vec::new();
    for (start, _) in body.match_indices("[[") {
        if start > 0 && body[..start].ends_with('[') {
            continue;
        }
        let after_open = start + 2;
        if let Some(relative_end) = body[after_open..].find("]]") {
            let after_close = after_open + relative_end + 2;
            if body[after_close..].starts_with(']') {
                continue;
            }
            let inner = &body[after_open..after_open + relative_end];
            let target = inner.split('|').next().unwrap_or("").trim();
            if !target.is_empty() {
                results.push(target.to_string());
            }
        }
    }
    results
}

fn resolve_wiki_link_target(
    transaction: &rusqlite::Transaction<'_>,
    target: &str,
) -> Result<Option<String>, String> {
    if is_safe_id(target) {
        let by_id = transaction
            .query_row(
                "SELECT id FROM wiki_pages WHERE id = ?1",
                params![target],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(to_wiki_error)?;
        if by_id.is_some() {
            return Ok(by_id);
        }
    }

    let slug = slugify(target);
    if !slug.is_empty() {
        let by_slug = transaction
            .query_row(
                "SELECT id FROM wiki_pages WHERE slug = ?1 ORDER BY updated_at DESC LIMIT 1",
                params![slug],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(to_wiki_error)?;
        if by_slug.is_some() {
            return Ok(by_slug);
        }
    }

    transaction
        .query_row(
            "SELECT id FROM wiki_pages WHERE title = ?1 COLLATE NOCASE ORDER BY updated_at DESC LIMIT 1",
            params![target],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_wiki_error)
}

fn is_safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn summary_from_row(row: &Row<'_>) -> rusqlite::Result<WikiPageSummary> {
    Ok(WikiPageSummary {
        id: row.get(0)?,
        parent_id: row.get(1)?,
        title: row.get(2)?,
        slug: row.get(3)?,
        sort_order: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn attachment_from_row(row: &Row<'_>) -> rusqlite::Result<WikiAttachment> {
    Ok(WikiAttachment {
        id: row.get(0)?,
        page_id: row.get(1)?,
        filename: row.get(2)?,
        relative_path: row.get(3)?,
        mime: row.get(4)?,
        bytes: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn slugify(value: &str) -> String {
    let mut slug = String::with_capacity(value.len());
    let mut last_was_hyphen = true;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_was_hyphen = false;
        } else if !last_was_hyphen {
            slug.push('-');
            last_was_hyphen = true;
        }
    }
    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        format!("page-{}", current_unix_millis())
    } else {
        trimmed
    }
}

fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .filter_map(|character| {
            if character.is_ascii_alphanumeric()
                || character == '.'
                || character == '-'
                || character == '_'
            {
                Some(character)
            } else if character == ' ' {
                Some('_')
            } else {
                None
            }
        })
        .collect()
}

fn make_wiki_id() -> String {
    format!("wiki-{:x}-{:x}", current_unix_millis(), random_suffix())
}

fn current_unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn random_suffix() -> u64 {
    // Cheap nonce derived from the high-resolution timer plus pid. Wiki ids
    // do not need cryptographic strength, only uniqueness inside one DB.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.subsec_nanos() as u64)
        .unwrap_or_default();
    let pid = std::process::id() as u64;
    nanos.wrapping_mul(2_654_435_761).wrapping_add(pid)
}

fn attachment_stored_name(attachment: &WikiAttachment) -> String {
    attachment
        .relative_path
        .rsplit('/')
        .next()
        .unwrap_or(&attachment.filename)
        .to_string()
}

fn sanitize_fts_query(value: &str) -> String {
    // Wrap each whitespace-separated token in double quotes so SQLite FTS5 does
    // not interpret stray characters (`-`, `:`, `*`) as operators.
    value
        .split_whitespace()
        .filter_map(|token| {
            let cleaned: String = token
                .chars()
                .filter(|character| {
                    character.is_alphanumeric() || matches!(character, '_' | '-' | '.' | '@' | '#')
                })
                .collect();
            if cleaned.is_empty() {
                None
            } else {
                Some(format!("\"{cleaned}\"*"))
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn base64_decode(value: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD
        .decode(value.trim())
        .map_err(|error| format!("attachment payload is not valid base64: {error}"))
}

fn to_wiki_error(error: rusqlite::Error) -> String {
    format!("wiki storage error: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wiki_link_extraction_ignores_triple_bracket_connection_links() {
        let targets = extract_wiki_link_targets(
            "See [[Runbook]] and [[[Production Bastion]]] plus [[Incident Notes|notes]].",
        );

        assert_eq!(targets, vec!["Runbook", "Incident Notes"]);
    }
}
