import {
  Download,
  Eye,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Search,
  Split,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Connection, WikiPage, WikiPageNode, WikiSearchHit, WikiTree } from "../types";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { WikiEditor } from "./WikiEditor";
import { WikiPreview } from "./WikiPreview";
import { WikiTree as WikiTreeView } from "./WikiTree";
import {
  buildPageLookup,
  flattenWikiTree,
} from "./wikiMarkdown";
import {
  createWikiPage,
  deleteWikiAttachment,
  deleteWikiPage,
  exportWikiToZip,
  fetchWikiPage,
  fetchWikiTree,
  fileToBase64,
  saveWikiAttachment,
  searchWiki,
  updateWikiPage,
} from "./wikiCommands";

type ViewMode = "edit" | "preview" | "split";

interface WikiWorkspaceProps {
  active: boolean;
  initialPageId?: string | null;
  onOpenConnection?: (connectionId: string) => void;
}

const SAVE_DEBOUNCE_MS = 800;
const SEARCH_DEBOUNCE_MS = 250;

export function WikiWorkspace({ active, initialPageId, onOpenConnection }: WikiWorkspaceProps) {
  const { t } = useTranslation();
  const [tree, setTree] = useState<WikiTree>({ roots: [] });
  const [selectedId, setSelectedId] = useState<string | null>(initialPageId ?? null);
  const [page, setPage] = useState<WikiPage | null>(null);
  const [pageDraft, setPageDraft] = useState<{ title: string; body: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<WikiSearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allConnections = useGlobalConnections();

  const flatPages = useMemo(
    () => flattenWikiTree(tree.roots as ReadonlyArray<WikiPageNode> as never),
    [tree],
  );

  const pageLookup = useMemo(() => buildPageLookup(flatPages), [flatPages]);

  const connectionsById = useMemo(() => {
    const map = new Map<string, Connection>();
    for (const connection of allConnections) {
      map.set(connection.id, connection);
    }
    return map;
  }, [allConnections]);

  const previewContext = useMemo(
    () => ({ pages: pageLookup, connectionsById }),
    [pageLookup, connectionsById],
  );

  const refreshTree = useCallback(async () => {
    if (!isTauriRuntime()) {
      return;
    }
    try {
      const next = await fetchWikiTree();
      setTree(next);
    } catch (cause) {
      setError(t("wiki.loadFailed", { error: formatError(cause) }));
    }
  }, [t]);

  useEffect(() => {
    if (active) {
      void refreshTree();
    }
  }, [active, refreshTree]);

  useEffect(() => {
    if (!selectedId) {
      setPage(null);
      setPageDraft(null);
      setDirty(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await fetchWikiPage(selectedId);
        if (cancelled) {
          return;
        }
        setPage(loaded);
        setPageDraft({ title: loaded.title, body: loaded.bodyMd });
        setDirty(false);
      } catch (cause) {
        if (!cancelled) {
          setError(t("wiki.loadFailed", { error: formatError(cause) }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, t]);

  const performSave = useCallback(
    async (override?: { title?: string; body?: string; connectionIds?: string[] }) => {
      if (!page || !pageDraft) {
        return;
      }
      const title = override?.title ?? pageDraft.title;
      const body = override?.body ?? pageDraft.body;
      setSaving(true);
      try {
        const updated = await updateWikiPage({
          id: page.id,
          title,
          bodyMd: body,
          connectionIds: override?.connectionIds ?? page.connectionIds,
        });
        setPage(updated);
        setPageDraft({ title: updated.title, body: updated.bodyMd });
        setDirty(false);
        await refreshTree();
      } catch (cause) {
        setError(t("wiki.saveFailed", { error: formatError(cause) }));
      } finally {
        setSaving(false);
      }
    },
    [page, pageDraft, refreshTree, t],
  );

  useEffect(() => {
    if (!dirty) {
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      void performSave();
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [dirty, performSave]);

  const handleCreate = useCallback(
    async (parentId: string | null) => {
      try {
        const created = await createWikiPage({
          title: t("wiki.untitled"),
          parentId,
        });
        await refreshTree();
        setSelectedId(created.id);
      } catch (cause) {
        setError(t("wiki.createFailed", { error: formatError(cause) }));
      }
    },
    [refreshTree, t],
  );

  const handleDelete = useCallback((pageId: string) => {
    setPendingDeleteId(pageId);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) {
      return;
    }
    const pageId = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      await deleteWikiPage(pageId);
      if (selectedId === pageId) {
        setSelectedId(null);
      }
      await refreshTree();
    } catch (cause) {
      setError(t("wiki.deleteFailed", { error: formatError(cause) }));
    }
  }, [pendingDeleteId, refreshTree, selectedId, t]);

  const handleExport = useCallback(async () => {
    try {
      const result = await exportWikiToZip();
      if (result) {
        setInfo(t("wiki.exportSuccess", { path: result.path }));
      }
    } catch (cause) {
      setError(t("wiki.exportFailed", { error: formatError(cause) }));
    }
  }, [t]);

  const handleAttach = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !page) {
        return;
      }
      for (const file of Array.from(files)) {
        try {
          const dataBase64 = await fileToBase64(file);
          await saveWikiAttachment({
            pageId: page.id,
            filename: file.name,
            dataBase64,
            mime: file.type || undefined,
          });
        } catch (cause) {
          setError(t("wiki.attachFailed", { error: formatError(cause) }));
        }
      }
      try {
        const reloaded = await fetchWikiPage(page.id);
        setPage(reloaded);
      } catch (cause) {
        setError(t("wiki.loadFailed", { error: formatError(cause) }));
      }
    },
    [page, t],
  );

  const handleAttachmentRemove = useCallback(
    async (attachmentId: string) => {
      if (!page) {
        return;
      }
      try {
        await deleteWikiAttachment(attachmentId);
        const reloaded = await fetchWikiPage(page.id);
        setPage(reloaded);
      } catch (cause) {
        setError(t("wiki.loadFailed", { error: formatError(cause) }));
      }
    },
    [page, t],
  );

  const handleConnectionsChange = useCallback(
    async (nextIds: string[]) => {
      if (!page) {
        return;
      }
      await performSave({ connectionIds: nextIds });
    },
    [page, performSave],
  );

  useEffect(() => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }
    if (!searchQuery.trim()) {
      setSearchHits([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const hits = await searchWiki(searchQuery, 30);
          setSearchHits(hits);
        } catch (cause) {
          setError(t("wiki.searchFailed", { error: formatError(cause) }));
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
      }
    };
  }, [searchQuery, t]);

  const handleEditorChange = useCallback(
    (next: string) => {
      setPageDraft((current) => {
        if (!current) {
          return current;
        }
        if (current.body === next) {
          return current;
        }
        return { ...current, body: next };
      });
      setDirty(true);
    },
    [],
  );

  const handleTitleChange = useCallback(
    (next: string) => {
      setPageDraft((current) => {
        if (!current) {
          return current;
        }
        if (current.title === next) {
          return current;
        }
        return { ...current, title: next };
      });
      setDirty(true);
    },
    [],
  );

  const handleOpenWikiLink = useCallback((pageId: string) => {
    setSelectedId(pageId);
  }, []);

  return (
    <div
      className="wiki-workspace relative flex h-full min-h-0 flex-1"
      role="region"
      aria-label={t("wiki.title")}
    >
      <aside className="wiki-tree-pane flex w-64 min-w-[200px] shrink-0 flex-col border-r border-black/10">
        <div className="wiki-search relative px-2 pt-2">
          <Search size={12} className="absolute left-4 top-[14px] opacity-60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("wiki.searchPlaceholder")}
            className="w-full rounded border border-black/10 bg-white/40 py-1 pl-6 pr-2 text-xs"
            aria-label={t("wiki.searchPlaceholder")}
          />
        </div>
        {searchQuery.trim() ? (
          <SearchResultsList
            hits={searchHits}
            onSelect={(id) => setSelectedId(id)}
          />
        ) : (
          <div className="wiki-tree-scroll min-h-0 flex-1 overflow-y-auto py-1">
            <WikiTreeView
              roots={tree.roots}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCreateChild={handleCreate}
              onDelete={handleDelete}
            />
          </div>
        )}
      </aside>
      {pendingDeleteId ? (
        <DeletePageDialog
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
      <section className="wiki-detail flex min-w-0 flex-1 flex-col">
        <div className="wiki-toolbar flex items-center gap-2 border-b border-black/10 px-3 py-2 text-sm">
          <span className="wiki-status flex items-center gap-1 text-xs opacity-70">
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            {dirty ? t("wiki.unsaved") : page ? t("wiki.saved") : null}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ViewModeToggle current={viewMode} onChange={setViewMode} />
            <button
              type="button"
              className="wiki-toolbar-button inline-flex items-center gap-1 rounded border border-black/10 px-2 py-1 text-xs hover:bg-black/5"
              onClick={() => void handleExport()}
            >
              <Download size={12} />
              {t("wiki.export")}
            </button>
          </div>
        </div>
        {error ? (
          <Banner kind="error" message={error} onDismiss={() => setError(null)} />
        ) : null}
        {info ? (
          <Banner kind="info" message={info} onDismiss={() => setInfo(null)} />
        ) : null}
        {!page || !pageDraft ? (
          <div className="wiki-empty flex flex-1 items-center justify-center text-sm opacity-70">
            {t("wiki.noSelection")}
          </div>
        ) : (
          <div className="wiki-editor-frame flex min-h-0 flex-1 flex-col">
            <div className="wiki-title-row flex items-center gap-2 px-3 pt-3">
              <FileText size={14} className="opacity-60" />
              <input
                type="text"
                value={pageDraft.title}
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder={t("wiki.pageTitlePlaceholder")}
                className="w-full bg-transparent text-lg font-semibold focus:outline-none"
                aria-label={t("wiki.pageTitlePlaceholder")}
              />
            </div>
            <div className="wiki-edit-area flex min-h-0 flex-1">
              {viewMode !== "preview" ? (
                <div className="wiki-edit-pane flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
                  <WikiEditor
                    value={pageDraft.body}
                    onChange={handleEditorChange}
                    ariaLabel={t("wiki.editor")}
                    placeholderText={t("wiki.bodyPlaceholder")}
                  />
                </div>
              ) : null}
              {viewMode !== "edit" ? (
                <div className="wiki-preview-pane flex min-h-0 flex-1 flex-col overflow-y-auto border-l border-black/10 px-4 py-3">
                  <WikiPreview
                    body={pageDraft.body}
                    context={previewContext}
                    onOpenWikiLink={handleOpenWikiLink}
                    onOpenConnection={onOpenConnection}
                  />
                </div>
              ) : null}
            </div>
            <PageSidebar
              page={page}
              allConnections={allConnections}
              onAttach={handleAttach}
              onAttachmentRemove={handleAttachmentRemove}
              onConnectionsChange={handleConnectionsChange}
              onOpenBacklink={handleOpenWikiLink}
              onSelectTag={(tag) => setSearchQuery(`#${tag}`)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function DeletePageDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="wiki-delete-dialog absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-delete-dialog-title"
        className="w-full max-w-sm rounded-lg border border-black/10 bg-[var(--chrome)] p-4 shadow-xl"
      >
        <h3 id="wiki-delete-dialog-title" className="text-sm font-semibold">
          {t("wiki.deletePageTitle")}
        </h3>
        <p className="mt-2 text-sm opacity-80">{t("wiki.deleteConfirm")}</p>
        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button
            type="button"
            className="rounded border border-black/10 px-3 py-1 hover:bg-black/5"
            onClick={onCancel}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700"
            onClick={onConfirm}
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewModeToggle({
  current,
  onChange,
}: {
  current: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  const { t } = useTranslation();
  const options: Array<{ key: ViewMode; icon: ReactNode; label: string }> = [
    { key: "edit", icon: <Pencil size={12} />, label: t("wiki.editorMode") },
    { key: "split", icon: <Split size={12} />, label: t("wiki.splitMode") },
    { key: "preview", icon: <Eye size={12} />, label: t("wiki.previewMode") },
  ];
  return (
    <div className="wiki-viewmode inline-flex rounded border border-black/10 text-xs">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`wiki-viewmode-button inline-flex items-center gap-1 px-2 py-1 ${
            current === option.key ? "bg-black/10 font-medium" : "hover:bg-black/5"
          }`}
          onClick={() => onChange(option.key)}
          aria-pressed={current === option.key}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function SearchResultsList({
  hits,
  onSelect,
}: {
  hits: WikiSearchHit[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (hits.length === 0) {
    return (
      <div className="wiki-search-empty p-3 text-xs opacity-70">
        {t("wiki.searchEmpty")}
      </div>
    );
  }
  return (
    <ul className="wiki-search-results min-h-0 flex-1 overflow-y-auto p-2 text-xs">
      {hits.map((hit) => (
        <li key={hit.id}>
          <button
            type="button"
            className="wiki-search-hit w-full rounded p-2 text-left hover:bg-black/5"
            onClick={() => onSelect(hit.id)}
          >
            <div className="wiki-search-hit-title font-medium">{hit.title}</div>
            <div
              className="wiki-search-hit-snippet mt-1 opacity-70"
              dangerouslySetInnerHTML={{ __html: highlightSnippet(hit.snippet) }}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

function highlightSnippet(snippet: string): string {
  const escaped = snippet
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/&lt;&lt;/g, "<mark>").replace(/&gt;&gt;/g, "</mark>");
}

function PageSidebar({
  page,
  allConnections,
  onAttach,
  onAttachmentRemove,
  onConnectionsChange,
  onOpenBacklink,
  onSelectTag,
}: {
  page: WikiPage;
  allConnections: Connection[];
  onAttach: (files: FileList | null) => void;
  onAttachmentRemove: (attachmentId: string) => void;
  onConnectionsChange: (nextIds: string[]) => void;
  onOpenBacklink: (pageId: string) => void;
  onSelectTag: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="wiki-page-sidebar grid grid-cols-4 gap-3 border-t border-black/10 p-3 text-xs">
      <section className="wiki-attachments">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">{t("wiki.attachments")}</h4>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-black/10 px-2 py-0.5 hover:bg-black/5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={11} />
            {t("wiki.attach")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => onAttach(event.target.files)}
          />
        </div>
        <ul className="mt-2 space-y-1">
          {page.attachments.length === 0 ? (
            <li className="opacity-60">—</li>
          ) : (
            page.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center justify-between rounded border border-black/5 px-2 py-1"
              >
                <span className="truncate" title={attachment.filename}>
                  {attachment.filename}
                </span>
                <button
                  type="button"
                  className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-red-500/15"
                  onClick={() => onAttachmentRemove(attachment.id)}
                  aria-label={t("wiki.attachmentRemove")}
                  title={t("wiki.attachmentRemove")}
                >
                  <X size={11} />
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
      <section className="wiki-page-backlinks">
        <h4 className="font-medium">{t("wiki.backlinks")}</h4>
        {page.backlinks.length === 0 ? (
          <p className="mt-2 opacity-60">{t("wiki.noBacklinks")}</p>
        ) : (
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {page.backlinks.map((backlink) => (
              <li key={backlink.id}>
                <button
                  type="button"
                  className="w-full truncate rounded border border-black/5 px-2 py-1 text-left hover:bg-black/5"
                  onClick={() => onOpenBacklink(backlink.id)}
                  title={backlink.title}
                >
                  {backlink.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="wiki-page-tags">
        <h4 className="font-medium">{t("wiki.tags")}</h4>
        {page.tags.length === 0 ? (
          <p className="mt-2 opacity-60">{t("wiki.noTags")}</p>
        ) : (
          <div className="mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {page.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="rounded-full border border-black/10 px-2 py-0.5 hover:bg-black/5"
                onClick={() => onSelectTag(tag)}
                title={t("wiki.filterByTag", { tag })}
                aria-label={t("wiki.filterByTag", { tag })}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="wiki-page-connections">
        <h4 className="font-medium">{t("wiki.connectionsLabel")}</h4>
        {allConnections.length === 0 ? (
          <p className="mt-2 opacity-60">{t("wiki.noConnections")}</p>
        ) : (
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {allConnections.map((connection) => {
              const checked = page.connectionIds.includes(connection.id);
              return (
                <li key={connection.id} className="flex items-center gap-2">
                  <input
                    id={`wiki-conn-${connection.id}`}
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const nextIds = event.target.checked
                        ? Array.from(new Set([...page.connectionIds, connection.id]))
                        : page.connectionIds.filter((id) => id !== connection.id);
                      onConnectionsChange(nextIds);
                    }}
                  />
                  <label
                    htmlFor={`wiki-conn-${connection.id}`}
                    className="truncate"
                    title={`${connection.name} (${connection.type})`}
                  >
                    {connection.name}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Banner({
  kind,
  message,
  onDismiss,
}: {
  kind: "error" | "info";
  message: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={`wiki-banner flex items-center gap-2 px-3 py-1 text-xs ${
        kind === "error"
          ? "wiki-banner-error bg-red-500/10 text-red-700"
          : "wiki-banner-info bg-blue-500/10 text-blue-700"
      }`}
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-black/10"
        onClick={onDismiss}
        aria-label={t("common.close")}
      >
        <X size={11} />
      </button>
    </div>
  );
}

function useGlobalConnections(): Connection[] {
  const [connections, setConnections] = useState<Connection[]>([]);
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const tree = await invokeCommand("list_connection_tree");
        if (!cancelled) {
          setConnections(flattenConnectionTree(tree));
        }
      } catch {
        // Connections list is optional for the wiki workspace.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return connections;
}

interface ConnectionTreeLike {
  connections: Connection[];
  folders: Array<{
    connections: Connection[];
    folders: ConnectionTreeLike["folders"];
  }>;
}

function flattenConnectionTree(tree: ConnectionTreeLike): Connection[] {
  const result: Connection[] = [...tree.connections];
  for (const folder of tree.folders) {
    result.push(...flattenConnectionTree(folder));
  }
  return result;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

