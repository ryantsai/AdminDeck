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
  RefreshCw,
  Search,
  SendHorizontal,
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
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import "@xterm/xterm/css/xterm.css";
import "./App.css";
import {
  invokeCommand,
  isTauriRuntime,
  type LocalDirectoryEntry,
  type SftpDirectoryEntry,
  type SftpTransferProgress,
  type SftpTransferResult,
  type SshConfigImportPreview,
  type SshHostKeyPreview,
  type TerminalOutput,
} from "./lib/tauri";
import { aiSuggestions, connectionGroups } from "./sample-data";
import { useWorkspaceStore } from "./store";
import type {
  Connection,
  ConnectionGroup,
  ConnectionStatus,
  ConnectionType,
  CreateConnectionRequest,
  FileEntry,
  SftpSettings,
  SshSettings,
  TerminalPane,
  TerminalSettings,
  WorkspaceTab,
} from "./types";

type DraggedTreeItem =
  | { kind: "folder"; folderId: string }
  | { kind: "connection"; connectionId: string };

type ConnectionDialogRequest = CreateConnectionRequest & {
  password?: string;
};

type TransferRecord = {
  id: string;
  direction: "upload" | "download";
  name: string;
  state: "queued" | "active" | "done" | "failed" | "canceled";
  progress: number;
  detail: string;
  overwriteBehavior: SftpSettings["overwriteBehavior"];
  localPath?: string;
  remoteDirectory?: string;
  remotePath?: string;
  localDirectory?: string;
};

type AssistantDraft = {
  id: string;
  title: string;
  risk: string;
  command: string;
  reason: string;
  contextLabel: string;
  status: "pending" | "approved" | "rejected";
};

