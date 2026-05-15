import { ConnectionGlyph, connectionSubtitle, connectionTypeSubtitle } from "./ConnectionGlyph";
import { ConnectionIconPicker } from "./ConnectionIconPicker";
import { connectionIconSrcForConnection } from "./ConnectionIcon";
import { AddConnectionMenu, QuickConnectMenu } from "./ConnectionMenus";
import { ImportDialog } from "./ImportDialog";
import { quickConnectRecentLabel } from "./quickConnectMenuModel";
import {
  CONNECTION_TAB_CONTEXT_MENU_EVENT,
  type ConnectionTabContextMenuDetail,
} from "./connectionTabContextMenu";
import { confirmTrustedSshHostKey, defaultPortForConnectionType, connectionTypeLabel, ftpPortForProtocolSelection, isRemoteDesktopConnectionType, localShellOptionsForPlatform, uniqueRuntimeId, type LocalShellOption } from "./utils";
import { RECENT_CONNECTION_LIMIT, createStoredSecretMask, loadCollapsedFolderIds, loadRecentConnectionIds, notifyConnectionTreeInvalidated, saveCollapsedFolderIds, saveRecentConnectionIds } from "./connectionSidebarState";
import { collectConnectionFolderIds, countConnections, countFolders, filterConnectionTree, flattenConnections, flattenFolders, upsertRootConnection, withLiveConnectionStatuses } from "./treeUtils";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, Folder, FolderPlus, KeyRound, LayoutDashboard, Maximize2, Minimize2, PanelRight, Pencil, Pin, PinOff, Play, Plus, RotateCcw, Save, Search, Settings, SquarePlus, Trash2, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import i18next from "../i18n/config";
import { ariaExpanded, dialogButtonAria } from "../lib/aria";
import { nativeMenuIcons } from "../lib/nativeMenuIcons";
import { showNativeContextMenu, type NativeContextMenuItem } from "../lib/nativeContextMenu";
import { confirmNativeDialog, invokeCommand, isTauriRuntime, selectAppLauncherFolder, selectKeyFile } from "../lib/tauri";
import { connectionTree } from "../app-defaults";
import { pushTrayMenu } from "../app/trayMenu";
import { useWorkspaceStore } from "../store";
import type { Connection, ConnectionFolder, ConnectionStatus, ConnectionTree, ConnectionType, CreateConnectionRequest, RdpSettings, SplitDirection, SshSettings, UpdateConnectionRequest, VncSettings } from "../types";

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

type InlineRenameTarget =
  | { kind: "connection"; id: string }
  | { kind: "folder"; id: string };

type DeleteTarget =
  | { kind: "connection"; connection: Connection }
  | { kind: "folder"; folder: ConnectionFolder };

type TransferSshPublicKeyDialogState = {
  connection: Connection;
  keyPath?: string;
};

