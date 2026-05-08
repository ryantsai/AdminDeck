import {
  BedSingle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Coffee,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { invokeCommand, isTauriRuntime } from "./lib/tauri";
import { useBootstrapSettings } from "./lib/settings";
import { SettingsPage } from "./settings/SettingsPage";
import { useWorkspaceStore } from "./store";
import "@icon-park/react/styles/index.css";
import "@xterm/xterm/css/xterm.css";
import "./App.css";
import { AssistantPanel } from "./ai/AssistantPanel";
import { ConnectionIcon } from "./connections/ConnectionIcon";
import { ConnectionSidebar } from "./connections/ConnectionSidebar";
import { StatusBar } from "./workspace/StatusBar";
import { TabStrip, WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import { WikiWorkspace } from "./wiki/WikiWorkspace";
import { useOpenWikiListener } from "./wiki/WikiPagesButton";
import type { Connection } from "./types";

type PanelLayoutState = {
  collapsed: boolean;
  width: number;
};

const CONNECTION_PANEL_DEFAULT_WIDTH = 292;

const CONNECTION_PANEL_MIN_WIDTH = 220;

const CONNECTION_PANEL_MAX_WIDTH = 1560;

const AI_PANEL_DEFAULT_WIDTH = 334;

const AI_PANEL_MIN_WIDTH = 260;

const AI_PANEL_MAX_WIDTH = 1860;

const CONNECTION_PANEL_LAYOUT_KEY = "admindeck.layout.connectionsPanel.v1";

const AI_PANEL_LAYOUT_KEY = "admindeck.layout.aiAssistPanel.v2";

const CONNECTION_RAIL_ORDER_KEY = "admindeck.connectionRail.order.v1";

type ConnectedRailItem = {
  connection: Connection;
  tabId: string;
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

const defaultConnectionPanelLayout: PanelLayoutState = {
  collapsed: false,
  width: CONNECTION_PANEL_DEFAULT_WIDTH,
};

const defaultAiPanelLayout: PanelLayoutState = {
  collapsed: false,
  width: AI_PANEL_DEFAULT_WIDTH,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadPanelLayout(
  key: string,
  fallback: PanelLayoutState,
  minWidth: number,
  maxWidth: number,
): PanelLayoutState {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<PanelLayoutState> | null;
    if (!parsed) {
      return fallback;
    }
    return {
      collapsed: typeof parsed.collapsed === "boolean" ? parsed.collapsed : fallback.collapsed,
      width:
        typeof parsed.width === "number" && Number.isFinite(parsed.width)
          ? clamp(Math.round(parsed.width), minWidth, maxWidth)
          : fallback.width,
    };
  } catch {
    return fallback;
  }
}

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

function RailTooltip({ label }: { label: string }) {
  return (
    <span className="rail-tooltip" role="tooltip">
      {label}
    </span>
  );
}

function persistPanelLayout(key: string, layout: PanelLayoutState) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    // Storage may be unavailable (private mode, quota); fail silently.
  }
}

function removeLayoutStorageKeys() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("admindeck.layout.")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable (private mode, quota); fail silently.
  }
}

type ActivePage = "workspace" | "wiki" | "settings";

