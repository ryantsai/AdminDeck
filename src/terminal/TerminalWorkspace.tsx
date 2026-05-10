import { confirmTrustedSshHostKey, connectionToolbarTitle, uniqueRuntimeId, usesNativeSshHostKeyVerification } from "../connections/utils";
import { readFromClipboard, writeToClipboard } from "../lib/clipboard";
import { ScreenshotMenu } from "../workspace/ScreenshotMenu";

import { RemoteDesktopWorkspace } from "../remote-desktop/RemoteDesktopWorkspace";
import { WebViewWorkspace } from "../webview/WebViewWorkspace";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, Mouse, ChevronRight, Circle, ClipboardPaste, Columns2, Copy, Globe2, LayoutDashboard, Menu, Network, RefreshCw, Save, Search, SplitSquareHorizontal, Type, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import i18next from "../i18n/config";
import { dialogButtonAria, menuButtonAria } from "../lib/aria";
import { invokeCommand, isTauriRuntime, saveTextFile, type RemoteLoopbackPort, type TerminalOutput, type TmuxSession } from "../lib/tauri";
import { defaultTerminalSettings } from "../app-defaults";
import { forgetTmuxSessionId, getTmuxSessionLabel, useWorkspaceStore } from "../store";
import { createTerminalRenderer, type TerminalDimensions, type TerminalRenderer } from "./renderer";
import { ensureLayout } from "../workspace/layout";
import { getPaneRenderer, registerPaneInputWriter, registerPaneRenderer, unregisterPaneInputWriter, unregisterPaneRenderer } from "../workspace/paneRegistry";
import type { Connection, LayoutNode, SplitDirection, TerminalPane, WorkspacePane, WorkspaceTab } from "../types";

type TerminalContextMenuState = {
  x: number;
  y: number;
  hasSelection: boolean;
};

const terminalInputEncoder = new TextEncoder();

function normalizeFilenamePart(value: string) {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "terminal";
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatBufferLogFilename(panelTitle: string, date = new Date()) {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());
  const second = padDatePart(date.getSeconds());
  return `${normalizeFilenamePart(panelTitle)}_${year}${month}${day}_${hour}${minute}${second}.log`;
}

