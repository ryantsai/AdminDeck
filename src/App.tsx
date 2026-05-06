import { ChevronLeft, ChevronRight, LayoutDashboard, Settings } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invokeCommand, isTauriRuntime } from "./lib/tauri";
import { useBootstrapSettings } from "./lib/settings";
import { SettingsPage } from "./settings/SettingsPage";
import { useWorkspaceStore } from "./store";
import "@icon-park/react/styles/index.css";
import "@xterm/xterm/css/xterm.css";
import "./App.css";
import { AssistantPanel } from "./ai/AssistantPanel";
import { ConnectionSidebar } from "./connections/ConnectionSidebar";
import { StatusBar } from "./workspace/StatusBar";
import { TabStrip, WorkspaceCanvas } from "./workspace/WorkspaceCanvas";

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

function App() {
  const { t } = useTranslation();
  const [activePage, setActivePage] = useState<"workspace" | "settings">("workspace");
  const appearanceSettings = useWorkspaceStore((state) => state.appearanceSettings);
  const setFrontendLaunchMs = useWorkspaceStore((state) => state.setFrontendLaunchMs);
  const setPerformanceSnapshot = useWorkspaceStore((state) => state.setPerformanceSnapshot);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const resetAllLayouts = useWorkspaceStore((state) => state.resetAllLayouts);
  const openConnectionCount = useWorkspaceStore((state) => state.tabs.length);
  const openConnectionCountRef = useRef(openConnectionCount);
  const [quitConfirm, setQuitConfirm] = useState<{ count: number } | null>(null);
  useBootstrapSettings();

  useEffect(() => {
    openConnectionCountRef.current = openConnectionCount;
  }, [openConnectionCount]);
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
    async function refreshPerformanceSnapshot() {
      try {
        const snapshot = await invokeCommand("get_performance_snapshot");
        if (!disposed) {
          setPerformanceSnapshot(snapshot);
        }
      } catch {
        // Performance metrics are diagnostic only.
      }
    }

    void refreshPerformanceSnapshot();
    const interval = window.setInterval(() => void refreshPerformanceSnapshot(), 15_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [setPerformanceSnapshot]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    const appWindow = getCurrentWindow();
    void appWindow
      .onCloseRequested((event) => {
        const count = openConnectionCountRef.current;
        if (count <= 0) {
          return;
        }
        event.preventDefault();
        setQuitConfirm({ count });
      })
      .then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

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
        onNavigate={setActivePage}
      />
      <div className="workspace-page" aria-hidden={activePage === "settings"}>
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
      {activePage === "settings" ? (
        <SettingsPage
          onBack={() => setActivePage("workspace")}
          onResetLayout={handleResetLayout}
        />
      ) : null}
      {quitConfirm ? (
        <QuitConfirmDialog
          count={quitConfirm.count}
          onCancel={() => setQuitConfirm(null)}
          onConfirm={() => {
            setQuitConfirm(null);
            void getCurrentWindow().destroy();
          }}
        />
      ) : null}
    </div>
  );
}

function QuitConfirmDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const title = t("app.quitConfirmTitle");
  return (
    <div className="dialog-backdrop confirm-delete-backdrop" role="presentation">
      <div className="confirm-delete-dialog" role="alertdialog" aria-label={title}>
        <p className="panel-label">{title}</p>
        <p className="confirm-delete-name">{t("app.quitConfirmBody", { count })}</p>
        <p className="confirm-delete-warning">{t("app.quitConfirmHint")}</p>
        <div className="dialog-actions">
          <button className="approve-button danger" type="button" onClick={onConfirm}>
            {t("app.quitConfirmAction")}
          </button>
          <button className="toolbar-button" type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
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
  activePage: "workspace" | "settings";
  connectionsCollapsed: boolean;
  onConnectionsRestore: () => void;
  onNavigate: (page: "workspace" | "settings") => void;
}) {
  const { t } = useTranslation();

  function handleConnectionsClick() {
    onNavigate("workspace");
    if (connectionsCollapsed) {
      onConnectionsRestore();
    }
  }

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