function App() {
  const { t } = useTranslation();
  const [activePage, setActivePage] = useState<ActivePage>("workspace");
  const [wikiInitialPageId, setWikiInitialPageId] = useState<string | null>(null);
  const appearanceSettings = useWorkspaceStore((state) => state.appearanceSettings);
  const setFrontendLaunchMs = useWorkspaceStore((state) => state.setFrontendLaunchMs);
  const setHostUsageSnapshot = useWorkspaceStore((state) => state.setHostUsageSnapshot);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const resetAllLayouts = useWorkspaceStore((state) => state.resetAllLayouts);
  useBootstrapSettings();

  useOpenWikiListener((pageId) => {
    setWikiInitialPageId(pageId);
    setActivePage("wiki");
  });

  const [connectionPanelLayout, setConnectionPanelLayout] = useState(() =>
    loadPanelLayout(
      CONNECTION_PANEL_LAYOUT_KEY,
      defaultConnectionPanelLayout,
      CONNECTION_PANEL_MIN_WIDTH,
      CONNECTION_PANEL_MAX_WIDTH,
    ),
  );
  const [aiPanelLayout, setAiPanelLayout] = useState(() =>
    loadPanelLayout(
      AI_PANEL_LAYOUT_KEY,
      defaultAiPanelLayout,
      AI_PANEL_MIN_WIDTH,
      AI_PANEL_MAX_WIDTH,
    ),
  );

  useEffect(() => {
    persistPanelLayout(CONNECTION_PANEL_LAYOUT_KEY, connectionPanelLayout);
  }, [connectionPanelLayout]);

  useEffect(() => {
    persistPanelLayout(AI_PANEL_LAYOUT_KEY, aiPanelLayout);
  }, [aiPanelLayout]);

  const [panelAnimating, setPanelAnimating] = useState(false);
  const prefersReducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    if (!panelAnimating) return;
    const timer = setTimeout(() => setPanelAnimating(false), 500);
    return () => clearTimeout(timer);
  }, [panelAnimating]);

  function toggleConnectionPanel() {
    if (!prefersReducedMotion) {
      setPanelAnimating(true);
    }
    setConnectionPanelLayout((layout) => ({ ...layout, collapsed: !layout.collapsed }));
  }

  function toggleAiPanel() {
    if (!prefersReducedMotion) {
      setPanelAnimating(true);
    }
    setAiPanelLayout((layout) => ({ ...layout, collapsed: !layout.collapsed }));
  }

  function expandAiPanel() {
    if (!prefersReducedMotion) {
      setPanelAnimating(true);
    }
    setAiPanelLayout((layout) => ({ ...layout, collapsed: false }));
  }

  function handleConnectionPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    setPanelAnimating(false);
    const startX = event.clientX;
    const startWidth = connectionPanelLayout.collapsed
      ? 0
      : connectionPanelLayout.width;

    beginDragResize(event, (pointerEvent) => {
      const nextWidth = clamp(
        startWidth + pointerEvent.clientX - startX,
        CONNECTION_PANEL_MIN_WIDTH,
        CONNECTION_PANEL_MAX_WIDTH,
      );
      setConnectionPanelLayout({
        collapsed: false,
        width: nextWidth,
      });
    });
  }

  function handleAiPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    setPanelAnimating(false);
    const startX = event.clientX;
    const startWidth = aiPanelLayout.collapsed ? 0 : aiPanelLayout.width;

    beginDragResize(event, (pointerEvent) => {
      const nextWidth = clamp(
        startWidth + startX - pointerEvent.clientX,
        AI_PANEL_MIN_WIDTH,
        AI_PANEL_MAX_WIDTH,
      );
      setAiPanelLayout({
        collapsed: false,
        width: nextWidth,
      });
    });
  }

  function handleResetLayout() {
    removeLayoutStorageKeys();
    resetAllLayouts();
    setConnectionPanelLayout(defaultConnectionPanelLayout);
    setAiPanelLayout(defaultAiPanelLayout);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFrontendLaunchMs(Math.round(performance.now()));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [setFrontendLaunchMs]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let refreshing = false;
    async function refreshHostUsageSnapshot() {
      if (refreshing) {
        return;
      }
      refreshing = true;
      try {
        const snapshot = await invokeCommand("get_host_usage_snapshot");
        if (!disposed) {
          setHostUsageSnapshot(snapshot);
        }
      } catch {
        // Host usage is informational only.
      } finally {
        refreshing = false;
      }
    }

    void refreshHostUsageSnapshot();
    const interval = window.setInterval(() => void refreshHostUsageSnapshot(), 5_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [setHostUsageSnapshot]);

  useEffect(() => {
    const preventDefaultContextMenu = (event: globalThis.MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", preventDefaultContextMenu, { capture: true });
    return () => {
      window.removeEventListener("contextmenu", preventDefaultContextMenu, { capture: true });
    };
  }, []);

  useLayoutEffect(() => {
    const node = appShellRef.current;
    if (!node) {
      return;
    }

    node.style.setProperty(
      "--connection-panel-width",
      connectionPanelLayout.collapsed ? "0px" : `${connectionPanelLayout.width}px`,
    );
    node.style.setProperty("--connection-resize-width", "1px");
    node.style.setProperty("--ai-panel-width", aiPanelLayout.collapsed ? "0px" : `${aiPanelLayout.width}px`);
    node.style.setProperty("--ai-resize-width", aiPanelLayout.collapsed ? "34px" : "1px");
    node.style.setProperty("--app-ui-font-family", appearanceSettings.appFontFamily);
    node.setAttribute("data-color-scheme", appearanceSettings.colorScheme);
  }, [
    aiPanelLayout.collapsed,
    aiPanelLayout.width,
    appearanceSettings.appFontFamily,
    appearanceSettings.colorScheme,
    connectionPanelLayout.collapsed,
    connectionPanelLayout.width,
  ]);

  return (
    <div
      ref={appShellRef}
      className={`app-shell ${panelAnimating ? "panel-animating" : ""} ${
        activePage === "settings" ? "settings-mode" : ""
      } ${
        connectionPanelLayout.collapsed ? "connections-collapsed" : ""
      } ${aiPanelLayout.collapsed ? "ai-assist-collapsed" : ""}`}
    >
      <ActivityRail
        activePage={activePage}
        connectionsCollapsed={connectionPanelLayout.collapsed}
        onConnectionsToggle={toggleConnectionPanel}
        onNavigate={(page) => {
          if (page !== "wiki") {
            setWikiInitialPageId(null);
          }
          setActivePage(page);
        }}
      />
      <div className="workspace-page" aria-hidden={activePage !== "workspace"}>
        <ConnectionSidebar
          collapsed={connectionPanelLayout.collapsed}
          onToggleCollapsed={toggleConnectionPanel}
        />
        {connectionPanelLayout.collapsed ? (
          <div className="connection-collapsed-separator" aria-hidden="true" />
        ) : (
          <PanelResizeHandle
            ariaLabel={t("app.resizeConnections")}
            side="left"
            onPointerDown={handleConnectionPanelResize}
          />
        )}
        <main className="workspace">
          <TabStrip />
          <WorkspaceCanvas workspaceActive={activePage === "workspace"} />
          <StatusBar />
        </main>
        <PanelResizeHandle
          ariaLabel={t("app.resizeAiAssistant")}
          side="right"
          collapsed={aiPanelLayout.collapsed}
          collapsedLabel={t("app.aiAssistant")}
          onClick={aiPanelLayout.collapsed ? expandAiPanel : undefined}
          onPointerDown={handleAiPanelResize}
        />
        <AssistantPanel
          collapsed={aiPanelLayout.collapsed}
          onOpenSettings={() => setActivePage("settings")}
          onToggleCollapsed={toggleAiPanel}
        />
      </div>
      {activePage === "wiki" ? (
        <div className="wiki-page" role="region" aria-label={t("wiki.title")}>
          <WikiWorkspace
            active={activePage === "wiki"}
            initialPageId={wikiInitialPageId}
            onOpenConnection={() => setActivePage("workspace")}
          />
        </div>
      ) : null}
      {activePage === "settings" ? (
        <SettingsPage
          onBack={() => setActivePage("workspace")}
          onResetLayout={handleResetLayout}
        />
      ) : null}
    </div>
  );
}

function beginDragResize(
  event: ReactPointerEvent<HTMLButtonElement>,
  onMove: (event: PointerEvent) => void,
) {
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  document.body.classList.add("is-resizing-layout");

  const stop = () => {
    document.body.classList.remove("is-resizing-layout");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
}

function PanelResizeHandle({
  ariaLabel,
  collapsed,
  collapsedLabel,
  onClick,
  side,
  onPointerDown,
}: {
  ariaLabel: string;
  collapsed?: boolean;
  collapsedLabel?: string;
  onClick?: () => void;
  side: "left" | "right";
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`panel-resize-handle panel-resize-handle-${side} ${
        collapsed ? "panel-resize-handle-collapsed" : ""
      }`}
      onClick={onClick}
      onPointerDown={collapsed ? undefined : onPointerDown}
      title={ariaLabel}
      type="button"
    >
      {collapsed ? (
        <span className="panel-collapsed-tab">
          <span>{collapsedLabel}</span>
          {side === "left" ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </span>
      ) : null}
    </button>
  );
}

function ActivityRail({
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
  const showWorkspaceStatus = useWorkspaceStore((state) => state.showWorkspaceStatus);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const activeSessionCounts = useWorkspaceStore((state) => state.activeSessionCounts);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const generalSettings = useWorkspaceStore((state) => state.generalSettings);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const [dontSleepEnabled, setDontSleepEnabled] = useState(false);
  const [dontSleepUpdating, setDontSleepUpdating] = useState(false);
  const [connectionRailOrder, setConnectionRailOrder] = useState(
    loadConnectionRailOrder,
  );
  const [draggedConnectionId, setDraggedConnectionId] = useState<string | null>(
    null,
  );
  const [connectionRailDropTarget, setConnectionRailDropTarget] =
    useState<ConnectionRailDropTarget | null>(null);
  const connectionRailDragRef = useRef<ConnectionRailDragState | null>(null);
  const connectionRailListRef = useRef<HTMLDivElement | null>(null);
  const suppressConnectionClickRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    void invokeCommand("get_dont_sleep_enabled")
      .then((enabled) => {
        if (!disposed) {
          setDontSleepEnabled(enabled);
        }
      })
      .catch(() => {
        // The rail should still render if the desktop-only helper is unavailable.
      });

    return () => {
      disposed = true;
    };
  }, []);

  function handleConnectionsClick() {
    if (activePage === "workspace") {
      onConnectionsToggle();
    } else {
      onNavigate("workspace");
    }
  }

  function handleConnectedConnectionClick(tabId: string) {
    onNavigate("workspace");
    activateTab(tabId);
  }

  const activeTabConnectionId = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId)?.connection?.id,
    [activeTabId, tabs],
  );

  const connectedRailItems = useMemo<ConnectedRailItem[]>(() => {
    if (!generalSettings.showConnectedConnectionsInRail) {
      return [];
    }

    const seenConnectionIds = new Set<string>();
    const items = tabs.flatMap((tab) => {
      const connection = tab.connection;
      if (
        !connection ||
        seenConnectionIds.has(connection.id) ||
        !activeSessionCounts[connection.id]
      ) {
        return [];
      }
      seenConnectionIds.add(connection.id);
      return [{ connection, tabId: tab.id }];
    });

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

    return [...orderedItems, ...itemByConnectionId.values()];
  }, [
    activeSessionCounts,
    connectionRailOrder,
    generalSettings.showConnectedConnectionsInRail,
    tabs,
  ]);

  function reorderConnectedRailItem(
    sourceConnectionId: string,
    dropTarget: ConnectionRailDropTarget,
  ) {
    const visibleConnectionIds = connectedRailItems.map(
      (item) => item.connection.id,
    );
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
    const button = target?.closest?.("[data-rail-connection-id]");
    if (button instanceof HTMLElement && list.contains(button)) {
      const rect = button.getBoundingClientRect();
      return {
        connectionId: button.dataset.railConnectionId ?? null,
        position: clientY < rect.top + rect.height / 2 ? "before" : "after",
      };
    }

    const firstButton = list.querySelector<HTMLElement>(
      "[data-rail-connection-id]",
    );
    if (firstButton) {
      const rect = firstButton.getBoundingClientRect();
      if (clientY < rect.top) {
        return {
          connectionId: firstButton.dataset.railConnectionId ?? null,
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

  function handleConnectedConnectionButtonClick(tabId: string, connectionId: string) {
    if (suppressConnectionClickRef.current === connectionId) {
      suppressConnectionClickRef.current = null;
      return;
    }
    handleConnectedConnectionClick(tabId);
  }

  async function handleDontSleepClick() {
    if (dontSleepUpdating) {
      return;
    }

    const nextEnabled = !dontSleepEnabled;
    setDontSleepUpdating(true);

    try {
      const enabled = isTauriRuntime()
        ? await invokeCommand("set_dont_sleep_enabled", { enabled: nextEnabled })
        : nextEnabled;
      setDontSleepEnabled(enabled);
      showWorkspaceStatus(
        enabled ? t("app.dontSleepEnabled") : t("app.dontSleepDisabled"),
        { tone: enabled ? "success" : "info" },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showWorkspaceStatus(t("app.dontSleepError", { message }), { tone: "error" });
    } finally {
      setDontSleepUpdating(false);
    }
  }

  const dontSleepLabel = dontSleepEnabled
    ? t("app.dontSleepDisable")
    : t("app.dontSleepEnable");
  const DontSleepIcon = dontSleepEnabled ? Coffee : BedSingle;

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
        className={`rail-button ${activePage === "wiki" ? "active" : ""}`}
        aria-label={t("app.wiki")}
        onClick={() => onNavigate("wiki")}
      >
        <BookOpen size={18} />
        <RailTooltip label={t("app.wiki")} />
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
          aria-label={t("app.connectedConnectionsRail")}
        >
          {connectedRailItems.map(({ connection, tabId }) => (
            <button
              key={connection.id}
              data-rail-connection-id={connection.id}
              className={`rail-button rail-button-connection ${
                activePage === "workspace" && activeTabConnectionId === connection.id
                  ? "active"
                  : ""
              } ${draggedConnectionId === connection.id ? "dragging" : ""} ${
                draggedConnectionId &&
                connectionRailDropTarget?.connectionId === connection.id &&
                connectionRailDropTarget.position === "before"
                  ? "rail-drop-before"
                  : ""
              } ${
                draggedConnectionId &&
                connectionRailDropTarget?.connectionId === connection.id &&
                connectionRailDropTarget.position === "after"
                  ? "rail-drop-after"
                  : ""
              }`}
              aria-label={t("app.openConnectedConnection", {
                name: connection.name,
              })}
              onClick={() =>
                handleConnectedConnectionButtonClick(tabId, connection.id)
              }
              onPointerCancel={handleConnectedRailPointerEnd}
              onPointerDown={(event) =>
                handleConnectedRailPointerDown(event, connection.id)
              }
              onPointerMove={handleConnectedRailPointerMove}
              onPointerUp={handleConnectedRailPointerEnd}
            >
              <ConnectionIcon
                localShell={connection.localShell}
                size={18}
                type={connection.type}
              />
              <RailTooltip label={connection.name} />
            </button>
          ))}
        </div>
      ) : null}
      <button
        className={`rail-button rail-button-dont-sleep ${
          dontSleepEnabled ? "active dont-sleep-enabled" : ""
        }`}
        aria-label={dontSleepLabel}
        aria-pressed={dontSleepEnabled}
        disabled={dontSleepUpdating}
        onClick={() => void handleDontSleepClick()}
      >
        <DontSleepIcon size={18} />
        <RailTooltip label={t("app.dontSleep")} />
      </button>
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

export default App;
