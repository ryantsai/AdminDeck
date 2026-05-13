import {
  BookMarked,
  ChevronLeft,
  FileUp,
  Loader2,
  Network,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "../i18n/config";
import { listen } from "@tauri-apps/api/event";
import {
  invokeCommand,
  selectConnectionImportFile,
  type BookmarkImportSource,
  type BookmarkTreeNode,
  type ImportFilePreview,
  type ScanProgressEvent,
  type ScanResultEntry,
} from "../lib/tauri";
import { defaultPortForConnectionType, uniqueRuntimeId } from "./utils";
import { flattenFolders } from "./treeUtils";
import type {
  ConnectionTree,
  ConnectionType,
  CreateConnectionRequest,
  SshSettings,
} from "../types";

type ImportDialogProps = {
  tree: ConnectionTree;
  sshSettings: SshSettings;
  onClose: () => void;
  onImported: (result: {
    count: number;
    source: "file" | "scan" | "bookmarks";
  }) => void;
};

type Stage = "menu" | "file" | "scan" | "bookmarks";

type Candidate = {
  id: string;
  selected: boolean;
  name: string;
  host: string;
  user: string;
  password: string;
  url?: string;
  port?: number;
  type: ConnectionType;
  folderPath: string[];
};

const DEFAULT_PORTS: Array<{ port: number; labelKey: string }> = [
  { port: 22, labelKey: "connections.import.portSsh" },
  { port: 23, labelKey: "connections.import.portTelnet" },
  { port: 3389, labelKey: "connections.import.portRdp" },
];

export function ImportDialog({ tree, sshSettings, onClose, onImported }: ImportDialogProps) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>("menu");
  const [error, setError] = useState("");

  return (
    <div className="dialog-backdrop connection-dialog-backdrop" role="presentation">
      <div className="connection-dialog import-dialog">
        <header className="connection-dialog-header compact">
          <div className="import-dialog-header-text">
            {stage !== "menu" ? (
              <button
                className="import-dialog-back"
                onClick={() => {
                  setStage("menu");
                  setError("");
                }}
                type="button"
                aria-label={t("connections.import.back")}
              >
                <ChevronLeft size={16} />
              </button>
            ) : null}
            <div>
              <p className="panel-label">
                {stage === "menu"
                  ? t("connections.import.title")
                  : stage === "file"
                    ? t("connections.import.fromFileTitle")
                    : stage === "scan"
                      ? t("connections.import.scanTitle")
                      : t("connections.import.bookmarksTitle")}
              </p>
            </div>
          </div>
        </header>

        {error ? <p className="form-error">{error}</p> : null}

        {stage === "menu" ? (
          <>
            <ImportMenu onPick={(next) => setStage(next)} />
            <div className="dialog-actions import-menu-actions">
              <button className="toolbar-button" onClick={onClose} type="button">
                {t("connections.cancel")}
              </button>
            </div>
          </>
        ) : null}
        {stage === "file" ? (
          <FileImportPanel
            tree={tree}
            sshSettings={sshSettings}
            onError={setError}
            onClearError={() => setError("")}
            onClose={onClose}
            onImported={onImported}
          />
        ) : null}
        {stage === "scan" ? (
          <ScanPanel
            tree={tree}
            sshSettings={sshSettings}
            onError={setError}
            onClearError={() => setError("")}
            onClose={onClose}
            onImported={onImported}
          />
        ) : null}
        {stage === "bookmarks" ? (
          <BookmarksPanel
            tree={tree}
            sshSettings={sshSettings}
            onError={setError}
            onClearError={() => setError("")}
            onClose={onClose}
            onImported={onImported}
          />
        ) : null}
      </div>
    </div>
  );
}

