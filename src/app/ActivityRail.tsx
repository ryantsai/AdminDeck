import {
  Gauge,
  LayoutDashboard,
  Pin,
  PinOff,
  Settings,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConnectionIcon } from "../connections/ConnectionIcon";
import { flattenConnections } from "../connections/treeUtils";
import { nativeMenuIcons } from "../lib/nativeMenuIcons";
import { showNativeContextMenu, type NativeContextMenuItem } from "../lib/nativeContextMenu";
import { invokeCommand, isTauriRuntime } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { Connection } from "../types";
import { RailTooltip } from "./RailTooltip";

export type ActivePage = "workspace" | "dashboard" | "settings";

type ConnectedRailItem = {
  connection: Connection;
  tabId?: string;
  pinned: boolean;
};

type ConnectionRailDragState = {
  connectionId: string;
  pointerId: number;
  startY: number;
  moved: boolean;
};

type ConnectionRailDropTarget = {
  connectionId: string | null;
  position: "before" | "after" | "end";
};

type RailConnectionMenuState = {
  connection: Connection;
  pinned: boolean;
  x: number;
  y: number;
};

const CONNECTION_RAIL_ORDER_KEY = "kkterm.connectionRail.order.v1";

function loadConnectionRailOrder() {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CONNECTION_RAIL_ORDER_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function persistConnectionRailOrder(order: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(CONNECTION_RAIL_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Ordering is a convenience preference; fail silently if storage is unavailable.
  }
}

export function ActivityRail({
  activePage,
  connectionsCollapsed,
  onConnectionsToggle,
  onNavigate,
}: {
  activePage: ActivePage;
  connectionsCollapsed: boolean;
  onConnectionsToggle: () => void;
  onNavigate: (page: ActivePage) => void;
}) {
  const { t } = useTranslation();
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const activeSessionCounts = useWorkspaceStore((state) => state.activeSessionCounts);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const generalSettings = useWorkspaceStore((state) => state.generalSettings);
  const setGeneralSettings = useWorkspaceStore((state) => state.setGeneralSettings);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const openConnection = useWorkspaceStore((state) => state.openConnection);
  const [savedConnections, setSavedConnections] = useState<Connection[]>([]);
  const [connectionRailOrder, setConnectionRailOrder] = useState(
    loadConnectionRailOrder,
  );
  const [draggedConnectionId, setDraggedConnectionId] = useState<string | null>(
    null,
  );
  const [connectionRailDropTarget, setConnectionRailDropTarget] =
    useState<ConnectionRailDropTarget | null>(null);
  const [railConnectionMenu, setRailConnectionMenu] =
    useState<RailConnectionMenuState | null>(null);
  const railConnectionMenuRef = useRef<HTMLDivElement | null>(null);
  const connectionRailDragRef = useRef<ConnectionRailDragState | null>(null);
  const connectionRailListRef = useRef<HTMLDivElement | null>(null);
  const suppressConnectionClickRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function loadSavedConnections() {
      try {
        const tree = await invokeCommand("list_connection_tree");
        if (!disposed) {
          setSavedConnections(flattenConnections(tree));
        }
      } catch {
        if (!disposed) {
          setSavedConnections([]);
        }
      }
    }

    void loadSavedConnections();
    const handleTreeInvalidated = () => {
      void loadSavedConnections();
    };
    window.addEventListener("kkterm:connection-tree-invalidated", handleTreeInvalidated);
    return () => {
      disposed = true;
      window.removeEventListener("kkterm:connection-tree-invalidated", handleTreeInvalidated);
    };
  }, []);

  function handleConnectionsClick() {
    if (activePage === "workspace") {
      onConnectionsToggle();
    } else {
      onNavigate("workspace");
    }
  }

  function handleRailConnectionClick(item: ConnectedRailItem) {
    onNavigate("workspace");
    if (item.tabId) {
      activateTab(item.tabId);
      return;
    }
    openConnection(item.connection);
  }

  const activeTabConnectionId = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId)?.connection?.id,
    [activeTabId, tabs],
  );

  const connectedRailItems = useMemo<ConnectedRailItem[]>(() => {
    const savedConnectionById = new Map(
      savedConnections.map((connection) => [connection.id, connection]),
    );
    const pinnedConnectionIds = generalSettings.pinnedConnectionIds ?? [];
    const pinnedConnectionIdSet = new Set(pinnedConnectionIds);
    const pinnedItems: ConnectedRailItem[] = pinnedConnectionIds.flatMap((connectionId) => {
      const connection = savedConnectionById.get(connectionId);
      if (!connection) {
        return [];
      }
      const tabId = tabs.find((tab) => tab.connection?.id === connection.id)?.id;
      return [{ connection, tabId, pinned: true }];
    });

    const seenConnectionIds = new Set<string>();
    pinnedItems.forEach((item) => seenConnectionIds.add(item.connection.id));
    const items: ConnectedRailItem[] = generalSettings.showConnectedConnectionsInRail
      ? tabs.flatMap((tab) => {
          const connection = tab.connection;
          if (
            !connection ||
            pinnedConnectionIdSet.has(connection.id) ||
            seenConnectionIds.has(connection.id) ||
            !activeSessionCounts[connection.id]
          ) {
            return [];
          }
          seenConnectionIds.add(connection.id);
          return [{ connection, tabId: tab.id, pinned: false }];
        })
      : [];

    const itemByConnectionId = new Map(
      items.map((item) => [item.connection.id, item]),
    );
    const orderedItems = connectionRailOrder.flatMap((connectionId) => {
      const item = itemByConnectionId.get(connectionId);
      if (!item) {
        return [];
      }
      itemByConnectionId.delete(connectionId);
      return [item];
    });

    return [...pinnedItems, ...orderedItems, ...itemByConnectionId.values()];
  }, [
    activeSessionCounts,
    connectionRailOrder,
    generalSettings.pinnedConnectionIds,
    generalSettings.showConnectedConnectionsInRail,
    savedConnections,
    tabs,
  ]);

  function reorderConnectedRailItem(
    sourceConnectionId: string,
    dropTarget: ConnectionRailDropTarget,
  ) {
    const visibleConnectionIds = connectedRailItems
      .filter((item) => !item.pinned)
      .map((item) => item.connection.id);
    if (
      !visibleConnectionIds.includes(sourceConnectionId) ||
      sourceConnectionId === dropTarget.connectionId
    ) {
      return;
    }

    setConnectionRailOrder((currentOrder) => {
      const nextOrder = [
        ...currentOrder.filter((connectionId) =>
          visibleConnectionIds.includes(connectionId),
        ),
        ...visibleConnectionIds.filter(
          (connectionId) => !currentOrder.includes(connectionId),
        ),
      ].filter((connectionId) => connectionId !== sourceConnectionId);

      const targetIndex = dropTarget.connectionId
        ? nextOrder.indexOf(dropTarget.connectionId)
        : -1;
      if (targetIndex === -1) {
        nextOrder.push(sourceConnectionId);
      } else {
        nextOrder.splice(
          dropTarget.position === "after" ? targetIndex + 1 : targetIndex,
          0,
          sourceConnectionId,
        );
      }
      persistConnectionRailOrder(nextOrder);
      return nextOrder;
    });
  }

  function getConnectionRailDropTarget(
    clientX: number,
    clientY: number,
  ): ConnectionRailDropTarget {
    const list = connectionRailListRef.current;
    if (!list) {
      return { connectionId: null, position: "end" };
    }

    const target = document.elementFromPoint(clientX, clientY);
    const button = target?.closest?.("[data-rail-connected-id]");
    if (button instanceof HTMLElement && list.contains(button)) {
      const rect = button.getBoundingClientRect();
      return {
        connectionId: button.dataset.railConnectedId ?? null,
        position: clientY < rect.top + rect.height / 2 ? "before" : "after",
      };
    }

    const firstButton = list.querySelector<HTMLElement>(
      "[data-rail-connected-id]",
    );
    if (firstButton) {
      const rect = firstButton.getBoundingClientRect();
      if (clientY < rect.top) {
        return {
          connectionId: firstButton.dataset.railConnectedId ?? null,
          position: "before",
        };
      }
    }

    return { connectionId: null, position: "end" };
  }

  function handleConnectedRailPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    connectionId: string,
  ) {
    if (event.button !== 0) {
      return;
    }
    connectionRailDragRef.current = {
      connectionId,
      pointerId: event.pointerId,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleConnectedRailPointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const drag = connectionRailDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (!drag.moved && Math.abs(event.clientY - drag.startY) < 5) {
      return;
    }

    drag.moved = true;
    setDraggedConnectionId(drag.connectionId);
    event.preventDefault();

    const targetConnectionId = getConnectionRailDropTarget(
      event.clientX,
      event.clientY,
    );
    setConnectionRailDropTarget(targetConnectionId);
    if (targetConnectionId.connectionId !== drag.connectionId) {
      reorderConnectedRailItem(drag.connectionId, targetConnectionId);
    }
  }

  function handleConnectedRailPointerEnd(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const drag = connectionRailDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.moved) {
      const targetConnectionId = getConnectionRailDropTarget(
        event.clientX,
        event.clientY,
      );
      reorderConnectedRailItem(drag.connectionId, targetConnectionId);
      suppressConnectionClickRef.current = drag.connectionId;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    connectionRailDragRef.current = null;
    setDraggedConnectionId(null);
    setConnectionRailDropTarget(null);
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

  async function pinRailConnection(connection: Connection) {
    const nextPinnedConnectionIds = [
      ...generalSettings.pinnedConnectionIds.filter(
        (connectionId) => connectionId !== connection.id,
      ),
      connection.id,
    ];
    await updatePinnedRailConnections(
      nextPinnedConnectionIds,
      t("connections.pinnedToRailStatus", { name: connection.name }),
    );
  }

  async function unpinRailConnection(connection: Connection) {
    await updatePinnedRailConnections(
      generalSettings.pinnedConnectionIds.filter(
        (connectionId) => connectionId !== connection.id,
      ),
      t("connections.unpinnedFromRailStatus", { name: connection.name }),
    );
  }

  function buildRailConnectionMenuItems(
    menu: RailConnectionMenuState,
  ): NativeContextMenuItem[] {
    return [
      {
        kind: "item",
        label: t(menu.pinned ? "connections.unpinFromRail" : "connections.pinToRail"),
        iconSvg: menu.pinned ? nativeMenuIcons.pinOff : nativeMenuIcons.pin,
        action: () => {
          void (menu.pinned
            ? unpinRailConnection(menu.connection)
            : pinRailConnection(menu.connection));
        },
      },
    ];
  }

  async function openRailConnectionMenu(menu: RailConnectionMenuState) {
    const opened = await showNativeContextMenu(buildRailConnectionMenuItems(menu), {
      x: menu.x,
      y: menu.y,
    });
    if (!opened) {
      setRailConnectionMenu(menu);
    }
  }

  useEffect(() => {
    if (!railConnectionMenu) {
      return;
    }
    function closeMenu(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && railConnectionMenuRef.current?.contains(target)) {
        return;
      }
      setRailConnectionMenu(null);
    }
    function closeMenuOnKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setRailConnectionMenu(null);
      }
    }
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeMenuOnKey);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeMenuOnKey);
    };
  }, [railConnectionMenu]);

  useLayoutEffect(() => {
    const node = railConnectionMenuRef.current;
    if (!node || !railConnectionMenu) {
      return;
    }
    const bounds = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(railConnectionMenu.x, window.innerWidth - bounds.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(railConnectionMenu.y, window.innerHeight - bounds.height - 8))}px`;
  }, [railConnectionMenu]);

  return (
    <nav className="activity-rail" aria-label={t("app.primaryNav")}>
      <button
        className={`rail-button ${activePage === "workspace" ? "active" : ""} ${
          connectionsCollapsed ? "connections-collapsed-indicator" : ""
        }`}
        aria-label={t("workspace.workspace")}
        onClick={handleConnectionsClick}
      >
        <LayoutDashboard size={18} />
        <RailTooltip label={t("workspace.workspace")} />
      </button>
      <button
        className={`rail-button ${activePage === "dashboard" ? "active" : ""}`}
        aria-label={t("dashboard.title")}
        onClick={() => onNavigate("dashboard")}
      >
        <Gauge size={18} />
        <RailTooltip label={t("dashboard.title")} />
      </button>
      {connectedRailItems.length > 0 ? (
        <div
          ref={connectionRailListRef}
          className={`rail-connected-connections ${
            draggedConnectionId &&
            connectionRailDropTarget?.position === "end"
              ? "rail-drop-end"
              : ""
          }`}
          aria-label={t("app.connectionRail")}
        >
          {connectedRailItems.map((item) => (
            <button
              key={item.connection.id}
              data-rail-connection-id={item.connection.id}
              data-rail-connected-id={item.pinned ? undefined : item.connection.id}
              className={`rail-button rail-button-connection ${
                item.pinned ? "pinned" : ""
              } ${activeSessionCounts[item.connection.id] ? "connected" : ""} ${
                activePage === "workspace" && activeTabConnectionId === item.connection.id
                  ? "active"
                  : ""
              } ${draggedConnectionId === item.connection.id ? "dragging" : ""} ${
                draggedConnectionId &&
                connectionRailDropTarget?.connectionId === item.connection.id &&
                connectionRailDropTarget.position === "before"
                  ? "rail-drop-before"
                  : ""
              } ${
                draggedConnectionId &&
                connectionRailDropTarget?.connectionId === item.connection.id &&
                connectionRailDropTarget.position === "after"
                  ? "rail-drop-after"
                  : ""
              }`}
              aria-label={t(item.pinned ? "app.openPinnedConnection" : "app.openConnectedConnection", {
                name: item.connection.name,
              })}
              onClick={() => {
                if (suppressConnectionClickRef.current === item.connection.id) {
                  suppressConnectionClickRef.current = null;
                  return;
                }
                handleRailConnectionClick(item);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                void openRailConnectionMenu({
                  connection: item.connection,
                  pinned: item.pinned,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              onPointerCancel={item.pinned ? undefined : handleConnectedRailPointerEnd}
              onPointerDown={
                item.pinned
                  ? undefined
                  : (event) =>
                    handleConnectedRailPointerDown(event, item.connection.id)
              }
              onPointerMove={item.pinned ? undefined : handleConnectedRailPointerMove}
              onPointerUp={item.pinned ? undefined : handleConnectedRailPointerEnd}
            >
              <ConnectionIcon
                iconBackgroundColor={item.connection.iconBackgroundColor}
                iconDataUrl={item.connection.iconDataUrl}
                localShell={item.connection.localShell}
                size={18}
                type={item.connection.type}
              />
              <RailTooltip label={item.connection.name} />
            </button>
          ))}
        </div>
      ) : null}
      {railConnectionMenu ? (
        <div
          ref={railConnectionMenuRef}
          className="terminal-menu rail-context-menu rail-connection-menu"
          onContextMenu={(event) => event.preventDefault()}
          role="menu"
        >
          <button
            className="terminal-menu-item"
            onClick={() => {
              const connection = railConnectionMenu.connection;
              const pinned = railConnectionMenu.pinned;
              setRailConnectionMenu(null);
              void (pinned ? unpinRailConnection(connection) : pinRailConnection(connection));
            }}
            role="menuitem"
            type="button"
          >
            {railConnectionMenu.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            {t(railConnectionMenu.pinned ? "connections.unpinFromRail" : "connections.pinToRail")}
          </button>
        </div>
      ) : null}
      <button
        className={`rail-button rail-button-settings ${activePage === "settings" ? "active" : ""}`}
        aria-label={t("app.settings")}
        onClick={() => onNavigate("settings")}
      >
        <Settings size={18} />
        <RailTooltip label={t("app.settings")} />
      </button>
    </nav>
  );
}
