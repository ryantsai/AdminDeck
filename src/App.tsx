import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssistantPanel } from "./ai/AssistantPanel";
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
import { useBootstrapSettings } from "./lib/settings";
import { SettingsPage } from "./settings/SettingsPage";
import { useWorkspaceStore } from "./store";
import { StatusBar } from "./workspace/StatusBar";
import { TabStrip, WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import "@icon-park/react/styles/index.css";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

function App() {
  const { t } = useTranslation();
  const [activePage, setActivePage] = useState<ActivePage>("workspace");
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
        activePage={activePage}
        connectionsCollapsed={connectionPanelLayout.collapsed}
        onConnectionsToggle={toggleConnectionPanel}
        onNavigate={setActivePage}
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
      {activePage === "settings" ? (
        <SettingsPage
          onBack={() => setActivePage("workspace")}
          onResetLayout={resetWorkspaceChromeLayout}
        />
      ) : null}
      {activePage === "dashboard" ? <DashboardPage /> : null}
      <StatusBar activePage={activePage} />
    </div>
  );
}

export default App;
