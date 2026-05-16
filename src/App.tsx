import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssistantPanel } from "./ai/AssistantPanel";
import type { AssistantPageContext } from "./ai/AssistantPanel";
import { ActivityRail } from "./app/ActivityRail";
import type { ActivePage } from "./app/ActivityRail";
import {
  useAppShellAppearance,
  useFrontendLaunchTimestamp,
  useGlobalContextMenuSuppression,
  useHostUsagePolling,
} from "./app/appShellEffects";
import {
  PanelResizeHandle,
  useWorkspaceChromeLayout,
} from "./app/workspaceChromeLayout";
import { ConnectionSidebar } from "./connections/ConnectionSidebar";
import { DashboardPage } from "./dashboard/DashboardPage";
import { useDashboardBackendInvalidation } from "./dashboard/state/invalidation";
import { ariaHidden } from "./lib/aria";
import { useBootstrapSettings } from "./lib/settings";
import { SettingsPage } from "./settings/SettingsPage";
import { useWorkspaceStore } from "./store";
import { StatusBar } from "./workspace/StatusBar";
import { TabStrip, WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

function App() {
  const { t } = useTranslation();
  const [activePage, setActivePage] = useState<ActivePage>("workspace");
  const [dashboardMounted, setDashboardMounted] = useState(false);
  const previousNonSettingsPageRef = useRef<Exclude<ActivePage, "settings">>("workspace");

  function navigateToPage(page: ActivePage) {
    if (page === "dashboard") {
      setDashboardMounted(true);
    }
    if (page === "settings" && activePage !== "settings") {
      previousNonSettingsPageRef.current = activePage as Exclude<ActivePage, "settings">;
    }
    setActivePage(page);
  }

  function openAssistantPanel() {
    if (activePage === "settings") {
      setActivePage(previousNonSettingsPageRef.current);
    }
    expandAiPanel();
  }

  const [dashboardAssistantContext, setDashboardAssistantContext] =
    useState<AssistantPageContext>();
  const appearanceSettings = useWorkspaceStore((state) => state.appearanceSettings);
  const resetAllLayouts = useWorkspaceStore((state) => state.resetAllLayouts);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const {
    aiPanelLayout,
    connectionPanelLayout,
    expandAiPanel,
    handleAiPanelResize,
    handleConnectionPanelResize,
    panelAnimating,
    resetWorkspaceChromeLayout,
    toggleAiPanel,
    toggleConnectionPanel,
  } = useWorkspaceChromeLayout(resetAllLayouts);

  useBootstrapSettings();
  useDashboardBackendInvalidation();
  useFrontendLaunchTimestamp();
  useHostUsagePolling();
  useGlobalContextMenuSuppression();
  useAppShellAppearance({
    aiPanelLayout,
    appShellRef,
    appearanceSettings,
    connectionPanelLayout,
  });

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
        key="activity-rail"
        activePage={activePage}
        connectionsCollapsed={connectionPanelLayout.collapsed}
        onConnectionsToggle={toggleConnectionPanel}
        onNavigate={navigateToPage}
      />
      <div key="workspace-page" className="workspace-page" {...ariaHidden(activePage !== "workspace")}>
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
        </main>
      </div>
      {activePage !== "settings" ? (
        <PanelResizeHandle
          key="ai-resize-handle"
          ariaLabel={t("app.resizeAiAssistant")}
          side="right"
          collapsed={aiPanelLayout.collapsed}
          collapsedLabel={t("app.aiAssistant")}
          onClick={aiPanelLayout.collapsed ? expandAiPanel : undefined}
          onPointerDown={handleAiPanelResize}
        />
      ) : null}
      <AssistantPanel
        key="assistant-panel"
        collapsed={aiPanelLayout.collapsed}
        onOpenSettings={() => navigateToPage("settings")}
        onToggleCollapsed={toggleAiPanel}
        pageContext={activePage === "dashboard" ? dashboardAssistantContext : undefined}
      />
      {activePage === "settings" ? (
        <SettingsPage
          key="settings-page"
          onBack={() => setActivePage(previousNonSettingsPageRef.current)}
          onResetLayout={resetWorkspaceChromeLayout}
        />
      ) : null}
      {dashboardMounted ? (
        <DashboardPage
          key="dashboard-page"
          dashboardActive={activePage === "dashboard"}
          onAssistantContextChange={setDashboardAssistantContext}
        />
      ) : null}
      <StatusBar key="status-bar" activePage={activePage} onOpenAssistant={openAssistantPanel} />
    </div>
  );
}

export default App;
