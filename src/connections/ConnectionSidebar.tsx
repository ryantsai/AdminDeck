import { ConnectionIcon } from "./ConnectionIcon";
import { ImportDialog } from "./ImportDialog";
import { confirmTrustedSshHostKey, defaultPortForConnectionType, connectionSubtitle, connectionTypeLabel, isRemoteDesktopConnectionType, localShellOptionsForPlatform, uniqueRuntimeId, type LocalShellOption } from "./utils";
import { collectConnectionFolderIds, countConnections, countFolders, filterConnectionTree, flattenConnections, flattenFolders, upsertRootConnection, withLiveConnectionStatuses } from "./treeUtils";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, Download, Folder, FolderPlus, KeyRound, PanelRight, Play, Plus, Save, Search, Server, Terminal, X } from "lucide-react";
import { AddComputer as IconParkAddComputer, CollapseTextInput as IconParkCollapseTextInput, Delete as IconParkDelete, Edit as IconParkEdit, ExpandTextInput as IconParkExpandTextInput, FolderPlus as IconParkFolderPlus, Setting as IconParkSetting } from "@icon-park/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { ariaExpanded, dialogButtonAria } from "../lib/aria";
import { invokeCommand, isTauriRuntime, selectKeyFile } from "../lib/tauri";
import { connectionTree } from "../sample-data";
import { useWorkspaceStore } from "../store";
import type { Connection, ConnectionFolder, ConnectionStatus, ConnectionTree, ConnectionType, CreateConnectionRequest, SplitDirection, SshSettings, UpdateConnectionRequest } from "../types";

type DraggedTreeItem =
  | { kind: "folder"; folderId: string }
  | { kind: "connection"; connectionId: string };

type TreeDropTarget =
  | { kind: "root"; targetIndex: number }
  | { kind: "folder"; folderId: string; targetIndex: number }
  | {
      kind: "connection";
      folderId?: string;
      connectionId: string;
      targetIndex: number;
    };

type TreeDragPreview = {
  kind: "folder" | "connection";
  title: string;
  subtitle?: string;
  connectionType?: ConnectionType;
  connectionStatus?: ConnectionStatus;
  connectionCount?: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

type PendingFolderDraft = {
  parentFolderId?: string;
};

type TreeContextMenuState =
  | {
      kind: "tree";
      x: number;
      y: number;
    }
  | {
      kind: "folder";
      folder: ConnectionFolder;
      x: number;
      y: number;
    }
  | {
      kind: "connection";
      connection: Connection;
      folderId?: string;
      x: number;
      y: number;
    };

type EditConnectionState = {
  connection: Connection;
  folderId?: string;
};

type TransferSshPublicKeyDialogState = {
  connection: Connection;
  keyPath?: string;
};

type ConnectionDialogRequest = CreateConnectionRequest & {
  password?: string;
  urlCredentialUsername?: string;
  urlPassword?: string;
};

type ConnectionTileType = ConnectionType;

const RECENT_CONNECTION_STORAGE_KEY = "admin-deck.recentConnectionIds";

const RECENT_CONNECTION_LIMIT = 5;

function createStoredSecretMask() {
  const maskLength = 12 + Math.floor(Math.random() * 5);
  return "*".repeat(maskLength);
}

function loadRecentConnectionIds() {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const storedIds = JSON.parse(localStorage.getItem(RECENT_CONNECTION_STORAGE_KEY) ?? "[]");
    return Array.isArray(storedIds)
      ? storedIds.filter((connectionId): connectionId is string => typeof connectionId === "string")
      : [];
  } catch {
    return [];
  }
}

function saveRecentConnectionIds(connectionIds: string[]) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(
    RECENT_CONNECTION_STORAGE_KEY,
    JSON.stringify(connectionIds.slice(0, RECENT_CONNECTION_LIMIT)),
  );
}