export function TerminalWorkspace({ isActive, tab }: { isActive: boolean; tab: WorkspaceTab }) {
  const splitTerminalPaneDirected = useWorkspaceStore(
    (state) => state.splitTerminalPaneDirected,
  );
  const openSftpBrowser = useWorkspaceStore((state) => state.openSftpBrowser);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const setFocusedPane = useWorkspaceStore((state) => state.setFocusedPane);
  const saveTabLayout = useWorkspaceStore((state) => state.saveTabLayout);
  const resetTabLayout = useWorkspaceStore((state) => state.resetTabLayout);
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const { t } = useTranslation();
  const defaultFontSize = defaultTerminalSettings.fontSize;
  const canSplit = tab.panes.some((pane) => pane.connection);
  const focusedPaneId = tab.focusedPaneId ?? tab.panes[0]?.id;
  const layout = useMemo(() => ensureLayout(tab.layout, tab.panes), [tab.layout, tab.panes]);
  const isSingleEmbeddedPane = tab.panes.length === 1 && tab.panes[0] !== undefined && !isTerminalPane(tab.panes[0]);

  function handleSplit(paneId: string, direction: "right" | "left" | "down" | "up") {
    setFocusedPane(tab.id, paneId);
    splitTerminalPaneDirected(tab.id, direction);
  }

  async function handleSaveBuffer(targetPaneId: string) {
    const targetPane = tab.panes.find((pane) => pane.id === targetPaneId);
    const renderer = getPaneRenderer(targetPaneId);
    if (!renderer) {
      return;
    }
    const defaultFilename = formatBufferLogFilename(targetPane?.title ?? tab.title);

    try {
      const text =
        targetPane && isTerminalPane(targetPane) && targetPane.connection?.type === "ssh" && targetPane.tmuxSessionId
          ? await invokeCommand("capture_tmux_pane", {
              request: {
                ...tmuxConnectionRequest(targetPane.connection),
                tmuxSessionId: targetPane.tmuxSessionId,
                bufferLines: sshSettings.bufferLines,
              },
            })
          : renderer.getBufferText();
      await saveTextFile(defaultFilename, text);
    } catch (error) {
      showStatusBarNotice(
        t("terminal.bufferSaveFailed", { message: error instanceof Error ? error.message : String(error) }),
        { tone: "error" },
      );
    }
  }

  function applyFontSizeToPanes(size: number) {
    for (const pane of tab.panes) {
      const renderer = getPaneRenderer(pane.id);
      renderer?.setFontSize(size);
    }
  }

  function currentFontSize() {
    const focusRenderer = focusedPaneId ? getPaneRenderer(focusedPaneId) : undefined;
    if (focusRenderer) {
      return focusRenderer.getFontSize();
    }
    for (const pane of tab.panes) {
      const renderer = getPaneRenderer(pane.id);
      if (renderer) {
        return renderer.getFontSize();
      }
    }
    return defaultFontSize;
  }

  function handleFontChange(delta: number | "reset") {
    const next = delta === "reset" ? defaultFontSize : currentFontSize() + delta;
    const clamped = Math.min(Math.max(Math.round(next), 6), 64);
    applyFontSizeToPanes(clamped);
  }

  function handleSaveView() {
    saveTabLayout(tab.id);
  }

  function handleResetView() {
    resetTabLayout(tab.id);
  }

  return (
    <section
      className={[
        "terminal-workspace",
        isActive ? "active" : "",
        isSingleEmbeddedPane ? "terminal-workspace-embedded-only" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="terminal-grid">
        {layout ? (
          <TerminalLayoutView
            isActive={isActive}
            tabId={tab.id}
            layout={layout}
            panes={tab.panes}
            focusedPaneId={focusedPaneId}
            onFocusPane={(paneId) => setFocusedPane(tab.id, paneId)}
            canSplit={canSplit}
            onFontChange={handleFontChange}
            onOpenSftp={(connection) => openSftpBrowser(connection)}
            onResetView={handleResetView}
            onSaveBuffer={(paneId) => void handleSaveBuffer(paneId)}
            onSaveView={handleSaveView}
            onSplit={handleSplit}
          />
        ) : null}
      </div>
    </section>
  );
}

function TerminalLayoutView({
  isActive,
  tabId,
  layout,
  panes,
  focusedPaneId,
  onFocusPane,
  canSplit,
  onFontChange,
  onOpenSftp,
  onResetView,
  onSaveBuffer,
  onSaveView,
  onSplit,
}: {
  isActive: boolean;
  tabId: string;
  layout: LayoutNode;
  panes: WorkspacePane[];
  focusedPaneId: string | undefined;
  onFocusPane: (paneId: string) => void;
  canSplit: boolean;
  onFontChange: (delta: number | "reset") => void;
  onOpenSftp: (connection: Connection) => void;
  onResetView: () => void;
  onSaveBuffer: (paneId: string) => void;
  onSaveView: () => void;
  onSplit: (paneId: string, direction: "right" | "left" | "down" | "up") => void;
}) {
  if (layout.type === "leaf") {
    const pane = panes.find((entry) => entry.id === layout.paneId);
    if (!pane) {
      return null;
    }
    return (
      <div className="terminal-layout-leaf">
        {isTerminalPane(pane) ? (
          <TerminalPaneView
            isActive={isActive}
            tabId={tabId}
            pane={pane}
            isFocused={pane.id === focusedPaneId}
            onFocus={() => onFocusPane(pane.id)}
            canSplit={canSplit}
            onFontChange={onFontChange}
            onOpenSftp={onOpenSftp}
            onResetView={onResetView}
            onSaveBuffer={onSaveBuffer}
            onSaveView={onSaveView}
            onSplit={onSplit}
          />
        ) : (
          <EmbeddedConnectionPane
            isActive={isActive}
            pane={pane}
            tabId={tabId}
            onFocus={() => onFocusPane(pane.id)}
          />
        )}
      </div>
    );
  }

  const className =
    layout.orientation === "horizontal"
      ? "terminal-layout-split terminal-layout-split-horizontal"
      : "terminal-layout-split terminal-layout-split-vertical";

  return (
    <div className={className}>
      {layout.children.map((child, index) => (
        <TerminalLayoutView
          key={child.type === "leaf" ? child.paneId : `split-${index}`}
          isActive={isActive}
          tabId={tabId}
          layout={child}
          panes={panes}
          focusedPaneId={focusedPaneId}
          onFocusPane={onFocusPane}
          canSplit={canSplit}
          onFontChange={onFontChange}
          onOpenSftp={onOpenSftp}
          onResetView={onResetView}
          onSaveBuffer={onSaveBuffer}
          onSaveView={onSaveView}
          onSplit={onSplit}
        />
      ))}
    </div>
  );
}

function isTerminalPane(pane: WorkspacePane): pane is TerminalPane {
  return pane.kind === undefined || pane.kind === "terminal";
}

function EmbeddedConnectionPane({
  isActive,
  pane,
  tabId,
  onFocus,
}: {
  isActive: boolean;
  pane: Exclude<WorkspacePane, TerminalPane>;
  tabId: string;
  onFocus: () => void;
}) {
  const closePane = useWorkspaceStore((state) => state.closePane);
  const { t } = useTranslation();
  const embeddedTab: WorkspaceTab = {
    id: pane.id,
    title: pane.title,
    subtitle:
      pane.kind === "webview"
        ? formatUrlPaneSubtitle(pane.url)
        : formatRemoteDesktopPaneSubtitle(pane.connection),
    kind: pane.kind,
    panes: [],
    connection: pane.connection,
    url: pane.kind === "webview" ? pane.url : undefined,
    dataPartition: pane.kind === "webview" ? pane.dataPartition : undefined,
  };

  return (
    <article
      className="embedded-workspace-pane"
      onMouseDown={onFocus}
    >
      <button
        aria-label={t("workspace.closeTab", { title: pane.title })}
        className="embedded-pane-close"
        onClick={() => closePane(tabId, pane.id)}
        title={t("workspace.closeTab", { title: pane.title })}
        type="button"
      >
        <X size={13} />
      </button>
      {pane.kind === "webview" ? (
        <WebViewWorkspace isActive={isActive} tab={embeddedTab} />
      ) : (
        <RemoteDesktopWorkspace isActive={isActive} tab={embeddedTab} />
      )}
    </article>
  );
}

function formatUrlPaneSubtitle(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function formatRemoteDesktopPaneSubtitle(connection: Connection) {
  return connection.user?.trim() || connection.host;
}

function TmuxSessionTag({
  connection,
  sessionId,
  tabId,
}: {
  connection: Connection;
  sessionId?: string;
  tabId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [error, setError] = useState("");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [mouseEnabledIds, setMouseEnabledIds] = useState<Set<string>>(
    () => new Set(sessionId ? [sessionId] : []),
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();

  const tabs = useWorkspaceStore((state) => state.tabs);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const setFocusedPane = useWorkspaceStore((state) => state.setFocusedPane);
  const openTmuxSessionInPane = useWorkspaceStore((state) => state.openTmuxSessionInPane);

  const enabled = connection.type === "ssh" && connection.useTmuxSessions !== false && sessionId;

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    setMouseEnabledIds((prev) => {
      if (prev.has(sessionId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
  }, [sessionId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function findSessionPane(tmuxSessionId: string): { tabId: string; paneId: string } | null {
    for (const tab of tabs) {
      if (tab.kind !== "terminal") continue;
      for (const pane of tab.panes) {
        if (isTerminalPane(pane) && pane.tmuxSessionId === tmuxSessionId) {
          return { tabId: tab.id, paneId: pane.id };
        }
      }
    }
    return null;
  }

  async function loadSessions() {
    if (!enabled || !isTauriRuntime()) {
      setSessions([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await invokeCommand("list_tmux_sessions", {
        request: tmuxConnectionRequest(connection),
      });
      setSessions(result);
    } catch (loadError) {
      setSessions([]);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    setExpandedSessionId(null);
    if (nextOpen) {
      await loadSessions();
    }
  }

  async function handleCloseSession(targetSessionId: string) {
    setLoading(true);
    setError("");
    try {
      await invokeCommand("close_tmux_session", {
        request: {
          ...tmuxConnectionRequest(connection),
          tmuxSessionId: targetSessionId,
        },
      });
      forgetTmuxSessionId(connection.id, targetSessionId);
      setMouseEnabledIds((prev) => {
        const next = new Set(prev);
        next.delete(targetSessionId);
        return next;
      });
      await loadSessions();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : String(closeError));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleMouse(targetSessionId: string) {
    const nextEnabled = !mouseEnabledIds.has(targetSessionId);
    try {
      await invokeCommand("set_tmux_mouse", {
        request: {
          ...tmuxConnectionRequest(connection),
          tmuxSessionId: targetSessionId,
          enabled: nextEnabled,
        },
      });
      setMouseEnabledIds((prev) => {
        const next = new Set(prev);
        if (nextEnabled) {
          next.add(targetSessionId);
        } else {
          next.delete(targetSessionId);
        }
        return next;
      });
    } catch (mouseError) {
      setError(mouseError instanceof Error ? mouseError.message : String(mouseError));
    }
  }

  function handleSessionRowClick(session: TmuxSession) {
    const location = findSessionPane(session.id);
    if (location) {
      activateTab(location.tabId);
      setFocusedPane(location.tabId, location.paneId);
      setOpen(false);
    } else {
      setExpandedSessionId((current) => (current === session.id ? null : session.id));
    }
  }

  function handleOpenInDirection(session: TmuxSession, direction: SplitDirection) {
    openTmuxSessionInPane(tabId, connection, session.id, direction);
    setOpen(false);
  }

  if (!enabled) {
    return null;
  }

  return (
    <div className="tmux-session-wrapper" ref={menuRef}>
      <button
        className="tmux-session-tag"
        {...dialogButtonAria(open)}
        onClick={() => void handleToggle()}
        title={t("terminal.showTmux")}
        type="button"
      >
        tmux {sessionId ? getTmuxSessionLabel(sessionId) : sessionId}
      </button>
      {open ? (
        <div className="tmux-session-menu" role="dialog" aria-label={t("terminal.tmuxSessions")}>
          <header>
            <strong>{t("terminal.tmuxSessions")}</strong>
            <button
              className="terminal-pane-action"
              aria-label={t("terminal.refreshTmux")}
              onClick={() => void loadSessions()}
              title={t("terminal.refreshTmux")}
              type="button"
            >
              <RefreshCw size={13} />
            </button>
          </header>
          {loading ? <p>{t("terminal.loading")}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {!loading && !error && sessions.length === 0 ? <p>{t("terminal.noTmuxSessions")}</p> : null}
          <div className="tmux-session-list">
            {sessions.map((session) => {
              const location = findSessionPane(session.id);
              const isInApp = location !== null;
              const isExpanded = expandedSessionId === session.id;
              const mouseOn = mouseEnabledIds.has(session.id);
              const sessionLabel = getTmuxSessionLabel(session.id);
              const sessionStatus = isInApp
                ? t("terminal.open")
                : session.attached
                  ? t("terminal.attached")
                  : t("terminal.detached");

              return (
                <div className="tmux-session-row" key={session.id}>
                  <div className="tmux-session-row-main">
                    <button
                      className={`tmux-session-row-info${isInApp ? " in-app" : ""}`}
                      onClick={() => handleSessionRowClick(session)}
                      title={isInApp ? t("terminal.focusPane") : t("terminal.openInPane")}
                      type="button"
                    >
                      <strong>{sessionLabel}</strong>
                      <small>
                        {sessionStatus}
                        {" · "}
                        {session.windows}w
                      </small>
                    </button>
                    <button
                      className={`tmux-mouse-toggle${mouseOn ? " active" : ""}`}
                      aria-label={`${mouseOn ? t("terminal.mouseOn") : t("terminal.mouseOff")} ${sessionLabel}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void handleToggleMouse(session.id)}
                      title={mouseOn ? t("terminal.mouseOn") : t("terminal.mouseOff")}
                      type="button"
                    >
                      <Mouse size={11} />
                    </button>
                    <button
                      className="terminal-pane-action"
                      aria-label={`${t("terminal.closeTmux")} ${sessionLabel}`}
                      onClick={() => void handleCloseSession(session.id)}
                      title={t("terminal.closeTmux")}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {!isInApp && isExpanded ? (
                    <div className="tmux-session-directions">
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "left")}
                        title={t("terminal.openLeft")}
                        type="button"
                      >
                        <ArrowLeft size={12} />
                      </button>
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "up")}
                        title={t("terminal.openAbove")}
                        type="button"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "down")}
                        title={t("terminal.openBelow")}
                        type="button"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "right")}
                        title={t("terminal.openRight")}
                        type="button"
                      >
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function tmuxConnectionRequest(connection: Connection) {
  return {
    host: connection.host,
    user: connection.user,
    port: connection.port,
    keyPath: connection.keyPath,
    proxyJump: connection.proxyJump,
    authMethod: connection.authMethod,
    secretOwnerId: connection.id,
  };
}

function SshPortForwardMenu({ connection }: { connection: Connection }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ports, setPorts] = useState<RemoteLoopbackPort[]>([]);
  const [error, setError] = useState("");
  const [openingPort, setOpeningPort] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openSshPortForwardBrowser = useWorkspaceStore((state) => state.openSshPortForwardBrowser);
  const showStatusBarNotice = useWorkspaceStore((state) => state.showStatusBarNotice);
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function loadPorts() {
    if (!isTauriRuntime()) {
      setPorts([]);
      setError(t("terminal.tauriRequired"));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await invokeCommand("list_remote_loopback_ports", {
        request: tmuxConnectionRequest(connection),
      });
      setPorts(result);
    } catch (loadError) {
      setPorts([]);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      await loadPorts();
    }
  }

  async function handleOpenPort(port: number) {
    setOpeningPort(port);
    setError("");
    try {
      const forward = await invokeCommand("start_ssh_port_forward", {
        request: {
          ...tmuxConnectionRequest(connection),
          remotePort: port,
        },
      });
      openSshPortForwardBrowser(connection, forward);
      showStatusBarNotice(t("terminal.sshPortForwardOpened", { port }));
      setOpen(false);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    } finally {
      setOpeningPort(null);
    }
  }

  return (
    <div className="tmux-session-wrapper" ref={menuRef}>
      <button
        className="terminal-pane-action"
        aria-label={t("terminal.sshPortRedirect")}
        {...dialogButtonAria(open)}
        onClick={() => void handleToggle()}
        title={t("terminal.sshPortRedirect")}
        type="button"
      >
        <Network size={13} />
      </button>
      {open ? (
        <div className="tmux-session-menu ssh-port-menu" role="dialog" aria-label={t("terminal.sshPortRedirect")}>
          <header>
            <strong>{t("terminal.remoteLoopbackPorts")}</strong>
            <button
              className="terminal-pane-action"
              aria-label={t("terminal.refreshPorts")}
              onClick={() => void loadPorts()}
              title={t("terminal.refreshPorts")}
              type="button"
            >
              <RefreshCw size={13} />
            </button>
          </header>
          {loading ? <p>{t("terminal.scanningPorts")}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {!loading && !error && ports.length === 0 ? <p>{t("terminal.noRemoteLoopbackPorts")}</p> : null}
          <div className="tmux-session-list">
            {ports.map((entry) => (
              <div className="tmux-session-row ssh-port-row" key={`${entry.address}-${entry.port}`}>
                <div className="tmux-session-row-main">
                  <div className="tmux-session-row-info" aria-label={t("terminal.remoteLoopbackPort", { port: entry.port })}>
                    <strong>{t("terminal.remoteLoopbackPort", { port: entry.port })}</strong>
                    <small>{entry.address}</small>
                  </div>
                  <button
                    className="terminal-pane-action"
                    aria-label={t("terminal.openPortInBrowser", { port: entry.port })}
                    disabled={openingPort !== null}
                    onClick={() => void handleOpenPort(entry.port)}
                    title={t("terminal.openPortInBrowser", { port: entry.port })}
                    type="button"
                  >
                    {openingPort === entry.port ? <RefreshCw size={13} /> : <Globe2 size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export async function inspectActiveSshSystemContext(tab: WorkspaceTab | undefined) {
  const connection =
    tab?.connection?.type === "ssh"
      ? tab.connection
      : tab?.panes.find((pane) => pane.connection?.type === "ssh")?.connection;
  if (!connection) {
    return undefined;
  }
  try {
    const context = await invokeCommand("inspect_ssh_system_context", {
      request: tmuxConnectionRequest(connection),
    });
    return [
      i18next.t("terminal.connectLabel", { name: connection.name }),
      i18next.t("terminal.targetLabel", { target: `${connection.user}@${connection.host}${connection.port ? `:${connection.port}` : ""}` }),
      context.trim(),
    ]
      .filter(Boolean)
      .join("\n");
  } catch (error) {
    return [
      i18next.t("terminal.connectLabel", { name: connection.name }),
      i18next.t("terminal.targetLabel", { target: `${connection.user}@${connection.host}${connection.port ? `:${connection.port}` : ""}` }),
      i18next.t("terminal.sshContextUnavailable", { message: error instanceof Error ? error.message : String(error) }),
    ]
      .join("\n");
  }
}

function TerminalPaneView({
  isActive,
  tabId,
  pane,
  isFocused,
  onFocus,
  canSplit,
  onFontChange,
  onOpenSftp,
  onResetView,
  onSaveBuffer,
  onSaveView,
  onSplit,
}: {
  isActive: boolean;
  tabId: string;
  pane: TerminalPane;
  isFocused: boolean;
  onFocus: () => void;
  canSplit: boolean;
  onFontChange: (delta: number | "reset") => void;
  onOpenSftp: (connection: Connection) => void;
  onResetView: () => void;
  onSaveBuffer: (paneId: string) => void;
  onSaveView: () => void;
  onSplit: (paneId: string, direction: "right" | "left" | "down" | "up") => void;
}) {
  const paneRef = useRef<HTMLElement | null>(null);
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const terminalRendererRef = useRef<TerminalRenderer | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastResizeDimensionsRef = useRef<TerminalDimensions | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeTimeoutRefs = useRef<number[]>([]);
  const fitAndResizeRef = useRef<() => void>(() => undefined);
  const startedRef = useRef(false);
  const onFocusRef = useRef(onFocus);
  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<{
    resultIndex: number;
    resultCount: number;
    found: boolean;
  }>({ resultIndex: -1, resultCount: 0, found: true });
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [selectedTerminalText, setSelectedTerminalText] = useState("");
  const [contextMenu, setContextMenu] = useState<TerminalContextMenuState | null>(null);
  const splitMenuRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const terminalSettings = useWorkspaceStore((state) => state.terminalSettings);
  const sshSettings = useWorkspaceStore((state) => state.sshSettings);
  const setAssistantContextSnippet = useWorkspaceStore(
    (state) => state.setAssistantContextSnippet,
  );
  const markConnectionSessionStarted = useWorkspaceStore(
    (state) => state.markConnectionSessionStarted,
  );
  const markConnectionSessionEnded = useWorkspaceStore(
    (state) => state.markConnectionSessionEnded,
  );
  const recordTerminalStartMetric = useWorkspaceStore(
    (state) => state.recordTerminalStartMetric,
  );
  const clearTerminalStartMetric = useWorkspaceStore(
    (state) => state.clearTerminalStartMetric,
  );
  const closePane = useWorkspaceStore((state) => state.closePane);
  const { t } = useTranslation();

  useEffect(() => {
    if (!splitMenuOpen && !actionsMenuOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (splitMenuRef.current && target && !splitMenuRef.current.contains(target)) {
        setSplitMenuOpen(false);
      }
      if (actionsMenuRef.current && target && !actionsMenuRef.current.contains(target)) {
        setActionsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [actionsMenuOpen, splitMenuOpen]);

  useEffect(() => {
    function handleExternalPointerDown(event: PointerEvent) {
      const renderer = terminalRendererRef.current;
      const target = event.target as Node | null;
      if (!renderer || !target || paneRef.current?.contains(target)) {
        return;
      }

      renderer.blur();
      focusExternalPointerTarget(target);
    }

    document.addEventListener("pointerdown", handleExternalPointerDown, true);
    return () => document.removeEventListener("pointerdown", handleExternalPointerDown, true);
  }, []);

  useEffect(() => {
    const element = terminalElementRef.current;
    const connection = pane.connection;
    if (!element || !connection || startedRef.current) {
      return;
    }

    startedRef.current = true;
    const rendererSettings =
      connection.type === "ssh"
        ? {
            ...terminalSettings,
            scrollbackLines: sshSettings.bufferLines,
            allowOsc52Clipboard: sshSettings.allowOsc52Clipboard,
          }
        : terminalSettings;
    const terminal = createTerminalRenderer(rendererSettings);
    terminalRendererRef.current = terminal;
    terminal.open(element);
    terminal.fit();
    focusTerminalUnlessExternalInputIsActive(terminal, paneRef.current);
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || !event.ctrlKey) {
        return true;
      }

      const key = event.key.toLowerCase();
      if ((key === "c" && event.shiftKey) || key === "insert") {
        const selection = terminal.getSelection();
        if (selection) {
          void writeToClipboard(selection);
          setSelectedTerminalText(selection);
          setContextMenu(null);
          return false;
        }
        return true;
      }

      if (key === "v") {
        void handlePasteIntoTerminal();
        return false;
      }

      return true;
    });
    registerPaneRenderer(pane.id, terminal);
    const focusDisposable = terminal.onFocus(() => {
      onFocusRef.current();
    });
    const terminalSessionType = terminalSessionTypeFor(connection);
    terminal.writeln(t("terminal.startingSessionFor", { type: terminalSessionType, name: connection.name }));

    if (!isTauriRuntime()) {
      terminal.writeln(t("terminal.desktopRuntimeRequired"));
      return () => {
        terminal.dispose();
      };
    }

    const requestedSessionId = uniqueRuntimeId(`${connection.id}-terminal`);
    sessionIdRef.current = requestedSessionId;

    let disposed = false;
    let sessionStarted = false;
    let removeOutputListener: (() => void) | undefined;
    const writeInputToSession = (data: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      void invokeCommand("write_terminal_input", {
        request: { sessionId, data: encodeTerminalInput(data) },
      });
    };
    registerPaneInputWriter(pane.id, writeInputToSession);
    const dataDisposable = terminal.onData((data) => {
      if (terminalSettings.confirmMultilinePaste && isMultilinePaste(data)) {
        const shouldPaste = window.confirm(t("terminal.pasteMultilineConfirm"));
        if (!shouldPaste) {
          return;
        }
      }

      writeInputToSession(data);
    });
    const selectionDisposable = terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      setSelectedTerminalText(selection);
      if (selection && terminalSettings.copyOnSelect) {
        void navigator.clipboard?.writeText(selection);
      }
    });
    const searchResultsDisposable = terminal.onSearchResultsChange((result) => {
      setSearchResult({
        resultIndex: result.resultIndex,
        resultCount: result.resultCount,
        found: result.resultCount > 0,
      });
    });

    function fitAndResizeTerminal() {
      const dimensions = terminal.fit();
      const lastDimensions = lastResizeDimensionsRef.current;
      if (lastDimensions && terminalDimensionsEqual(lastDimensions, dimensions)) {
        return;
      }

      lastResizeDimensionsRef.current = dimensions;
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void invokeCommand("resize_terminal", {
          request: {
            sessionId,
            cols: dimensions.cols,
            pixelHeight: dimensions.pixelHeight,
            pixelWidth: dimensions.pixelWidth,
            rows: dimensions.rows,
          },
        });
      }
    }
    fitAndResizeRef.current = fitAndResizeTerminal;

    function clearScheduledResizeTimeouts() {
      for (const timeoutId of resizeTimeoutRefs.current) {
        window.clearTimeout(timeoutId);
      }
      resizeTimeoutRefs.current = [];
    }

    function scheduleFitAndResizeTerminal() {
      if (resizeFrameRef.current !== null) {
        return;
      }
      clearScheduledResizeTimeouts();

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = window.requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          fitAndResizeTerminal();
        });
      });
      resizeTimeoutRefs.current = [
        window.setTimeout(fitAndResizeTerminal, 80),
        window.setTimeout(fitAndResizeTerminal, 180),
        window.setTimeout(() => {
          fitAndResizeTerminal();
          resizeTimeoutRefs.current = [];
        }, 320),
      ];
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleFitAndResizeTerminal();
    });
    resizeObserver.observe(element);
    window.addEventListener("resize", scheduleFitAndResizeTerminal);
    scheduleFitAndResizeTerminal();
    void document.fonts?.ready.then(() => {
      if (!disposed) {
        scheduleFitAndResizeTerminal();
      }
    });

    void (async () => {
      const unlisten = await listen<TerminalOutput>("terminal-output", (event) => {
        if (event.payload.sessionId === sessionIdRef.current) {
          terminal.write(event.payload.data);
        }
      });
      if (disposed) {
        unlisten();
        return;
      }
      removeOutputListener = unlisten;

      try {
        if (usesNativeSshHostKeyVerification(connection)) {
          terminal.writeln(t("terminal.verifyingHostKey"));
          const preview = await invokeCommand("inspect_ssh_host_key", {
            request: {
              host: connection.host,
              port: connection.port,
            },
          });
          await confirmTrustedSshHostKey(preview);
        }

        const terminalStartAt = performance.now();
        const terminalDimensions = terminal.dimensions;
        const result = await invokeCommand("start_terminal_session", {
          request: {
            sessionId: requestedSessionId,
            title: connection.name,
            type: terminalSessionType,
            host: connection.host,
            user: connection.user,
            port: connection.port,
            keyPath: connection.keyPath,
            proxyJump: connection.proxyJump,
            authMethod: connection.authMethod,
            secretOwnerId: connection.id,
            shell:
              connection.type === "local"
                ? connection.localShell ?? terminalSettings.defaultShell
                : undefined,
            serialLine: connection.type === "serial" ? connection.serialLine ?? connection.host : undefined,
            serialSpeed: connection.type === "serial" ? connection.serialSpeed ?? 9600 : undefined,
            initialDirectory:
              connection.type === "ssh" && isRemoteInitialDirectory(pane.cwd)
                ? pane.cwd.trim()
                : undefined,
            cols: terminalDimensions.cols,
            pixelHeight: terminalDimensions.pixelHeight,
            pixelWidth: terminalDimensions.pixelWidth,
            rows: terminalDimensions.rows,
            useTmux: connection.type === "ssh" && connection.useTmuxSessions !== false,
            tmuxSessionId: pane.tmuxSessionId,
            sshBufferLines: connection.type === "ssh" ? sshSettings.bufferLines : undefined,
          },
        });
        if (disposed) {
          void invokeCommand("close_terminal_session", { sessionId: result.sessionId });
          return;
        }
        const frontendDurationMs = Math.round(performance.now() - terminalStartAt);
        if (terminalSessionType === "ssh" && result.terminalReadyMs === undefined) {
          clearTerminalStartMetric("ssh");
        } else {
          recordTerminalStartMetric({
            kind: terminalSessionType,
            title: connection.name,
            durationMs:
              terminalSessionType === "ssh"
                ? result.terminalReadyMs ?? frontendDurationMs
                : frontendDurationMs,
            recordedAt: new Date().toISOString(),
          });
        }
        sessionIdRef.current = result.sessionId;
        sessionStarted = true;
        markConnectionSessionStarted(connection.id);
      } catch (error) {
        terminal.writeln("");
        terminal.writeln(t("terminal.failedToStartDetail", { message: String(error) }));
      }
    })();

    return () => {
      disposed = true;
      startedRef.current = false;
      dataDisposable.dispose();
      selectionDisposable.dispose();
      searchResultsDisposable.dispose();
      focusDisposable.dispose();
      unregisterPaneInputWriter(pane.id, writeInputToSession);
      unregisterPaneRenderer(pane.id, terminal);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleFitAndResizeTerminal);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      clearScheduledResizeTimeouts();
      removeOutputListener?.();
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void invokeCommand("close_terminal_session", { sessionId });
      }
      if (sessionStarted) {
        markConnectionSessionEnded(connection.id);
      }
      sessionIdRef.current = null;
      lastResizeDimensionsRef.current = null;
      terminalRendererRef.current = null;
      fitAndResizeRef.current = () => undefined;
      setSelectedTerminalText("");
      setContextMenu(null);
      setSearchResult({ resultIndex: -1, resultCount: 0, found: true });
      terminal.dispose();
    };
  }, [
    clearTerminalStartMetric,
    markConnectionSessionEnded,
    markConnectionSessionStarted,
    pane.connection,
    pane.tmuxSessionId,
    recordTerminalStartMetric,
    terminalSettings,
  ]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = () => setContextMenu(null);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const renderer = terminalRendererRef.current;
      if (!renderer) {
        return;
      }

      fitAndResizeRef.current();
      focusTerminalUnlessExternalInputIsActive(renderer, paneRef.current);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isActive]);


  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [searchOpen]);

  useEffect(() => {
    const renderer = terminalRendererRef.current;
    if (!renderer) {
      return;
    }

    if (!searchOpen || !searchTerm.trim()) {
      renderer.clearSearch();
      setSearchResult({ resultIndex: -1, resultCount: 0, found: true });
      return;
    }

    const found = renderer.findNext(searchTerm);
    setSearchResult((result) => ({
      ...result,
      found,
      resultCount: found ? result.resultCount : 0,
      resultIndex: found ? result.resultIndex : -1,
    }));
  }, [searchOpen, searchTerm]);

  function handleCopyTerminalSelection() {
    const text = terminalRendererRef.current?.getSelection() || selectedTerminalText;
    if (text) {
      void writeToClipboard(text);
    }
    setContextMenu(null);
    terminalRendererRef.current?.focus();
  }

  async function handlePasteIntoTerminal() {
    const text = await readFromClipboard();
    if (!text) {
      setContextMenu(null);
      terminalRendererRef.current?.focus();
      return;
    }

    if (terminalSettings.confirmMultilinePaste && isMultilinePaste(text)) {
      const shouldPaste = window.confirm(t("terminal.pasteMultilineConfirm"));
      if (!shouldPaste) {
        setContextMenu(null);
        terminalRendererRef.current?.focus();
        return;
      }
    }

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      void invokeCommand("write_terminal_input", {
        request: { sessionId, data: encodeTerminalInput(text) },
      });
    }
    setContextMenu(null);
    terminalRendererRef.current?.focus();
  }

  function handleTerminalContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    onFocus();

    const selection = terminalRendererRef.current?.getSelection() ?? "";
    setSelectedTerminalText(selection);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      hasSelection: Boolean(selection),
    });
  }

  async function handleSendBufferToAssistant() {
    const text = (
      await terminalBufferForAssistant(
        pane,
        terminalRendererRef.current,
        sshSettings.bufferLines,
      )
    ).trim();
    if (!text) {
      return;
    }

    const sourceLabel = pane.connection
      ? `${pane.connection.name} ${t("terminal.terminalBuffer")}`
      : `${pane.title} ${t("terminal.terminalBuffer")}`;
    setAssistantContextSnippet({
      id: `terminal-buffer-${Date.now()}`,
      kind: "text",
      sourceLabel,
      text,
      capturedAt: new Date().toISOString(),
    });
  }

  function handleSearchNext() {
    const found = terminalRendererRef.current?.findNext(searchTerm) ?? false;
    setSearchResult((result) => ({
      ...result,
      found,
      resultCount: found ? result.resultCount : 0,
      resultIndex: found ? result.resultIndex : -1,
    }));
  }

  function handleSearchPrevious() {
    const found = terminalRendererRef.current?.findPrevious(searchTerm) ?? false;
    setSearchResult((result) => ({
      ...result,
      found,
      resultCount: found ? result.resultCount : 0,
      resultIndex: found ? result.resultIndex : -1,
    }));
  }

  function handleCloseSearch() {
    terminalRendererRef.current?.clearSearch();
    setSearchOpen(false);
    setSearchTerm("");
    setSearchResult({ resultIndex: -1, resultCount: 0, found: true });
    terminalRendererRef.current?.focus();
  }

  function handleOpenSftp() {
    if (pane.connection?.type !== "ssh") {
      return;
    }
    onOpenSftp(pane.connection);
  }

  function handleSplit(direction: "right" | "left" | "down" | "up") {
    setSplitMenuOpen(false);
    onSplit(pane.id, direction);
  }

  function handleSaveBuffer() {
    setActionsMenuOpen(false);
    onSaveBuffer(pane.id);
  }

  function handleSaveView() {
    setActionsMenuOpen(false);
    onSaveView();
  }

  function handleResetView() {
    setActionsMenuOpen(false);
    onResetView();
  }

  function handleFontChange(delta: number | "reset") {
    onFontChange(delta);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        handleSearchPrevious();
      } else {
        handleSearchNext();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleCloseSearch();
    }
  }

  const searchStatusLabel = searchTerm.trim()
    ? searchResult.resultCount > 0 && searchResult.resultIndex >= 0
      ? `${searchResult.resultIndex + 1}/${searchResult.resultCount}`
      : searchResult.found
        ? "..."
        : t("terminal.noResults")
    : "";
  const isSshPane = pane.connection?.type === "ssh";
  const paneToolbarTitle = pane.toolbarTitle ?? (pane.connection ? connectionToolbarTitle(pane.connection) : pane.title);

  return (
    <article
      className={[
        "terminal-pane",
        searchOpen ? "terminal-pane-search-open" : "",
        isFocused ? "terminal-pane-focused" : "terminal-pane-inactive",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={() => onFocus()}
      ref={paneRef}
    >
      <header>
        <span>
          <Circle size={9} fill="currentColor" />
          {paneToolbarTitle}
        </span>
        <div className="terminal-pane-actions">
          {pane.connection ? (
            <TmuxSessionTag connection={pane.connection} sessionId={pane.tmuxSessionId} tabId={tabId} />
          ) : null}
          {isSshPane ? (
            <button
              className="terminal-pane-action terminal-pane-action-text"
              aria-label={t("terminal.openSftp")}
              onClick={handleOpenSftp}
              title={t("terminal.openSftp")}
              type="button"
            >
              <Columns2 size={13} />
              <span>{t("terminal.sftp")}</span>
            </button>
          ) : null}
          {isSshPane && pane.connection ? <SshPortForwardMenu connection={pane.connection} /> : null}
          <div className="terminal-menu-wrapper" ref={splitMenuRef}>
            <button
              className="terminal-pane-action"
              aria-label={t("terminal.splitLayout")}
              {...menuButtonAria(splitMenuOpen)}
              disabled={!canSplit}
              onClick={() => setSplitMenuOpen((open) => !open)}
              title={t("terminal.splitLayout")}
              type="button"
            >
              <SplitSquareHorizontal size={13} />
            </button>
            {splitMenuOpen ? (
              <div className="terminal-menu" role="menu">
                <button
                  className="terminal-menu-item"
                  onClick={() => handleSplit("right")}
                  role="menuitem"
                  type="button"
                >
                  <ArrowRight size={13} />
                  {t("terminal.splitRight")}
                </button>
                <button
                  className="terminal-menu-item"
                  onClick={() => handleSplit("left")}
                  role="menuitem"
                  type="button"
                >
                  <ArrowLeft size={13} />
                  {t("terminal.splitLeft")}
                </button>
                <button
                  className="terminal-menu-item"
                  onClick={() => handleSplit("down")}
                  role="menuitem"
                  type="button"
                >
                  <ArrowDown size={13} />
                  {t("terminal.splitDown")}
                </button>
                <button
                  className="terminal-menu-item"
                  onClick={() => handleSplit("up")}
                  role="menuitem"
                  type="button"
                >
                  <ArrowUp size={13} />
                  {t("terminal.splitUp")}
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="terminal-pane-action"
            aria-label={t("terminal.findInScrollback")}
            onClick={() => setSearchOpen((open) => !open)}
            title={t("terminal.findInScrollback")}
            type="button"
          >
            <Search size={13} />
          </button>
          <button
            className="terminal-pane-action"
            aria-label={t("terminal.copySelection")}
            disabled={!selectedTerminalText}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleCopyTerminalSelection}
            title={t("terminal.copySelection")}
            type="button"
          >
            <Copy size={13} />
          </button>
          <ScreenshotMenu
            buttonClassName="terminal-pane-action"
            targetLabel={`${pane.connection?.name ?? pane.title} ${t("workspace.terminalPane")}`}
            targetRef={paneRef}
          />
          <button
            className="terminal-pane-action"
            aria-label={t("terminal.sendToAi")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void handleSendBufferToAssistant()}
            title={t("terminal.sendToAi")}
            type="button"
          >
            <Bot size={13} />
          </button>
          <div className="terminal-menu-wrapper" ref={actionsMenuRef}>
            <button
              className="terminal-pane-action"
              aria-label={t("terminal.actions")}
              {...menuButtonAria(actionsMenuOpen)}
              onClick={() => setActionsMenuOpen((open) => !open)}
              title={t("terminal.actions")}
              type="button"
            >
              <Menu size={13} />
            </button>
            {actionsMenuOpen ? (
              <div className="terminal-menu" role="menu">
                <button
                  className="terminal-menu-item"
                  onClick={handleSaveBuffer}
                  role="menuitem"
                  type="button"
                >
                  <Save size={13} />
                  {t("terminal.saveBuffer")}
                </button>
                <div className="terminal-menu-submenu">
                  <button
                    className="terminal-menu-item"
                    role="menuitem"
                    type="button"
                  >
                    <Type size={13} />
                    {t("terminal.font")}
                    <ChevronRight size={13} className="terminal-menu-chevron" />
                  </button>
                  <div className="terminal-menu terminal-menu-submenu-panel" role="menu">
                    <button
                      className="terminal-menu-item"
                      onClick={() => handleFontChange(1)}
                      role="menuitem"
                      type="button"
                    >
                      {t("terminal.increaseSize")}
                    </button>
                    <button
                      className="terminal-menu-item"
                      onClick={() => handleFontChange(-1)}
                      role="menuitem"
                      type="button"
                    >
                      {t("terminal.decreaseSize")}
                    </button>
                    <button
                      className="terminal-menu-item"
                      onClick={() => handleFontChange("reset")}
                      role="menuitem"
                      type="button"
                    >
                      {t("terminal.resetSize")}
                    </button>
                  </div>
                </div>
                <div className="terminal-menu-submenu">
                  <button
                    className="terminal-menu-item"
                    role="menuitem"
                    type="button"
                  >
                    <LayoutDashboard size={13} />
                    {t("terminal.view")}
                    <ChevronRight size={13} className="terminal-menu-chevron" />
                  </button>
                  <div className="terminal-menu terminal-menu-submenu-panel" role="menu">
                    <button
                      className="terminal-menu-item"
                      onClick={handleSaveView}
                      role="menuitem"
                      type="button"
                    >
                      {t("terminal.save")}
                    </button>
                    <button
                      className="terminal-menu-item"
                      onClick={handleResetView}
                      role="menuitem"
                      type="button"
                    >
                      {t("terminal.reset")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <button
            className="terminal-pane-action terminal-pane-close"
            aria-label={pane.tmuxSessionId ? t("terminal.detachTmux") : t("terminal.closePane")}
            onClick={() => closePane(tabId, pane.id)}
            title={pane.tmuxSessionId ? t("terminal.detachTmux") : t("terminal.closePane")}
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      </header>
      {searchOpen ? (
        <div className="terminal-search-bar">
          <Search size={13} />
          <input
            aria-label={t("terminal.findInScrollback")}
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("terminal.find")}
            ref={searchInputRef}
            value={searchTerm}
          />
          <span className={searchResult.found ? "terminal-search-count" : "terminal-search-count empty"}>
            {searchStatusLabel}
          </span>
          <button
            aria-label={t("terminal.previousSearch")}
            className="terminal-pane-action"
            disabled={!searchTerm.trim()}
            onClick={handleSearchPrevious}
            title={t("terminal.previousSearch")}
            type="button"
          >
            <ArrowUp size={13} />
          </button>
          <button
            aria-label={t("terminal.nextSearch")}
            className="terminal-pane-action"
            disabled={!searchTerm.trim()}
            onClick={handleSearchNext}
            title={t("terminal.nextSearch")}
            type="button"
          >
            <ArrowDown size={13} />
          </button>
          <button
            aria-label={t("terminal.closeSearch")}
            className="terminal-pane-action"
            onClick={handleCloseSearch}
            title={t("terminal.closeSearch")}
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      ) : null}
      {pane.connection ? (
        <div className="xterm-host" onContextMenu={handleTerminalContextMenu} ref={terminalElementRef} />
      ) : (
        <pre>
          <code>{pane.buffer}</code>
        </pre>
      )}
      {contextMenu ? (
        <TerminalContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopyTerminalSelection}
          onPaste={() => void handlePasteIntoTerminal()}
        />
      ) : null}
    </article>
  );
}

function TerminalContextMenu({
  menu,
  onClose,
  onCopy,
  onPaste,
}: {
  menu: TerminalContextMenuState;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) {
      return;
    }

    const bounds = node.getBoundingClientRect();
    const left = Math.min(menu.x, window.innerWidth - bounds.width - 8);
    const top = Math.min(menu.y, window.innerHeight - bounds.height - 8);
    node.style.left = `${Math.max(8, left)}px`;
    node.style.top = `${Math.max(8, top)}px`;
  }, [menu.x, menu.y]);

  return (
    <div
      className="terminal-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={menuRef}
      role="menu"
    >
      <button
        disabled={!menu.hasSelection}
        onClick={() => {
          onCopy();
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <span className="menu-item-label">
          <Copy size={14} />
          <span>{t("terminal.copy")}</span>
        </span>
        <kbd>{t("terminal.copyShortcut")}</kbd>
      </button>
      <button
        onClick={() => {
          onPaste();
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <span className="menu-item-label">
          <ClipboardPaste size={14} />
          <span>{t("terminal.paste")}</span>
        </span>
      </button>
    </div>
  );
}

function isMultilinePaste(data: string) {
  return data.split(/\r\n|\r|\n/).filter((line) => line.length > 0).length > 1;
}

function encodeTerminalInput(data: string) {
  return Array.from(terminalInputEncoder.encode(data));
}

function terminalDimensionsEqual(left: TerminalDimensions, right: TerminalDimensions) {
  return (
    left.cols === right.cols &&
    left.pixelHeight === right.pixelHeight &&
    left.pixelWidth === right.pixelWidth &&
    left.rows === right.rows
  );
}

function terminalSessionTypeFor(connection: Connection): "local" | "ssh" | "telnet" | "serial" {
  return connection.type === "local" ||
    connection.type === "ssh" ||
    connection.type === "telnet" ||
    connection.type === "serial"
    ? connection.type
    : "ssh";
}

async function terminalBufferForAssistant(
  pane: TerminalPane,
  renderer: TerminalRenderer | null,
  bufferLines: number,
) {
  if (pane.connection?.type === "ssh" && pane.tmuxSessionId) {
    try {
      return await invokeCommand("capture_tmux_pane", {
        request: {
          ...tmuxConnectionRequest(pane.connection),
          tmuxSessionId: pane.tmuxSessionId,
          bufferLines,
        },
      });
    } catch (error) {
      console.warn("Falling back to local terminal buffer after tmux capture failed.", error);
    }
  }

  return renderer?.getBufferText() ?? "";
}

function isRemoteInitialDirectory(cwd: string) {
  const trimmed = cwd.trim();
  if (!trimmed || trimmed === "~") {
    return false;
  }

  return !/^[A-Za-z]:[\\/]/.test(trimmed);
}

function focusTerminalUnlessExternalInputIsActive(
  renderer: TerminalRenderer,
  paneElement: HTMLElement | null,
) {
  if (shouldPreserveExternalFocus(paneElement)) {
    return;
  }

  renderer.focus();
}

function shouldPreserveExternalFocus(paneElement: HTMLElement | null) {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return false;
  }

  if (activeElement === document.body || activeElement === document.documentElement) {
    return false;
  }

  if (paneElement?.contains(activeElement)) {
    return false;
  }

  if (activeElement.closest(".assistant-panel")) {
    return true;
  }

  return isEditableElement(activeElement);
}

function isEditableElement(element: HTMLElement) {
  if (element.isContentEditable) {
    return true;
  }

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function focusExternalPointerTarget(target: Node) {
  const focusTarget = focusableElementForPointerTarget(target);
  if (!focusTarget) {
    return;
  }

  const focus = () => {
    if (!focusTarget.isConnected || document.activeElement === focusTarget) {
      return;
    }

    focusTarget.focus({ preventScroll: true });
  };

  queueMicrotask(focus);
  window.requestAnimationFrame(focus);
}

function focusableElementForPointerTarget(target: Node) {
  const element = target instanceof HTMLElement ? target : target.parentElement;
  if (!element) {
    return null;
  }

  if (isFocusableElement(element)) {
    return element;
  }

  const label = element.closest("label");
  if (label instanceof HTMLLabelElement && label.control instanceof HTMLElement) {
    return label.control;
  }

  return element.closest<HTMLElement>(
    'input, textarea, select, button, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
  );
}

function isFocusableElement(element: HTMLElement) {
  if (element instanceof HTMLButtonElement) {
    return !element.disabled;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return !element.disabled;
  }

  if (element.isContentEditable) {
    return true;
  }

  const tabIndex = element.getAttribute("tabindex");
  return tabIndex !== null && tabIndex !== "-1";
}
