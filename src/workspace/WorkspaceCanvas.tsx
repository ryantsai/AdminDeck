import { QuickConnectMenu } from "../connections/ConnectionSidebar";
import { localShellOptionsForPlatform, tabIconFor, uniqueRuntimeId, type LocalShellOption } from "../connections/utils";
import { RemoteDesktopWorkspace } from "../remote-desktop/RemoteDesktopWorkspace";
import { SftpWorkspace } from "../sftp/SftpWorkspace";
import { TerminalWorkspace } from "../terminal/TerminalWorkspace";
import { WebViewWorkspace } from "../webview/WebViewWorkspace";
import { Plus, Terminal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dialogButtonAria } from "../lib/aria";
import { invokeCommand } from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { Connection } from "../types";

export function TabStrip() {
  const { t } = useTranslation();
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const openConnection = useWorkspaceStore((state) => state.openConnection);
  const [quickConnectMenuOpen, setQuickConnectMenuOpen] = useState(false);
  const quickConnectRef = useRef<HTMLDivElement | null>(null);
  const shellOptions = useMemo(() => localShellOptionsForPlatform(), []);

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

  function handleQuickLocalShell(option: LocalShellOption) {
    setQuickConnectMenuOpen(false);
    openConnection({
      id: uniqueRuntimeId("quick"),
      name: option.label,
      host: "localhost",
      user: "local",
      type: "local",
      localShell: option.value,
      status: "idle",
    });
  }

  async function handleQuickAdminShell(option: LocalShellOption) {
    if (!option.value) {
      return;
    }

    setQuickConnectMenuOpen(false);
    try {
      await invokeCommand("launch_elevated_terminal", {
        request: {
          shell: option.value,
        },
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  function handleQuickSsh(connection: Connection) {
    setQuickConnectMenuOpen(false);
    openConnection(connection);
  }

  return (
    <div className="tab-strip" aria-label={t("workspace.tabs")}>
      {tabs.map((tab) => (
        <div className={tab.id === activeTabId ? "tab active" : "tab"} key={tab.id}>
          <button className="tab-button" onClick={() => activateTab(tab.id)} type="button">
            {(() => {
              const Icon = tabIconFor(tab);
              return <Icon size={14} />;
            })()}
            <span>{tab.title}</span>
          </button>
          <button
            aria-label={`Close ${tab.title}`}
            className="tab-close-button"
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
            title={`Close ${tab.title}`}
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="quick-connect-anchor tab-quick-connect-anchor" ref={quickConnectRef}>
        <button
          {...dialogButtonAria(quickConnectMenuOpen)}
          className="new-tab"
          aria-label={t("workspace.newTab")}
          onClick={() => setQuickConnectMenuOpen((isOpen) => !isOpen)}
          title={t("workspace.newTab")}
          type="button"
        >
          <Plus size={15} />
        </button>
        {quickConnectMenuOpen ? (
          <QuickConnectMenu
            recentConnections={[]}
            shellOptions={shellOptions}
            sshSettings={sshSettings}
            onOpenConnection={(connection) => {
              setQuickConnectMenuOpen(false);
              openConnection(connection);
            }}
            onOpenElevatedShell={(option) => void handleQuickAdminShell(option)}
            onOpenLocalShell={handleQuickLocalShell}
            onOpenSsh={handleQuickSsh}
          />
        ) : null}
      </div>
    </div>
  );
}

export function WorkspaceCanvas({
  workspaceActive = true,
}: {
  workspaceActive?: boolean;
} = {}) {
  const { t } = useTranslation();
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);

  if (tabs.length === 0) {
    return (
      <div className="workspace-canvas">
        <section className="empty-workspace">
          <Terminal size={28} />
          <h2>{t("workspace.noActiveSession")}</h2>
          <p>{t("workspace.openFromTree")}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-canvas">
      {tabs.map((tab) => {
        if (tab.kind === "sftp") {
          return (
            <SftpWorkspace
              isActive={workspaceActive && tab.id === activeTabId}
              key={tab.id}
              tab={tab}
            />
          );
        }
        if (tab.kind === "webview") {
          return (
            <WebViewWorkspace
              isActive={workspaceActive && tab.id === activeTabId}
              key={tab.id}
              tab={tab}
            />
          );
        }
        if (tab.kind === "remoteDesktop") {
          return (
            <RemoteDesktopWorkspace
              isActive={workspaceActive && tab.id === activeTabId}
              key={tab.id}
              tab={tab}
            />
          );
        }
        return (
          <TerminalWorkspace
            isActive={workspaceActive && tab.id === activeTabId}
            key={tab.id}
            tab={tab}
          />
        );
      })}
    </div>
  );
}
