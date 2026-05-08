import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Coffee,
  LayoutDashboard,
  Moon,
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

  function handleConnectionPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
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
      className={`app-shell ${activePage === "settings" ? "settings-mode" : ""} ${
        connectionPanelLayout.collapsed ? "connections-collapsed" : ""
      } ${aiPanelLayout.collapsed ? "ai-assist-collapsed" : ""}`}
    >
      <ActivityRail
        activePage={activePage}
        connectionsCollapsed={connectionPanelLayout.collapsed}
        onConnectionsRestore={() =>
          setConnectionPanelLayout((layout) => ({ ...layout, collapsed: false }))
        }
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
          onToggleCollapsed={() =>
            setConnectionPanelLayout((layout) => ({
              ...layout,
              collapsed: !layout.collapsed,
            }))
          }
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
          onClick={() =>
            aiPanelLayout.collapsed
              ? setAiPanelLayout((layout) => ({ ...layout, collapsed: false }))
              : undefined
          }
          onPointerDown={handleAiPanelResize}
        />
        <AssistantPanel
          collapsed={aiPanelLayout.collapsed}
          onOpenSettings={() => setActivePage("settings")}
          onToggleCollapsed={() =>
            setAiPanelLayout((layout) => ({
              ...layout,
              collapsed: !layout.collapsed,
            }))
          }
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
  onConnectionsRestore,
  onNavigate,
}: {
  activePage: ActivePage;
  connectionsCollapsed: boolean;
  onConnectionsRestore: () => void;
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
    onNavigate("workspace");
    if (connectionsCollapsed) {
      onConnectionsRestore();
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

  const connectedRailItems = useMemo(() => {
    if (!generalSettings.showConnectedConnectionsInRail) {
      return [];
    }

    const seenConnectionIds = new Set<string>();
    return tabs.flatMap((tab) => {
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
  }, [activeSessionCounts, generalSettings.showConnectedConnectionsInRail, tabs]);

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
  const DontSleepIcon = dontSleepEnabled ? Coffee : Moon;

  return (
    <nav className="activity-rail" aria-label={t("app.primaryNav")}>
      <button
        className={`rail-button ${activePage === "workspace" ? "active" : ""} ${
          connectionsCollapsed ? "connections-collapsed-indicator" : ""
        }`}
        aria-label={t("app.connections")}
        onClick={handleConnectionsClick}
      >
        <LayoutDashboard size={18} />
        <span className="rail-tooltip" role="tooltip">
          {t("app.connections")}
        </span>
      </button>
      {connectedRailItems.length > 0 ? (
        <div
          className="rail-connected-connections"
          aria-label={t("app.connectedConnectionsRail")}
        >
          {connectedRailItems.map(({ connection, tabId }) => (
            <button
              key={connection.id}
              className={`rail-button rail-button-connection ${
                activePage === "workspace" && activeTabConnectionId === connection.id
                  ? "active"
                  : ""
              }`}
              aria-label={t("app.openConnectedConnection", {
                name: connection.name,
              })}
              onClick={() => handleConnectedConnectionClick(tabId)}
            >
              <ConnectionIcon
                localShell={connection.localShell}
                size={18}
                type={connection.type}
              />
              <span className="rail-tooltip" role="tooltip">
                {connection.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        className={`rail-button ${activePage === "wiki" ? "active" : ""}`}
        aria-label={t("app.wiki")}
        onClick={() => onNavigate("wiki")}
      >
        <BookOpen size={18} />
        <span className="rail-tooltip" role="tooltip">
          {t("app.wiki")}
        </span>
      </button>
      <button
        className={`rail-button rail-button-dont-sleep ${
          dontSleepEnabled ? "active dont-sleep-enabled" : ""
        }`}
        aria-label={dontSleepLabel}
        aria-pressed={dontSleepEnabled}
        disabled={dontSleepUpdating}
        onClick={() => void handleDontSleepClick()}
        title={dontSleepLabel}
      >
        <DontSleepIcon size={18} />
        <span className="rail-tooltip" role="tooltip">
          {t("app.dontSleep")}
        </span>
      </button>
      <button
        className={`rail-button rail-button-settings ${activePage === "settings" ? "active" : ""}`}
        aria-label={t("app.settings")}
        onClick={() => onNavigate("settings")}
      >
        <Settings size={18} />
        <span className="rail-tooltip" role="tooltip">
          {t("app.settings")}
        </span>
      </button>
    </nav>
  );
}

export default App;
