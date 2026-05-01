import {
  Bot,
  Check,
  ChevronDown,
  Circle,
  Columns2,
  Command,
  Copy,
  Database,
  Download,
  FileCode2,
  Folder,
  FolderPlus,
  HardDrive,
  KeyRound,
  Laptop,
  LayoutPanelLeft,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Play,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SplitSquareHorizontal,
  Tags,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as TerminalEmulator } from "@xterm/xterm";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import "@xterm/xterm/css/xterm.css";
import "./App.css";
import { invokeCommand, isTauriRuntime, type TerminalOutput } from "./lib/tauri";
import {
  aiSuggestions,
  connectionGroups,
  localFiles,
  remoteFiles,
  transferQueue,
} from "./sample-data";
import { useWorkspaceStore } from "./store";
import type {
  Connection,
  ConnectionGroup,
  ConnectionStatus,
  ConnectionType,
  CreateConnectionRequest,
  FileEntry,
  TerminalPane,
  TerminalSettings,
  WorkspaceTab,
} from "./types";

type DraggedTreeItem =
  | { kind: "folder"; folderId: string }
  | { kind: "connection"; connectionId: string };

function App() {
  const [bootstrap, setBootstrap] = useState("Starting local runtime");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const setTerminalSettings = useWorkspaceStore((state) => state.setTerminalSettings);

  useEffect(() => {
    invokeCommand("app_bootstrap")
      .then((result) =>
        setBootstrap(
          `${result.logStatus} | ${result.storageStatus} | Keychain: ${result.keychainStatus.backend}`,
        ),
      )
      .catch(() => setBootstrap("Frontend preview mode"));
  }, []);

  useEffect(() => {
    invokeCommand("get_terminal_settings")
      .then(setTerminalSettings)
      .catch(() => undefined);
  }, [setTerminalSettings]);

  return (
    <div className="app-shell">
      <ActivityRail onOpenSettings={() => setSettingsOpen(true)} />
      <ConnectionSidebar />
      <main className="workspace">
        <TopBar runtimeStatus={bootstrap} />
        <TabStrip />
        <WorkspaceCanvas />
        <StatusBar />
      </main>
      <AssistantPanel />
      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}

function ActivityRail({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <nav className="activity-rail" aria-label="Primary">
      <button className="rail-button active" aria-label="Connections">
        <LayoutPanelLeft size={18} />
      </button>
      <button className="rail-button" aria-label="Terminal sessions">
        <Terminal size={18} />
      </button>
      <button className="rail-button" aria-label="SFTP browser">
        <Columns2 size={18} />
      </button>
      <button className="rail-button" aria-label="Command palette">
        <Command size={18} />
      </button>
      <button className="rail-button bottom" aria-label="Settings" onClick={onOpenSettings}>
        <Settings size={18} />
      </button>
    </nav>
  );
}

function ConnectionSidebar() {
  const query = useWorkspaceStore((state) => state.query);
  const setQuery = useWorkspaceStore((state) => state.setQuery);
  const openConnection = useWorkspaceStore((state) => state.openConnection);
  const activeSessionCounts = useWorkspaceStore((state) => state.activeSessionCounts);
  const [groups, setGroups] = useState<ConnectionGroup[]>(connectionGroups);
  const [formMode, setFormMode] = useState<"save" | "quick" | null>(null);
  const [formError, setFormError] = useState("");
  const [treeError, setTreeError] = useState("");
  const [draggedItem, setDraggedItem] = useState<DraggedTreeItem | null>(null);
  const [dropTarget, setDropTarget] = useState("");

  useEffect(() => {
    void reloadConnectionGroups();
  }, []);

  async function reloadConnectionGroups() {
    try {
      setGroups(await invokeCommand("list_connection_groups"));
    } catch {
      setGroups(connectionGroups);
    }
  }

  function handleConnectionReady(connection: Connection) {
    setGroups((currentGroups) => upsertConnectionGroup(currentGroups, connection));
    openConnection(connection);
    setFormMode(null);
    setFormError("");
    setTreeError("");
  }

  async function handleConnectionSubmit(request: CreateConnectionRequest) {
    setFormError("");
    if (formMode === "save") {
      try {
        const connection = await invokeCommand("create_connection", { request });
        handleConnectionReady(connection);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    handleConnectionReady({
      id: `quick-${Date.now()}`,
      name: request.name || request.host,
      host: request.host,
      user: request.user,
      port: request.port,
      keyPath: request.keyPath,
      type: request.type,
      tags: request.tags,
      status: "idle",
    });
  }

  async function handleCreateFolder() {
    const name = window.prompt("New folder name")?.trim();
    if (!name) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("create_connection_folder", {
        request: { name },
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRenameFolder(group: ConnectionGroup) {
    const name = window.prompt("Rename folder", group.name)?.trim();
    if (!name || name === group.name) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("rename_connection_folder", {
        request: { id: group.id, name },
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDeleteFolder(group: ConnectionGroup) {
    if (group.id === "local") {
      setTreeError("The local workspace folder cannot be deleted.");
      return;
    }

    const detail =
      group.connections.length === 0
        ? `Delete folder ${group.name}?`
        : `Delete folder ${group.name} and ${group.connections.length} connection${
            group.connections.length === 1 ? "" : "s"
          }?`;
    if (!window.confirm(detail)) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("delete_connection_folder", {
        folderId: group.id,
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRenameConnection(connection: Connection) {
    const name = window.prompt("Rename connection", connection.name)?.trim();
    if (!name || name === connection.name) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("rename_connection", {
        request: { id: connection.id, name },
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDuplicateConnection(connection: Connection) {
    try {
      setTreeError("");
      await invokeCommand("duplicate_connection", {
        request: { id: connection.id },
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMoveFolder(folderId: string, targetIndex: number) {
    try {
      setTreeError("");
      setGroups(
        await invokeCommand("move_connection_folder", {
          request: { id: folderId, targetIndex },
        }),
      );
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMoveConnection(connectionId: string, folderId: string, targetIndex: number) {
    try {
      setTreeError("");
      setGroups(
        await invokeCommand("move_connection", {
          request: { id: connectionId, folderId, targetIndex },
        }),
      );
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDeleteConnection(connection: Connection) {
    if (!window.confirm(`Delete ${connection.name}?`)) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("delete_connection", {
        connectionId: connection.id,
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  const groupsWithLiveStatuses = useMemo(
    () => withLiveConnectionStatuses(groups, activeSessionCounts),
    [activeSessionCounts, groups],
  );

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return groupsWithLiveStatuses;
    }

    return groupsWithLiveStatuses
      .map((group) => {
        if (group.name.toLowerCase().includes(normalizedQuery)) {
          return group;
        }

        return {
          ...group,
          connections: group.connections.filter((connection) =>
            [
              connection.name,
              connection.host,
              connection.user,
              connection.type,
              ...connection.tags,
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery),
          ),
        };
      })
      .filter(
        (group) =>
          group.connections.length > 0 ||
          group.name.toLowerCase().includes(normalizedQuery),
      );
  }, [groupsWithLiveStatuses, query]);
  const isTreeFiltered = query.trim().length > 0;

  function handleDragStart(event: DragEvent, item: DraggedTreeItem) {
    if (isTreeFiltered) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-admindeck-tree-item", JSON.stringify(item));
    setDraggedItem(item);
  }

  function handleDragOver(event: DragEvent, targetId: string) {
    if (isTreeFiltered || !draggedItem) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(targetId);
  }

  function handleDragEnd() {
    setDraggedItem(null);
    setDropTarget("");
  }

  function dropDraggedItem(
    event: DragEvent,
    target: { kind: "folder"; folderId: string; targetIndex: number } | {
      kind: "connection";
      folderId: string;
      connectionId: string;
      targetIndex: number;
    },
  ) {
    event.preventDefault();
    const item = draggedItem;
    handleDragEnd();
    if (!item) {
      return;
    }

    if (item.kind === "folder" && target.kind === "folder" && item.folderId !== target.folderId) {
      void handleMoveFolder(item.folderId, target.targetIndex);
      return;
    }

    if (item.kind === "connection") {
      if (target.kind === "connection" && item.connectionId === target.connectionId) {
        return;
      }

      void handleMoveConnection(item.connectionId, target.folderId, target.targetIndex);
    }
  }

  return (
    <aside className="connection-sidebar">
      <div className="sidebar-header">
        <div>
          <p className="panel-label">AdminDeck</p>
          <h1>Connections</h1>
        </div>
        <div className="sidebar-actions">
          <button
            className="icon-button"
            aria-label="New folder"
            title="New folder"
            onClick={() => void handleCreateFolder()}
          >
            <FolderPlus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Add connection"
            title="Add connection"
            onClick={() => setFormMode("save")}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <label className="search-box">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search hosts, tags, folders"
        />
      </label>

      <button className="quick-connect" onClick={() => setFormMode("quick")}>
        <Play size={15} />
        Quick connect
      </button>
      {treeError ? <p className="form-error tree-error">{treeError}</p> : null}

      <div className="tree-list" aria-label="Connection tree">
        {filteredGroups.map((group, groupIndex) => (
          <section className="tree-group" key={group.id}>
            <div
              className={`tree-folder-row ${dropTarget === `folder-${group.id}` ? "drop-target" : ""}`}
              draggable={!isTreeFiltered}
              onDragEnd={handleDragEnd}
              onDragOver={(event) => handleDragOver(event, `folder-${group.id}`)}
              onDragStart={(event) =>
                handleDragStart(event, { kind: "folder", folderId: group.id })
              }
              onDrop={(event) =>
                dropDraggedItem(event, {
                  kind: "folder",
                  folderId: group.id,
                  targetIndex:
                    draggedItem?.kind === "connection"
                      ? group.connections.length
                      : groupIndex,
                })
              }
            >
              <button className="tree-folder">
                <ChevronDown size={14} />
                <Folder size={15} />
                <span>{group.name}</span>
                <small>{group.connections.length}</small>
              </button>
              <span className="folder-actions">
                <button
                  className="row-action"
                  aria-label={`Rename folder ${group.name}`}
                  onClick={() => void handleRenameFolder(group)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="row-action danger"
                  aria-label={`Delete folder ${group.name}`}
                  onClick={() => void handleDeleteFolder(group)}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
            {group.connections.map((connection, connectionIndex) => (
              <ConnectionRow
                connection={connection}
                key={connection.id}
                dragDisabled={isTreeFiltered}
                isDropTarget={dropTarget === `connection-${connection.id}`}
                onDelete={() => void handleDeleteConnection(connection)}
                onDuplicate={() => void handleDuplicateConnection(connection)}
                onDragEnd={handleDragEnd}
                onDragOver={(event) => handleDragOver(event, `connection-${connection.id}`)}
                onDragStart={(event) =>
                  handleDragStart(event, {
                    kind: "connection",
                    connectionId: connection.id,
                  })
                }
                onDrop={(event) =>
                  dropDraggedItem(event, {
                    kind: "connection",
                    folderId: group.id,
                    connectionId: connection.id,
                    targetIndex: connectionIndex,
                  })
                }
                onOpen={() => openConnection(connection)}
                onRename={() => void handleRenameConnection(connection)}
              />
            ))}
          </section>
        ))}
      </div>

      {formMode ? (
        <ConnectionDialog
          error={formError}
          groups={groups}
          mode={formMode}
          onCancel={() => {
            setFormMode(null);
            setFormError("");
          }}
          onSubmit={handleConnectionSubmit}
        />
      ) : null}
    </aside>
  );
}

function ConnectionDialog({
  error,
  groups,
  mode,
  onCancel,
  onSubmit,
}: {
  error: string;
  groups: ConnectionGroup[];
  mode: "save" | "quick";
  onCancel: () => void;
  onSubmit: (request: CreateConnectionRequest) => void | Promise<void>;
}) {
  const [connectionType, setConnectionType] = useState<ConnectionType>("ssh");
  const folderOptions = useMemo(
    () => groups.filter((group) => !["local", "manual"].includes(group.id)),
    [groups],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const host = String(form.get("host") ?? "").trim();
    const name = String(form.get("name") ?? "").trim() || host;
    const portValue = String(form.get("port") ?? "").trim();
    const keyPath = String(form.get("keyPath") ?? "").trim();
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    void onSubmit({
      name,
      host,
      user: String(form.get("user") ?? "").trim(),
      type: connectionType,
      folderId:
        connectionType === "local"
          ? "local"
          : String(form.get("folderId") ?? "").trim() || "manual",
      port: portValue ? Number(portValue) : undefined,
      keyPath: keyPath || undefined,
      tags,
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="connection-dialog" onSubmit={handleSubmit}>
        <header>
          <div>
            <p className="panel-label">{mode === "save" ? "New connection" : "Quick connect"}</p>
            <h2>{mode === "save" ? "Save and open" : "Open one-off session"}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onCancel}>
            <X size={15} />
          </button>
        </header>

        <label>
          <span>Type</span>
          <select
            value={connectionType}
            onChange={(event) => setConnectionType(event.currentTarget.value as ConnectionType)}
          >
            <option value="ssh">SSH terminal</option>
            <option value="local">Local terminal</option>
            <option value="sftp">SFTP browser</option>
          </select>
        </label>

        {mode === "save" && connectionType !== "local" ? (
          <label>
            <span>Folder</span>
            <select name="folderId" defaultValue="manual">
              <option value="manual">Manual</option>
              {folderOptions.map((group) => (
                <option value={group.id} key={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          <span>Name</span>
          <input name="name" placeholder="Bastion East" />
        </label>

        <label>
          <span>Host</span>
          <input name="host" placeholder="example.internal" required />
        </label>

        <div className="form-grid">
          <label>
            <span>User</span>
            <input name="user" placeholder="admin" required />
          </label>
          <label>
            <span>Port</span>
            <input name="port" inputMode="numeric" min="1" max="65535" type="number" placeholder="22" />
          </label>
        </div>

        <label>
          <span>Key path</span>
          <input name="keyPath" placeholder="C:\\Users\\ryan\\.ssh\\id_ed25519" />
        </label>

        <label>
          <span>Tags</span>
          <input name="tags" placeholder="prod, jump" />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="dialog-actions">
          <button className="toolbar-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="approve-button" type="submit">
            <Play size={15} />
            {mode === "save" ? "Save and open" : "Connect"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConnectionRow({
  connection,
  dragDisabled,
  isDropTarget,
  onDelete,
  onDuplicate,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onOpen,
  onRename,
}: {
  connection: Connection;
  dragDisabled: boolean;
  isDropTarget: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
  onDragStart: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onOpen: () => void;
  onRename: () => void;
}) {
  const Icon = connection.type === "local" ? Laptop : connection.type === "sftp" ? Columns2 : Server;

  return (
    <div
      className={isDropTarget ? "connection-row drop-target" : "connection-row"}
      draggable={!dragDisabled}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <button className="connection-open" onClick={onOpen}>
        <Icon size={15} />
        <span className="connection-main">
          <strong>{connection.name}</strong>
          <small>{connection.host}</small>
        </span>
      </button>
      <span className={`status-dot ${connection.status}`} />
      <span className="connection-actions">
        <button className="row-action" aria-label={`Rename ${connection.name}`} onClick={onRename}>
          <Pencil size={13} />
        </button>
        <button className="row-action" aria-label={`Duplicate ${connection.name}`} onClick={onDuplicate}>
          <Copy size={13} />
        </button>
        <button className="row-action danger" aria-label={`Delete ${connection.name}`} onClick={onDelete}>
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  );
}

function upsertConnectionGroup(groups: ConnectionGroup[], connection: Connection) {
  const groupId = connection.type === "local" ? "local" : "manual";
  const groupName = connection.type === "local" ? "Local workspace" : "Manual";
  const withoutConnection = groups.map((group) => ({
    ...group,
    connections: group.connections.filter((item) => item.id !== connection.id),
  }));
  const targetGroup = withoutConnection.find((group) => group.id === groupId);

  if (targetGroup) {
    return withoutConnection.map((group) =>
      group.id === groupId
        ? { ...group, connections: [connection, ...group.connections] }
        : group,
    );
  }

  return [
    ...withoutConnection,
    {
      id: groupId,
      name: groupName,
      connections: [connection],
    },
  ];
}

function withLiveConnectionStatuses(
  groups: ConnectionGroup[],
  activeSessionCounts: Record<string, number>,
) {
  return groups.map((group) => ({
    ...group,
    connections: group.connections.map((connection) => ({
      ...connection,
      status: liveConnectionStatus(connection.id, activeSessionCounts),
    })),
  }));
}

function liveConnectionStatus(
  connectionId: string,
  activeSessionCounts: Record<string, number>,
): ConnectionStatus {
  return activeSessionCounts[connectionId] ? "connected" : "idle";
}

function TopBar({ runtimeStatus }: { runtimeStatus: string }) {
  return (
    <header className="top-bar">
      <div className="command-search">
        <Command size={15} />
        <span>Open command palette</span>
        <kbd>Ctrl</kbd>
        <kbd>K</kbd>
      </div>
      <div className="top-actions">
        <span className="runtime-status">
          <ShieldCheck size={14} />
          {runtimeStatus}
        </span>
        <button className="icon-button" aria-label="Import SSH config" title="Import SSH config">
          <FileCode2 size={15} />
        </button>
        <button className="icon-button" aria-label="Secrets" title="Secrets">
          <KeyRound size={15} />
        </button>
      </div>
    </header>
  );
}

function TabStrip() {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const openLocalTerminal = useWorkspaceStore((state) => state.openLocalTerminal);

  return (
    <div className="tab-strip" role="tablist" aria-label="Workspace tabs">
      {tabs.map((tab) => (
        <button
          className={tab.id === activeTabId ? "tab active" : "tab"}
          key={tab.id}
          onClick={() => activateTab(tab.id)}
          role="tab"
          aria-selected={tab.id === activeTabId}
        >
          {tab.kind === "sftp" ? <Columns2 size={14} /> : <Terminal size={14} />}
          <span>{tab.title}</span>
          <X
            className="tab-close"
            size={13}
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
          />
        </button>
      ))}
      <button className="new-tab" aria-label="New local terminal" onClick={openLocalTerminal}>
        <Plus size={15} />
      </button>
    </div>
  );
}

function WorkspaceCanvas() {
  const activeTab = useWorkspaceStore((state) =>
    state.tabs.find((tab) => tab.id === state.activeTabId),
  );

  if (!activeTab) {
    return (
      <section className="empty-workspace">
        <Terminal size={28} />
        <h2>No active session</h2>
        <p>Open a local terminal, SSH connection, or SFTP browser from the tree.</p>
      </section>
    );
  }

  if (activeTab.kind === "sftp") {
    return <SftpWorkspace tab={activeTab} />;
  }

  return <TerminalWorkspace tab={activeTab} />;
}

function TerminalWorkspace({ tab }: { tab: WorkspaceTab }) {
  const splitTerminalPane = useWorkspaceStore((state) => state.splitTerminalPane);
  const canSplit = tab.panes.some((pane) => pane.connection);

  return (
    <section className="terminal-workspace">
      <div className="workspace-toolbar">
        <div>
          <strong>{tab.title}</strong>
          <span>{tab.subtitle}</span>
        </div>
        <div className="toolbar-cluster">
          <button
            className="icon-button"
            aria-label="Split terminal"
            disabled={!canSplit}
            onClick={() => splitTerminalPane(tab.id)}
            title="Split terminal"
          >
            <SplitSquareHorizontal size={15} />
          </button>
          <button className="icon-button" aria-label="Copy terminal selection">
            <Copy size={15} />
          </button>
          <button className="icon-button" aria-label="More terminal actions">
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>

      <div className="terminal-grid">
        {tab.panes.map((pane) => (
          <TerminalPaneView pane={pane} key={pane.id} />
        ))}
      </div>
    </section>
  );
}

function TerminalPaneView({ pane }: { pane: TerminalPane }) {
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const terminalSettings = useWorkspaceStore((state) => state.terminalSettings);
  const markConnectionSessionStarted = useWorkspaceStore(
    (state) => state.markConnectionSessionStarted,
  );
  const markConnectionSessionEnded = useWorkspaceStore(
    (state) => state.markConnectionSessionEnded,
  );

  useEffect(() => {
    const element = terminalElementRef.current;
    const connection = pane.connection;
    if (!element || !connection || startedRef.current) {
      return;
    }

    startedRef.current = true;
    const terminal = new TerminalEmulator({
      cursorBlink: true,
      cursorStyle: terminalSettings.cursorStyle,
      fontFamily: terminalSettings.fontFamily,
      fontSize: terminalSettings.fontSize,
      lineHeight: terminalSettings.lineHeight,
      scrollback: terminalSettings.scrollbackLines,
      theme: {
        background: "#0c1219",
        foreground: "#d9e2ef",
        cursor: "#d9e2ef",
        selectionBackground: "#305f95",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(element);
    fitAddon.fit();
    terminal.focus();
    terminal.writeln(`Starting ${connection.type} session for ${connection.name}...`);

    if (!isTauriRuntime()) {
      terminal.writeln("Terminal sessions require the Tauri desktop runtime.");
      return () => {
        terminal.dispose();
      };
    }

    const requestedSessionId = `${connection.id}-${Date.now()}`;
    sessionIdRef.current = requestedSessionId;

    let disposed = false;
    let sessionStarted = false;
    let removeOutputListener: (() => void) | undefined;
    const dataDisposable = terminal.onData((data) => {
      if (terminalSettings.confirmMultilinePaste && isMultilinePaste(data)) {
        const shouldPaste = window.confirm("Paste multiple lines into this terminal?");
        if (!shouldPaste) {
          return;
        }
      }

      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      void invokeCommand("write_terminal_input", {
        request: { sessionId, data },
      });
    });
    const selectionDisposable = terminal.onSelectionChange(() => {
      if (!terminalSettings.copyOnSelect) {
        return;
      }

      const selection = terminal.getSelection();
      if (selection) {
        void navigator.clipboard?.writeText(selection);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void invokeCommand("resize_terminal", {
          request: { sessionId, cols: terminal.cols, rows: terminal.rows },
        });
      }
    });
    resizeObserver.observe(element);

    void (async () => {
      const unlisten = await listen<TerminalOutput>("terminal-output", (event) => {
        if (event.payload.sessionId === sessionIdRef.current) {
          terminal.write(event.payload.data);
        }
      });
      if (disposed) {
        unlisten();
        return;
      }
      removeOutputListener = unlisten;

      try {
        const result = await invokeCommand("start_terminal_session", {
          request: {
            sessionId: requestedSessionId,
            title: connection.name,
            type: connection.type === "local" ? "local" : "ssh",
            host: connection.host,
            user: connection.user,
            port: connection.port,
            keyPath: connection.keyPath,
            shell: connection.type === "local" ? terminalSettings.defaultShell : undefined,
            cols: terminal.cols,
            rows: terminal.rows,
          },
        });
        if (disposed) {
          void invokeCommand("close_terminal_session", { sessionId: result.sessionId });
          return;
        }
        sessionIdRef.current = result.sessionId;
        sessionStarted = true;
        markConnectionSessionStarted(connection.id);
      } catch (error) {
        terminal.writeln("");
        terminal.writeln(`[failed to start session: ${String(error)}]`);
      }
    })();

    return () => {
      disposed = true;
      startedRef.current = false;
      dataDisposable.dispose();
      selectionDisposable.dispose();
      resizeObserver.disconnect();
      removeOutputListener?.();
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void invokeCommand("close_terminal_session", { sessionId });
      }
      if (sessionStarted) {
        markConnectionSessionEnded(connection.id);
      }
      sessionIdRef.current = null;
      terminal.dispose();
    };
  }, [
    markConnectionSessionEnded,
    markConnectionSessionStarted,
    pane.connection,
    terminalSettings,
  ]);

  return (
    <article className="terminal-pane">
      <header>
        <span>
          <Circle size={9} fill="currentColor" />
          {pane.title}
        </span>
        <small>{pane.cwd}</small>
      </header>
      {pane.connection ? (
        <div className="xterm-host" ref={terminalElementRef} />
      ) : (
        <pre>
          <code>{pane.buffer}</code>
        </pre>
      )}
    </article>
  );
}

function isMultilinePaste(data: string) {
  return data.split(/\r\n|\r|\n/).filter((line) => line.length > 0).length > 1;
}

function SftpWorkspace({ tab }: { tab: WorkspaceTab }) {
  return (
    <section className="sftp-workspace">
      <div className="workspace-toolbar">
        <div>
          <strong>{tab.title}</strong>
          <span>{tab.subtitle}</span>
        </div>
        <div className="toolbar-cluster">
          <button className="toolbar-button">
            <Upload size={15} />
            Upload
          </button>
          <button className="toolbar-button">
            <Download size={15} />
            Download
          </button>
        </div>
      </div>

      <div className="file-manager">
        <FilePane title="Local" path="C:\\Users\\ryan\\deployments" files={localFiles} />
        <FilePane title="Remote" path="/srv/admin-deck/releases" files={remoteFiles} />
      </div>

      <div className="transfer-queue">
        <header>
          <strong>Transfer queue</strong>
          <span>{transferQueue.length} active</span>
        </header>
        {transferQueue.map((transfer) => (
          <div className="transfer-row" key={transfer.id}>
            <span>{transfer.name}</span>
            <progress value={transfer.progress} max="100" />
            <small>{transfer.progress}%</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilePane({
  title,
  path,
  files,
}: {
  title: string;
  path: string;
  files: FileEntry[];
}) {
  return (
    <article className="file-pane">
      <header>
        <div>
          <strong>{title}</strong>
          <span>{path}</span>
        </div>
        <button className="icon-button" aria-label={`Refresh ${title.toLowerCase()} files`}>
          <MoreHorizontal size={15} />
        </button>
      </header>
      <div className="file-table">
        {files.map((file) => (
          <div className="file-row" key={file.name}>
            {file.kind === "folder" ? <Folder size={15} /> : <FileCode2 size={15} />}
            <span>{file.name}</span>
            <small>{file.size}</small>
            <small>{file.modified}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const terminalSettings = useWorkspaceStore((state) => state.terminalSettings);
  const setTerminalSettings = useWorkspaceStore((state) => state.setTerminalSettings);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const request: TerminalSettings = {
      fontFamily: String(form.get("fontFamily") ?? "").trim(),
      fontSize: Number(form.get("fontSize")),
      lineHeight: Number(form.get("lineHeight")),
      cursorStyle: String(form.get("cursorStyle")) as TerminalSettings["cursorStyle"],
      scrollbackLines: Number(form.get("scrollbackLines")),
      copyOnSelect: form.get("copyOnSelect") === "on",
      confirmMultilinePaste: form.get("confirmMultilinePaste") === "on",
      defaultShell: String(form.get("defaultShell") ?? "").trim(),
    };

    try {
      setError("");
      if (!isTauriRuntime()) {
        setTerminalSettings(request);
        onClose();
        return;
      }

      setTerminalSettings(await invokeCommand("update_terminal_settings", { request }));
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="settings-dialog" onSubmit={handleSubmit}>
        <header>
          <div>
            <p className="panel-label">Settings</p>
            <h2>Terminal defaults</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </header>

        <section className="settings-section">
          <label>
            <span>Font family</span>
            <input name="fontFamily" defaultValue={terminalSettings.fontFamily} required />
          </label>
          <div className="form-grid three-columns">
            <label>
              <span>Font size</span>
              <input
                name="fontSize"
                defaultValue={terminalSettings.fontSize}
                min="8"
                max="32"
                type="number"
              />
            </label>
            <label>
              <span>Line height</span>
              <input
                name="lineHeight"
                defaultValue={terminalSettings.lineHeight}
                min="1"
                max="2"
                step="0.05"
                type="number"
              />
            </label>
            <label>
              <span>Cursor</span>
              <select name="cursorStyle" defaultValue={terminalSettings.cursorStyle}>
                <option value="block">Block</option>
                <option value="bar">Bar</option>
                <option value="underline">Underline</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              <span>Scrollback</span>
              <input
                name="scrollbackLines"
                defaultValue={terminalSettings.scrollbackLines}
                min="100"
                max="100000"
                step="100"
                type="number"
              />
            </label>
            <label>
              <span>Default shell</span>
              <input name="defaultShell" defaultValue={terminalSettings.defaultShell} required />
            </label>
          </div>
        </section>

        <section className="settings-toggles">
          <label>
            <input
              name="copyOnSelect"
              type="checkbox"
              defaultChecked={terminalSettings.copyOnSelect}
            />
            <span>Copy terminal selection automatically</span>
          </label>
          <label>
            <input
              name="confirmMultilinePaste"
              type="checkbox"
              defaultChecked={terminalSettings.confirmMultilinePaste}
            />
            <span>Confirm multiline paste before sending input</span>
          </label>
        </section>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="dialog-actions">
          <button className="toolbar-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="approve-button" type="submit">
            <Check size={15} />
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
}

function AssistantPanel() {
  const [selectedSuggestion, setSelectedSuggestion] = useState(aiSuggestions[0].id);
  const suggestion = aiSuggestions.find((item) => item.id === selectedSuggestion) ?? aiSuggestions[0];

  return (
    <aside className="assistant-panel">
      <div className="assistant-header">
        <div>
          <p className="panel-label">Command assist</p>
          <h2>Ask before execute</h2>
        </div>
        <PanelRight size={17} />
      </div>

      <div className="assistant-context">
        <Bot size={16} />
        <span>Scoped to active session output. No command runs without approval.</span>
      </div>

      <div className="suggestion-list">
        {aiSuggestions.map((item) => (
          <button
            className={item.id === selectedSuggestion ? "suggestion active" : "suggestion"}
            key={item.id}
            onClick={() => setSelectedSuggestion(item.id)}
          >
            <span>{item.title}</span>
            <small>{item.risk}</small>
          </button>
        ))}
      </div>

      <section className="approval-card">
        <header>
          <span>Proposed command</span>
          <strong>{suggestion.risk}</strong>
        </header>
        <pre>
          <code>{suggestion.command}</code>
        </pre>
        <p>{suggestion.reason}</p>
        <div className="approval-actions">
          <button className="toolbar-button">
            <X size={15} />
            Reject
          </button>
          <button className="approve-button">
            <Check size={15} />
            Approve
          </button>
        </div>
      </section>

      <section className="settings-stack">
        <div>
          <Database size={15} />
          <span>SQLite connections</span>
          <strong>Planned</strong>
        </div>
        <div>
          <KeyRound size={15} />
          <span>OS keychain</span>
          <strong>Planned</strong>
        </div>
        <div>
          <Tags size={15} />
          <span>OpenAI-compatible endpoint</span>
          <strong>BYO key</strong>
        </div>
      </section>
    </aside>
  );
}

function StatusBar() {
  return (
    <footer className="status-bar">
      <span>
        <HardDrive size={13} />
        Local-first
      </span>
      <span>Telemetry off</span>
      <span>Windows acceptance target</span>
    </footer>
  );
}

export default App;