export function ConnectionSidebar({
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { i18n, t } = useTranslation();
  const query = useWorkspaceStore((state) => state.query);
  const setQuery = useWorkspaceStore((state) => state.setQuery);
  const openConnection = useWorkspaceStore((state) => state.openConnection);
  const refreshOpenConnectionMetadata = useWorkspaceStore((state) => state.refreshOpenConnectionMetadata);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const addConnectionToTerminalPane = useWorkspaceStore((state) => state.addConnectionToTerminalPane);
  const activeSessionCounts = useWorkspaceStore((state) => state.activeSessionCounts);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const showWorkspaceStatus = useWorkspaceStore((state) => state.showWorkspaceStatus);
  const [tree, setTree] = useState<ConnectionTree>(connectionTree);
  const [formMode, setFormMode] = useState<"save" | "quick" | null>(null);
  const [formError, setFormError] = useState("");
  const [treeError, setTreeError] = useState("");
  const [quickConnectMenuOpen, setQuickConnectMenuOpen] = useState(false);
  const [recentConnectionIds, setRecentConnectionIds] = useState(loadRecentConnectionIds);
  const [dropTarget, setDropTarget] = useState("");
  const [dragPreview, setDragPreview] = useState<TreeDragPreview | null>(null);
  const [draggedSourceId, setDraggedSourceId] = useState("");
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [pendingFolderDraft, setPendingFolderDraft] = useState<PendingFolderDraft | null>(null);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenuState | null>(null);
  const [editConnection, setEditConnection] = useState<EditConnectionState | null>(null);
  const [transferSshPublicKeyDialog, setTransferSshPublicKeyDialog] =
    useState<TransferSshPublicKeyDialogState | null>(null);
  const [transferSshPublicKeyError, setTransferSshPublicKeyError] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<
    | { kind: "connection"; connection: Connection }
    | { kind: "folder"; folder: ConnectionFolder }
    | null
  >(null);
  const quickConnectRef = useRef<HTMLDivElement | null>(null);
  const draggedItemRef = useRef<DraggedTreeItem | null>(null);
  const pointerDragTargetRef = useRef<TreeDropTarget | null>(null);
  const pointerDragListenersRef = useRef<{
    move: (event: PointerEvent) => void;
    stop: (event: PointerEvent) => void;
  } | null>(null);
  const suppressTreeClickRef = useRef(false);

  useEffect(() => {
    void reloadConnectionGroups();
    const handleTreeInvalidated = () => {
      void reloadConnectionGroups();
    };
    window.addEventListener("admindeck:connection-tree-invalidated", handleTreeInvalidated);
    return () => {
      window.removeEventListener("admindeck:connection-tree-invalidated", handleTreeInvalidated);
    };
  }, []);

  useEffect(() => {
    if (!quickConnectMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const node = quickConnectRef.current;
      if (node && !node.contains(event.target as Node)) {
        setQuickConnectMenuOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickConnectMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [quickConnectMenuOpen]);

  useEffect(
    () => () => {
      removePointerDragListeners();
    },
    [],
  );

  async function reloadConnectionGroups() {
    try {
      setTree(await invokeCommand("list_connection_tree"));
    } catch {
      setTree(connectionTree);
    }
  }

  async function handleConnectionSaved(connection: Connection, folderId?: string) {
    if (folderId) {
      await reloadConnectionGroups();
    } else {
      setTree((currentTree) => upsertRootConnection(currentTree, connection));
    }
    setFormMode(null);
    setFormError("");
    setTreeError("");
  }

  function showConnectionSuccessStatus(message: string) {
    showWorkspaceStatus(message, {
      tone: "success",
    });
  }

  function handleConnectionReady(connection: Connection) {
    setTree((currentTree) => upsertRootConnection(currentTree, connection));
    rememberConnection(connection);
    openConnection(connection);
    setFormMode(null);
    setFormError("");
    setTreeError("");
  }

  function rememberConnection(connection: Connection) {
    setRecentConnectionIds((currentIds) => {
      const nextIds = [
        connection.id,
        ...currentIds.filter((connectionId) => connectionId !== connection.id),
      ].slice(0, RECENT_CONNECTION_LIMIT);
      saveRecentConnectionIds(nextIds);
      return nextIds;
    });
  }

  function handleOpenConnection(connection: Connection) {
    rememberConnection(connection);
    openConnection(connection);
  }

  function handleAddConnectionToFocusedPane(connection: Connection, direction: SplitDirection) {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab || activeTab.kind !== "terminal") {
      handleOpenConnection(connection);
      return;
    }
    rememberConnection(connection);
    addConnectionToTerminalPane(activeTab.id, connection, direction);
  }

  async function handleTransferSshPublicKey(username: string, password: string) {
    if (!transferSshPublicKeyDialog) {
      return;
    }
    const { connection, keyPath } = transferSshPublicKeyDialog;
    setTreeError("");
    setTransferSshPublicKeyError("");
    if (connection.proxyJump?.trim()) {
      setTransferSshPublicKeyError(t("connections.transferSshPublicKeyProxyJumpUnsupported"));
      return;
    }
    try {
      const hostKeyPreview = await invokeCommand("inspect_ssh_host_key", {
        request: {
          host: connection.host,
          port: connection.port,
        },
      });
      await confirmTrustedSshHostKey(hostKeyPreview);
      const result = await invokeCommand("transfer_ssh_public_key", {
        request: {
          host: connection.host,
          port: connection.port,
          username,
          password,
          keyPath,
          proxyJump: connection.proxyJump,
        },
      });
      setTransferSshPublicKeyDialog(null);
      showConnectionSuccessStatus(t("connections.transferSshPublicKeyComplete", { path: result.publicKeyPath }));
    } catch (error) {
      setTransferSshPublicKeyError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleQuickLocalShell(option: LocalShellOption) {
    setQuickConnectMenuOpen(false);
    const connection: Connection = {
      id: uniqueRuntimeId("quick"),
      name: option.label,
      host: "localhost",
      user: "local",
      type: "local",
      localShell: option.value,
      status: "idle",
    };
    openConnection(connection);
  }

  function handleQuickSsh(connection: Connection) {
    setQuickConnectMenuOpen(false);
    openConnection(connection);
  }

  async function handleQuickAdminShell(option: LocalShellOption) {
    if (!option.value) {
      return;
    }

    setTreeError("");
    setQuickConnectMenuOpen(false);
    try {
      await invokeCommand("launch_elevated_terminal", {
        request: {
          shell: option.value,
        },
      });
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
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

  async function storeUrlPassword(connectionId: string, password: string) {
    if (!isTauriRuntime()) {
      return;
    }

    await invokeCommand("store_secret", {
      request: {
        kind: "urlPassword",
        ownerId: connectionId,
        secret: password,
      },
    });
  }

  async function upsertUrlCredential(connectionId: string, username: string) {
    if (!isTauriRuntime()) {
      return;
    }

    await invokeCommand("upsert_url_credential", {
      request: {
        connectionId,
        username,
      },
    });
  }

  async function handleConnectionSubmit(request: ConnectionDialogRequest) {
    setFormError("");
    const { password, urlCredentialUsername, urlPassword, ...connectionRequest } = request;
    if (formMode === "save") {
      try {
        const connection = await invokeCommand("create_connection", {
          request: connectionRequest,
        });
        if (password) {
          await storeConnectionPassword(connection.id, password);
        }
        if (connection.type === "url" && urlCredentialUsername && urlPassword) {
          await storeUrlPassword(connection.id, urlPassword);
          await upsertUrlCredential(connection.id, urlCredentialUsername);
        }
        await handleConnectionSaved(
          {
            ...connection,
            hasPassword: Boolean(password),
            urlCredentialUsername:
              connection.type === "url" && urlCredentialUsername ? urlCredentialUsername : undefined,
            hasUrlCredential: connection.type === "url" && Boolean(urlCredentialUsername && urlPassword),
          },
          connectionRequest.folderId,
        );
        showConnectionSuccessStatus(t("connections.createConnectionComplete", { name: connection.name }));
      } catch (error) {
        setFormError(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    const connection: Connection = {
      id: `quick-${Date.now()}`,
      name: connectionRequest.name || connectionRequest.host || connectionRequest.url || "Quick session",
      host: connectionRequest.host ?? "",
      user: connectionRequest.user ?? "",
      port: connectionRequest.port,
      keyPath: connectionRequest.keyPath,
      proxyJump: connectionRequest.proxyJump,
      authMethod: connectionRequest.authMethod,
      hasPassword: Boolean(password),
      type: connectionRequest.type,
      localShell: connectionRequest.localShell,
      serialLine: connectionRequest.serialLine,
      serialSpeed: connectionRequest.serialSpeed,
      url: connectionRequest.url,
      dataPartition: connectionRequest.dataPartition,
      useTmuxSessions: connectionRequest.useTmuxSessions,
      tmuxConnectionId:
        connectionRequest.type === "ssh" && connectionRequest.useTmuxSessions !== false
          ? uniqueRuntimeId("admindeck")
          : undefined,
      urlCredentialUsername:
        connectionRequest.type === "url" && urlCredentialUsername ? urlCredentialUsername : undefined,
      hasUrlCredential: connectionRequest.type === "url" && Boolean(urlCredentialUsername && urlPassword),
      status: "idle",
    };

    try {
      if (password) {
        await storeConnectionPassword(connection.id, password);
      }
      if (connection.type === "url" && urlCredentialUsername && urlPassword) {
        await storeUrlPassword(connection.id, urlPassword);
      }
      handleConnectionReady(connection);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleConnectionUpdate(request: ConnectionDialogRequest) {
    if (!editConnection) {
      return;
    }

    setFormError("");
    const { password, urlCredentialUsername, urlPassword, ...connectionRequest } = request;
    const updateRequest: UpdateConnectionRequest = {
      ...connectionRequest,
      id: editConnection.connection.id,
      type: editConnection.connection.type,
    };

    try {
      const connection = await invokeCommand("update_connection", {
        request: updateRequest,
      });
      if (password) {
        await storeConnectionPassword(connection.id, password);
      }
      if (connection.type === "url" && urlPassword) {
        await storeUrlPassword(connection.id, urlPassword);
      }
      if (connection.type === "url" && urlCredentialUsername) {
        await upsertUrlCredential(connection.id, urlCredentialUsername);
      }
      refreshOpenConnectionMetadata({
        ...connection,
        hasPassword: connection.hasPassword || Boolean(password),
        urlCredentialUsername:
          connection.type === "url" && urlCredentialUsername
            ? urlCredentialUsername
            : connection.urlCredentialUsername,
        hasUrlCredential:
          connection.hasUrlCredential ||
          (connection.type === "url" && Boolean(urlCredentialUsername && urlPassword)),
      });
      await reloadConnectionGroups();
      setEditConnection(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleCreateFolder(parentFolderId?: string) {
    setTreeError("");
    if (parentFolderId) {
      setCollapsedFolderIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(parentFolderId);
        return nextIds;
      });
    }
    setPendingFolderDraft({ parentFolderId });
  }

  function handleCancelPendingFolder() {
    setPendingFolderDraft(null);
  }

  async function handleCommitPendingFolder(name: string, parentFolderId?: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      handleCancelPendingFolder();
      return;
    }

    setPendingFolderDraft(null);
    await createFolder(trimmedName, parentFolderId);
  }

  async function createFolder(name: string, parentFolderId?: string) {
    if (!name) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("create_connection_folder", {
        request: { name, parentFolderId },
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRenameFolder(folder: ConnectionFolder) {
    const name = window.prompt("Rename folder", folder.name)?.trim();
    if (!name || name === folder.name) {
      return;
    }

    try {
      setTreeError("");
      await invokeCommand("rename_connection_folder", {
        request: { id: folder.id, name },
      });
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDeleteFolder(folder: ConnectionFolder) {
    try {
      setTreeError("");
      await invokeCommand("delete_connection_folder", {
        folderId: folder.id,
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
      const renamedConnection = await invokeCommand("rename_connection", {
        request: { id: connection.id, name },
      });
      refreshOpenConnectionMetadata(renamedConnection);
      await reloadConnectionGroups();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMoveFolder(
    folderId: string,
    parentFolderId: string | undefined,
    targetIndex: number,
  ) {
    try {
      setTreeError("");
      setTree(
        await invokeCommand("move_connection_folder", {
          request: { id: folderId, parentFolderId, targetIndex },
        }),
      );
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMoveConnection(
    connectionId: string,
    folderId: string | undefined,
    targetIndex: number,
  ) {
    try {
      setTreeError("");
      setTree(
        await invokeCommand("move_connection", {
          request: { id: connectionId, folderId, targetIndex },
        }),
      );
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDeleteConnection(connection: Connection) {
    try {
      setTreeError("");
      await invokeCommand("delete_connection", {
        connectionId: connection.id,
      });
      await reloadConnectionGroups();
      showConnectionSuccessStatus(t("connections.deleteConnectionComplete", { name: connection.name }));
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  const treeWithLiveStatuses = useMemo(
    () => withLiveConnectionStatuses(tree, activeSessionCounts),
    [activeSessionCounts, tree],
  );

  const filteredTree = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return treeWithLiveStatuses;
    }

    return filterConnectionTree(treeWithLiveStatuses, normalizedQuery);
  }, [query, treeWithLiveStatuses]);
  const quickConnectShellOptions = useMemo(() => localShellOptionsForPlatform(), [i18n.language]);
  const recentConnections = useMemo(() => {
    const connectionsById = new Map(
      flattenConnections(treeWithLiveStatuses).map((connection) => [connection.id, connection]),
    );
    return recentConnectionIds
      .map((connectionId) => connectionsById.get(connectionId))
      .filter((connection): connection is Connection => Boolean(connection))
      .slice(0, RECENT_CONNECTION_LIMIT);
  }, [recentConnectionIds, treeWithLiveStatuses]);
  const isTreeFiltered = query.trim().length > 0;

  function handleDragEnd() {
    draggedItemRef.current = null;
    pointerDragTargetRef.current = null;
    setDragPreview(null);
    setDraggedSourceId("");
    setDropTarget("");
  }

  function handleTreeClickCapture(event: ReactMouseEvent) {
    if (!suppressTreeClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressTreeClickRef.current = false;
  }

  function handleTreeContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setTreeContextMenu({
      kind: "tree",
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleConnectionContextMenu(
    connection: Connection,
    folderId: string | undefined,
    event: ReactMouseEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setTreeContextMenu({
      kind: "connection",
      connection,
      folderId,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleFolderContextMenu(folder: ConnectionFolder, event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setTreeContextMenu({
      kind: "folder",
      folder,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleToggleFolder(folderId: string) {
    setCollapsedFolderIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(folderId)) {
        nextIds.delete(folderId);
      } else {
        nextIds.add(folderId);
      }
      return nextIds;
    });
  }

  function handleExpandAllFolders() {
    setCollapsedFolderIds(new Set());
    setTreeContextMenu(null);
  }

  function handleCollapseAllFolders() {
    setCollapsedFolderIds(new Set(collectConnectionFolderIds(treeWithLiveStatuses.folders)));
    setTreeContextMenu(null);
  }

  function completeTreeDrop(item: DraggedTreeItem, target: TreeDropTarget) {
    if (item.kind === "folder") {
      if (target.kind === "connection") {
        return;
      }

      if (target.kind === "folder" && item.folderId === target.folderId) {
        return;
      }

      void handleMoveFolder(
        item.folderId,
        target.kind === "folder" ? target.folderId : undefined,
        target.targetIndex,
      );
      return;
    }

    if (item.kind === "connection") {
      if (target.kind === "connection" && item.connectionId === target.connectionId) {
        return;
      }

      void handleMoveConnection(
        item.connectionId,
        target.kind === "root" ? undefined : target.folderId,
        target.targetIndex,
      );
    }
  }

  function removePointerDragListeners() {
    const listeners = pointerDragListenersRef.current;
    if (!listeners) {
      return;
    }

    window.removeEventListener("pointermove", listeners.move);
    window.removeEventListener("pointerup", listeners.stop);
    window.removeEventListener("pointercancel", listeners.stop);
    pointerDragListenersRef.current = null;
  }

  function treeDropTargetFromElement(element: Element | null, item: DraggedTreeItem) {
    const row = element?.closest<HTMLElement>("[data-tree-drop-kind]");
    if (!row) {
      return null;
    }

    if (row.dataset.treeDropKind === "root") {
      return {
        kind: "root",
        targetIndex:
          item.kind === "connection"
            ? Number(row.dataset.connectionCount ?? 0)
            : Number(row.dataset.folderCount ?? 0),
      } satisfies TreeDropTarget;
    }

    if (row.dataset.treeDropKind === "folder") {
      const folderId = row.dataset.folderId;
      if (!folderId) {
        return null;
      }

      const connectionCount = Number(row.dataset.connectionCount ?? 0);
      const folderCount = Number(row.dataset.folderCount ?? 0);
      return {
        kind: "folder",
        folderId,
        targetIndex: item.kind === "connection" ? connectionCount : folderCount,
      } satisfies TreeDropTarget;
    }

    const folderId = row.dataset.folderId;
    const connectionId = row.dataset.connectionId;
    if (!connectionId) {
      return null;
    }

    return {
      kind: "connection",
      folderId: folderId || undefined,
      connectionId,
      targetIndex: Number(row.dataset.connectionIndex ?? 0),
    } satisfies TreeDropTarget;
  }

  function treeDropTargetId(target: TreeDropTarget) {
    if (target.kind === "root") {
      return "root";
    }

    return target.kind === "folder" ? `folder-${target.folderId}` : `connection-${target.connectionId}`;
  }

  function treeItemId(item: DraggedTreeItem) {
    return item.kind === "folder" ? `folder-${item.folderId}` : `connection-${item.connectionId}`;
  }

  function handlePointerDragStart(
    event: ReactPointerEvent<HTMLElement>,
    item: DraggedTreeItem,
    preview: Omit<TreeDragPreview, "x" | "y" | "offsetX" | "offsetY" | "width">,
  ) {
    if (isTreeFiltered || event.button !== 0) {
      return;
    }

    removePointerDragListeners();
    const sourceBounds = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const offsetX = startX - sourceBounds.left;
    const offsetY = startY - sourceBounds.top;
    const previewWidth = Math.min(sourceBounds.width, 320);
    const pointerId = event.pointerId;
    let dragStarted = false;
    pointerDragTargetRef.current = null;

    const updateDragPreview = (pointerEvent: PointerEvent) => {
      setDragPreview((currentPreview) =>
        currentPreview
          ? { ...currentPreview, x: pointerEvent.clientX, y: pointerEvent.clientY }
          : null,
      );
    };

    const startDrag = (pointerEvent: PointerEvent) => {
      if (dragStarted) {
        return;
      }

      dragStarted = true;
      draggedItemRef.current = item;
      suppressTreeClickRef.current = true;
      setDraggedSourceId(treeItemId(item));
      setDragPreview({
        ...preview,
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
        offsetX,
        offsetY,
        width: previewWidth,
      });
      setDropTarget("");
    };
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) {
        return;
      }

      if (!dragStarted) {
        const xMovement = Math.abs(pointerEvent.clientX - startX);
        const yMovement = Math.abs(pointerEvent.clientY - startY);
        if (xMovement < 4 && yMovement < 4) {
          return;
        }

        startDrag(pointerEvent);
      }

      pointerEvent.preventDefault();
      updateDragPreview(pointerEvent);
      const target = treeDropTargetFromElement(
        document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY),
        item,
      );
      pointerDragTargetRef.current = target;
      setDropTarget(target ? treeDropTargetId(target) : "");
    };
    const stop = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) {
        return;
      }

      if (!dragStarted) {
        removePointerDragListeners();
        return;
      }

      pointerEvent.preventDefault();
      const target = pointerDragTargetRef.current;
      const dragged = draggedItemRef.current;
      removePointerDragListeners();
      handleDragEnd();
      if (target && dragged) {
        completeTreeDrop(dragged, target);
      }
      window.setTimeout(() => {
        suppressTreeClickRef.current = false;
      }, 0);
    };

    pointerDragListenersRef.current = { move, stop };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  return (
    <aside className="connection-sidebar">
      <div className="sidebar-header">
        <div>
          <h1>{t("connections.title")}</h1>
        </div>
        <div className="sidebar-actions">
          <button
            className="icon-button"
            aria-label={t("connections.addConnection")}
            title={t("connections.addConnection")}
            onClick={() => setFormMode("save")}
            type="button"
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={t("connections.collapseColumn")}
            title={t("connections.collapseColumn")}
            onClick={onToggleCollapsed}
            type="button"
          >
            <PanelRight size={17} />
          </button>
        </div>
      </div>

      <label className="search-box">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t("connections.searchPlaceholder")}
        />
      </label>

      <div className="quick-connect-anchor" ref={quickConnectRef}>
        <button
          {...dialogButtonAria(quickConnectMenuOpen)}
          className="quick-connect"
          onClick={() => setQuickConnectMenuOpen((isOpen) => !isOpen)}
        >
          <Play size={15} />
          {t("connections.quickConnect")}
        </button>
        {quickConnectMenuOpen ? (
          <QuickConnectMenu
            recentConnections={recentConnections}
            shellOptions={quickConnectShellOptions}
            sshSettings={sshSettings}
            onOpenConnection={(connection) => {
              setQuickConnectMenuOpen(false);
              handleOpenConnection(connection);
            }}
            onOpenElevatedShell={(option) => void handleQuickAdminShell(option)}
            onOpenLocalShell={handleQuickLocalShell}
            onOpenSsh={handleQuickSsh}
          />
        ) : null}
      </div>
      <div className="tree-folder-controls" aria-label={t("connections.folderTreeControls")}>
        <button
          aria-label={t("connections.newFolder")}
          className="tree-folder-control"
          onClick={() => void handleCreateFolder()}
          title={t("connections.newFolder")}
          type="button"
        >
          <FolderPlus size={13} />
        </button>
        <button
          aria-label={t("connections.collapseAll")}
          className="tree-folder-control"
          onClick={handleCollapseAllFolders}
          title={t("connections.collapseAll")}
          type="button"
        >
          <IconParkCollapseTextInput size={13} />
        </button>
        <button
          aria-label={t("connections.expandAll")}
          className="tree-folder-control"
          onClick={handleExpandAllFolders}
          title={t("connections.expandAll")}
          type="button"
        >
          <IconParkExpandTextInput size={13} />
        </button>
      </div>
      {treeError ? <p className="form-error tree-error">{treeError}</p> : null}

      <div
        className={`tree-list ${dropTarget === "root" ? "drop-target" : ""}`}
        aria-label={t("connections.connectionTree")}
        data-connection-count={filteredTree.connections.length}
        data-folder-count={filteredTree.folders.length}
        data-tree-drop-kind="root"
        onContextMenu={handleTreeContextMenu}
      >
        {filteredTree.connections.map((connection, connectionIndex) => (
          <ConnectionRow
            connection={connection}
            key={connection.id}
            connectionIndex={connectionIndex}
            dragDisabled={isTreeFiltered}
            isDraggingSource={draggedSourceId === `connection-${connection.id}`}
            isDropTarget={dropTarget === `connection-${connection.id}`}
            onClickCapture={handleTreeClickCapture}
            onOpen={() => handleOpenConnection(connection)}
            onContextMenu={(event) => handleConnectionContextMenu(connection, undefined, event)}
            onPointerDragStart={(event) =>
              handlePointerDragStart(
                event,
                { kind: "connection", connectionId: connection.id },
                {
                  kind: "connection",
                  title: connection.name,
                  subtitle: connection.host,
                  connectionType: connection.type,
                  connectionStatus: connection.status,
                },
              )
            }
          />
        ))}
        {pendingFolderDraft && !pendingFolderDraft.parentFolderId ? (
          <NewFolderDraftRow
            level={0}
            onCancel={handleCancelPendingFolder}
            onCommit={(name) => void handleCommitPendingFolder(name)}
          />
        ) : null}
        {filteredTree.folders.map((folder) => (
          <ConnectionFolderNode
            dragDisabled={isTreeFiltered}
            draggedSourceId={draggedSourceId}
            dropTarget={dropTarget}
            folder={folder}
            collapsedFolderIds={collapsedFolderIds}
            key={folder.id}
            level={0}
            onClickCapture={handleTreeClickCapture}
            pendingFolderDraft={pendingFolderDraft}
            onCancelPendingFolder={handleCancelPendingFolder}
            onCommitPendingFolder={handleCommitPendingFolder}
            onContextMenu={handleFolderContextMenu}
            onConnectionContextMenu={handleConnectionContextMenu}
            onCreateFolder={handleCreateFolder}
            onOpenConnection={handleOpenConnection}
            onPointerDragStart={handlePointerDragStart}
            onToggleFolder={handleToggleFolder}
          />
        ))}
      </div>

      {treeContextMenu ? (
        <TreeContextMenu
          menu={treeContextMenu}
          canAddToPane={Boolean(tabs.find((tab) => tab.id === activeTabId && tab.kind === "terminal"))}
          onClose={() => setTreeContextMenu(null)}
          onCreateConnection={() => {
            setTreeContextMenu(null);
            setFormMode("save");
          }}
          onCreateFolder={() => {
            setTreeContextMenu(null);
            handleCreateFolder();
          }}
          onDelete={() => {
            const menu = treeContextMenu;
            setTreeContextMenu(null);
            if (menu.kind === "connection") {
              setConfirmDeleteTarget({ kind: "connection", connection: menu.connection });
            } else if (menu.kind === "folder") {
              setConfirmDeleteTarget({ kind: "folder", folder: menu.folder });
            }
          }}
          onProperties={() => {
            const menu = treeContextMenu;
            setTreeContextMenu(null);
            if (menu.kind === "connection") {
              setFormError("");
              setEditConnection({ connection: menu.connection, folderId: menu.folderId });
            }
          }}
          onRename={() => {
            const menu = treeContextMenu;
            setTreeContextMenu(null);
            if (menu.kind === "connection") {
              void handleRenameConnection(menu.connection);
            } else if (menu.kind === "folder") {
              void handleRenameFolder(menu.folder);
            }
          }}
          onAddToPane={(direction) => {
            const menu = treeContextMenu;
            setTreeContextMenu(null);
            if (menu.kind === "connection") {
              handleAddConnectionToFocusedPane(menu.connection, direction);
            }
          }}
          onTransferSshPublicKey={() => {
            const menu = treeContextMenu;
            setTreeContextMenu(null);
            if (menu.kind === "connection" && menu.connection.type === "ssh") {
              setTreeError("");
              setTransferSshPublicKeyDialog({
                connection: menu.connection,
                keyPath: menu.connection.keyPath ?? sshSettings.defaultKeyPath,
              });
              setTransferSshPublicKeyError("");
            }
          }}
        />
      ) : null}

      {dragPreview ? <TreeDragPreview preview={dragPreview} /> : null}

      {formMode ? (
        <ConnectionDialog
          error={formError}
          tree={tree}
          mode={formMode}
          sshSettings={sshSettings}
          onCancel={() => {
            setFormMode(null);
            setFormError("");
          }}
          onImportRequested={
            formMode === "save"
              ? () => {
                  setFormMode(null);
                  setFormError("");
                  setImportDialogOpen(true);
                }
              : undefined
          }
          onSubmit={handleConnectionSubmit}
        />
      ) : null}
      {importDialogOpen ? (
        <ImportDialog
          tree={tree}
          sshSettings={sshSettings}
          onClose={() => setImportDialogOpen(false)}
          onImported={({ count, source }) => {
            setImportDialogOpen(false);
            void reloadConnectionGroups();
            showConnectionSuccessStatus(
              t(
                source === "scan"
                  ? "connections.import.importScanComplete"
                  : "connections.import.importFileComplete",
                { count },
              ),
            );
          }}
        />
      ) : null}
      {editConnection ? (
        <ConnectionDialog
          error={formError}
          initialConnection={editConnection.connection}
          initialFolderId={editConnection.folderId}
          tree={tree}
          mode="edit"
          sshSettings={sshSettings}
          onCancel={() => {
            setEditConnection(null);
            setFormError("");
          }}
          onSubmit={handleConnectionUpdate}
        />
      ) : null}
      {confirmDeleteTarget ? (
        <ConfirmDeleteDialog
          onCancel={() => setConfirmDeleteTarget(null)}
          onConfirm={() => {
            const target = confirmDeleteTarget;
            setConfirmDeleteTarget(null);
            if (target.kind === "connection") {
              void handleDeleteConnection(target.connection);
            } else {
              void handleDeleteFolder(target.folder);
            }
          }}
          target={confirmDeleteTarget}
        />
      ) : null}
      {transferSshPublicKeyDialog ? (
        <TransferSshPublicKeyDialog
          connection={transferSshPublicKeyDialog.connection}
          error={transferSshPublicKeyError}
          onCancel={() => setTransferSshPublicKeyDialog(null)}
          onSubmit={(username, password) => void handleTransferSshPublicKey(username, password)}
        />
      ) : null}
    </aside>
  );
}

function ConnectionFolderNode({
  collapsedFolderIds,
  dragDisabled,
  draggedSourceId,
  dropTarget,
  folder,
  level,
  onClickCapture,
  onCreateFolder,
  onOpenConnection,
  onPointerDragStart,
  onToggleFolder,
  onCancelPendingFolder,
  onCommitPendingFolder,
  onConnectionContextMenu,
  onContextMenu,
  pendingFolderDraft,
}: {
  collapsedFolderIds: Set<string>;
  dragDisabled: boolean;
  draggedSourceId: string;
  dropTarget: string;
  folder: ConnectionFolder;
  level: number;
  onClickCapture: (event: ReactMouseEvent) => void;
  onCreateFolder: (parentFolderId?: string) => void | Promise<void>;
  onOpenConnection: (connection: Connection) => void;
  onPointerDragStart: (
    event: ReactPointerEvent<HTMLElement>,
    item: DraggedTreeItem,
    preview: Omit<TreeDragPreview, "x" | "y" | "offsetX" | "offsetY" | "width">,
  ) => void;
  onToggleFolder: (folderId: string) => void;
  onCancelPendingFolder: () => void;
  onCommitPendingFolder: (name: string, parentFolderId?: string) => void | Promise<void>;
  onConnectionContextMenu: (
    connection: Connection,
    folderId: string | undefined,
    event: ReactMouseEvent<HTMLElement>,
  ) => void;
  onContextMenu: (folder: ConnectionFolder, event: ReactMouseEvent<HTMLElement>) => void;
  pendingFolderDraft: PendingFolderDraft | null;
}) {
  const { t } = useTranslation();
  const connectionCount = countConnections(folder);
  const folderCount = countFolders(folder.folders);
  const isCollapsed = collapsedFolderIds.has(folder.id);
  const groupRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    groupRef.current?.style.setProperty("--tree-level-indent", `${level * 14}px`);
  }, [level]);

  return (
    <section className="tree-group" ref={groupRef}>
      <div
        className={`tree-folder-row ${dragDisabled ? "" : "can-drag"} ${
          dropTarget === `folder-${folder.id}` ? "drop-target" : ""
        } ${draggedSourceId === `folder-${folder.id}` ? "dragging-source" : ""}`}
        data-connection-count={folder.connections.length}
        data-folder-count={folder.folders.length}
        data-folder-id={folder.id}
        data-tree-drop-kind="folder"
        onClickCapture={onClickCapture}
        onContextMenu={(event) => onContextMenu(folder, event)}
        onPointerDown={(event) =>
          onPointerDragStart(
            event,
            { kind: "folder", folderId: folder.id },
            {
              kind: "folder",
              title: folder.name,
              connectionCount,
            },
          )
        }
      >
        <div className="tree-folder">
          <button
            {...ariaExpanded(!isCollapsed)}
            aria-label={`${isCollapsed ? t("connections.expand") : t("connections.collapse")} ${folder.name}`}
            className="tree-disclosure"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleFolder(folder.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title={isCollapsed ? t("connections.expandFolder") : t("connections.collapseFolder")}
            type="button"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <Folder size={15} />
          <span>{folder.name}</span>
          <small>{connectionCount + folderCount}</small>
        </div>
        <span className="folder-actions">
          <button
            className="row-action"
            aria-label={`${t("connections.newSubfolderIn")} ${folder.name}`}
            onClick={() => void onCreateFolder(folder.id)}
          >
            <FolderPlus size={13} />
          </button>
        </span>
      </div>
      {!isCollapsed ? (
        <>
          {folder.connections.length > 0 ? (
            <div className="tree-folder-connections">
              {folder.connections.map((connection, connectionIndex) => (
                <ConnectionRow
                  connection={connection}
                  connectionIndex={connectionIndex}
                  dragDisabled={dragDisabled}
                  folderId={folder.id}
                  isDraggingSource={draggedSourceId === `connection-${connection.id}`}
                  isDropTarget={dropTarget === `connection-${connection.id}`}
                  key={connection.id}
                  onClickCapture={onClickCapture}
                  onOpen={() => onOpenConnection(connection)}
                  onContextMenu={(event) => onConnectionContextMenu(connection, folder.id, event)}
                  onPointerDragStart={(event) =>
                    onPointerDragStart(
                      event,
                      { kind: "connection", connectionId: connection.id },
                      {
                        kind: "connection",
                        title: connection.name,
                        subtitle: connection.host,
                        connectionType: connection.type,
                        connectionStatus: connection.status,
                      },
                    )
                  }
                />
              ))}
            </div>
          ) : null}
          {pendingFolderDraft?.parentFolderId === folder.id ? (
            <NewFolderDraftRow
              level={level + 1}
              onCancel={onCancelPendingFolder}
              onCommit={(name) => void onCommitPendingFolder(name, folder.id)}
            />
          ) : null}
          {folder.folders.map((childFolder) => (
            <ConnectionFolderNode
              collapsedFolderIds={collapsedFolderIds}
              dragDisabled={dragDisabled}
              draggedSourceId={draggedSourceId}
              dropTarget={dropTarget}
              folder={childFolder}
              key={childFolder.id}
              level={level + 1}
              onClickCapture={onClickCapture}
              pendingFolderDraft={pendingFolderDraft}
              onCancelPendingFolder={onCancelPendingFolder}
              onCommitPendingFolder={onCommitPendingFolder}
              onConnectionContextMenu={onConnectionContextMenu}
              onContextMenu={onContextMenu}
              onCreateFolder={onCreateFolder}
              onOpenConnection={onOpenConnection}
              onPointerDragStart={onPointerDragStart}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </>
      ) : null}
    </section>
  );
}

function NewFolderDraftRow({
  level,
  onCancel,
  onCommit,
}: {
  level: number;
  onCancel: () => void;
  onCommit: (name: string) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isSettledRef = useRef(false);
  const groupRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    groupRef.current?.style.setProperty("--tree-level-indent", `${level * 14}px`);
  }, [level]);

  const settle = (name: string) => {
    if (isSettledRef.current) {
      return;
    }

    isSettledRef.current = true;
    if (!name.trim()) {
      onCancel();
      return;
    }

    void onCommit(name);
  };

  return (
    <div className="tree-group pending-folder-group" ref={groupRef}>
      <div className="tree-folder-row pending-folder-row">
        <div className="tree-folder pending-folder">
          <ChevronDown size={14} />
          <Folder size={15} />
          <input
            aria-label="New folder name"
            className="pending-folder-input"
            onBlur={(event) => settle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                settle(event.currentTarget.value);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                isSettledRef.current = true;
                onCancel();
              }
            }}
            ref={inputRef}
          />
        </div>
      </div>
    </div>
  );
}

function TreeContextMenu({
  menu,
  canAddToPane,
  onClose,
  onCreateConnection,
  onCreateFolder,
  onDelete,
  onProperties,
  onRename,
  onAddToPane,
  onTransferSshPublicKey,
}: {
  menu: TreeContextMenuState;
  canAddToPane: boolean;
  onClose: () => void;
  onCreateConnection: () => void;
  onCreateFolder: () => void;
  onDelete: () => void;
  onProperties: () => void;
  onRename: () => void;
  onAddToPane: (direction: SplitDirection) => void;
  onTransferSshPublicKey: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = () => onClose();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) {
      return;
    }

    const bounds = node.getBoundingClientRect();
    const sidebarBounds = node.closest(".connection-sidebar")?.getBoundingClientRect();
    const minLeft = sidebarBounds ? sidebarBounds.left + 8 : 8;
    const maxLeft = sidebarBounds
      ? sidebarBounds.right - bounds.width - 8
      : window.innerWidth - bounds.width - 8;
    const left = Math.min(menu.x, maxLeft);
    const top = Math.min(menu.y, window.innerHeight - bounds.height - 8);
    node.style.left = `${Math.max(minLeft, left)}px`;
    node.style.top = `${Math.max(8, top)}px`;
  }, [menu.x, menu.y]);

  return (
    <div
      className="tree-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={menuRef}
      role="menu"
    >
      {menu.kind === "tree" ? (
        <>
          <button onClick={onCreateConnection} role="menuitem" type="button">
            <IconParkAddComputer className="menu-item-icon" size={15} />
            <span>{t("connections.newConnection")}</span>
          </button>
          <button onClick={onCreateFolder} role="menuitem" type="button">
            <IconParkFolderPlus className="menu-item-icon" size={15} />
            <span>{t("connections.newFolder")}</span>
          </button>
        </>
      ) : null}
      {menu.kind !== "tree" ? (
        <>
          <button onClick={onRename} role="menuitem" type="button">
            <IconParkEdit className="menu-item-icon" size={15} />
            <span>{t("connections.rename")}</span>
          </button>
          <button onClick={onDelete} role="menuitem" type="button">
            <IconParkDelete className="menu-item-icon" size={15} />
            <span>{t("connections.delete")}</span>
          </button>
        </>
      ) : null}
      {menu.kind === "connection" ? (
        <>
          {canAddToPane ? (
            <div className="tree-context-submenu" role="none">
              <button aria-haspopup="menu" className="tree-submenu-trigger" role="menuitem" type="button">
                <PanelRight className="menu-item-icon" size={15} />
                <span>{t("connections.addTo")}</span>
                <ChevronRight className="menu-item-chevron" size={13} />
              </button>
              <div className="tree-context-submenu-menu" role="menu" aria-label={t("connections.addToPane")}>
                <button onClick={() => onAddToPane("left")} role="menuitem" type="button">
                  <ArrowLeft className="menu-item-icon" size={15} />
                  <span>{t("connections.left")}</span>
                </button>
                <button onClick={() => onAddToPane("right")} role="menuitem" type="button">
                  <ArrowRight className="menu-item-icon" size={15} />
                  <span>{t("connections.right")}</span>
                </button>
                <button onClick={() => onAddToPane("down")} role="menuitem" type="button">
                  <ArrowDown className="menu-item-icon" size={15} />
                  <span>{t("connections.lower")}</span>
                </button>
                <button onClick={() => onAddToPane("up")} role="menuitem" type="button">
                  <ArrowUp className="menu-item-icon" size={15} />
                  <span>{t("connections.upper")}</span>
                </button>
              </div>
            </div>
          ) : null}
          {menu.connection.type === "ssh" ? (
            <button onClick={onTransferSshPublicKey} role="menuitem" type="button">
              <KeyRound className="menu-item-icon" size={15} />
              <span>{t("connections.transferSshPublicKey")}</span>
            </button>
          ) : null}
          <button onClick={onProperties} role="menuitem" type="button">
            <IconParkSetting className="menu-item-icon" size={15} />
            <span>{t("connections.properties")}</span>
          </button>
        </>
      ) : null}
    </div>
  );
}

export function QuickConnectMenu({
  recentConnections,
  shellOptions,
  sshSettings,
  onOpenConnection,
  onOpenElevatedShell,
  onOpenLocalShell,
  onOpenSsh,
}: {
  recentConnections: Connection[];
  shellOptions: LocalShellOption[];
  sshSettings: SshSettings;
  onOpenConnection: (connection: Connection) => void;
  onOpenElevatedShell: (option: LocalShellOption) => void;
  onOpenLocalShell: (option: LocalShellOption) => void;
  onOpenSsh: (connection: Connection) => void;
}) {
  const [sshDialogOpen, setSshDialogOpen] = useState(false);
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState(String(sshSettings.defaultPort));
  const { t } = useTranslation();
  const normalizedSshPort = Number(sshPort || sshSettings.defaultPort);
  const canSubmitSsh =
    Boolean(sshHost.trim()) &&
    Number.isInteger(normalizedSshPort) &&
    normalizedSshPort >= 1 &&
    normalizedSshPort <= 65535;

  function handleSshSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const host = sshHost.trim();
    if (!canSubmitSsh) {
      return;
    }

    onOpenSsh({
      id: uniqueRuntimeId("quick"),
      name: host,
      host,
      user: sshSettings.defaultUser,
      port: normalizedSshPort,
      authMethod: "agent",
      type: "ssh",
      useTmuxSessions: false,
      status: "idle",
    });
  }

  return (
    <div className="quick-connect-menu" role="dialog" aria-label={t("connections.quickConnectDialog")}>
      {sshDialogOpen ? (
        <form className="quick-connect-mini-dialog" onSubmit={handleSshSubmit}>
          <label>
            <span>{t("connections.hostname")}</span>
            <input
              autoFocus
              onChange={(event) => setSshHost(event.currentTarget.value)}
              placeholder={t("connections.exampleHost")}
              required
              value={sshHost}
            />
          </label>
          <label>
            <span>{t("connections.port")}</span>
            <input
              inputMode="numeric"
              max="65535"
              min="1"
              onChange={(event) => setSshPort(event.currentTarget.value)}
              placeholder={String(sshSettings.defaultPort)}
              type="number"
              value={sshPort}
            />
          </label>
          <div className="quick-connect-mini-actions">
            <button disabled={!canSubmitSsh} type="submit">
              {t("connections.connect")}
            </button>
            <button onClick={() => setSshDialogOpen(false)} type="button">
              {t("connections.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setSshDialogOpen(true)} type="button">
          <Server size={15} />
          <span>{t("connections.ssh")}</span>
        </button>
      )}
      {shellOptions.map((option) =>
        option.canElevate ? (
          <div className="quick-connect-submenu" key={option.value ?? option.label}>
            <button aria-haspopup="menu" onClick={() => onOpenLocalShell(option)} type="button">
              <Terminal size={15} />
              <span>{option.label}</span>
              <ChevronDown size={13} />
            </button>
            <div className="quick-connect-submenu-panel">
              <button onClick={() => onOpenLocalShell(option)} type="button">
                {t("connections.normal")}
              </button>
              <button onClick={() => onOpenElevatedShell(option)} type="button">
                {t("connections.admin")}
              </button>
            </div>
          </div>
        ) : (
          <button
            key={option.value ?? option.label}
            onClick={() => onOpenLocalShell(option)}
            type="button"
          >
            <Terminal size={15} />
            <span>{option.label}</span>
          </button>
        ),
      )}
      <div className="quick-connect-menu-separator" aria-hidden="true" />
      {recentConnections.length > 0 ? (
        recentConnections.map((connection) => (
          <button
            key={connection.id}
            onClick={() => onOpenConnection(connection)}
            type="button"
          >
            <ConnectionGlyph localShell={connection.localShell} size={15} type={connection.type} />
            <span className="connection-main">
              <strong>{connection.name}</strong>
              <small>{connectionSubtitle(connection)}</small>
            </span>
            <span className={`status-dot ${connection.status}`} />
          </button>
        ))
      ) : (
        <button disabled type="button">
          <Server size={15} />
          <span>{t("connections.noRecent")}</span>
        </button>
      )}
    </div>
  );
}


function ConnectionTypeGlyph({
  className,
  size = 16,
  type,
}: {
  className?: string;
  size?: number;
  type: ConnectionTileType;
}) {
  return <ConnectionIcon className={className} size={size} type={type} />;
}

function ConnectionGlyph({
  className,
  localShell,
  size = 16,
  type,
}: {
  className?: string;
  localShell?: string;
  size?: number;
  type: ConnectionType;
}) {
  return (
    <ConnectionIcon
      className={className}
      localShell={localShell}
      size={size}
      type={type}
    />
  );
}

function PasswordField({
  autoComplete = "current-password",
  hasStoredSecret,
  label,
  name,
  placeholder,
  required,
}: {
  autoComplete?: string;
  hasStoredSecret: boolean;
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
}) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [storedSecretMask, setStoredSecretMask] = useState(createStoredSecretMask);
  const shouldShowStoredSecretMask = hasStoredSecret && !isFocused && value.length === 0;

  useEffect(() => {
    if (hasStoredSecret) {
      setStoredSecretMask(createStoredSecretMask());
    }
  }, [hasStoredSecret]);

  return (
    <label>
      <span>{label}</span>
      <input
        autoComplete={autoComplete}
        name={shouldShowStoredSecretMask ? undefined : name}
        onBlur={() => setIsFocused(false)}
        onChange={(event) => setValue(event.currentTarget.value)}
        onFocus={() => setIsFocused(true)}
        placeholder={placeholder}
        required={shouldShowStoredSecretMask ? false : required}
        type="password"
        value={shouldShowStoredSecretMask ? storedSecretMask : value}
      />
    </label>
  );
}

function ConnectionDialog({
  error,
  initialConnection,
  initialFolderId,
  tree,
  mode,
  sshSettings,
  onCancel,
  onImportRequested,
  onSubmit,
}: {
  error: string;
  initialConnection?: Connection;
  initialFolderId?: string;
  tree: ConnectionTree;
  mode: "save" | "quick" | "edit";
  sshSettings: SshSettings;
  onCancel: () => void;
  onImportRequested?: () => void;
  onSubmit: (request: ConnectionDialogRequest) => void | Promise<void>;
}) {
  const { i18n, t } = useTranslation();
  const [connectionType, setConnectionType] = useState<ConnectionType | "">(
    initialConnection?.type ?? "",
  );
  const [authMethod, setAuthMethod] = useState<"keyFile" | "password" | "agent">(
    initialConnection?.authMethod ?? "keyFile",
  );
  const [keyPath, setKeyPath] = useState(
    initialConnection?.keyPath ?? sshSettings.defaultKeyPath ?? "",
  );
  const [hasStoredConnectionPassword, setHasStoredConnectionPassword] = useState(
    Boolean(initialConnection?.hasPassword),
  );
  const [hasStoredUrlPassword, setHasStoredUrlPassword] = useState(
    Boolean(initialConnection?.hasUrlCredential),
  );
  const usesSshDefaults = connectionType === "ssh";
  const isTelnetConnection = connectionType === "telnet";
  const isSerialConnection = connectionType === "serial";
  const usesRemoteDesktopFields = connectionType
    ? isRemoteDesktopConnectionType(connectionType)
    : false;
  const folderOptions = useMemo(() => flattenFolders(tree.folders), [tree.folders]);
  const localShellOptions = useMemo(() => localShellOptionsForPlatform(), [i18n.language]);
  const isEditMode = mode === "edit";
  const isUrlConnection = connectionType === "url";
  const connectionTypeOptions: Array<{
    type: ConnectionTileType;
    title: string;
    subtitle: string;
  }> = [
    {
      type: "local",
      title: t("connections.localTerminal"),
      subtitle: t("connections.localShell"),
    },
    {
      type: "ssh",
      title: t("connections.ssh"),
      subtitle: t("connections.secureShell"),
    },
    {
      type: "telnet",
      title: t("connections.telnet"),
      subtitle: t("connections.telnetShell"),
    },
    {
      type: "serial",
      title: t("connections.serial"),
      subtitle: t("connections.serialLine"),
    },
    {
      type: "url",
      title: t("connections.url"),
      subtitle: t("connections.embeddedWebApp"),
    },
    {
      type: "rdp",
      title: t("connections.windowsRdp"),
      subtitle: t("connections.rdp"),
    },
    {
      type: "vnc",
      title: t("connections.vnc"),
      subtitle: t("connections.screenControl"),
    },
  ];

  useEffect(() => {
    if (!isEditMode || !initialConnection || !isTauriRuntime()) {
      return;
    }

    let disposed = false;
    const secretKind = initialConnection.type === "url" ? "urlPassword" : "connectionPassword";

    void invokeCommand("secret_exists", {
      request: {
        kind: secretKind,
        ownerId: initialConnection.id,
      },
    })
      .then((presence) => {
        if (disposed) {
          return;
        }
        if (initialConnection.type === "url") {
          setHasStoredUrlPassword(presence.exists);
        } else {
          setHasStoredConnectionPassword(presence.exists);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, [initialConnection, isEditMode]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connectionType) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const selectedLocalShell = String(
      form.get("localShell") ??
        initialConnection?.localShell ??
        localShellOptions[0]?.value ??
        "",
    );
    const selectedLocalShellLabel =
      localShellOptions.find((option) => (option.value ?? "") === selectedLocalShell)?.label ??
      t("connections.localTerminal");
    const rawUrl = String(form.get("url") ?? "").trim();
    const serialLine = String(form.get("serialLine") ?? "COM1").trim() || "COM1";
    const host =
      connectionType === "local"
        ? "localhost"
        : connectionType === "serial"
          ? serialLine
        : connectionType === "url"
          ? rawUrl
          : String(form.get("host") ?? "").trim();
    const requestedName = String(form.get("name") ?? "").trim();
    const name =
      connectionType === "local"
        ? requestedName || selectedLocalShellLabel
        : connectionType === "serial"
          ? requestedName || serialLine
        : requestedName || host;
    const portValue = String(form.get("port") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const keyPath = String(form.get("keyPath") ?? "").trim();
    const proxyJump = String(form.get("proxyJump") ?? "").trim();
    const useTmuxSessions = form.get("useTmuxSessions") === "on";

    void onSubmit({
      name,
      host,
      user:
        connectionType === "local"
          ? "local"
          : connectionType === "serial"
            ? ""
          : connectionType === "url"
            ? initialConnection?.user ?? "web"
            : String(form.get("user") ?? "").trim(),
      type: connectionType,
      folderId: String(form.get("folderId") ?? "").trim() || undefined,
      port: portValue ? Number(portValue) : undefined,
      keyPath: usesSshDefaults && authMethod === "keyFile" ? keyPath || undefined : undefined,
      proxyJump: proxyJump || undefined,
      authMethod: usesSshDefaults ? authMethod : undefined,
      useTmuxSessions: usesSshDefaults ? useTmuxSessions : undefined,
      localShell: connectionType === "local" ? selectedLocalShell || undefined : undefined,
      serialLine: connectionType === "serial" ? serialLine : undefined,
      serialSpeed:
        connectionType === "serial"
          ? Number(String(form.get("serialSpeed") ?? "9600").trim() || "9600")
          : undefined,
      url: connectionType === "url" ? rawUrl : undefined,
      dataPartition:
        connectionType === "url"
          ? String(form.get("dataPartition") ?? "").trim() || undefined
          : undefined,
      password:
        isTelnetConnection
          ? password
          : usesSshDefaults && authMethod === "password"
          ? password
          : usesRemoteDesktopFields
            ? password || undefined
            : undefined,
      urlCredentialUsername:
        connectionType === "url"
          ? String(form.get("urlCredentialUsername") ?? "").trim() || undefined
          : undefined,
      urlPassword: connectionType === "url" ? String(form.get("urlPassword") ?? "") || undefined : undefined,
    });
  }

  async function handleBrowseKeyFile() {
    const selectedPath = await selectKeyFile(keyPath || sshSettings.defaultKeyPath);
    if (selectedPath) {
      setKeyPath(selectedPath);
    }
  }

  return (
    <div className="dialog-backdrop connection-dialog-backdrop" role="presentation">
      <form className="connection-dialog" onSubmit={handleSubmit}>
        <header
          className={mode === "quick" ? "connection-dialog-header" : "connection-dialog-header compact"}
        >
          <div>
            <p className="panel-label">
              {mode === "edit"
                ? t("connections.connectionProperties")
                : mode === "save"
                  ? t("connections.newConnectionTitle")
                  : t("connections.quickConnect")}
            </p>
            {mode === "quick" ? <h2>{t("connections.openOneOffSession")}</h2> : null}
          </div>
          {mode === "quick" ? (
            <button className="icon-button" type="button" aria-label={t("connections.close")} onClick={onCancel}>
              <X size={15} />
            </button>
          ) : null}
        </header>

        {isEditMode && initialConnection ? (
          <div className="connection-type-summary">
            <ConnectionGlyph localShell={initialConnection.localShell} size={20} type={initialConnection.type} />
            <span>
              <strong>{connectionTypeLabel(initialConnection.type)}</strong>
              <small>{connectionSubtitle(initialConnection)}</small>
            </span>
          </div>
        ) : (
          <fieldset className="connection-type-picker">
            <legend>{t("connections.type")}</legend>
            <div className="connection-type-grid">
              {connectionTypeOptions.map((option) => (
                <button
                  aria-pressed={connectionType === option.type}
                  className={`connection-type-tile ${connectionType === option.type ? "selected" : ""}`}
                  data-connection-type={option.type}
                  key={option.type}
                  onClick={() => setConnectionType(option.type)}
                  type="button"
                >
                  <span className="connection-type-icon">
                    <ConnectionTypeGlyph size={22} type={option.type} />
                  </span>
                  <span className="connection-type-copy">
                    <strong>{option.title}</strong>
                    <small>{option.subtitle}</small>
                  </span>
                </button>
              ))}
              {onImportRequested ? (
                <button
                  className="connection-type-tile"
                  data-connection-type="import"
                  key="import"
                  onClick={onImportRequested}
                  type="button"
                >
                  <span className="connection-type-icon">
                    <Download size={22} />
                  </span>
                  <span className="connection-type-copy">
                    <strong>{t("connections.import.tileTitle")}</strong>
                    <small>{t("connections.import.tileSubtitle")}</small>
                  </span>
                </button>
              ) : null}
            </div>
          </fieldset>
        )}

        {connectionType ? (
          <div className="connection-dialog-fields">
            {mode === "save" || mode === "edit" ? (
              <label>
                <span>{t("connections.folder")}</span>
                <select name="folderId" defaultValue={initialFolderId ?? ""}>
                  <option value="">{t("connections.root")}</option>
                  {folderOptions.map((option) => (
                    <option value={option.folder.id} key={option.folder.id}>
                      {"  ".repeat(option.level)}
                      {option.folder.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {connectionType === "local" ? (
              <>
                <label>
                  <span>{t("connections.nameOptional")}</span>
                  <input name="name" defaultValue={initialConnection?.name ?? ""} placeholder={t("connections.connectionName")} />
                </label>
                <label>
                  <span>{t("connections.shell")}</span>
                  <select
                    name="localShell"
                    defaultValue={initialConnection?.localShell ?? localShellOptions[0]?.value ?? ""}
                  >
                    {localShellOptions.map((option) => (
                      <option value={option.value ?? ""} key={option.value ?? option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : isSerialConnection ? (
              <>
                <label>
                  <span>{t("connections.nameOptional")}</span>
                  <input name="name" defaultValue={initialConnection?.name ?? ""} placeholder={t("connections.connectionName")} />
                </label>
                <div className="form-grid">
                  <label>
                    <span>{t("connections.line")}*</span>
                    <input
                      name="serialLine"
                      defaultValue={initialConnection?.serialLine ?? initialConnection?.host ?? "COM1"}
                      placeholder={t("connections.serialLinePlaceholder")}
                      required
                    />
                  </label>
                  <label>
                    <span>{t("connections.speed")}*</span>
                    <input
                      name="serialSpeed"
                      defaultValue={initialConnection?.serialSpeed ?? 9600}
                      inputMode="numeric"
                      min="1"
                      type="number"
                      placeholder="9600"
                      required
                    />
                  </label>
                </div>
              </>
            ) : isUrlConnection ? (
              <>
                <label>
                  <span>{t("connections.nameOptional")}</span>
                  <input name="name" defaultValue={initialConnection?.name ?? ""} placeholder={t("connections.connectionName")} />
                </label>
                <label>
                  <span>{t("connections.url")}*</span>
                  <input name="url" defaultValue={initialConnection?.url ?? ""} placeholder={t("connections.urlPlaceholder")} required />
                </label>
                <div className="form-grid">
                  <label>
                    <span>{t("connections.dataPartition")}</span>
                    <input
                      name="dataPartition"
                      defaultValue={initialConnection?.dataPartition ?? ""}
                      placeholder={t("connections.default")}
                    />
                  </label>
                  <label>
                    <span>{t("connections.credentialUser")}</span>
                    <input
                      name="urlCredentialUsername"
                      defaultValue={initialConnection?.urlCredentialUsername ?? ""}
                      placeholder={t("connections.optionalUsername")}
                    />
                  </label>
                </div>
                <PasswordField
                  hasStoredSecret={isEditMode && hasStoredUrlPassword}
                  label={t("connections.password")}
                  name="urlPassword"
                  placeholder={isEditMode ? t("connections.leaveBlankPassword") : t("connections.storedInKeychain")}
                />
              </>
            ) : (
              <>
                <label>
                  <span>{t("connections.nameOptional")}</span>
                  <input name="name" defaultValue={initialConnection?.name ?? ""} placeholder={t("connections.connectionName")} />
                </label>

                <label>
                  <span>{t("connections.host")}*</span>
                  <input
                    name="host"
                    defaultValue={initialConnection?.host ?? ""}
                    placeholder={t("connections.exampleHost")}
                    required
                  />
                </label>

                <div className="form-grid">
                  <label>
                    <span>{connectionType === "vnc" ? t("connections.user") : `${t("connections.user")}*`}</span>
                    <input
                      key={`user-${connectionType}`}
                      name="user"
                      defaultValue={
                        initialConnection?.user ??
                        (connectionType === "ssh" || connectionType === "telnet" ? sshSettings.defaultUser : "")
                      }
                      placeholder={
                        connectionType === "rdp"
                          ? t("connections.domainAdmin")
                          : connectionType === "vnc"
                            ? t("connections.optionalUsername")
                            : t("connections.admin")
                      }
                      required={connectionType !== "vnc"}
                    />
                  </label>
                  <label>
                    <span>{t("connections.port")}</span>
                    <input
                      key={`port-${connectionType}`}
                      name="port"
                      defaultValue={
                        initialConnection?.port ?? defaultPortForConnectionType(connectionType, sshSettings)
                      }
                      inputMode="numeric"
                      min="1"
                      max="65535"
                      type="number"
                      placeholder={String(defaultPortForConnectionType(connectionType, sshSettings))}
                    />
                  </label>
                </div>
              </>
            )}

            {usesRemoteDesktopFields ? (
              <PasswordField
                hasStoredSecret={isEditMode && hasStoredConnectionPassword}
                label={t("connections.password")}
                name="password"
                placeholder={isEditMode ? t("connections.leaveBlankPassword") : t("connections.storedInKeychain")}
              />
            ) : null}

            {isTelnetConnection ? (
              <PasswordField
                hasStoredSecret={isEditMode && hasStoredConnectionPassword}
                label={`${t("connections.passwordLabel")}*`}
                name="password"
                placeholder={isEditMode ? t("connections.leaveBlankPassword") : t("connections.storedInKeychain")}
                required={!isEditMode}
              />
            ) : null}

            {usesSshDefaults ? (
              <>
                <div className="form-grid">
                  <label>
                    <span>{t("connections.auth")}*</span>
                    <select
                      name="authMethod"
                      value={authMethod}
                      required
                      onChange={(event) =>
                        setAuthMethod(event.currentTarget.value as "keyFile" | "password" | "agent")
                      }
                    >
                      <option value="keyFile">{t("connections.keyFile")}</option>
                      <option value="password">{t("connections.password")}</option>
                      <option value="agent">{t("connections.sshAgent")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("connections.proxyJumpLabel")}</span>
                    <input
                      name="proxyJump"
                      defaultValue={initialConnection?.proxyJump ?? sshSettings.defaultProxyJump ?? ""}
                      placeholder={t("connections.jumpInternal")}
                    />
                  </label>
                </div>

                {authMethod === "password" ? (
                  <PasswordField
                    hasStoredSecret={isEditMode && hasStoredConnectionPassword}
                    label={`${t("connections.passwordLabel")}*`}
                    name="password"
                    placeholder={isEditMode ? t("connections.leaveBlankPassword") : t("connections.storedInKeychain")}
                    required={!isEditMode}
                  />
                ) : authMethod === "keyFile" ? (
                  <label>
                    <span>{t("connections.keyPath")}</span>
                    <div className="input-with-button">
                      <input
                        name="keyPath"
                        onChange={(event) => setKeyPath(event.currentTarget.value)}
                        placeholder={t("connections.keyPathExample")}
                        value={keyPath}
                      />
                      <button className="toolbar-button" onClick={handleBrowseKeyFile} type="button">
                        {t("connections.browse")}
                      </button>
                    </div>
                  </label>
                ) : null}
                <label className="checkbox-row">
                  <input
                    name="useTmuxSessions"
                    type="checkbox"
                    defaultChecked={initialConnection?.useTmuxSessions ?? true}
                  />
                  <span>{t("connections.useTmux")}</span>
                </label>
              </>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="dialog-actions">
          <button className="approve-button" disabled={!connectionType} type="submit">
            {mode === "quick" ? <Play size={15} /> : <Save size={15} />}
            {mode === "quick" ? t("connections.connect") : t("common.save")}
          </button>
          <button className="toolbar-button" type="button" onClick={onCancel}>
            {t("connections.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDeleteDialog({
  onCancel,
  onConfirm,
  target,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  target:
    | { kind: "connection"; connection: Connection }
    | { kind: "folder"; folder: ConnectionFolder };
}) {
  const { t } = useTranslation();
  const name =
    target.kind === "connection" ? target.connection.name : target.folder.name;
  const title =
    target.kind === "connection"
      ? t("connections.deleteConnectionConfirm")
      : t("connections.deleteFolderConfirm");

  let detail = "";
  if (target.kind === "folder") {
    const childFolderCount = countFolders(target.folder.folders);
    const connectionCount = countConnections(target.folder);
    if (connectionCount > 0 || childFolderCount > 0) {
      const parts: string[] = [];
      if (connectionCount > 0) {
        parts.push(
          connectionCount === 1
            ? `${connectionCount} connection`
            : `${connectionCount} connections`,
        );
      }
      if (childFolderCount > 0) {
        parts.push(
          childFolderCount === 1
            ? `${childFolderCount} subfolder`
            : `${childFolderCount} subfolders`,
        );
      }
      detail = `Delete folder "${name}", ${parts.join(" and ")}?`;
    }
  }

  return (
    <div className="dialog-backdrop confirm-delete-backdrop" role="presentation">
      <div className="confirm-delete-dialog" role="alertdialog" aria-label={title}>
        <p className="panel-label">{title}</p>
        <p className="confirm-delete-name">{name}</p>
        {detail ? <p className="confirm-delete-detail">{detail}</p> : null}
        <p className="confirm-delete-warning">{t("connections.cannotBeUndone")}</p>
        <div className="dialog-actions">
          <button className="approve-button danger" type="button" onClick={onConfirm}>
            {t("common.delete")}
          </button>
          <button className="toolbar-button" type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferSshPublicKeyDialog({
  connection,
  error,
  onCancel,
  onSubmit,
}: {
  connection: Connection;
  error: string;
  onCancel: () => void;
  onSubmit: (username: string, password: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(connection.user);
  const [password, setPassword] = useState("");
  const canSubmit = Boolean(username.trim()) && password.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    void onSubmit(username.trim(), password);
  }

  return (
    <div className="dialog-backdrop connection-dialog-backdrop" role="presentation">
      <form className="connection-dialog ssh-public-key-dialog" onSubmit={handleSubmit}>
        <header className="connection-dialog-header compact">
          <div>
            <p className="panel-label">{t("connections.transferSshPublicKey")}</p>
            <h2>{connection.name}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t("connections.close")} onClick={onCancel}>
            <X size={15} />
          </button>
        </header>
        <p className="field-hint">{t("connections.transferSshPublicKeyHint")}</p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="form-grid">
          <label>
            <span>{t("connections.user")}*</span>
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.currentTarget.value)}
              required
              value={username}
            />
          </label>
          <label>
            <span>{t("connections.passwordLabel")}*</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              type="password"
              value={password}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <button className="approve-button" disabled={!canSubmit} type="submit">
            <KeyRound size={15} />
            {t("connections.transferSshPublicKeyAction")}
          </button>
          <button className="toolbar-button" type="button" onClick={onCancel}>
            {t("connections.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function TreeDragPreview({ preview }: { preview: TreeDragPreview }) {
  const previewRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = previewRef.current;
    if (!node) {
      return;
    }

    node.style.left = `${preview.x - preview.offsetX}px`;
    node.style.top = `${preview.y - preview.offsetY}px`;
    node.style.width = `${preview.width}px`;
  }, [preview.offsetX, preview.offsetY, preview.width, preview.x, preview.y]);

  return (
    <div className={`tree-drag-preview ${preview.kind}`} ref={previewRef}>
      {preview.kind === "folder" ? (
        <Folder size={15} />
      ) : (
        <ConnectionGlyph size={15} type={preview.connectionType ?? "ssh"} />
      )}
      <span className="connection-main">
        <strong>{preview.title}</strong>
        {preview.subtitle ? <small>{preview.subtitle}</small> : null}
      </span>
      {preview.kind === "folder" ? (
        <small className="tree-drag-count">{preview.connectionCount ?? 0}</small>
      ) : preview.connectionStatus ? (
        <span className={`status-dot ${preview.connectionStatus}`} />
      ) : null}
    </div>
  );
}

function ConnectionRow({
  connection,
  connectionIndex,
  dragDisabled,
  folderId,
  isDraggingSource,
  isDropTarget,
  onClickCapture,
  onContextMenu,
  onOpen,
  onPointerDragStart,
}: {
  connection: Connection;
  connectionIndex: number;
  dragDisabled: boolean;
  folderId?: string;
  isDraggingSource: boolean;
  isDropTarget: boolean;
  onClickCapture: (event: ReactMouseEvent) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpen: () => void;
  onPointerDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className={`connection-row ${dragDisabled ? "" : "can-drag"} ${
        isDropTarget ? "drop-target" : ""
      } ${isDraggingSource ? "dragging-source" : ""
      }`}
      data-connection-id={connection.id}
      data-connection-index={connectionIndex}
      data-folder-id={folderId ?? ""}
      data-tree-drop-kind="connection"
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDragStart}
    >
      <button className="connection-open" onClick={onOpen}>
        <ConnectionGlyph localShell={connection.localShell} size={32} type={connection.type} />
        <span className="connection-main">
          <strong>{connection.name}</strong>
          <small>{connectionSubtitle(connection)}</small>
        </span>
      </button>
      <span className={`status-dot ${connection.status}`} />
    </div>
  );
}
