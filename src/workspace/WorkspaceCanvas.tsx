import { connectionTypeForTab } from "../connections/utils";
import { RemoteDesktopWorkspace } from "../remote-desktop/RemoteDesktopWorkspace";
import { SftpWorkspace } from "../sftp/SftpWorkspace";
import { TerminalWorkspace } from "../terminal/TerminalWorkspace";
import { WebViewWorkspace } from "../webview/WebViewWorkspace";
import { ConnectionIcon } from "../connections/ConnectionIcon";
import { ChevronLeft, ChevronRight, Terminal, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../store";

export function TabStrip() {
  const { t } = useTranslation();
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    updateScroll();
    const observer = new ResizeObserver(updateScroll);
    observer.observe(el);
    el.addEventListener("scroll", updateScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateScroll);
    };
  }, [tabs.length, updateScroll]);

  function scrollLeft() {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    el.scrollBy({ left: -200, behavior: "smooth" });
  }

  function scrollRight() {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    el.scrollBy({ left: 200, behavior: "smooth" });
  }

  return (
    <div className="tab-strip" aria-label={t("workspace.tabs")}>
      {canScrollLeft ? (
        <button
          aria-label="Scroll tabs left"
          className="tab-scroll-arrow tab-scroll-left"
          onClick={scrollLeft}
          type="button"
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}
      <div className="tab-scroll-container" ref={scrollRef}>
        {tabs.map((tab) => (
          <div className={tab.id === activeTabId ? "tab active" : "tab"} key={tab.id}>
            <button className="tab-button" onClick={() => activateTab(tab.id)} type="button">
              <ConnectionIcon
                localShell={connectionTypeForTab(tab).localShell}
                size={14}
                type={connectionTypeForTab(tab).type}
              />
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
      </div>
      {canScrollRight ? (
        <button
          aria-label="Scroll tabs right"
          className="tab-scroll-arrow tab-scroll-right"
          onClick={scrollRight}
          type="button"
        >
          <ChevronRight size={16} />
        </button>
      ) : null}
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