function App() {
  const [bootstrap, setBootstrap] = useState("Starting local runtime");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionRefreshToken, setConnectionRefreshToken] = useState(0);
  const setTerminalSettings = useWorkspaceStore((state) => state.setTerminalSettings);
  const setSshSettings = useWorkspaceStore((state) => state.setSshSettings);
  const setSftpSettings = useWorkspaceStore((state) => state.setSftpSettings);

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

  useEffect(() => {
    invokeCommand("get_ssh_settings")
      .then(setSshSettings)
      .catch(() => undefined);
  }, [setSshSettings]);

  useEffect(() => {
    invokeCommand("get_sftp_settings")
      .then(setSftpSettings)
      .catch(() => undefined);
  }, [setSftpSettings]);

  return (
    <div className="app-shell">
      <ActivityRail onOpenSettings={() => setSettingsOpen(true)} />
      <ConnectionSidebar refreshToken={connectionRefreshToken} />
      <main className="workspace">
        <TopBar
          onConnectionsChanged={() => setConnectionRefreshToken((token) => token + 1)}
          runtimeStatus={bootstrap}
        />
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

function ConnectionSidebar({ refreshToken }: { refreshToken: number }) {
  const query = useWorkspaceStore((state) => state.query);
  const setQuery = useWorkspaceStore((state) => state.setQuery);
  const openConnection = useWorkspaceStore((state) => state.openConnection);
  const activeSessionCounts = useWorkspaceStore((state) => state.activeSessionCounts);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const [groups, setGroups] = useState<ConnectionGroup[]>(connectionGroups);
  const [formMode, setFormMode] = useState<"save" | "quick" | null>(null);
  const [formError, setFormError] = useState("");
  const [treeError, setTreeError] = useState("");
  const [draggedItem, setDraggedItem] = useState<DraggedTreeItem | null>(null);
  const [dropTarget, setDropTarget] = useState("");

  useEffect(() => {
    void reloadConnectionGroups();
  }, [refreshToken]);

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

  async function storeConnectionPassword(connectionId: string, password: string) {
    if (!isTauriRuntime()) {
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

  async function handleConnectionSubmit(request: ConnectionDialogRequest) {
    setFormError("");
    const { password, ...connectionRequest } = request;
    if (formMode === "save") {
      try {
        const connection = await invokeCommand("create_connection", {
          request: connectionRequest,
        });
        if (password) {
          await storeConnectionPassword(connection.id, password);
        }
        handleConnectionReady({ ...connection, hasPassword: Boolean(password) });
      } catch (error) {
        setFormError(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    const connection: Connection = {
      id: `quick-${Date.now()}`,
      name: connectionRequest.name || connectionRequest.host,
      host: connectionRequest.host,
      user: connectionRequest.user,
      port: connectionRequest.port,
      keyPath: connectionRequest.keyPath,
      proxyJump: connectionRequest.proxyJump,
      authMethod: connectionRequest.authMethod,
      hasPassword: Boolean(password),
      type: connectionRequest.type,
      tags: connectionRequest.tags,
      status: "idle",
    };

    try {
      if (password) {
        await storeConnectionPassword(connection.id, password);
      }
      handleConnectionReady(connection);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
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
          sshSettings={sshSettings}
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
  sshSettings,
  onCancel,
  onSubmit,
}: {
  error: string;
  groups: ConnectionGroup[];
  mode: "save" | "quick";
  sshSettings: SshSettings;
  onCancel: () => void;
  onSubmit: (request: ConnectionDialogRequest) => void | Promise<void>;
}) {
  const [connectionType, setConnectionType] = useState<ConnectionType>("ssh");
  const [authMethod, setAuthMethod] = useState<"keyFile" | "password" | "agent">("keyFile");
  const usesSshDefaults = connectionType !== "local";
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
    const password = String(form.get("password") ?? "");
    const keyPath = String(form.get("keyPath") ?? "").trim();
    const proxyJump = String(form.get("proxyJump") ?? "").trim();
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
      keyPath: usesSshDefaults && authMethod === "keyFile" ? keyPath || undefined : undefined,
      proxyJump: proxyJump || undefined,
      authMethod: usesSshDefaults ? authMethod : undefined,
      password: usesSshDefaults && authMethod === "password" ? password : undefined,
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
            <input
              key={`user-${connectionType}`}
              name="user"
              defaultValue={usesSshDefaults ? sshSettings.defaultUser : "local"}
              placeholder={usesSshDefaults ? "admin" : "local"}
              required
            />
          </label>
          <label>
            <span>Port</span>
            <input
              key={`port-${connectionType}`}
              name="port"
              defaultValue={usesSshDefaults ? sshSettings.defaultPort : undefined}
              inputMode="numeric"
              min="1"
              max="65535"
              type="number"
              placeholder={usesSshDefaults ? "22" : ""}
            />
          </label>
        </div>

        {usesSshDefaults ? (
          <>
            <div className="form-grid">
              <label>
                <span>Auth</span>
                <select
                  name="authMethod"
                  value={authMethod}
                  onChange={(event) =>
                    setAuthMethod(event.currentTarget.value as "keyFile" | "password" | "agent")
                  }
                >
                  <option value="keyFile">Key file</option>
                  <option value="password">Password</option>
                  <option value="agent">SSH agent</option>
                </select>
              </label>
              <label>
                <span>Proxy jump</span>
                <input
                  name="proxyJump"
                  defaultValue={sshSettings.defaultProxyJump ?? ""}
                  placeholder="jump.internal"
                />
              </label>
            </div>

            {authMethod === "password" ? (
              <label>
                <span>Password</span>
                <input
                  name="password"
                  placeholder="Stored in OS keychain"
                  required
                  type="password"
                />
              </label>
            ) : authMethod === "keyFile" ? (
              <label>
                <span>Key path</span>
                <input
                  name="keyPath"
                  defaultValue={sshSettings.defaultKeyPath ?? ""}
                  placeholder="C:\\Users\\ryan\\.ssh\\id_ed25519"
                />
              </label>
            ) : null}
          </>
        ) : null}

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

function TopBar({
  onConnectionsChanged,
  runtimeStatus,
}: {
  onConnectionsChanged: () => void;
  runtimeStatus: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<SshConfigImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [savingImport, setSavingImport] = useState(false);

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      setImportError("");
      const content = await file.text();
      setImportPreview(
        await invokeCommand("import_ssh_config", {
          request: { content, folderId: "manual", tags: [] },
        }),
      );
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSaveImportedConnections() {
    if (!importPreview || importPreview.drafts.length === 0) {
      return;
    }

    try {
      setSavingImport(true);
      setImportError("");
      for (const draft of importPreview.drafts) {
        await invokeCommand("create_connection", { request: draft });
      }
      setImportPreview(null);
      onConnectionsChanged();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingImport(false);
    }
  }

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
        <input
          accept=".conf,.config,.txt"
          className="hidden-file-input"
          onChange={(event) => void handleImportFileChange(event)}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="icon-button"
          aria-label="Import SSH config"
          onClick={() => fileInputRef.current?.click()}
          title="Import SSH config"
        >
          <FileCode2 size={15} />
        </button>
        <button className="icon-button" aria-label="Secrets" title="Secrets">
          <KeyRound size={15} />
        </button>
      </div>
      {importPreview || importError ? (
        <SshConfigImportDialog
          error={importError}
          onCancel={() => {
            setImportPreview(null);
            setImportError("");
          }}
          onSave={() => void handleSaveImportedConnections()}
          preview={importPreview}
          saving={savingImport}
        />
      ) : null}
    </header>
  );
}

function SshConfigImportDialog({
  error,
  onCancel,
  onSave,
  preview,
  saving,
}: {
  error: string;
  onCancel: () => void;
  onSave: () => void;
  preview: SshConfigImportPreview | null;
  saving: boolean;
}) {
  const drafts = preview?.drafts ?? [];
  const unsupportedDirectives = preview?.unsupportedDirectives ?? [];

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="import-dialog" role="dialog" aria-modal="true" aria-label="Import SSH config">
        <header>
          <div>
            <p className="panel-label">SSH config import</p>
            <h2>{drafts.length} connection drafts</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onCancel}>
            <X size={15} />
          </button>
        </header>

        {drafts.length > 0 ? (
          <div className="import-preview-list">
            {drafts.map((draft) => (
              <div className="import-preview-row" key={`${draft.name}-${draft.host}`}>
                <Server size={15} />
                <span>
                  <strong>{draft.name}</strong>
                  <small>
                    {draft.user}@{draft.host}
                    {draft.port ? `:${draft.port}` : ""}
                  </small>
                </span>
                {draft.proxyJump ? <small>via {draft.proxyJump}</small> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-import">No importable Host entries were found.</p>
        )}

        {unsupportedDirectives.length > 0 ? (
          <section className="unsupported-list">
            <header>
              <strong>Unsupported directives</strong>
              <span>{unsupportedDirectives.length}</span>
            </header>
            {unsupportedDirectives.map((item) => (
              <div className="unsupported-row" key={`${item.line}-${item.directive}-${item.value}`}>
                <span>Line {item.line}</span>
                <code>{item.directive}</code>
                <small>{item.hostPattern ?? "global"}</small>
              </div>
            ))}
          </section>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="dialog-actions">
          <button className="toolbar-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="approve-button"
            disabled={saving || drafts.length === 0}
            onClick={onSave}
            type="button"
          >
            <Check size={15} />
            {saving ? "Saving" : "Save drafts"}
          </button>
        </div>
      </section>
    </div>
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
    const terminalSessionType = connection.type === "local" ? "local" : "ssh";
    terminal.writeln(`Starting ${terminalSessionType} session for ${connection.name}...`);

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
        if (usesNativeSshHostKeyVerification(connection)) {
          terminal.writeln("Verifying SSH host key...");
          const preview = await invokeCommand("inspect_ssh_host_key", {
            request: {
              host: connection.host,
              port: connection.port,
            },
          });
          await confirmTrustedSshHostKey(preview);
        }

        const result = await invokeCommand("start_terminal_session", {
          request: {
            sessionId: requestedSessionId,
            title: connection.name,
            type: connection.type === "local" ? "local" : "ssh",
            host: connection.host,
            user: connection.user,
            port: connection.port,
            keyPath: connection.keyPath,
            proxyJump: connection.proxyJump,
            authMethod: connection.authMethod,
            secretOwnerId: connection.id,
            shell: connection.type === "local" ? terminalSettings.defaultShell : undefined,
            initialDirectory: connection.type === "local" ? undefined : pane.cwd.trim() || undefined,
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

function usesNativeSshHostKeyVerification(connection: Connection) {
  return (
    (connection.type === "ssh" || connection.type === "sftp") &&
    (Boolean(connection.keyPath?.trim()) ||
      Boolean(connection.hasPassword) ||
      connection.authMethod === "password" ||
      connection.authMethod === "agent") &&
    !connection.proxyJump?.trim()
  );
}

async function confirmTrustedSshHostKey(preview: SshHostKeyPreview) {
  if (preview.status === "trusted") {
    return;
  }

  if (preview.status === "changed") {
    throw new Error(
      `SSH host key for ${preview.host}:${preview.port} changed. Presented ${preview.algorithm} ${preview.fingerprint}.`,
    );
  }

  const shouldTrust = window.confirm(
    [
      `Trust SSH host key for ${preview.host}:${preview.port}?`,
      "",
      `${preview.algorithm} ${preview.fingerprint}`,
    ].join("\n"),
  );
  if (!shouldTrust) {
    throw new Error("SSH host key was not trusted");
  }

  await invokeCommand("trust_ssh_host_key", {
    request: {
      host: preview.host,
      port: preview.port,
      publicKey: preview.publicKey,
    },
  });
}

function SftpWorkspace({ tab }: { tab: WorkspaceTab }) {
  const sftpSettings = useWorkspaceStore((state) => state.sftpSettings);
  const openTerminalHere = useWorkspaceStore((state) => state.openTerminalHere);
  const connection = tab.connection;
  const [localPath, setLocalPath] = useState("");
  const [localFiles, setLocalFiles] = useState<FileEntry[]>([]);
  const [remotePath, setRemotePath] = useState(".");
  const [remoteFiles, setRemoteFiles] = useState<FileEntry[]>([]);
  const [status, setStatus] = useState("Connecting");
  const [localStatus, setLocalStatus] = useState("");
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const [selectedLocalName, setSelectedLocalName] = useState<string | null>(null);
  const [selectedRemoteName, setSelectedRemoteName] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const activeTransferIdRef = useRef<string | null>(null);
  const markConnectionSessionStarted = useWorkspaceStore(
    (state) => state.markConnectionSessionStarted,
  );
  const markConnectionSessionEnded = useWorkspaceStore(
    (state) => state.markConnectionSessionEnded,
  );

  useEffect(() => {
    void loadLocalDirectory();
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let dispose: (() => void) | undefined;
    let disposed = false;
    void listen<SftpTransferProgress>("sftp-transfer-progress", (event) => {
      const progress = event.payload;
      setTransfers((current) =>
        current.map((transfer) =>
          transfer.id === progress.transferId
            ? {
                ...transfer,
                progress: progress.progress,
                detail:
                  progress.totalBytes > 0
                    ? `${formatFileSize(progress.transferredBytes)} / ${formatFileSize(
                        progress.totalBytes,
                      )}`
                    : `${formatFileSize(progress.transferredBytes)} transferred`,
              }
            : transfer,
        ),
      );
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      dispose = unlisten;
    });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, []);

  const loadLocalDirectory = async (path?: string) => {
    if (!isTauriRuntime()) {
      setLocalStatus("Tauri runtime unavailable");
      setLocalFiles([]);
      return;
    }

    setIsLocalLoading(true);
    setLocalStatus(path ? "Opening folder" : "Loading local files");
    try {
      const result = await invokeCommand("list_local_directory", {
        request: { path },
      });
      setLocalPath(result.path);
      setLocalFiles(result.entries.map(localEntryToFileEntry));
      setSelectedLocalName(null);
      setLocalStatus("");
    } catch (error) {
      setLocalStatus(String(error));
      setLocalFiles([]);
    } finally {
      setIsLocalLoading(false);
    }
  };

  useEffect(() => {
    if (!connection) {
      setStatus("No SFTP connection selected");
      return;
    }

    if (!isTauriRuntime()) {
      setStatus("Tauri runtime unavailable");
      return;
    }

    let disposed = false;
    let sessionStarted = false;
    const requestedSessionId = `${connection.id}-sftp-${Date.now()}`;
    sessionIdRef.current = requestedSessionId;
    setIsRemoteLoading(true);
    setStatus("Verifying host");

    (async () => {
      try {
        if (usesNativeSshHostKeyVerification(connection)) {
          const preview = await invokeCommand("inspect_ssh_host_key", {
            request: {
              host: connection.host,
              port: connection.port,
            },
          });
          await confirmTrustedSshHostKey(preview);
        }

        setStatus("Opening SFTP");
        const result = await invokeCommand("start_sftp_session", {
          request: {
            sessionId: requestedSessionId,
            title: connection.name,
            host: connection.host,
            user: connection.user,
            port: connection.port,
            keyPath: connection.keyPath,
            proxyJump: connection.proxyJump,
            authMethod: connection.authMethod,
            secretOwnerId: connection.id,
            path: ".",
          },
        });

        if (disposed) {
          void invokeCommand("close_sftp_session", { sessionId: result.sessionId });
          return;
        }

        sessionIdRef.current = result.sessionId;
        sessionStarted = true;
        markConnectionSessionStarted(connection.id);
        setRemotePath(result.path);
        setRemoteFiles(result.entries.map(remoteEntryToFileEntry));
        setSelectedRemoteName(null);
        setStatus("Connected");
      } catch (error) {
        if (!disposed) {
          setStatus(String(error));
          setRemoteFiles([]);
        }
      } finally {
        if (!disposed) {
          setIsRemoteLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void invokeCommand("close_sftp_session", { sessionId });
      }
      if (sessionStarted) {
        markConnectionSessionEnded(connection.id);
      }
      sessionIdRef.current = null;
    };
  }, [connection, markConnectionSessionEnded, markConnectionSessionStarted]);

  const refreshRemoteDirectory = async () => {
    await loadRemoteDirectory(remotePath, "Refreshing");
  };

  const loadRemoteDirectory = async (path: string, loadingStatus = "Opening folder") => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !isTauriRuntime()) {
      return;
    }

    setIsRemoteLoading(true);
    setStatus(loadingStatus);
    try {
      const result = await invokeCommand("list_sftp_directory", {
        request: { sessionId, path },
      });
      setRemotePath(result.path);
      setRemoteFiles(result.entries.map(remoteEntryToFileEntry));
      setSelectedRemoteName(null);
      setStatus("Connected");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setIsRemoteLoading(false);
    }
  };

  const openRemoteFolder = async (folderName: string) => {
    await loadRemoteDirectory(joinRemotePath(remotePath, folderName));
  };

  const openRemoteParent = async () => {
    await loadRemoteDirectory(joinRemotePath(remotePath, ".."));
  };

  const refreshLocalDirectory = async () => {
    await loadLocalDirectory(localPath || undefined);
  };

  const openLocalFolder = async (folderName: string) => {
    await loadLocalDirectory(joinLocalPath(localPath, folderName));
  };

  const openLocalParent = async () => {
    await loadLocalDirectory(joinLocalPath(localPath, ".."));
  };

  const setTransferState = (id: string, patch: Partial<TransferRecord>) => {
    setTransfers((current) =>
      current.map((transfer) => (transfer.id === id ? { ...transfer, ...patch } : transfer)),
    );
  };

  const runQueuedTransfer = async (transfer: TransferRecord) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !isTauriRuntime()) {
      setTransferState(transfer.id, {
        state: "failed",
        progress: 100,
        detail: "SFTP session unavailable",
      });
      activeTransferIdRef.current = null;
      return;
    }

    setTransferState(transfer.id, {
      state: "active",
      detail: "Preparing",
    });

    try {
      const result =
        transfer.direction === "upload"
          ? await invokeCommand("upload_sftp_path", {
              request: {
                sessionId,
                transferId: transfer.id,
                localPath: transfer.localPath ?? "",
                remoteDirectory: transfer.remoteDirectory ?? remotePath,
                overwriteBehavior: transfer.overwriteBehavior,
              },
            })
          : await invokeCommand("download_sftp_path", {
              request: {
                sessionId,
                transferId: transfer.id,
                remotePath: transfer.remotePath ?? "",
                localDirectory: transfer.localDirectory ?? localPath,
                overwriteBehavior: transfer.overwriteBehavior,
              },
            });

      setTransferState(transfer.id, {
        state: "done",
        progress: 100,
        detail: formatTransferResult(result),
      });

      if (transfer.direction === "upload") {
        await refreshRemoteDirectory();
      } else {
        await refreshLocalDirectory();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTransferState(transfer.id, {
        state: message.includes("transfer canceled") ? "canceled" : "failed",
        progress: 100,
        detail: message.includes("transfer canceled") ? "Canceled" : message,
      });
    } finally {
      activeTransferIdRef.current = null;
      setTransfers((current) => [...current]);
    }
  };

  useEffect(() => {
    if (activeTransferIdRef.current) {
      return;
    }

    const nextTransfer = transfers.find((transfer) => transfer.state === "queued");
    if (!nextTransfer) {
      return;
    }

    activeTransferIdRef.current = nextTransfer.id;
    void runQueuedTransfer(nextTransfer);
  }, [transfers]);

  const enqueueTransfer = (transfer: TransferRecord) => {
    setTransfers((current) => [...current, transfer]);
  };

  const handleUpload = () => {
    const sessionId = sessionIdRef.current;
    const selected = localFiles.find((file) => file.name === selectedLocalName);
    if (!sessionId || !selected || !localPath || !isTauriRuntime()) {
      return;
    }

    const transferId = `upload-${Date.now()}`;
    enqueueTransfer({
      id: transferId,
      direction: "upload",
      name: selected.name,
      state: "queued",
      progress: 0,
      detail: "Waiting",
      overwriteBehavior: sftpSettings.overwriteBehavior,
      localPath: joinLocalPath(localPath, selected.name),
      remoteDirectory: remotePath,
    });
  };

  const handleDownload = () => {
    const sessionId = sessionIdRef.current;
    const selected = remoteFiles.find((file) => file.name === selectedRemoteName);
    if (!sessionId || !selected || !localPath || !isTauriRuntime()) {
      return;
    }

    const transferId = `download-${Date.now()}`;
    enqueueTransfer({
      id: transferId,
      direction: "download",
      name: selected.name,
      state: "queued",
      progress: 0,
      detail: "Waiting",
      overwriteBehavior: sftpSettings.overwriteBehavior,
      remotePath: joinRemotePath(remotePath, selected.name),
      localDirectory: localPath,
    });
  };

  const handleCancelTransfer = async (transfer: TransferRecord) => {
    if (transfer.state === "queued") {
      setTransferState(transfer.id, {
        state: "canceled",
        progress: 100,
        detail: "Canceled before start",
      });
      return;
    }

    if (transfer.state !== "active") {
      return;
    }

    setTransferState(transfer.id, { detail: "Canceling" });
    try {
      await invokeCommand("cancel_sftp_transfer", {
        request: { transferId: transfer.id },
      });
    } catch (error) {
      setTransferState(transfer.id, {
        state: "failed",
        progress: 100,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleCreateRemoteFolder = async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !isTauriRuntime()) {
      return;
    }

    const name = window.prompt("New remote folder name");
    if (name === null) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatus("Remote folder name cannot be blank");
      return;
    }

    setIsRemoteLoading(true);
    setStatus("Creating folder");
    try {
      await invokeCommand("create_sftp_folder", {
        request: {
          sessionId,
          parentPath: remotePath,
          name: trimmedName,
        },
      });
      await refreshRemoteDirectory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRemoteLoading(false);
    }
  };

  const handleRenameRemotePath = async () => {
    const sessionId = sessionIdRef.current;
    const selected = remoteFiles.find((file) => file.name === selectedRemoteName);
    if (!sessionId || !selected || !isTauriRuntime()) {
      return;
    }

    const name = window.prompt("Rename remote item", selected.name);
    if (name === null) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatus("Remote name cannot be blank");
      return;
    }
    if (trimmedName === selected.name) {
      return;
    }

    setIsRemoteLoading(true);
    setStatus("Renaming");
    try {
      await invokeCommand("rename_sftp_path", {
        request: {
          sessionId,
          path: joinRemotePath(remotePath, selected.name),
          newName: trimmedName,
        },
      });
      await refreshRemoteDirectory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRemoteLoading(false);
    }
  };

  const handleDeleteRemotePath = async () => {
    const sessionId = sessionIdRef.current;
    const selected = remoteFiles.find((file) => file.name === selectedRemoteName);
    if (!sessionId || !selected || !isTauriRuntime()) {
      return;
    }

    const shouldDelete = window.confirm(`Delete remote ${selected.kind} "${selected.name}"?`);
    if (!shouldDelete) {
      return;
    }

    setIsRemoteLoading(true);
    setStatus("Deleting");
    try {
      await invokeCommand("delete_sftp_path", {
        request: {
          sessionId,
          path: joinRemotePath(remotePath, selected.name),
        },
      });
      await refreshRemoteDirectory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRemoteLoading(false);
    }
  };

  const handleOpenTerminalHere = () => {
    if (!connection || !isConnected) {
      return;
    }

    openTerminalHere(connection, remotePath);
  };

  const isConnected = status === "Connected" && Boolean(sessionIdRef.current);
  const isTransferring = transfers.some((transfer) => transfer.state === "active");
  const activeTransferCount = transfers.filter((transfer) => transfer.state === "active").length;

  return (
    <section className="sftp-workspace">
      <div className="workspace-toolbar">
        <div>
          <strong>{tab.title}</strong>
          <span>{status === "Connected" ? tab.subtitle : status}</span>
        </div>
        <div className="toolbar-cluster">
          <button
            className="toolbar-button"
            disabled={!isConnected || !selectedLocalName}
            onClick={handleUpload}
            type="button"
          >
            <Upload size={15} />
            Upload
          </button>
          <button
            className="toolbar-button"
            disabled={!isConnected || !selectedRemoteName || !localPath}
            onClick={handleDownload}
            type="button"
          >
            <Download size={15} />
            Download
          </button>
          <button
            className="toolbar-button"
            disabled={!isConnected}
            onClick={handleOpenTerminalHere}
            type="button"
          >
            <Terminal size={15} />
            Terminal
          </button>
        </div>
      </div>

      <div className="file-manager">
        <FilePane
          title="Local"
          path={localPath || localStatus || "Local files"}
          files={localFiles}
          isLoading={isLocalLoading}
          status={localStatus}
          selectedName={selectedLocalName}
          onRefresh={refreshLocalDirectory}
          onGoUp={openLocalParent}
          onOpenFolder={openLocalFolder}
          onSelectFile={setSelectedLocalName}
        />
        <FilePane
          title="Remote"
          path={remotePath}
          files={remoteFiles}
          isLoading={isRemoteLoading}
          status={status === "Connected" ? "" : status}
          selectedName={selectedRemoteName}
          onRefresh={refreshRemoteDirectory}
          onGoUp={openRemoteParent}
          onCreateFolder={isConnected && !isTransferring ? handleCreateRemoteFolder : undefined}
          onRenameSelected={isConnected && !isTransferring ? handleRenameRemotePath : undefined}
          onDeleteSelected={isConnected && !isTransferring ? handleDeleteRemotePath : undefined}
          onOpenFolder={openRemoteFolder}
          onSelectFile={setSelectedRemoteName}
        />
      </div>

      <div className="transfer-queue">
        <header>
          <strong>Transfer activity</strong>
          <span>{activeTransferCount} active</span>
        </header>
        {transfers.length === 0 ? (
          <div className="transfer-row transfer-row-muted">No transfers yet</div>
        ) : null}
        {transfers.map((transfer) => (
          <div className="transfer-row" key={transfer.id}>
            <span>
              {transfer.direction === "upload" ? "Upload" : "Download"} {transfer.name}
            </span>
            <progress value={transfer.progress} max="100" />
            <small className={`transfer-state transfer-state-${transfer.state}`}>
              {transfer.state}
            </small>
            <small>{transfer.detail}</small>
            <button
              className="row-action"
              aria-label={`Cancel ${transfer.name}`}
              disabled={!["active", "queued"].includes(transfer.state)}
              onClick={() => void handleCancelTransfer(transfer)}
              title={`Cancel ${transfer.name}`}
              type="button"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function localEntryToFileEntry(entry: LocalDirectoryEntry): FileEntry {
  return {
    name: entry.name,
    kind: entry.kind,
    size: entry.kind === "folder" ? "-" : formatFileSize(entry.size),
    modified: formatRemoteTime(entry.modified),
  };
}

function remoteEntryToFileEntry(entry: SftpDirectoryEntry): FileEntry {
  return {
    name: entry.name,
    kind: entry.kind,
    size: entry.kind === "folder" ? "-" : formatFileSize(entry.size),
    modified: formatRemoteTime(entry.modified),
  };
}

function formatTransferResult(result: SftpTransferResult) {
  const parts = [`${result.files} files`];
  if (result.folders > 0) {
    parts.push(`${result.folders} folders`);
  }
  parts.push(formatFileSize(result.bytes));
  return parts.join(" | ");
}

function joinRemotePath(basePath: string, childName: string) {
  if (!basePath || basePath === ".") {
    return childName;
  }
  if (basePath.endsWith("/")) {
    return `${basePath}${childName}`;
  }
  return `${basePath}/${childName}`;
}

function joinLocalPath(basePath: string, childName: string) {
  if (!basePath) {
    return childName;
  }
  if (basePath.endsWith("\\") || basePath.endsWith("/")) {
    return `${basePath}${childName}`;
  }
  return `${basePath}\\${childName}`;
}

function formatFileSize(size?: number) {
  if (size === undefined) {
    return "-";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatRemoteTime(timestamp?: number) {
  if (!timestamp) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function FilePane({
  title,
  path,
  files,
  isLoading = false,
  status = "",
  selectedName,
  onRefresh,
  onGoUp,
  onCreateFolder,
  onRenameSelected,
  onDeleteSelected,
  onOpenFolder,
  onSelectFile,
}: {
  title: string;
  path: string;
  files: FileEntry[];
  isLoading?: boolean;
  status?: string;
  selectedName?: string | null;
  onRefresh?: () => void;
  onGoUp?: () => void;
  onCreateFolder?: () => void;
  onRenameSelected?: () => void;
  onDeleteSelected?: () => void;
  onOpenFolder?: (folderName: string) => void;
  onSelectFile?: (fileName: string) => void;
}) {
  const hasMutationActions = Boolean(onCreateFolder || onRenameSelected || onDeleteSelected);

  return (
    <article className="file-pane">
      <header>
        <div>
          <strong>{title}</strong>
          <span>{path}</span>
        </div>
        <div className="file-pane-actions">
          <button
            className="icon-button"
            aria-label={`Open parent ${title.toLowerCase()} folder`}
            disabled={!onGoUp || isLoading}
            onClick={onGoUp}
            title={`Open parent ${title.toLowerCase()} folder`}
            type="button"
          >
            <ChevronDown className="up-icon" size={15} />
          </button>
          {hasMutationActions && (
            <>
              <button
                className="icon-button"
                aria-label={`Create ${title.toLowerCase()} folder`}
                disabled={!onCreateFolder || isLoading}
                onClick={onCreateFolder}
                title={`Create ${title.toLowerCase()} folder`}
                type="button"
              >
                <FolderPlus size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Rename selected ${title.toLowerCase()} item`}
                disabled={!onRenameSelected || !selectedName || isLoading}
                onClick={onRenameSelected}
                title={`Rename selected ${title.toLowerCase()} item`}
                type="button"
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete selected ${title.toLowerCase()} item`}
                disabled={!onDeleteSelected || !selectedName || isLoading}
                onClick={onDeleteSelected}
                title={`Delete selected ${title.toLowerCase()} item`}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
          <button
            className="icon-button"
            aria-label={`Refresh ${title.toLowerCase()} files`}
            disabled={!onRefresh || isLoading}
            onClick={onRefresh}
            title={`Refresh ${title.toLowerCase()} files`}
            type="button"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>
      <div className="file-table">
        {isLoading && <div className="file-row file-row-muted">Loading...</div>}
        {!isLoading && status && <div className="file-row file-row-muted">{status}</div>}
        {!isLoading && !status && files.length === 0 && (
          <div className="file-row file-row-muted">No files</div>
        )}
        {files.map((file) => (
          <button
            className={`file-row${selectedName === file.name ? " selected" : ""}`}
            disabled={isLoading}
            key={file.name}
            onClick={() => onSelectFile?.(file.name)}
            onDoubleClick={() => {
              if (file.kind === "folder") {
                onOpenFolder?.(file.name);
              }
            }}
            title={file.kind === "folder" ? `Double-click to open ${file.name}` : file.name}
            type="button"
          >
            {file.kind === "folder" ? <Folder size={15} /> : <FileCode2 size={15} />}
            <span>{file.name}</span>
            <small>{file.size}</small>
            <small>{file.modified}</small>
          </button>
        ))}
      </div>
    </article>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const terminalSettings = useWorkspaceStore((state) => state.terminalSettings);
  const setTerminalSettings = useWorkspaceStore((state) => state.setTerminalSettings);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const setSshSettings = useWorkspaceStore((state) => state.setSshSettings);
  const sftpSettings = useWorkspaceStore((state) => state.sftpSettings);
  const setSftpSettings = useWorkspaceStore((state) => state.setSftpSettings);
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
    const sshRequest: SshSettings = {
      defaultUser: String(form.get("defaultUser") ?? "").trim(),
      defaultPort: Number(form.get("defaultPort")),
      defaultKeyPath: String(form.get("defaultKeyPath") ?? "").trim() || undefined,
      defaultProxyJump: String(form.get("defaultProxyJump") ?? "").trim() || undefined,
    };
    const sftpRequest: SftpSettings = {
      overwriteBehavior: String(
        form.get("overwriteBehavior") ?? "fail",
      ) as SftpSettings["overwriteBehavior"],
    };

    try {
      setError("");
      if (!isTauriRuntime()) {
        setTerminalSettings(request);
        setSshSettings(sshRequest);
        setSftpSettings(sftpRequest);
        onClose();
        return;
      }

      const [updatedTerminalSettings, updatedSshSettings, updatedSftpSettings] = await Promise.all([
        invokeCommand("update_terminal_settings", { request }),
        invokeCommand("update_ssh_settings", { request: sshRequest }),
        invokeCommand("update_sftp_settings", { request: sftpRequest }),
      ]);
      setTerminalSettings(updatedTerminalSettings);
      setSshSettings(updatedSshSettings);
      setSftpSettings(updatedSftpSettings);
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
            <h2>Terminal, SSH, and SFTP defaults</h2>
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

        <section className="settings-section">
          <div className="settings-section-heading">
            <span>SSH defaults</span>
          </div>
          <div className="form-grid">
            <label>
              <span>Default user</span>
              <input name="defaultUser" defaultValue={sshSettings.defaultUser} required />
            </label>
            <label>
              <span>Default port</span>
              <input
                name="defaultPort"
                defaultValue={sshSettings.defaultPort}
                inputMode="numeric"
                min="1"
                max="65535"
                type="number"
              />
            </label>
          </div>
          <label>
            <span>Default key path</span>
            <input
              name="defaultKeyPath"
              defaultValue={sshSettings.defaultKeyPath ?? ""}
              placeholder="C:\\Users\\ryan\\.ssh\\id_ed25519"
            />
          </label>
          <label>
            <span>Default proxy jump</span>
            <input
              name="defaultProxyJump"
              defaultValue={sshSettings.defaultProxyJump ?? ""}
              placeholder="jump.internal"
            />
          </label>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <span>SFTP defaults</span>
          </div>
          <label>
            <span>Existing destination</span>
            <select name="overwriteBehavior" defaultValue={sftpSettings.overwriteBehavior}>
              <option value="fail">Stop transfer</option>
              <option value="overwrite">Overwrite files</option>
            </select>
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
  const activeTab = useWorkspaceStore((state) =>
    state.tabs.find((tab) => tab.id === state.activeTabId),
  );
  const [selectedSuggestion, setSelectedSuggestion] = useState(aiSuggestions[0].id);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const suggestion = aiSuggestions.find((item) => item.id === selectedSuggestion) ?? aiSuggestions[0];
  const contextLabel = activeTab
    ? `${activeTab.title} - ${activeTab.kind === "sftp" ? "SFTP browser" : "Terminal"}`
    : "No active session";
  const connectionLabel = activeTab?.connection
    ? `${activeTab.connection.user}@${activeTab.connection.host}`
    : "Workspace";

  function handleSuggestionSelect(suggestionId: string) {
    const nextSuggestion = aiSuggestions.find((item) => item.id === suggestionId);
    setSelectedSuggestion(suggestionId);
    if (nextSuggestion) {
      setPrompt(nextSuggestion.title);
    }
  }

  function handleDraftProposal() {
    const normalizedPrompt = prompt.trim();
    setDraft({
      id: `${suggestion.id}-${Date.now()}`,
      title: normalizedPrompt || suggestion.title,
      risk: suggestion.risk,
      command: suggestion.command,
      reason: suggestion.reason,
      contextLabel,
      status: "pending",
    });
  }

  function handleCopyCommand(command: string) {
    void navigator.clipboard?.writeText(command);
  }

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
        <span>
          <strong>{contextLabel}</strong>
          <small>{connectionLabel}</small>
        </span>
      </div>

      <label className="assistant-composer">
        <span>Request</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          placeholder="Draft a command for the active session"
          rows={4}
        />
      </label>
      <button
        className="approve-button"
        disabled={!activeTab}
        onClick={handleDraftProposal}
        type="button"
      >
        <SendHorizontal size={15} />
        Draft proposal
      </button>

      <div className="suggestion-list">
        {aiSuggestions.map((item) => (
          <button
            className={item.id === selectedSuggestion ? "suggestion active" : "suggestion"}
            key={item.id}
            onClick={() => handleSuggestionSelect(item.id)}
            type="button"
          >
            <span>{item.title}</span>
            <small>{item.risk}</small>
          </button>
        ))}
      </div>

      <section className={`approval-card ${draft ? `approval-card-${draft.status}` : ""}`}>
        <header>
          <span>{draft ? draft.contextLabel : "Proposed command"}</span>
          <strong>{draft?.status ?? "pending"}</strong>
        </header>
        {draft ? (
          <>
            <pre>
              <code>{draft.command}</code>
            </pre>
            <p>{draft.reason}</p>
          </>
        ) : (
          <p className="approval-empty">No proposal staged.</p>
        )}
        <div className="approval-actions">
          <button
            className="toolbar-button"
            disabled={!draft}
            onClick={() => draft && setDraft({ ...draft, status: "rejected" })}
            type="button"
          >
            <X size={15} />
            Reject
          </button>
          <button
            className="toolbar-button"
            disabled={!draft}
            onClick={() => draft && handleCopyCommand(draft.command)}
            type="button"
          >
            <Copy size={15} />
            Copy
          </button>
          <button
            className="approve-button"
            disabled={!draft}
            onClick={() => draft && setDraft({ ...draft, status: "approved" })}
            type="button"
          >
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