function ImportMenu({
  onPick,
}: {
  onPick: (stage: "file" | "scan" | "bookmarks") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="import-menu">
      <button
        className="import-menu-tile"
        onClick={() => onPick("file")}
        type="button"
      >
        <span className="import-menu-icon">
          <FileUp size={20} />
        </span>
        <span className="import-menu-copy">
          <strong>{t("connections.import.fromFileTitle")}</strong>
          <small>{t("connections.import.fromFileSubtitle")}</small>
        </span>
      </button>
      <button
        className="import-menu-tile"
        onClick={() => onPick("scan")}
        type="button"
      >
        <span className="import-menu-icon">
          <Network size={20} />
        </span>
        <span className="import-menu-copy">
          <strong>{t("connections.import.scanTitle")}</strong>
          <small>{t("connections.import.scanSubtitle")}</small>
        </span>
      </button>
      <button
        className="import-menu-tile"
        onClick={() => onPick("bookmarks")}
        type="button"
      >
        <span className="import-menu-icon">
          <BookMarked size={20} />
        </span>
        <span className="import-menu-copy">
          <strong>{t("connections.import.bookmarksTitle")}</strong>
          <small>{t("connections.import.bookmarksSubtitle")}</small>
        </span>
      </button>
    </div>
  );
}

function FileImportPanel({
  tree,
  sshSettings,
  onError,
  onClearError,
  onClose,
  onImported,
}: {
  tree: ConnectionTree;
  sshSettings: SshSettings;
  onError: (message: string) => void;
  onClearError: () => void;
  onClose: () => void;
  onImported: (result: {
    count: number;
    source: "file" | "scan" | "bookmarks";
  }) => void;
}) {
  const { t } = useTranslation();
  const [filePath, setFilePath] = useState("");
  const [preview, setPreview] = useState<ImportFilePreview | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleBrowse() {
    onClearError();
    try {
      const path = await selectConnectionImportFile();
      if (!path) {
        return;
      }
      setFilePath(path);
      setLoading(true);
      const result = await invokeCommand("parse_import_file", { request: { path } });
      setPreview(result);
      setCandidates(
        result.drafts.map((draft, index) => ({
          id: `${index}`,
          selected: true,
          name: draft.name,
          host: draft.host,
          user: draft.user,
          password: "",
          url: draft.url,
          port: draft.port,
          type: draft.type,
          folderPath: draft.folderPath,
        })),
      );
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure));
      setPreview(null);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="import-panel">
      <div className="import-file-row">
        <button
          className="approve-button"
          disabled={loading}
          onClick={() => void handleBrowse()}
          type="button"
        >
          {loading ? (
            <Loader2 className="spin" size={14} />
          ) : (
            <FileUp size={14} />
          )}
          <span>{t("connections.import.chooseFile")}</span>
        </button>
        <input
          className="import-file-path"
          placeholder={t("connections.import.noFileChosen")}
          readOnly
          type="text"
          value={filePath}
        />
      </div>

      <p className="import-hint">{t("connections.import.fileFormatsHint")}</p>

      {preview ? (
        <ImportPreviewSection
          candidates={candidates}
          format={preview.format}
          onCancel={onClose}
          onCandidatesChange={setCandidates}
          onError={onError}
          onImported={onImported}
          sshSettings={sshSettings}
          tree={tree}
          warnings={preview.warnings}
        />
      ) : (
        <div className="dialog-actions">
          <button className="toolbar-button" onClick={onClose} type="button">
            {t("connections.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}

function ScanPanel({
  tree,
  sshSettings,
  onError,
  onClearError,
  onClose,
  onImported,
}: {
  tree: ConnectionTree;
  sshSettings: SshSettings;
  onError: (message: string) => void;
  onClearError: () => void;
  onClose: () => void;
  onImported: (result: {
    count: number;
    source: "file" | "scan" | "bookmarks";
  }) => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState("");
  const [enabledPorts, setEnabledPorts] = useState<Set<number>>(
    () => new Set(DEFAULT_PORTS.map((entry) => entry.port)),
  );
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgressEvent | null>(null);
  const [results, setResults] = useState<ScanResultEntry[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const scanIdRef = useRef("");

  useEffect(() => {
    let dispose: (() => void) | null = null;
    let disposed = false;

    void listen<ScanProgressEvent>("import-scan-progress", (event) => {
      if (event.payload.scanId !== scanIdRef.current) {
        return;
      }
      setProgress(event.payload);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        dispose = unlisten;
      }
    });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, []);

  function togglePort(port: number) {
    setEnabledPorts((current) => {
      const next = new Set(current);
      if (next.has(port)) {
        next.delete(port);
      } else {
        next.add(port);
      }
      return next;
    });
  }

  async function handleStartScan() {
    onClearError();
    if (!target.trim()) {
      onError(t("connections.import.scanTargetRequired"));
      return;
    }
    if (enabledPorts.size === 0) {
      onError(t("connections.import.scanPortRequired"));
      return;
    }
    const scanId = uniqueRuntimeId("scan");
    scanIdRef.current = scanId;
    setScanning(true);
    setProgress({ scanId, completed: 0, total: 0 });
    setResults(null);
    setCandidates([]);
    try {
      const response = await invokeCommand("scan_network_for_connections", {
        request: {
          scanId,
          target: target.trim(),
          ports: Array.from(enabledPorts).sort((left, right) => left - right),
        },
      });
      setResults(response.results);
      setCandidates(
        response.results.map((entry, index) => ({
          id: `${index}`,
          selected: true,
          name: entry.host,
          host: entry.host,
          user: "",
          password: "",
          port: entry.port,
          type: entry.type,
          folderPath: [],
        })),
      );
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setScanning(false);
    }
  }

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div className="import-panel">
      <label className="import-field">
        <span>{t("connections.import.scanTargetLabel")}</span>
        <input
          autoFocus
          onChange={(event) => setTarget(event.currentTarget.value)}
          placeholder={t("connections.import.scanTargetPlaceholder")}
          type="text"
          value={target}
        />
      </label>
      <p className="import-hint">{t("connections.import.scanTargetHint")}</p>

      <fieldset className="import-port-list">
        <legend>{t("connections.import.scanPortsLabel")}</legend>
        {DEFAULT_PORTS.map((entry) => (
          <label className="import-port-toggle" key={entry.port}>
            <input
              checked={enabledPorts.has(entry.port)}
              onChange={() => togglePort(entry.port)}
              type="checkbox"
            />
            <span>{`${t(entry.labelKey)} (${entry.port})`}</span>
          </label>
        ))}
      </fieldset>

      <div className="import-scan-actions">
        <button
          className="approve-button"
          disabled={scanning}
          onClick={() => void handleStartScan()}
          type="button"
        >
          {scanning ? (
            <Loader2 className="spin" size={14} />
          ) : (
            <Network size={14} />
          )}
          <span>
            {scanning
              ? t("connections.import.scanRunning")
              : t("connections.import.scanStart")}
          </span>
        </button>
        {scanning || (progress && progress.total > 0) ? (
          <div className="import-progress" aria-live="polite">
            <div
              className="import-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
            <span className="import-progress-text">
              {progress
                ? `${progress.completed}/${progress.total} (${progressPercent}%)`
                : ""}
            </span>
          </div>
        ) : null}
      </div>

      {results && results.length === 0 ? (
        <p className="import-empty">{t("connections.import.scanNoResults")}</p>
      ) : null}

      {results && results.length > 0 ? (
        <ImportPreviewSection
          candidates={candidates}
          format="scan"
          onCancel={onClose}
          onCandidatesChange={setCandidates}
          onError={onError}
          onImported={onImported}
          sshSettings={sshSettings}
          tree={tree}
          warnings={[]}
        />
      ) : null}
    </div>
  );
}


function BookmarksPanel({
  tree,
  sshSettings,
  onError,
  onClearError,
  onClose,
  onImported,
}: {
  tree: ConnectionTree;
  sshSettings: SshSettings;
  onError: (message: string) => void;
  onClearError: () => void;
  onClose: () => void;
  onImported: (result: {
    count: number;
    source: "file" | "scan" | "bookmarks";
  }) => void;
}) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<BookmarkImportSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<ImportFilePreview | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onClearError();
    setLoading(true);
    invokeCommand("list_browser_bookmark_sources", undefined)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setSources(response.sources);
        const first =
          response.sources.find((source) => source.root.children.length > 0) ??
          response.sources[0];
        if (first) {
          setSelectedSourceId(first.id);
        }
      })
      .catch((failure) => {
        if (!cancelled) {
          onError(failure instanceof Error ? failure.message : String(failure));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
  const selectedCount = selectedNodeIds.size;

  function handleSourceChange(sourceId: string) {
    setSelectedSourceId(sourceId);
    setSelectedNodeIds(new Set());
    setPreview(null);
    setCandidates([]);
    onClearError();
  }

  function toggleNode(node: BookmarkTreeNode, checked: boolean) {
    setSelectedNodeIds((current) => {
      const next = new Set(current);
      collectBookmarkNodeIds(node).forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
    setPreview(null);
    setCandidates([]);
  }

  async function handlePreview() {
    if (!selectedSource) {
      onError(t("connections.import.bookmarksSourceRequired"));
      return;
    }
    if (selectedNodeIds.size === 0) {
      onError(t("connections.import.bookmarksSelectionRequired"));
      return;
    }
    onClearError();
    setPreviewing(true);
    try {
      const result = await invokeCommand("preview_browser_bookmark_import", {
        request: {
          sourceId: selectedSource.id,
          selectedNodeIds: Array.from(selectedNodeIds),
        },
      });
      setPreview(result);
      setCandidates(
        result.drafts.map((draft, index) => ({
          id: `${index}`,
          selected: true,
          name: draft.name,
          host: draft.host,
          user: draft.user,
          password: "",
          url: draft.url,
          port: draft.port,
          type: draft.type,
          folderPath: draft.folderPath,
        })),
      );
      if (result.drafts.length === 0) {
        onError(t("connections.import.bookmarksNoImportable"));
      }
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure));
      setPreview(null);
      setCandidates([]);
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="import-panel">
      {loading ? (
        <p className="import-empty">
          <Loader2 className="spin" size={14} />
          <span>{t("connections.import.bookmarksLoading")}</span>
        </p>
      ) : null}

      {!loading && sources.length === 0 ? (
        <p className="import-empty">{t("connections.import.bookmarksNoSources")}</p>
      ) : null}

      {!loading && sources.length > 0 ? (
        <>
          <label className="import-field">
            <span>{t("connections.import.bookmarksSourceLabel")}</span>
            <select
              onChange={(event) => handleSourceChange(event.currentTarget.value)}
              value={selectedSourceId}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          {selectedSource ? (
            <p className="import-hint">
              {t("connections.import.bookmarksSourcePath", {
                path: selectedSource.path,
              })}
            </p>
          ) : null}

          {selectedSource && selectedSource.warnings.length > 0 ? (
            <div className="import-warnings" role="status">
              <strong>{t("connections.import.warningsHeading")}</strong>
              <ul>
                {selectedSource.warnings.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedSource ? (
            <div
              className="import-bookmark-tree"
              role="tree"
              aria-label={t("connections.import.bookmarksTreeLabel")}
            >
              {selectedSource.root.children.map((node) => (
                <BookmarkTreeRow
                  key={node.id}
                  node={node}
                  selectedNodeIds={selectedNodeIds}
                  onToggle={toggleNode}
                />
              ))}
            </div>
          ) : null}

          <div className="import-scan-actions">
            <button
              className="approve-button"
              disabled={previewing || !selectedSource || selectedCount === 0}
              onClick={() => void handlePreview()}
              type="button"
            >
              {previewing ? (
                <Loader2 className="spin" size={14} />
              ) : (
                <BookMarked size={14} />
              )}
              <span>
                {t("connections.import.bookmarksPreview", {
                  count: selectedCount,
                })}
              </span>
            </button>
          </div>
        </>
      ) : null}

      {preview && candidates.length > 0 ? (
        <ImportPreviewSection
          candidates={candidates}
          format="bookmarks"
          onCancel={onClose}
          onCandidatesChange={setCandidates}
          onError={onError}
          onImported={onImported}
          sshSettings={sshSettings}
          tree={tree}
          warnings={preview.warnings}
        />
      ) : null}
    </div>
  );
}

function BookmarkTreeRow({
  node,
  selectedNodeIds,
  onToggle,
}: {
  node: BookmarkTreeNode;
  selectedNodeIds: Set<string>;
  onToggle: (node: BookmarkTreeNode, checked: boolean) => void;
}) {
  const descendantIds = useMemo(() => collectBookmarkNodeIds(node), [node]);
  const checked = descendantIds.every((id) => selectedNodeIds.has(id));
  const partiallyChecked =
    !checked && descendantIds.some((id) => selectedNodeIds.has(id));
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = partiallyChecked;
    }
  }, [partiallyChecked]);

  return (
    <div className="import-bookmark-node" role="treeitem">
      <label className="import-bookmark-label">
        <input
          ref={checkboxRef}
          checked={checked}
          onChange={(event) => onToggle(node, event.currentTarget.checked)}
          type="checkbox"
        />
        <span>{node.name}</span>
        {node.type === "bookmark" && node.url ? (
          <small>{node.url}</small>
        ) : null}
      </label>
      {node.children.length > 0 ? (
        <div className="import-bookmark-children" role="group">
          {node.children.map((child) => (
            <BookmarkTreeRow
              key={child.id}
              node={child}
              selectedNodeIds={selectedNodeIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function collectBookmarkNodeIds(node: BookmarkTreeNode): string[] {
  return [
    node.id,
    ...node.children.flatMap((child) => collectBookmarkNodeIds(child)),
  ];
}

function ImportPreviewSection({
  candidates,
  format,
  onCancel,
  onCandidatesChange,
  onError,
  onImported,
  sshSettings,
  tree,
  warnings,
}: {
  candidates: Candidate[];
  format: string;
  onCancel: () => void;
  onCandidatesChange: (next: Candidate[]) => void;
  onError: (message: string) => void;
  onImported: (result: {
    count: number;
    source: "file" | "scan" | "bookmarks";
  }) => void;
  sshSettings: SshSettings;
  tree: ConnectionTree;
  warnings: string[];
}) {
  const { t } = useTranslation();
  const [folderTarget, setFolderTarget] = useState<string>("__new__");
  const [newFolderName, setNewFolderName] = useState(
    suggestFolderName(format),
  );
  const [bulkField, setBulkField] = useState<"user" | "password" | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  const [bulkScope, setBulkScope] = useState<"all" | "empty">("empty");
  const [importing, setImporting] = useState(false);

  const folderOptions = useMemo(() => flattenFolders(tree.folders), [tree]);
  const selectedCount = candidates.filter((row) => row.selected).length;

  function toggleAll(value: boolean) {
    onCandidatesChange(candidates.map((row) => ({ ...row, selected: value })));
  }

  function updateRow(index: number, patch: Partial<Candidate>) {
    onCandidatesChange(
      candidates.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function openBulkField(field: "user" | "password") {
    onError("");
    setBulkField(field);
    setBulkValue("");
    setBulkScope("empty");
  }

  function closeBulkField() {
    setBulkField(null);
    setBulkValue("");
  }

  function applyBulkField() {
    if (!bulkField) {
      return;
    }
    if (bulkField === "user") {
      const user = bulkValue.trim();
      if (!user) {
        onError(t("connections.import.bulkUserRequired"));
        return;
      }
      onCandidatesChange(
        candidates.map((row) => {
          if (!row.selected) {
            return row;
          }
          if (bulkScope === "empty" && row.user.trim()) {
            return row;
          }
          return { ...row, user };
        }),
      );
    } else {
      if (!bulkValue) {
        onError(t("connections.import.bulkPasswordRequired"));
        return;
      }
      onCandidatesChange(
        candidates.map((row) => {
          if (!row.selected) {
            return row;
          }
          if (bulkScope === "empty" && row.password) {
            return row;
          }
          return { ...row, password: bulkValue };
        }),
      );
    }
    closeBulkField();
  }

  async function resolveFolderPath(
    baseFolderId: string | undefined,
    folderPath: string[],
    folderCache: Map<string, string>,
  ) {
    let parentFolderId = baseFolderId;
    const pathSegments: string[] = [];
    for (const rawSegment of folderPath) {
      const segment = rawSegment.trim();
      if (!segment) {
        continue;
      }
      pathSegments.push(segment);
      const cacheKey = `${parentFolderId ?? "__root__"}/${pathSegments.join("/")}`;
      const cached = folderCache.get(cacheKey);
      if (cached) {
        parentFolderId = cached;
        continue;
      }
      const folder = await invokeCommand("create_connection_folder", {
        request: { name: segment, parentFolderId },
      });
      folderCache.set(cacheKey, folder.id);
      parentFolderId = folder.id;
    }
    return parentFolderId;
  }

  async function storeImportedPassword(connectionId: string, password: string) {
    if (!password) {
      return;
    }
    await invokeCommand("store_secret", {
      request: {
        kind: "connectionPassword",
        ownerId: connectionId,
        secret: password,
      },
    });
  }

  async function handleImport() {
    if (selectedCount === 0) {
      onError(t("connections.import.noneSelected"));
      return;
    }

    setImporting(true);
    try {
      let targetFolderId: string | undefined;
      if (folderTarget === "__new__") {
        const trimmed = newFolderName.trim();
        if (!trimmed) {
          onError(t("connections.import.folderNameRequired"));
          setImporting(false);
          return;
        }
        const folder = await invokeCommand("create_connection_folder", {
          request: { name: trimmed },
        });
        targetFolderId = folder.id;
      } else if (folderTarget !== "__root__") {
        targetFolderId = folderTarget;
      }

      const folderCache = new Map<string, string>();

      for (const row of candidates) {
        if (!row.selected) {
          continue;
        }
        const port = ["local", "serial", "url"].includes(row.type)
          ? row.port
          : row.port ?? defaultPortForConnectionType(row.type, sshSettings);
        const rowFolderId = await resolveFolderPath(
          targetFolderId,
          row.folderPath,
          folderCache,
        );
        const password = ["ssh", "telnet", "rdp", "vnc"].includes(row.type)
          ? row.password
          : "";
        const request: CreateConnectionRequest = {
          name:
            row.name.trim() ||
            row.host ||
            row.url ||
            t("connections.import.bookmarkFallbackName"),
          type: row.type,
          host: row.type === "url" ? undefined : row.host,
          user: row.user,
          folderId: rowFolderId,
          port,
          url: row.type === "url" ? row.url ?? row.host : undefined,
          authMethod: password && row.type === "ssh" ? "password" : undefined,
        };
        const connection = await invokeCommand("create_connection", { request });
        await storeImportedPassword(connection.id, password);
      }

      onImported({
        count: selectedCount,
        source:
          format === "scan"
            ? "scan"
            : format === "bookmarks"
              ? "bookmarks"
              : "file",
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setImporting(false);
    }
  }

  const allSelected = selectedCount === candidates.length && candidates.length > 0;

  return (
    <div className="import-preview">
      <div className="import-preview-toolbar">
        <strong>
          {t("connections.import.previewHeading", {
            count: candidates.length,
            selected: selectedCount,
          })}
        </strong>
        <div className="import-preview-toolbar-actions">
          <button
            className="toolbar-button"
            onClick={() => toggleAll(true)}
            type="button"
            disabled={allSelected}
          >
            {t("connections.import.selectAll")}
          </button>
          <button
            className="toolbar-button"
            onClick={() => toggleAll(false)}
            type="button"
            disabled={selectedCount === 0}
          >
            {t("connections.import.selectNone")}
          </button>
        </div>
      </div>

      <div className="import-bulk-actions">
        <button
          aria-expanded={bulkField === "user"}
          className="toolbar-button"
          disabled={selectedCount === 0}
          onClick={() =>
            bulkField === "user" ? closeBulkField() : openBulkField("user")
          }
          type="button"
        >
          {t("connections.import.setUsernameButton")}
        </button>
        <button
          aria-expanded={bulkField === "password"}
          className="toolbar-button"
          disabled={selectedCount === 0}
          onClick={() =>
            bulkField === "password"
              ? closeBulkField()
              : openBulkField("password")
          }
          type="button"
        >
          {t("connections.import.setPasswordButton")}
        </button>
      </div>

      {bulkField ? (
        <div
          className="import-bulk-popover"
          role="group"
          aria-label={
            bulkField === "user"
              ? t("connections.import.setUsernameButton")
              : t("connections.import.setPasswordButton")
          }
        >
          <label className="import-field import-bulk-field">
            <span>
              {bulkField === "user"
                ? t("connections.import.bulkUserLabel")
                : t("connections.import.bulkPasswordLabel")}
            </span>
            <input
              autoFocus
              onChange={(event) => setBulkValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyBulkField();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closeBulkField();
                }
              }}
              placeholder={
                bulkField === "user"
                  ? t("connections.import.bulkUserPlaceholder")
                  : t("connections.import.bulkPasswordPlaceholder")
              }
              type={bulkField === "user" ? "text" : "password"}
              value={bulkValue}
            />
          </label>
          <div className="import-bulk-scope" role="radiogroup">
            <label className="import-bulk-scope-option">
              <input
                checked={bulkScope === "empty"}
                name="import-bulk-scope"
                onChange={() => setBulkScope("empty")}
                type="radio"
              />
              <span>{t("connections.import.bulkScopeUnfilled")}</span>
            </label>
            <label className="import-bulk-scope-option">
              <input
                checked={bulkScope === "all"}
                name="import-bulk-scope"
                onChange={() => setBulkScope("all")}
                type="radio"
              />
              <span>{t("connections.import.bulkScopeAll")}</span>
            </label>
          </div>
          <div className="import-bulk-popover-actions">
            <button
              className="approve-button"
              onClick={applyBulkField}
              type="button"
            >
              {t("connections.import.bulkApply")}
            </button>
            <button
              className="toolbar-button"
              onClick={closeBulkField}
              type="button"
            >
              {t("connections.import.bulkCancel")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="import-preview-table-wrapper">
        <table className="import-preview-table">
          <thead>
            <tr>
              <th aria-label={t("connections.import.selectColumn")} />
              <th>{t("connections.import.colName")}</th>
              <th>{t("connections.import.colType")}</th>
              <th>{t("connections.import.colHost")}</th>
              <th>{t("connections.import.colPort")}</th>
              <th>{t("connections.import.colUser")}</th>
              <th>{t("connections.import.colPassword")}</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((row, index) => (
              <tr key={row.id}>
                <td>
                  <input
                    aria-label={t("connections.import.selectRow")}
                    checked={row.selected}
                    onChange={(event) =>
                      updateRow(index, { selected: event.currentTarget.checked })
                    }
                    type="checkbox"
                  />
                </td>
                <td>
                  <input
                    onChange={(event) =>
                      updateRow(index, { name: event.currentTarget.value })
                    }
                    type="text"
                    value={row.name}
                  />
                </td>
                <td>
                  <select
                    onChange={(event) =>
                      updateRow(index, {
                        type: event.currentTarget.value as ConnectionType,
                      })
                    }
                    value={row.type}
                  >
                    <option value="ssh">{t("connections.ssh")}</option>
                    <option value="telnet">{t("connections.telnet")}</option>
                    <option value="rdp">{t("connections.rdp")}</option>
                    <option value="vnc">{t("connections.vnc")}</option>
                    <option value="serial">{t("connections.serial")}</option>
                    <option value="url">{t("connections.url")}</option>
                    <option value="local">{t("connections.localTerminal")}</option>
                  </select>
                </td>
                <td>
                  <input
                    onChange={(event) =>
                      updateRow(index, { host: event.currentTarget.value })
                    }
                    type="text"
                    value={row.host}
                  />
                </td>
                <td>
                  <input
                    className="import-port-input"
                    onChange={(event) => {
                      const text = event.currentTarget.value.trim();
                      const parsed = text ? Number.parseInt(text, 10) : NaN;
                      updateRow(index, {
                        port: Number.isFinite(parsed) ? parsed : undefined,
                      });
                    }}
                    type="number"
                    value={row.port ?? ""}
                  />
                </td>
                <td>
                  <input
                    onChange={(event) =>
                      updateRow(index, { user: event.currentTarget.value })
                    }
                    type="text"
                    value={row.user}
                  />
                </td>
                <td>
                  <input
                    onChange={(event) =>
                      updateRow(index, { password: event.currentTarget.value })
                    }
                    type="password"
                    value={row.password}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {warnings.length > 0 ? (
        <div className="import-warnings" role="status">
          <strong>{t("connections.import.warningsHeading")}</strong>
          <ul>
            {warnings.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="import-destination">
        <legend>{t("connections.import.destinationLabel")}</legend>
        <select
          onChange={(event) => setFolderTarget(event.currentTarget.value)}
          value={folderTarget}
        >
          <option value="__new__">{t("connections.import.destinationNewFolder")}</option>
          <option value="__root__">{t("connections.import.destinationRoot")}</option>
          {folderOptions.map((option) => (
            <option key={option.folder.id} value={option.folder.id}>
              {"  ".repeat(option.level)}
              {option.folder.name}
            </option>
          ))}
        </select>
        {folderTarget === "__new__" ? (
          <input
            aria-label={t("connections.import.newFolderNameLabel")}
            onChange={(event) => setNewFolderName(event.currentTarget.value)}
            placeholder={t("connections.import.newFolderNameLabel")}
            type="text"
            value={newFolderName}
          />
        ) : null}
      </fieldset>

      <div className="dialog-actions">
        <button
          className="approve-button"
          disabled={importing || selectedCount === 0}
          onClick={() => void handleImport()}
          type="button"
        >
          {importing ? <Loader2 className="spin" size={14} /> : null}
          <span>
            {t("connections.import.importCount", { count: selectedCount })}
          </span>
        </button>
        <button className="toolbar-button" onClick={onCancel} type="button">
          {t("connections.cancel")}
        </button>
      </div>
    </div>
  );
}

function suggestFolderName(format: string) {
  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const label =
    format === "bookmarks"
      ? i18next.t("connections.import.importedFromBookmarks")
      : format === "scan"
        ? i18next.t("connections.import.importedFromScan")
      : format === "rdcman"
        ? i18next.t("connections.import.importedFromRdcman")
        : format === "mobaxterm"
          ? i18next.t("connections.import.importedFromMobaxterm")
          : format === "putty"
            ? i18next.t("connections.import.importedFromPutty")
            : i18next.t("connections.import.importedDefault");
  return `${label} ${stamp}`;
}