type ConnectionDialogRequest = CreateConnectionRequest & {
  iconDataUrl?: string | null;
  password?: string;
  urlCredentialUsername?: string;
  urlPassword?: string;
};

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
  const saveConnectionLayout = useWorkspaceStore((state) => state.saveConnectionLayout);
  const resetConnectionLayout = useWorkspaceStore((state) => state.resetConnectionLayout);
  const activeSessionCounts = useWorkspaceStore((state) => state.activeSessionCounts);
  const generalSettings = useWorkspaceStore((state) => state.generalSettings);
  const setGeneralSettings = useWorkspaceStore((state) => state.setGeneralSettings);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const rdpSettings = useWorkspaceStore((state) => state.rdpSettings);
  const vncSettings = useWorkspaceStore((state) => state.vncSettings);
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const [tree, setTree] = useState<ConnectionTree>(connectionTree);
  const [formMode, setFormMode] = useState<"save" | "quick" | null>(null);
  const [newConnectionType, setNewConnectionType] = useState<ConnectionType | null>(null);
  const [formError, setFormError] = useState("");
  const [treeError, setTreeError] = useState("");
  const [addConnectionMenuOpen, setAddConnectionMenuOpen] = useState(false);
  const [quickConnectMenuOpen, setQuickConnectMenuOpen] = useState(false);
  const [recentConnectionIds, setRecentConnectionIds] = useState(loadRecentConnectionIds);
  const [dropTarget, setDropTarget] = useState("");
  const [dragPreview, setDragPreview] = useState<TreeDragPreview | null>(null);
  const [draggedSourceId, setDraggedSourceId] = useState("");
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(loadCollapsedFolderIds);
  const [pendingFolderDraft, setPendingFolderDraft] = useState<PendingFolderDraft | null>(null);
  const [inlineRenameTarget, setInlineRenameTarget] = useState<InlineRenameTarget | null>(null);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenuState | null>(null);
  const [editConnection, setEditConnection] = useState<EditConnectionState | null>(null);
  const [transferSshPublicKeyDialog, setTransferSshPublicKeyDialog] =
    useState<TransferSshPublicKeyDialogState | null>(null);
  const [transferSshPublicKeyError, setTransferSshPublicKeyError] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<DeleteTarget | null>(null);
  const addConnectionRef = useRef<HTMLDivElement | null>(null);
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
    window.addEventListener("kkterm:connection-tree-invalidated", handleTreeInvalidated);
    const unlistenPromise = isTauriRuntime()
      ? listen("connection-tree-changed", handleTreeInvalidated)
      : Promise.resolve(() => {});
    return () => {
      window.removeEventListener("kkterm:connection-tree-invalidated", handleTreeInvalidated);
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    function handleConnectionTabContextMenu(event: Event) {
      const detail = (event as CustomEvent<ConnectionTabContextMenuDetail>).detail;
      if (!detail?.connection) {
        return;
      }
      void openTreeContextMenu({
        kind: "connection",
        connection: detail.connection,
        x: detail.x,
        y: detail.y,
      });
    }

    window.addEventListener(CONNECTION_TAB_CONTEXT_MENU_EVENT, handleConnectionTabContextMenu);
    return () => {
      window.removeEventListener(CONNECTION_TAB_CONTEXT_MENU_EVENT, handleConnectionTabContextMenu);
    };
  });

  useEffect(() => {
    saveCollapsedFolderIds(collapsedFolderIds);
  }, [collapsedFolderIds]);

  useEffect(() => {
    if (!quickConnectMenuOpen && !addConnectionMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const quickConnectNode = quickConnectRef.current;
      const addConnectionNode = addConnectionRef.current;
      if (quickConnectNode && !quickConnectNode.contains(target)) {
        setQuickConnectMenuOpen(false);
      }
      if (addConnectionNode && !addConnectionNode.contains(target)) {
        setAddConnectionMenuOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickConnectMenuOpen(false);
        setAddConnectionMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [addConnectionMenuOpen, quickConnectMenuOpen]);

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

  async function handleConnectionSaved() {
    await reloadConnectionGroups();
    notifyConnectionTreeInvalidated();
    setFormMode(null);
    setNewConnectionType(null);
    setFormError("");
    setTreeError("");
  }

  function showConnectionSuccessStatus(message: string) {
    showStatusBarNotice(message, {
      tone: "success",
    });
  }

  function handleConnectionReady(connection: Connection) {
    setTree((currentTree) => upsertRootConnection(currentTree, connection));
    rememberConnection(connection);
    openConnection(connection);
    setFormMode(null);
    setNewConnectionType(null);
    setFormError("");
    setTreeError("");
  }

  function handleNewConnectionTypeSelected(connectionType: ConnectionType) {
    setAddConnectionMenuOpen(false);
    setQuickConnectMenuOpen(false);
    setFormError("");
    setNewConnectionType(connectionType);
    setFormMode("save");
  }

  function handleQuickSshRequested() {
    setAddConnectionMenuOpen(false);
    setQuickConnectMenuOpen(false);
    setFormError("");
    setNewConnectionType("ssh");
    setFormMode("quick");
  }

  function handleImportRequested() {
    setAddConnectionMenuOpen(false);
    setFormError("");
    setNewConnectionType(null);
    setImportDialogOpen(true);
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

  async function updatePinnedRailConnections(
    nextPinnedConnectionIds: string[],
    successMessage: string,
  ) {
    const previousSettings = generalSettings;
    const nextSettings = {
      ...previousSettings,
      pinnedConnectionIds: nextPinnedConnectionIds,
    };
    setGeneralSettings(nextSettings);
    try {
      const saved = isTauriRuntime()
        ? await invokeCommand("update_general_settings", { request: nextSettings })
        : nextSettings;
      setGeneralSettings(saved);
      showStatusBarNotice(successMessage, { tone: "success" });
    } catch (error) {
      setGeneralSettings(previousSettings);
      const message = error instanceof Error ? error.message : String(error);
      showStatusBarNotice(t("connections.pinRailError", { message }), {
        tone: "error",
      });
    }
  }

  async function handleToggleRailPin(connection: Connection) {
    if (generalSettings.pinnedConnectionIds.includes(connection.id)) {
      await updatePinnedRailConnections(
        generalSettings.pinnedConnectionIds.filter((connectionId) => connectionId !== connection.id),
        t("connections.unpinnedFromRailStatus", { name: connection.name }),
      );
      return;
    }

    await updatePinnedRailConnections(
      [
        ...generalSettings.pinnedConnectionIds.filter((connectionId) => connectionId !== connection.id),
        connection.id,
      ],
      t("connections.pinnedToRailStatus", { name: connection.name }),
    );
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
    const { iconDataUrl, password, urlCredentialUsername, urlPassword, ...connectionRequest } = request;
    if (formMode === "save") {
      try {
        let connection = await invokeCommand("create_connection", {
          request: connectionRequest,
        });
        connection = await saveConnectionIconDataUrl(connection, iconDataUrl);
        if (password) {
          await storeConnectionPassword(connection.id, password);
        }
        if (connection.type === "url" && urlCredentialUsername && urlPassword) {
          await storeUrlPassword(connection.id, urlPassword);
          await upsertUrlCredential(connection.id, urlCredentialUsername);
        }
        await handleConnectionSaved();
        showConnectionSuccessStatus(t("connections.createConnectionComplete", { name: connection.name }));
      } catch (error) {
        setFormError(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    const connection: Connection = {
      id: `quick-${Date.now()}`,
      name: connectionRequest.name || connectionRequest.host || connectionRequest.url || i18next.t("connections.quickSessionFallbackName"),
      host: connectionRequest.host ?? "",
      user: connectionRequest.user ?? "",
      port: connectionRequest.port,
      keyPath: connectionRequest.keyPath,
      proxyJump: connectionRequest.proxyJump,
      authMethod: connectionRequest.authMethod,
      hasPassword: Boolean(password),
      type: connectionRequest.type,
      localShell: connectionRequest.localShell,
      localStartupDirectory: connectionRequest.localStartupDirectory,
      localStartupScript: connectionRequest.localStartupScript,
      serialLine: connectionRequest.serialLine,
      serialSpeed: connectionRequest.serialSpeed,
      url: connectionRequest.url,
      dataPartition: connectionRequest.dataPartition,
      useTmuxSessions: connectionRequest.useTmuxSessions,
      tmuxConnectionId:
        connectionRequest.type === "ssh" && connectionRequest.useTmuxSessions !== false
          ? uniqueRuntimeId("kkterm")
          : undefined,
      urlCredentialUsername:
        connectionRequest.type === "url" && urlCredentialUsername ? urlCredentialUsername : undefined,
      hasUrlCredential: connectionRequest.type === "url" && Boolean(urlCredentialUsername && urlPassword),
      iconDataUrl,
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
    const { iconDataUrl, password, urlCredentialUsername, urlPassword, ...connectionRequest } = request;
    const updateRequest: UpdateConnectionRequest = {
      ...connectionRequest,
      id: editConnection.connection.id,
      type: editConnection.connection.type,
    };

    try {
      let connection = await invokeCommand("update_connection", {
        request: updateRequest,
      });
      connection = await saveConnectionIconDataUrl(connection, iconDataUrl);
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
      notifyConnectionTreeInvalidated();
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
      notifyConnectionTreeInvalidated();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function commitFolderRename(folder: ConnectionFolder, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === folder.name) {
      setInlineRenameTarget(null);
      return true;
    }

    try {
      setTreeError("");
      await invokeCommand("rename_connection_folder", {
        request: { id: folder.id, name: trimmedName },
      });
      setInlineRenameTarget(null);
      await reloadConnectionGroups();
      notifyConnectionTreeInvalidated();
      return true;
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function saveConnectionIconDataUrl(
    connection: Connection,
    iconDataUrl: string | null | undefined,
  ) {
    const normalizedIconDataUrl = iconDataUrl ?? null;
    if ((connection.iconDataUrl ?? null) === normalizedIconDataUrl) {
      return connection;
    }
    const updated = await invokeCommand("update_connection_icon_data_url", {
      connectionId: connection.id,
      iconDataUrl: normalizedIconDataUrl,
    });
    return updated ?? { ...connection, iconDataUrl: normalizedIconDataUrl };
  }

  async function handleDeleteFolder(folder: ConnectionFolder) {
    try {
      setTreeError("");
      await invokeCommand("delete_connection_folder", {
        folderId: folder.id,
      });
      await reloadConnectionGroups();
      notifyConnectionTreeInvalidated();
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function commitConnectionRename(connection: Connection, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === connection.name) {
      setInlineRenameTarget(null);
      return true;
    }

    try {
      setTreeError("");
      const renamedConnection = await invokeCommand("rename_connection", {
        request: { id: connection.id, name: trimmedName },
      });
      refreshOpenConnectionMetadata(renamedConnection);
      setInlineRenameTarget(null);
      await reloadConnectionGroups();
      notifyConnectionTreeInvalidated();
      return true;
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
      return false;
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
      notifyConnectionTreeInvalidated();
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
      notifyConnectionTreeInvalidated();
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
      notifyConnectionTreeInvalidated();
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

  useEffect(() => {
    void pushTrayMenu(recentConnections, {
      dontSleep: t("app.trayDontSleep"),
      exit: t("app.trayExit"),
    });
  }, [recentConnections, t]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    const openConnectionById = (connectionId: string) => {
      const connection = flattenConnections(treeWithLiveStatuses).find(
        (candidate) => candidate.id === connectionId,
      );
      if (connection) {
        handleOpenConnection(connection);
      }
    };
    const unlistenTrayPromise = listen<string>("kkterm://tray-open-connection", (event) => {
      openConnectionById(event.payload);
    });
    const unlistenAssistantPromise = listen<string>("assistant-open-connection", (event) => {
      openConnectionById(event.payload);
    });
    return () => {
      void unlistenTrayPromise.then((unlisten) => unlisten());
      void unlistenAssistantPromise.then((unlisten) => unlisten());
    };
  }, [treeWithLiveStatuses]);

  const isTreeFiltered = query.trim().length > 0;

  function menuPositionFromElement(element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.left,
      y: bounds.bottom,
    };
  }

  function buildAddConnectionMenuItems(): NativeContextMenuItem[] {
    const connectionTypes: ConnectionType[] = [
      "local",
      "ssh",
      "telnet",
      "serial",
      "url",
      "rdp",
      "vnc",
      "ftp",
    ];
    return [
      ...connectionTypes.map((connectionType) => ({
        kind: "item" as const,
        label: connectionType === "ssh" ? t("connections.ssh") : connectionTypeLabel(connectionType),
        iconSrc: connectionIconSrcForConnection({ type: connectionType }),
        action: () => handleNewConnectionTypeSelected(connectionType),
      })),
      { kind: "separator" as const },
      {
        kind: "item" as const,
        label: t("connections.import.tileTitle"),
        iconSvg: nativeMenuIcons.download,
        action: handleImportRequested,
      },
    ];
  }

  function buildQuickConnectMenuItems(): NativeContextMenuItem[] {
    return [
      {
        kind: "item",
        label: t("connections.ssh"),
        iconSrc: connectionIconSrcForConnection({ type: "ssh" }),
        action: handleQuickSshRequested,
      },
      ...quickConnectShellOptions.map((option) =>
        option.canElevate
          ? {
              kind: "submenu" as const,
              label: option.label,
              iconSrc: connectionIconSrcForConnection({
                localShell: option.value,
                type: "local",
              }),
              items: [
                {
                  kind: "item" as const,
                  label: t("connections.normal"),
                  iconSrc: connectionIconSrcForConnection({
                    localShell: option.value,
                    type: "local",
                  }),
                  action: () => handleQuickLocalShell(option),
                },
                {
                  kind: "item" as const,
                  label: t("connections.admin"),
                  iconSrc: connectionIconSrcForConnection({
                    localShell: option.value,
                    type: "local",
                  }),
                  action: () => void handleQuickAdminShell(option),
                },
              ],
            }
          : {
              kind: "item" as const,
              label: option.label,
              iconSrc: connectionIconSrcForConnection({
                localShell: option.value,
                type: "local",
              }),
              action: () => handleQuickLocalShell(option),
            },
      ),
      { kind: "separator" as const },
      ...(recentConnections.length > 0
        ? recentConnections.map((connection) => ({
            kind: "item" as const,
            label: quickConnectRecentLabel(connection),
            iconSrc: connectionIconSrcForConnection(connection),
            action: () => {
              setQuickConnectMenuOpen(false);
              handleOpenConnection(connection);
            },
          }))
        : [
            {
              kind: "item" as const,
              label: t("connections.noRecent"),
              disabled: true,
              action: () => undefined,
            },
          ]),
    ];
  }

  async function handleAddConnectionButtonClick(event: ReactMouseEvent<HTMLButtonElement>) {
    setQuickConnectMenuOpen(false);
    const opened = await showNativeContextMenu(
      buildAddConnectionMenuItems(),
      menuPositionFromElement(event.currentTarget),
    );
    if (opened) {
      setAddConnectionMenuOpen(false);
      return;
    }
    setAddConnectionMenuOpen((isOpen) => !isOpen);
  }

  async function handleQuickConnectButtonClick(event: ReactMouseEvent<HTMLButtonElement>) {
    setAddConnectionMenuOpen(false);
    const opened = await showNativeContextMenu(
      buildQuickConnectMenuItems(),
      menuPositionFromElement(event.currentTarget),
    );
    if (opened) {
      setQuickConnectMenuOpen(false);
      return;
    }
    setQuickConnectMenuOpen((isOpen) => !isOpen);
  }

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
    void openTreeContextMenu({
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
    void openTreeContextMenu({
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
    void openTreeContextMenu({
      kind: "folder",
      folder,
      x: event.clientX,
      y: event.clientY,
    });
  }

  async function openTreeContextMenu(menu: TreeContextMenuState) {
    const opened = await showNativeContextMenu(buildTreeContextMenuItems(menu), {
      x: menu.x,
      y: menu.y,
    });
    if (!opened) {
      setTreeContextMenu(menu);
    }
  }

  function buildTreeContextMenuItems(menu: TreeContextMenuState): NativeContextMenuItem[] {
    if (menu.kind === "tree") {
      return [
        {
          kind: "item",
          label: t("connections.newConnection"),
          iconSvg: nativeMenuIcons.plus,
          action: handleTreeMenuCreateConnection,
        },
        {
          kind: "item",
          label: t("connections.newFolder"),
          iconSvg: nativeMenuIcons.folderPlus,
          action: handleTreeMenuCreateFolder,
        },
      ];
    }

    const items: NativeContextMenuItem[] = [
      {
        kind: "item",
        label: t("connections.rename"),
        iconSvg: nativeMenuIcons.pencil,
        action: () => void handleTreeMenuRename(menu),
      },
      {
        kind: "item",
        label: t("connections.delete"),
        iconSvg: nativeMenuIcons.trash,
        action: () => void handleTreeMenuDelete(menu),
      },
    ];

    if (menu.kind !== "connection") {
      return items;
    }

    const isPinned = generalSettings.pinnedConnectionIds.includes(menu.connection.id);
    const canAddToPane = Boolean(tabs.find((tab) => tab.id === activeTabId && tab.kind === "terminal"));
    items.push(
      { kind: "separator" },
      {
        kind: "item",
        label: t(isPinned ? "connections.unpinFromRail" : "connections.pinToRail"),
        iconSvg: isPinned ? nativeMenuIcons.pinOff : nativeMenuIcons.pin,
        action: () => void handleTreeMenuToggleRailPin(menu),
      },
    );

    if (canAddToPane) {
      items.push({
        kind: "submenu",
        label: t("connections.addTo"),
        iconSvg: nativeMenuIcons.panelRight,
        items: [
          {
            kind: "item",
            label: t("connections.left"),
            iconSvg: nativeMenuIcons.arrowLeft,
            action: () => handleTreeMenuAddToPane(menu, "left"),
          },
          {
            kind: "item",
            label: t("connections.right"),
            iconSvg: nativeMenuIcons.arrowRight,
            action: () => handleTreeMenuAddToPane(menu, "right"),
          },
          {
            kind: "item",
            label: t("connections.lower"),
            iconSvg: nativeMenuIcons.arrowDown,
            action: () => handleTreeMenuAddToPane(menu, "down"),
          },
          {
            kind: "item",
            label: t("connections.upper"),
            iconSvg: nativeMenuIcons.arrowUp,
            action: () => handleTreeMenuAddToPane(menu, "up"),
          },
        ],
      });
    }

    if (isTerminalConnectionType(menu.connection.type)) {
      items.push({
        kind: "submenu",
        label: t("connections.layout"),
        iconSvg: nativeMenuIcons.layoutDashboard,
        items: [
          {
            kind: "item",
            label: t("common.save"),
            iconSvg: nativeMenuIcons.save,
            action: () => handleTreeMenuSaveLayout(menu),
          },
          {
            kind: "item",
            label: t("common.reset"),
            iconSvg: nativeMenuIcons.rotateCcw,
            action: () => handleTreeMenuResetLayout(menu),
          },
        ],
      });
    }

    if (menu.connection.type === "ssh") {
      items.push({
        kind: "item",
        label: t("connections.transferSshPublicKey"),
        iconSvg: nativeMenuIcons.keyRound,
        action: () => handleTreeMenuTransferSshPublicKey(menu),
      });
    }

    items.push({
      kind: "item",
      label: t("connections.properties"),
      iconSvg: nativeMenuIcons.settings,
      action: () => handleTreeMenuProperties(menu),
    });
    return items;
  }

  function handleTreeMenuCreateConnection() {
    setTreeContextMenu(null);
    handleNewConnectionTypeSelected("local");
  }

  function handleTreeMenuCreateFolder() {
    setTreeContextMenu(null);
    handleCreateFolder();
  }

  async function handleTreeMenuDelete(menu: TreeContextMenuState) {
    setTreeContextMenu(null);
    let target: DeleteTarget | null = null;
    if (menu.kind === "connection") {
      target = { kind: "connection", connection: menu.connection };
    } else if (menu.kind === "folder") {
      target = { kind: "folder", folder: menu.folder };
    }

    if (!target) {
      return;
    }

    let confirmed: boolean | null = null;
    try {
      confirmed = await confirmNativeDialog(deleteConfirmationMessage(t, target), {
        kind: "warning",
        title: deleteConfirmationTitle(t, target),
      });
    } catch {
      confirmed = null;
    }
    if (confirmed === true) {
      if (target.kind === "connection") {
        await handleDeleteConnection(target.connection);
      } else {
        await handleDeleteFolder(target.folder);
      }
      return;
    }

    if (confirmed === null) {
      setConfirmDeleteTarget(target);
    }
  }

  function handleTreeMenuProperties(menu: TreeContextMenuState) {
    setTreeContextMenu(null);
    if (menu.kind === "connection") {
      setFormError("");
      setEditConnection({ connection: menu.connection, folderId: menu.folderId });
    }
  }

  function handleTreeMenuRename(menu: TreeContextMenuState) {
    setTreeContextMenu(null);
    setPendingFolderDraft(null);
    setTreeError("");
    if (menu.kind === "connection") {
      setInlineRenameTarget({ kind: "connection", id: menu.connection.id });
    } else if (menu.kind === "folder") {
      setInlineRenameTarget({ kind: "folder", id: menu.folder.id });
    }
  }

  function handleTreeMenuAddToPane(menu: TreeContextMenuState, direction: SplitDirection) {
    setTreeContextMenu(null);
    if (menu.kind === "connection") {
      handleAddConnectionToFocusedPane(menu.connection, direction);
    }
  }

  function handleTreeMenuSaveLayout(menu: TreeContextMenuState) {
    setTreeContextMenu(null);
    if (menu.kind === "connection") {
      saveConnectionLayout(menu.connection.id);
    }
  }

  function handleTreeMenuResetLayout(menu: TreeContextMenuState) {
    setTreeContextMenu(null);
    if (menu.kind === "connection") {
      resetConnectionLayout(menu.connection.id);
    }
  }

  async function handleTreeMenuToggleRailPin(menu: TreeContextMenuState) {
    setTreeContextMenu(null);
    if (menu.kind === "connection") {
      await handleToggleRailPin(menu.connection);
    }
  }

  function handleTreeMenuTransferSshPublicKey(menu: TreeContextMenuState) {
    setTreeContextMenu(null);
    if (menu.kind === "connection" && menu.connection.type === "ssh") {
      setTreeError("");
      setTransferSshPublicKeyDialog({
        connection: menu.connection,
        keyPath: menu.connection.keyPath ?? sshSettings.defaultKeyPath,
      });
      setTransferSshPublicKeyError("");
    }
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
    if (isTreeFiltered || inlineRenameTarget || event.button !== 0) {
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
          <div className="add-connection-anchor" ref={addConnectionRef}>
            <button
              {...dialogButtonAria(addConnectionMenuOpen)}
              className="icon-button"
              aria-label={t("connections.addConnection")}
              title={t("connections.addConnection")}
              onClick={(event) => void handleAddConnectionButtonClick(event)}
              type="button"
            >
              <Plus size={16} />
            </button>
            {addConnectionMenuOpen ? (
              <AddConnectionMenu
                onImportRequested={handleImportRequested}
                onSelectType={handleNewConnectionTypeSelected}
              />
            ) : null}
          </div>
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
          onClick={(event) => void handleQuickConnectButtonClick(event)}
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
          <FolderPlus size={12} />
        </button>
        <button
          aria-label={t("connections.collapseAll")}
          className="tree-folder-control"
          onClick={handleCollapseAllFolders}
          title={t("connections.collapseAll")}
          type="button"
        >
          <Minimize2 size={13} />
        </button>
        <button
          aria-label={t("connections.expandAll")}
          className="tree-folder-control"
          onClick={handleExpandAllFolders}
          title={t("connections.expandAll")}
          type="button"
        >
          <Maximize2 size={13} />
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
            dragDisabled={isTreeFiltered || Boolean(inlineRenameTarget)}
            isRenaming={inlineRenameTarget?.kind === "connection" && inlineRenameTarget.id === connection.id}
            isDraggingSource={draggedSourceId === `connection-${connection.id}`}
            isDropTarget={dropTarget === `connection-${connection.id}`}
            onClickCapture={handleTreeClickCapture}
            onCancelRename={() => setInlineRenameTarget(null)}
            onCommitRename={(name) => commitConnectionRename(connection, name)}
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
            dragDisabled={isTreeFiltered || Boolean(inlineRenameTarget)}
            draggedSourceId={draggedSourceId}
            dropTarget={dropTarget}
            folder={folder}
            collapsedFolderIds={collapsedFolderIds}
            key={folder.id}
            level={0}
            onClickCapture={handleTreeClickCapture}
            pendingFolderDraft={pendingFolderDraft}
            inlineRenameTarget={inlineRenameTarget}
            onCancelPendingFolder={handleCancelPendingFolder}
            onCommitPendingFolder={handleCommitPendingFolder}
            onCancelRename={() => setInlineRenameTarget(null)}
            onCommitConnectionRename={commitConnectionRename}
            onCommitFolderRename={commitFolderRename}
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
          isPinned={
            treeContextMenu.kind === "connection" &&
            generalSettings.pinnedConnectionIds.includes(treeContextMenu.connection.id)
          }
          onClose={() => setTreeContextMenu(null)}
          onCreateConnection={handleTreeMenuCreateConnection}
          onCreateFolder={handleTreeMenuCreateFolder}
          onDelete={() => void handleTreeMenuDelete(treeContextMenu)}
          onProperties={() => handleTreeMenuProperties(treeContextMenu)}
          onRename={() => void handleTreeMenuRename(treeContextMenu)}
          onAddToPane={(direction) => handleTreeMenuAddToPane(treeContextMenu, direction)}
          onSaveLayout={() => handleTreeMenuSaveLayout(treeContextMenu)}
          onResetLayout={() => handleTreeMenuResetLayout(treeContextMenu)}
          onToggleRailPin={() => void handleTreeMenuToggleRailPin(treeContextMenu)}
          onTransferSshPublicKey={() => handleTreeMenuTransferSshPublicKey(treeContextMenu)}
        />
      ) : null}

      {dragPreview ? <TreeDragPreview preview={dragPreview} /> : null}

      {formMode ? (
        <ConnectionDialog
          error={formError}
          initialConnectionType={newConnectionType ?? undefined}
          tree={tree}
          mode={formMode}
          sshSettings={sshSettings}
          rdpSettings={rdpSettings}
          vncSettings={vncSettings}
          onGeneratedSshKey={(generated) =>
            showConnectionSuccessStatus(
              t("settings.sshKeyGenerated", {
                privateKeyPath: generated.privateKeyPath,
                publicKeyPath: generated.publicKeyPath,
              }),
            )
          }
          onCancel={() => {
            setFormMode(null);
            setNewConnectionType(null);
            setFormError("");
          }}
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
                  : source === "bookmarks"
                    ? "connections.import.importBookmarksComplete"
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
          rdpSettings={rdpSettings}
          vncSettings={vncSettings}
          onGeneratedSshKey={(generated) =>
            showConnectionSuccessStatus(
              t("settings.sshKeyGenerated", {
                privateKeyPath: generated.privateKeyPath,
                publicKeyPath: generated.publicKeyPath,
              }),
            )
          }
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
  inlineRenameTarget,
  pendingFolderDraft,
  onCancelRename,
  onCommitConnectionRename,
  onCommitFolderRename,
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
  inlineRenameTarget: InlineRenameTarget | null;
  onCancelRename: () => void;
  onCommitConnectionRename: (connection: Connection, name: string) => Promise<boolean>;
  onCommitFolderRename: (folder: ConnectionFolder, name: string) => Promise<boolean>;
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
  const isRenamingFolder = inlineRenameTarget?.kind === "folder" && inlineRenameTarget.id === folder.id;
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
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <Folder size={13} />
          {isRenamingFolder ? (
            <InlineTreeRenameInput
              ariaLabel={t("connections.renameFolder")}
              initialName={folder.name}
              onCancel={onCancelRename}
              onCommit={(name) => onCommitFolderRename(folder, name)}
            />
          ) : (
            <span>{folder.name}</span>
          )}
          <small>{connectionCount + folderCount}</small>
        </div>
        <span className="folder-actions">
          <button
            className="row-action"
            aria-label={`${t("connections.newSubfolderIn")} ${folder.name}`}
            onClick={() => void onCreateFolder(folder.id)}
          >
            <FolderPlus size={12} />
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
                  isRenaming={inlineRenameTarget?.kind === "connection" && inlineRenameTarget.id === connection.id}
                  isDraggingSource={draggedSourceId === `connection-${connection.id}`}
                  isDropTarget={dropTarget === `connection-${connection.id}`}
                  key={connection.id}
                  onClickCapture={onClickCapture}
                  onCancelRename={onCancelRename}
                  onCommitRename={(name) => onCommitConnectionRename(connection, name)}
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
              inlineRenameTarget={inlineRenameTarget}
              onCancelPendingFolder={onCancelPendingFolder}
              onCommitPendingFolder={onCommitPendingFolder}
              onCancelRename={onCancelRename}
              onCommitConnectionRename={onCommitConnectionRename}
              onCommitFolderRename={onCommitFolderRename}
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
  const { t } = useTranslation();

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
          <ChevronDown size={12} />
          <Folder size={13} />
          <input
            aria-label={t("connections.newFolderName")}
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

function isTerminalConnectionType(type: ConnectionType) {
  return type === "local" || type === "ssh" || type === "telnet" || type === "serial";
}

function InlineTreeRenameInput({
  ariaLabel,
  initialName,
  onCancel,
  onCommit,
}: {
  ariaLabel: string;
  initialName: string;
  onCancel: () => void;
  onCommit: (name: string) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isSettlingRef = useRef(false);
  const [draft, setDraft] = useState(initialName);

  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function settle(name: string) {
    if (isSettlingRef.current) {
      return;
    }

    isSettlingRef.current = true;
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === initialName) {
      onCancel();
      return;
    }

    const committed = await onCommit(trimmedName);
    if (!committed) {
      isSettlingRef.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  return (
    <input
      aria-label={ariaLabel}
      className="tree-rename-input"
      onBlur={(event) => void settle(event.currentTarget.value)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void settle(event.currentTarget.value);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          isSettlingRef.current = true;
          onCancel();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      ref={inputRef}
      value={draft}
    />
  );
}

function TreeContextMenu({
  menu,
  canAddToPane,
  isPinned,
  onClose,
  onCreateConnection,
  onCreateFolder,
  onDelete,
  onProperties,
  onRename,
  onAddToPane,
  onSaveLayout,
  onResetLayout,
  onToggleRailPin,
  onTransferSshPublicKey,
}: {
  menu: TreeContextMenuState;
  canAddToPane: boolean;
  isPinned: boolean;
  onClose: () => void;
  onCreateConnection: () => void;
  onCreateFolder: () => void;
  onDelete: () => void;
  onProperties: () => void;
  onRename: () => void;
  onAddToPane: (direction: SplitDirection) => void;
  onSaveLayout: () => void;
  onResetLayout: () => void;
  onToggleRailPin: () => void;
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
            <SquarePlus className="menu-item-icon" size={15} />
            <span>{t("connections.newConnection")}</span>
          </button>
          <button onClick={onCreateFolder} role="menuitem" type="button">
            <FolderPlus className="menu-item-icon" size={15} />
            <span>{t("connections.newFolder")}</span>
          </button>
        </>
      ) : null}
      {menu.kind !== "tree" ? (
        <>
          <button onClick={onRename} role="menuitem" type="button">
            <Pencil className="menu-item-icon" size={15} />
            <span>{t("connections.rename")}</span>
          </button>
          <button onClick={onDelete} role="menuitem" type="button">
            <Trash2 className="menu-item-icon" size={15} />
            <span>{t("connections.delete")}</span>
          </button>
        </>
      ) : null}
      {menu.kind === "connection" ? (
        <>
          <button onClick={onToggleRailPin} role="menuitem" type="button">
            {isPinned ? (
              <PinOff className="menu-item-icon" size={15} />
            ) : (
              <Pin className="menu-item-icon" size={15} />
            )}
            <span>{t(isPinned ? "connections.unpinFromRail" : "connections.pinToRail")}</span>
          </button>
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
          {isTerminalConnectionType(menu.connection.type) ? (
            <div className="tree-context-submenu" role="none">
              <button aria-haspopup="menu" className="tree-submenu-trigger" role="menuitem" type="button">
                <LayoutDashboard className="menu-item-icon" size={15} />
                <span>{t("connections.layout")}</span>
                <ChevronRight className="menu-item-chevron" size={13} />
              </button>
              <div className="tree-context-submenu-menu" role="menu" aria-label={t("connections.layout")}>
                <button onClick={onSaveLayout} role="menuitem" type="button">
                  <Save className="menu-item-icon" size={15} />
                  <span>{t("common.save")}</span>
                </button>
                <button onClick={onResetLayout} role="menuitem" type="button">
                  <RotateCcw className="menu-item-icon" size={15} />
                  <span>{t("common.reset")}</span>
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
            <Settings className="menu-item-icon" size={15} />
            <span>{t("connections.properties")}</span>
          </button>
        </>
      ) : null}
    </div>
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
  initialConnectionType,
  initialFolderId,
  tree,
  mode,
  rdpSettings,
  sshSettings,
  vncSettings,
  onGeneratedSshKey,
  onCancel,
  onSubmit,
}: {
  error: string;
  initialConnection?: Connection;
  initialConnectionType?: ConnectionType;
  initialFolderId?: string;
  tree: ConnectionTree;
  mode: "save" | "quick" | "edit";
  rdpSettings: RdpSettings;
  sshSettings: SshSettings;
  vncSettings: VncSettings;
  onGeneratedSshKey?: (generated: { privateKeyPath: string; publicKeyPath: string }) => void;
  onCancel: () => void;
  onSubmit: (request: ConnectionDialogRequest) => void | Promise<void>;
}) {
  const { i18n, t } = useTranslation();
  const connectionType = initialConnection?.type ?? initialConnectionType ?? "";
  const [authMethod, setAuthMethod] = useState<"keyFile" | "password" | "agent">(
    initialConnection?.authMethod ?? "keyFile",
  );
  const [keyPath, setKeyPath] = useState(
    initialConnection?.keyPath ?? sshSettings.defaultKeyPath ?? "",
  );
  const [localStartupDirectory, setLocalStartupDirectory] = useState(
    initialConnection?.localStartupDirectory ?? "",
  );
  const [keyEmailDialogOpen, setKeyEmailDialogOpen] = useState(false);
  const [keyEmailDraft, setKeyEmailDraft] = useState("");
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [keyGenerationError, setKeyGenerationError] = useState("");
  const [hasStoredConnectionPassword, setHasStoredConnectionPassword] = useState(
    Boolean(initialConnection?.hasPassword),
  );
  const [hasStoredUrlPassword, setHasStoredUrlPassword] = useState(
    Boolean(initialConnection?.hasUrlCredential),
  );
  const [portDraft, setPortDraft] = useState(
    String(initialConnection?.port ?? (connectionType ? defaultPortForConnectionType(connectionType, sshSettings) : "")),
  );
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(initialConnection?.iconDataUrl ?? null);
  const [rdpInheritsSettingsDefaults, setRdpInheritsSettingsDefaults] = useState(
    initialConnection?.rdpOptions?.inheritDefaults ?? true,
  );
  const [vncInheritsSettingsDefaults, setVncInheritsSettingsDefaults] = useState(
    initialConnection?.vncOptions?.inheritDefaults ?? true,
  );
  const usesSshDefaults = connectionType === "ssh";
  const isTelnetConnection = connectionType === "telnet";
  const isSerialConnection = connectionType === "serial";
  const isFtpConnection = connectionType === "ftp";
  const usesRemoteDesktopFields = connectionType
    ? isRemoteDesktopConnectionType(connectionType)
    : false;
  const folderOptions = useMemo(() => flattenFolders(tree.folders), [tree.folders]);
  const reusableIconDataUrls = useMemo(() => {
    const urls = flattenConnections(tree)
      .map((connection) => connection.iconDataUrl)
      .filter((url): url is string => Boolean(url));
    if (initialConnection?.iconDataUrl) {
      urls.unshift(initialConnection.iconDataUrl);
    }
    return Array.from(new Set(urls));
  }, [initialConnection?.iconDataUrl, tree]);
  const localShellOptions = useMemo(() => localShellOptionsForPlatform(), [i18n.language]);
  const isEditMode = mode === "edit";
  const isUrlConnection = connectionType === "url";
  const usesTwoColumnOptions = connectionType === "rdp" || connectionType === "vnc" || connectionType === "ftp";

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
    const ftpProtocolSelection = String(form.get("ftpProtocol") ?? "ftp");
    const ftpTlsModeSelection = String(form.get("ftpTlsMode") ?? "explicit");
    const rawPortValue = String(form.get("port") ?? "").trim();
    const portValue =
      connectionType === "ftp"
        ? String(ftpPortForProtocolSelection(ftpProtocolSelection, rawPortValue, ftpTlsModeSelection))
        : rawPortValue;
    const password = String(form.get("password") ?? "");
    const keyPath = String(form.get("keyPath") ?? "").trim();
    const proxyJump = String(form.get("proxyJump") ?? "").trim();
    const useTmuxSessions = form.get("useTmuxSessions") === "on";
    const inheritRdpDefaults = form.get("rdpInheritDefaults") === "on";
    const inheritVncDefaults = form.get("vncInheritDefaults") === "on";

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
      localStartupDirectory:
        connectionType === "local"
          ? String(form.get("localStartupDirectory") ?? "").trim() || undefined
          : undefined,
      localStartupScript:
        connectionType === "local"
          ? String(form.get("localStartupScript") ?? "").trim() || undefined
          : undefined,
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
      rdpOptions:
        connectionType === "rdp"
          ? {
              inheritDefaults: inheritRdpDefaults,
              colorDepth: inheritRdpDefaults
                ? rdpSettings.colorDepth
                : Number(String(form.get("rdpColorDepth") ?? rdpSettings.colorDepth)) as RdpSettings["colorDepth"],
              redirectClipboard: inheritRdpDefaults
                ? rdpSettings.redirectClipboard
                : form.get("rdpRedirectClipboard") === "on",
              redirectDrives: inheritRdpDefaults
                ? rdpSettings.redirectDrives
                : form.get("rdpRedirectDrives") === "on",
              bitmapCache: inheritRdpDefaults
                ? rdpSettings.bitmapCache
                : form.get("rdpBitmapCache") === "on",
              performanceProfile: String(
                inheritRdpDefaults
                  ? rdpSettings.performanceProfile
                  : form.get("rdpPerformanceProfile") ?? rdpSettings.performanceProfile,
              ) as RdpSettings["performanceProfile"],
            }
          : undefined,
      vncOptions:
        connectionType === "vnc"
          ? {
              inheritDefaults: inheritVncDefaults,
              sharedSession: inheritVncDefaults
                ? vncSettings.sharedSession
                : form.get("vncSharedSession") === "on",
              viewOnly: inheritVncDefaults
                ? vncSettings.viewOnly
                : form.get("vncViewOnly") === "on",
              colorLevel: String(
                inheritVncDefaults ? vncSettings.colorLevel : form.get("vncColorLevel") ?? vncSettings.colorLevel,
              ) as VncSettings["colorLevel"],
              preferredEncoding: String(
                inheritVncDefaults
                  ? vncSettings.preferredEncoding
                  : form.get("vncPreferredEncoding") ?? vncSettings.preferredEncoding,
              ) as VncSettings["preferredEncoding"],
            }
          : undefined,
      ftpOptions:
        connectionType === "ftp"
          ? {
              protocol: String(form.get("ftpProtocol") ?? "ftp") as "sftp" | "ftp" | "ftps",
              mode: String(form.get("ftpMode") ?? "passive") as "passive" | "active",
              tlsMode:
                form.get("ftpProtocol") === "ftps"
                  ? (String(form.get("ftpTlsMode") ?? "explicit") as "explicit" | "implicit")
                  : undefined,
              transferType: String(form.get("ftpTransferType") ?? "binary") as
                | "binary"
                | "ascii",
              utf8: form.get("ftpUtf8") === "on",
              showHidden: form.get("ftpShowHidden") === "on",
              ignoreCertErrors: form.get("ftpIgnoreCertErrors") === "on",
              connectTimeoutSecs:
                Number(String(form.get("ftpConnectTimeoutSecs") ?? "30")) || 30,
              keepaliveSecs:
                Number(String(form.get("ftpKeepaliveSecs") ?? "0")) || undefined,
            }
          : undefined,
      password:
        isTelnetConnection
          ? password
          : usesSshDefaults && authMethod === "password"
          ? password
          : usesRemoteDesktopFields
            ? password || undefined
            : isFtpConnection
              ? password || undefined
              : undefined,
      urlCredentialUsername:
        connectionType === "url"
          ? String(form.get("urlCredentialUsername") ?? "").trim() || undefined
          : undefined,
      urlPassword: connectionType === "url" ? String(form.get("urlPassword") ?? "") || undefined : undefined,
      iconDataUrl: mode === "quick" ? undefined : iconDataUrl,
    });
  }

  async function handleBrowseKeyFile() {
    const selectedPath = await selectKeyFile(keyPath || sshSettings.defaultKeyPath);
    if (selectedPath) {
      setKeyPath(selectedPath);
    }
  }

  async function handleBrowseLocalStartupDirectory() {
    const selectedPath = await selectAppLauncherFolder({
      title: t("connections.localStartupDirectoryPickerTitle"),
    });
    if (selectedPath) {
      setLocalStartupDirectory(selectedPath);
    }
  }

  function handleOpenKeyEmailDialog() {
    setKeyGenerationError("");
    setKeyEmailDraft("");
    setKeyEmailDialogOpen(true);
  }

  function handleFtpProtocolChange(event: FormEvent<HTMLSelectElement>) {
    if (event.currentTarget.value === "sftp") {
      setPortDraft("22");
    }
  }

  async function handleGenerateKeyPair(emailInput: string) {
    const email = emailInput.trim();
    if (!email) {
      return;
    }
    try {
      setIsGeneratingKey(true);
      setKeyGenerationError("");
      const generated = await invokeCommand("generate_ssh_key_pair", {
        request: { email },
      });
      setKeyPath(generated.privateKeyPath);
      onGeneratedSshKey?.(generated);
      setKeyEmailDialogOpen(false);
      setKeyEmailDraft("");
    } catch (generateError) {
      setKeyGenerationError(generateError instanceof Error ? generateError.message : String(generateError));
    } finally {
      setIsGeneratingKey(false);
    }
  }

  return (
    <div className="dialog-backdrop connection-dialog-backdrop" role="presentation">
      <form
        className={usesTwoColumnOptions ? "connection-dialog connection-dialog-wide" : "connection-dialog"}
        onSubmit={handleSubmit}
      >
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

        {connectionType ? (
          <div className="connection-type-summary">
            {mode === "quick" ? (
              <ConnectionGlyph
                iconDataUrl={initialConnection?.iconDataUrl}
                localShell={initialConnection?.localShell}
                size={20}
                type={connectionType}
              />
            ) : (
              <ConnectionIconPicker
                customIconDataUrls={reusableIconDataUrls}
                iconDataUrl={iconDataUrl}
                localShell={initialConnection?.localShell}
                onChange={setIconDataUrl}
                type={connectionType}
              />
            )}
            <span>
              <strong>{connectionTypeLabel(connectionType)}</strong>
              <small>
                {isEditMode && initialConnection
                  ? connectionSubtitle(initialConnection)
                  : connectionTypeSubtitle(connectionType)}
              </small>
            </span>
          </div>
        ) : null}

        {connectionType ? (
          <div
            className={
              usesTwoColumnOptions
                ? "connection-dialog-fields connection-dialog-fields-two-column"
                : "connection-dialog-fields"
            }
          >
            <div className="connection-dialog-primary-fields">
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
                <div className="connection-option-fields">
                  <label className="option-mode-row">
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
                </div>
                <label>
                  <span>{t("connections.localStartupDirectory")}</span>
                  <div className="input-with-button">
                    <input
                      name="localStartupDirectory"
                      onChange={(event) => setLocalStartupDirectory(event.currentTarget.value)}
                      placeholder={t("connections.localStartupDirectoryPlaceholder")}
                      value={localStartupDirectory}
                    />
                    <button className="toolbar-button" onClick={handleBrowseLocalStartupDirectory} type="button">
                      {t("connections.browse")}
                    </button>
                  </div>
                </label>
                <label>
                  <span>{t("connections.localStartupScript")}</span>
                  <textarea
                    name="localStartupScript"
                    defaultValue={initialConnection?.localStartupScript ?? ""}
                    placeholder={t("connections.localStartupScriptPlaceholder")}
                    rows={4}
                  />
                </label>
              </>
            ) : isSerialConnection ? (
              <>
                <label>
                  <span>{t("connections.nameOptional")}</span>
                  <input name="name" defaultValue={initialConnection?.name ?? ""} placeholder={t("connections.connectionName")} />
                </label>
                <div className="connection-endpoint-fields">
                  <label className="endpoint-host-input">
                    <span>{t("connections.line")}*</span>
                    <input
                      name="serialLine"
                      defaultValue={initialConnection?.serialLine ?? initialConnection?.host ?? "COM1"}
                      placeholder={t("connections.serialLinePlaceholder")}
                      required
                    />
                  </label>
                  <label className="endpoint-port-input">
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
                <div className="connection-endpoint-fields">
                  <label className="endpoint-wide-input">
                    <span>{t("connections.url")}*</span>
                    <input name="url" defaultValue={initialConnection?.url ?? ""} placeholder={t("connections.urlPlaceholder")} required />
                  </label>
                </div>
                <div className="connection-auth-fields">
                  <label>
                    <span>{t("connections.credentialUser")}</span>
                    <input
                      name="urlCredentialUsername"
                      defaultValue={initialConnection?.urlCredentialUsername ?? ""}
                      placeholder={t("connections.optionalUsername")}
                    />
                  </label>
                  <PasswordField
                    hasStoredSecret={isEditMode && hasStoredUrlPassword}
                    label={t("connections.password")}
                    name="urlPassword"
                    placeholder={isEditMode ? t("connections.leaveBlankPassword") : t("connections.storedInKeychain")}
                  />
                </div>
                <div className="connection-option-fields">
                  <label>
                    <span>{t("connections.dataPartition")}</span>
                    <input
                      name="dataPartition"
                      defaultValue={initialConnection?.dataPartition ?? ""}
                      placeholder={t("connections.default")}
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <label>
                  <span>{t("connections.nameOptional")}</span>
                  <input name="name" defaultValue={initialConnection?.name ?? ""} placeholder={t("connections.connectionName")} />
                </label>

                <div className="connection-endpoint-fields">
                  <label className="endpoint-host-input">
                    <span>{t("connections.host")}*</span>
                    <input
                      name="host"
                      defaultValue={initialConnection?.host ?? ""}
                      placeholder={t("connections.exampleHost")}
                      required
                    />
                  </label>
                  <label className="endpoint-port-input">
                    <span>{t("connections.port")}</span>
                    <input
                      key={`port-${connectionType}`}
                      name="port"
                      onChange={(event) => setPortDraft(event.currentTarget.value)}
                      value={portDraft}
                      inputMode="numeric"
                      min="1"
                      max="65535"
                      type="number"
                      placeholder={String(defaultPortForConnectionType(connectionType, sshSettings))}
                    />
                  </label>
                  {usesSshDefaults ? (
                    <label className="proxy-jump-input">
                      <span>{t("connections.proxyJumpOptional")}</span>
                      <input
                        name="proxyJump"
                        defaultValue={initialConnection?.proxyJump ?? sshSettings.defaultProxyJump ?? ""}
                        placeholder={t("connections.jumpInternal")}
                      />
                    </label>
                  ) : null}
                </div>

                {usesSshDefaults ? (
                  <div className="connection-auth-fields">
                    <label className="auth-user-input">
                      <span>{`${t("connections.user")}*`}</span>
                      <input
                        key={`user-${connectionType}`}
                        name="user"
                        defaultValue={initialConnection?.user ?? sshSettings.defaultUser}
                        placeholder={t("connections.admin")}
                        required
                      />
                    </label>
                    <label className="auth-mode-row">
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
                        <div className="input-with-button ssh-key-input-actions">
                          <input
                            name="keyPath"
                            onChange={(event) => setKeyPath(event.currentTarget.value)}
                            placeholder={t("connections.keyPathExample")}
                            value={keyPath}
                          />
                          <button className="toolbar-button" onClick={handleBrowseKeyFile} type="button">
                            {t("connections.browse")}
                          </button>
                          <button
                            className="toolbar-button"
                            onClick={handleOpenKeyEmailDialog}
                            type="button"
                          >
                            <KeyRound size={15} />
                            {t("settings.generateSshKey")}
                          </button>
                        </div>
                      </label>
                    ) : null}
                  </div>
                ) : (
                  <div className="connection-auth-fields">
                    <label>
                    <span>{connectionType === "vnc" ? t("connections.user") : `${t("connections.user")}*`}</span>
                    <input
                      key={`user-${connectionType}`}
                      name="user"
                      defaultValue={initialConnection?.user ?? (connectionType === "telnet" ? sshSettings.defaultUser : "")}
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
                    {isFtpConnection ? (
                      <PasswordField
                        hasStoredSecret={isEditMode && hasStoredConnectionPassword}
                        label={t("connections.password")}
                        name="password"
                        placeholder={
                          isEditMode
                            ? t("connections.leaveBlankPassword")
                            : t("connections.storedInKeychain")
                        }
                      />
                    ) : null}
                  </div>
                )}
              </>
            )}

            {usesSshDefaults ? (
              <>
                <div className="connection-session-fields">
                  <label className="connection-session-toggle">
                    <span>{t("connections.useTmux")}</span>
                    <input
                      name="useTmuxSessions"
                      type="checkbox"
                      defaultChecked={initialConnection?.useTmuxSessions ?? true}
                    />
                  </label>
                </div>
              </>
            ) : null}
            </div>
            {connectionType === "rdp" ? (
              <fieldset className="connection-session-fields connection-specific-options">
                <legend>{t("connections.rdpOptions")}</legend>
                <div className="connection-specific-options-panel">
                  <label className="connection-session-toggle">
                    <span>{t("connections.inheritSettingsDefaults")}</span>
                    <input
                      name="rdpInheritDefaults"
                      type="checkbox"
                      checked={rdpInheritsSettingsDefaults}
                      onChange={(event) => setRdpInheritsSettingsDefaults(event.currentTarget.checked)}
                    />
                  </label>
                  <div className="connection-option-fields">
                    <label>
                      <span>{t("settings.colorDepth")}</span>
                      <select
                        disabled={rdpInheritsSettingsDefaults}
                        name="rdpColorDepth"
                        defaultValue={initialConnection?.rdpOptions?.colorDepth ?? rdpSettings.colorDepth}
                      >
                        <option value={32}>{t("settings.rdpColorDepth32")}</option>
                        <option value={24}>{t("settings.rdpColorDepth24")}</option>
                        <option value={16}>{t("settings.rdpColorDepth16")}</option>
                        <option value={15}>{t("settings.rdpColorDepth15")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("settings.performanceFlags")}</span>
                      <select
                        disabled={rdpInheritsSettingsDefaults}
                        name="rdpPerformanceProfile"
                        defaultValue={initialConnection?.rdpOptions?.performanceProfile ?? rdpSettings.performanceProfile}
                      >
                        <option value="balanced">{t("settings.rdpPerformanceBalanced")}</option>
                        <option value="quality">{t("settings.rdpPerformanceQuality")}</option>
                        <option value="speed">{t("settings.rdpPerformanceSpeed")}</option>
                      </select>
                    </label>
                  </div>
                  <div className="connection-session-fields">
                    <label className="connection-session-toggle">
                      <span>{t("settings.rdpRedirectClipboard")}</span>
                      <input
                        disabled={rdpInheritsSettingsDefaults}
                        name="rdpRedirectClipboard"
                        type="checkbox"
                        defaultChecked={initialConnection?.rdpOptions?.redirectClipboard ?? rdpSettings.redirectClipboard}
                      />
                    </label>
                    <label className="connection-session-toggle">
                      <span>{t("settings.rdpRedirectDrives")}</span>
                      <input
                        disabled={rdpInheritsSettingsDefaults}
                        name="rdpRedirectDrives"
                        type="checkbox"
                        defaultChecked={initialConnection?.rdpOptions?.redirectDrives ?? rdpSettings.redirectDrives}
                      />
                    </label>
                    <label className="connection-session-toggle">
                      <span>{t("settings.bitmapCache")}</span>
                      <input
                        disabled={rdpInheritsSettingsDefaults}
                        name="rdpBitmapCache"
                        type="checkbox"
                        defaultChecked={initialConnection?.rdpOptions?.bitmapCache ?? rdpSettings.bitmapCache}
                      />
                    </label>
                  </div>
                </div>
              </fieldset>
            ) : null}
            {connectionType === "vnc" ? (
              <fieldset className="connection-session-fields connection-specific-options">
                <legend>{t("connections.vncOptions")}</legend>
                <div className="connection-specific-options-panel">
                  <label className="connection-session-toggle">
                    <span>{t("connections.inheritSettingsDefaults")}</span>
                    <input
                      name="vncInheritDefaults"
                      type="checkbox"
                      checked={vncInheritsSettingsDefaults}
                      onChange={(event) => setVncInheritsSettingsDefaults(event.currentTarget.checked)}
                    />
                  </label>
                  <div className="connection-option-fields">
                    <label>
                      <span>{t("settings.preferredEncoding")}</span>
                      <select
                        disabled={vncInheritsSettingsDefaults}
                        name="vncPreferredEncoding"
                        defaultValue={initialConnection?.vncOptions?.preferredEncoding ?? vncSettings.preferredEncoding}
                      >
                        <option value="tight">{t("settings.vncEncodingTight")}</option>
                        <option value="zrle">{t("settings.vncEncodingZrle")}</option>
                        <option value="raw">{t("settings.vncEncodingRaw")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("settings.colorLevel")}</span>
                      <select
                        disabled={vncInheritsSettingsDefaults}
                        name="vncColorLevel"
                        defaultValue={initialConnection?.vncOptions?.colorLevel ?? vncSettings.colorLevel}
                      >
                        <option value="full">{t("settings.vncColorFull")}</option>
                        <option value="256">{t("settings.vncColor256")}</option>
                        <option value="64">{t("settings.vncColor64")}</option>
                        <option value="8">{t("settings.vncColor8")}</option>
                      </select>
                    </label>
                  </div>
                  <div className="connection-session-fields">
                    <label className="connection-session-toggle">
                      <span>{t("settings.vncSharedSession")}</span>
                      <input
                        disabled={vncInheritsSettingsDefaults}
                        name="vncSharedSession"
                        type="checkbox"
                        defaultChecked={initialConnection?.vncOptions?.sharedSession ?? vncSettings.sharedSession}
                      />
                    </label>
                    <label className="connection-session-toggle">
                      <span>{t("settings.vncViewOnly")}</span>
                      <input
                        disabled={vncInheritsSettingsDefaults}
                        name="vncViewOnly"
                        type="checkbox"
                        defaultChecked={initialConnection?.vncOptions?.viewOnly ?? vncSettings.viewOnly}
                      />
                    </label>
                  </div>
                </div>
              </fieldset>
            ) : null}
            {isFtpConnection ? (
              <fieldset className="connection-session-fields connection-specific-options">
                <legend>{t("connections.ftpOptions")}</legend>
                <div className="connection-specific-options-panel">
                  <div className="connection-option-fields">
                    <label>
                      <span>{t("connections.ftpProtocol")}</span>
                      <select
                        name="ftpProtocol"
                        defaultValue={initialConnection?.ftpOptions?.protocol ?? "ftp"}
                        onChange={handleFtpProtocolChange}
                      >
                        <option value="ftp">{t("connections.ftpProtocolFtp")}</option>
                        <option value="ftps">{t("connections.ftpProtocolFtps")}</option>
                        <option value="sftp">{t("connections.ftpProtocolSftp")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("connections.ftpMode")}</span>
                      <select
                        name="ftpMode"
                        defaultValue={initialConnection?.ftpOptions?.mode ?? "passive"}
                      >
                        <option value="passive">{t("connections.ftpModePassive")}</option>
                        <option value="active">{t("connections.ftpModeActive")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("connections.ftpTlsMode")}</span>
                      <select
                        name="ftpTlsMode"
                        defaultValue={initialConnection?.ftpOptions?.tlsMode ?? "explicit"}
                      >
                        <option value="explicit">{t("connections.ftpTlsExplicit")}</option>
                        <option value="implicit">{t("connections.ftpTlsImplicit")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("connections.ftpTransferType")}</span>
                      <select
                        name="ftpTransferType"
                        defaultValue={initialConnection?.ftpOptions?.transferType ?? "binary"}
                      >
                        <option value="binary">{t("connections.ftpTransferBinary")}</option>
                        <option value="ascii">{t("connections.ftpTransferAscii")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("connections.ftpConnectTimeoutSecs")}</span>
                      <input
                        name="ftpConnectTimeoutSecs"
                        defaultValue={initialConnection?.ftpOptions?.connectTimeoutSecs ?? 30}
                        inputMode="numeric"
                        min="1"
                        max="600"
                        type="number"
                      />
                    </label>
                    <label>
                      <span>{t("connections.ftpKeepaliveSecs")}</span>
                      <input
                        name="ftpKeepaliveSecs"
                        defaultValue={initialConnection?.ftpOptions?.keepaliveSecs ?? 0}
                        inputMode="numeric"
                        min="0"
                        max="3600"
                        type="number"
                        placeholder="0"
                      />
                    </label>
                  </div>
                  <div className="connection-session-fields">
                    <label className="connection-session-toggle">
                      <span>{t("connections.ftpUtf8")}</span>
                      <input
                        name="ftpUtf8"
                        type="checkbox"
                        defaultChecked={initialConnection?.ftpOptions?.utf8 ?? true}
                      />
                    </label>
                    <label className="connection-session-toggle">
                      <span>{t("connections.ftpShowHidden")}</span>
                      <input
                        name="ftpShowHidden"
                        type="checkbox"
                        defaultChecked={initialConnection?.ftpOptions?.showHidden ?? false}
                      />
                    </label>
                    <label className="connection-session-toggle">
                      <span>{t("connections.ftpIgnoreCertErrors")}</span>
                      <input
                        name="ftpIgnoreCertErrors"
                        type="checkbox"
                        defaultChecked={initialConnection?.ftpOptions?.ignoreCertErrors ?? false}
                      />
                    </label>
                  </div>
                </div>
              </fieldset>
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
      {keyEmailDialogOpen ? (
        <ConnectionSshKeyEmailDialog
          email={keyEmailDraft}
          error={keyGenerationError}
          isGenerating={isGeneratingKey}
          onCancel={() => {
            if (isGeneratingKey) {
              return;
            }
            setKeyEmailDialogOpen(false);
            setKeyEmailDraft("");
          }}
          onChange={setKeyEmailDraft}
          onSubmit={(email) => void handleGenerateKeyPair(email)}
        />
      ) : null}
    </div>
  );
}

function ConnectionSshKeyEmailDialog({
  email,
  error,
  isGenerating,
  onCancel,
  onChange,
  onSubmit,
}: {
  email: string;
  error: string;
  isGenerating: boolean;
  onCancel: () => void;
  onChange: (email: string) => void;
  onSubmit: (email: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const canSubmit = Boolean(email.trim()) && !isGenerating;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit(email);
  }

  return (
    <div className="dialog-backdrop connection-dialog-backdrop" role="presentation">
      <form
        aria-label={t("settings.sshKeyEmailDialogTitle")}
        aria-modal="true"
        className="connection-dialog ssh-key-email-dialog"
        onSubmit={handleSubmit}
        role="dialog"
      >
        <header className="connection-dialog-header compact">
          <div>
            <p className="panel-label">{t("settings.sectionSsh")}</p>
            <h2>{t("settings.sshKeyEmailDialogTitle")}</h2>
          </div>
        </header>
        <p className="field-hint">{t("settings.sshKeyEmailDialogHint")}</p>
        {error ? <p className="form-error">{error}</p> : null}
        <label>
          <span>{t("settings.sshKeyEmailPrompt")}</span>
          <input
            autoComplete="email"
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder={t("settings.sshKeyEmailPlaceholder")}
            ref={inputRef}
            required
            type="email"
            value={email}
          />
        </label>
        <div className="dialog-actions">
          <button className="approve-button" disabled={!canSubmit} type="submit">
            <KeyRound size={15} />
            {isGenerating ? t("settings.sshKeyGenerating") : t("settings.generateSshKey")}
          </button>
          <button className="toolbar-button" disabled={isGenerating} onClick={onCancel} type="button">
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function deleteConfirmationTitle(t: TFunction, target: DeleteTarget) {
  return target.kind === "connection"
    ? t("connections.deleteConnectionConfirm")
    : t("connections.deleteFolderConfirm");
}

function deleteConfirmationMessage(t: TFunction, target: DeleteTarget) {
  const name = target.kind === "connection" ? target.connection.name : target.folder.name;
  return `${deleteConfirmationTitle(t, target)}: ${name}\n\n${t("connections.cannotBeUndone")}`;
}

function ConfirmDeleteDialog({
  onCancel,
  onConfirm,
  target,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  target: DeleteTarget;
}) {
  const { t } = useTranslation();
  const name = target.kind === "connection" ? target.connection.name : target.folder.name;
  const title = deleteConfirmationTitle(t, target);

  return (
    <div className="dialog-backdrop confirm-delete-backdrop" role="presentation">
      <div className="confirm-delete-dialog" role="alertdialog" aria-label={title}>
        <p className="panel-label">{title}</p>
        <p className="confirm-delete-name">{name}</p>
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
  isRenaming,
  isDraggingSource,
  isDropTarget,
  onCancelRename,
  onClickCapture,
  onContextMenu,
  onCommitRename,
  onOpen,
  onPointerDragStart,
}: {
  connection: Connection;
  connectionIndex: number;
  dragDisabled: boolean;
  folderId?: string;
  isRenaming: boolean;
  isDraggingSource: boolean;
  isDropTarget: boolean;
  onCancelRename: () => void;
  onClickCapture: (event: ReactMouseEvent) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onCommitRename: (name: string) => Promise<boolean>;
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
      {isRenaming ? (
        <div className="connection-open connection-open-editing">
          <ConnectionGlyph iconDataUrl={connection.iconDataUrl} localShell={connection.localShell} size={18} type={connection.type} />
          <span className="connection-main">
            <InlineTreeRenameInput
              ariaLabel={i18next.t("connections.renameConnection")}
              initialName={connection.name}
              onCancel={onCancelRename}
              onCommit={onCommitRename}
            />
          </span>
        </div>
      ) : (
        <button className="connection-open" onClick={onOpen}>
          <ConnectionGlyph iconDataUrl={connection.iconDataUrl} localShell={connection.localShell} size={18} type={connection.type} />
          <span className="connection-main">
            <strong>{connection.name}</strong>
          </span>
        </button>
      )}
      <span className={`status-dot ${connection.status}`} />
    </div>
  );
}
