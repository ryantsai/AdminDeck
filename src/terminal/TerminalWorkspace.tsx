import { confirmTrustedSshHostKey, uniqueRuntimeId, usesNativeSshHostKeyVerification } from "../connections/utils";
import { readFromClipboard, writeToClipboard } from "../lib/clipboard";
import { ScreenshotMenu } from "../workspace/ScreenshotMenu";
import { RemoteDesktopWorkspace } from "../remote-desktop/RemoteDesktopWorkspace";
import { WebViewWorkspace } from "../webview/WebViewWorkspace";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, Mouse, ChevronRight, Circle, ClipboardPaste, Columns2, Copy, Keyboard, LayoutDashboard, Menu, RefreshCw, Save, Search, SplitSquareHorizontal, Type, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { dialogButtonAria, menuButtonAria } from "../lib/aria";
import { invokeCommand, isTauriRuntime, saveTextFile, type TerminalOutput, type TmuxSession } from "../lib/tauri";
import { defaultTerminalSettings } from "../sample-data";
import { useWorkspaceStore } from "../store";
import { createTerminalRenderer, type TerminalDimensions, type TerminalRenderer } from "./renderer";
import { ensureLayout } from "../workspace/layout";
import { getPaneRenderer, registerPaneInputWriter, registerPaneRenderer, unregisterPaneInputWriter, unregisterPaneRenderer, writeInputToPane } from "../workspace/paneRegistry";
import type { Connection, LayoutNode, SplitDirection, TerminalPane, WorkspacePane, WorkspaceTab } from "../types";

type TerminalContextMenuState = {
  x: number;
  y: number;
  hasSelection: boolean;
};

const ASSISTANT_CONTEXT_MAX_CHARS = 4000;

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
  const setFocusedPane = useWorkspaceStore((state) => state.setFocusedPane);
  const saveTabLayout = useWorkspaceStore((state) => state.saveTabLayout);
  const resetTabLayout = useWorkspaceStore((state) => state.resetTabLayout);
  const defaultFontSize = defaultTerminalSettings.fontSize;
  const canSplit = tab.panes.some((pane) => pane.connection);
  const sshConnection = tab.connection?.type === "ssh" ? tab.connection : undefined;
  const focusedPaneId = tab.focusedPaneId ?? tab.panes[0]?.id;
  const layout = useMemo(() => ensureLayout(tab.layout, tab.panes), [tab.layout, tab.panes]);
  const isSingleEmbeddedPane = tab.panes.length === 1 && tab.panes[0] !== undefined && !isTerminalPane(tab.panes[0]);

  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const splitMenuRef = useRef<HTMLDivElement | null>(null);
  const hamburgerMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!splitMenuOpen && !hamburgerOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (splitMenuRef.current && target && !splitMenuRef.current.contains(target)) {
        setSplitMenuOpen(false);
      }
      if (hamburgerMenuRef.current && target && !hamburgerMenuRef.current.contains(target)) {
        setHamburgerOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [splitMenuOpen, hamburgerOpen]);

  function handleSplit(direction: "right" | "left" | "down" | "up") {
    setSplitMenuOpen(false);
    splitTerminalPaneDirected(tab.id, direction);
  }

  async function handleSaveBuffer() {
    setHamburgerOpen(false);
    const targetPaneId = focusedPaneId;
    if (!targetPaneId) {
      return;
    }
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
              },
            })
          : renderer.getBufferText();
      await saveTextFile(defaultFilename, text);
    } catch (error) {
      window.alert(
        `Could not save terminal buffer: ${
          error instanceof Error ? error.message : String(error)
        }`,
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
    setHamburgerOpen(false);
    saveTabLayout(tab.id);
  }

  function handleResetView() {
    setHamburgerOpen(false);
    resetTabLayout(tab.id);
  }

  function handleSendCtrlAltDelete() {
    const pane = focusedPaneId ? tab.panes.find((entry) => entry.id === focusedPaneId) : undefined;
    if (!pane || !isTerminalPane(pane) || pane.connection?.type !== "ssh") {
      return;
    }
    writeInputToPane(pane.id, "\x1b[3;7~");
  }

  const focusedSshPane = focusedPaneId
    ? tab.panes.find(
        (pane) => pane.id === focusedPaneId && isTerminalPane(pane) && pane.connection?.type === "ssh",
      )
    : undefined;

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
      {!isSingleEmbeddedPane ? (
        <div className="workspace-toolbar">
          <div>
            <strong>{tab.title}</strong>
            <span>{tab.subtitle}</span>
          </div>
          <div className="toolbar-cluster">
            <button
              className="toolbar-button"
              aria-label="Open SFTP browser"
              disabled={!sshConnection}
              onClick={() => sshConnection && openSftpBrowser(sshConnection)}
              title="Open SFTP browser"
              type="button"
            >
              <Columns2 size={15} />
              SFTP
            </button>
            <button
              className="icon-button"
              aria-label="Send Ctrl+Alt+Delete to focused SSH session"
              disabled={!focusedSshPane}
              onClick={handleSendCtrlAltDelete}
              title="Send Ctrl+Alt+Delete"
              type="button"
            >
              <Keyboard size={15} />
            </button>
            <div className="terminal-menu-wrapper" ref={splitMenuRef}>
              <button
                className="icon-button"
                aria-label="Split layout"
                {...menuButtonAria(splitMenuOpen)}
                disabled={!canSplit}
                onClick={() => setSplitMenuOpen((open) => !open)}
                title="Split layout"
                type="button"
              >
                <SplitSquareHorizontal size={15} />
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
                    Split Right
                  </button>
                  <button
                    className="terminal-menu-item"
                    onClick={() => handleSplit("left")}
                    role="menuitem"
                    type="button"
                  >
                    <ArrowLeft size={13} />
                    Split Left
                  </button>
                  <button
                    className="terminal-menu-item"
                    onClick={() => handleSplit("down")}
                    role="menuitem"
                    type="button"
                  >
                    <ArrowDown size={13} />
                    Split Down
                  </button>
                  <button
                    className="terminal-menu-item"
                    onClick={() => handleSplit("up")}
                    role="menuitem"
                    type="button"
                  >
                    <ArrowUp size={13} />
                    Split Up
                  </button>
                </div>
              ) : null}
            </div>
            <div className="terminal-menu-wrapper" ref={hamburgerMenuRef}>
              <button
                className="icon-button"
                aria-label="Terminal actions"
                {...menuButtonAria(hamburgerOpen)}
                onClick={() => setHamburgerOpen((open) => !open)}
                title="Terminal actions"
                type="button"
              >
                <Menu size={15} />
              </button>
              {hamburgerOpen ? (
                <div className="terminal-menu" role="menu">
                <button
                  className="terminal-menu-item"
                  onClick={() => void handleSaveBuffer()}
                  role="menuitem"
                  type="button"
                >
                  <Save size={13} />
                  Save Buffer
                </button>
                <div className="terminal-menu-submenu">
                  <button
                    className="terminal-menu-item"
                    role="menuitem"
                    type="button"
                  >
                    <Type size={13} />
                    Font
                    <ChevronRight size={13} className="terminal-menu-chevron" />
                  </button>
                  <div className="terminal-menu terminal-menu-submenu-panel" role="menu">
                    <button
                      className="terminal-menu-item"
                      onClick={() => handleFontChange(1)}
                      role="menuitem"
                      type="button"
                    >
                      Increase size
                    </button>
                    <button
                      className="terminal-menu-item"
                      onClick={() => handleFontChange(-1)}
                      role="menuitem"
                      type="button"
                    >
                      Decrease size
                    </button>
                    <button
                      className="terminal-menu-item"
                      onClick={() => handleFontChange("reset")}
                      role="menuitem"
                      type="button"
                    >
                      Reset size
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
                    View
                    <ChevronRight size={13} className="terminal-menu-chevron" />
                  </button>
                  <div className="terminal-menu terminal-menu-submenu-panel" role="menu">
                    <button
                      className="terminal-menu-item"
                      onClick={handleSaveView}
                      role="menuitem"
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      className="terminal-menu-item"
                      onClick={handleResetView}
                      role="menuitem"
                      type="button"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="terminal-grid">
        {layout ? (
          <TerminalLayoutView
            isActive={isActive}
            tabId={tab.id}
            layout={layout}
            panes={tab.panes}
            focusedPaneId={focusedPaneId}
            onFocusPane={(paneId) => setFocusedPane(tab.id, paneId)}
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
}: {
  isActive: boolean;
  tabId: string;
  layout: LayoutNode;
  panes: WorkspacePane[];
  focusedPaneId: string | undefined;
  onFocusPane: (paneId: string) => void;
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
        aria-label={`Close ${pane.title}`}
        className="embedded-pane-close"
        onClick={() => closePane(tabId, pane.id)}
        title={`Close ${pane.title}`}
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
  const [mouseEnabledIds, setMouseEnabledIds] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);

  const tabs = useWorkspaceStore((state) => state.tabs);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const setFocusedPane = useWorkspaceStore((state) => state.setFocusedPane);
  const openTmuxSessionInPane = useWorkspaceStore((state) => state.openTmuxSessionInPane);

  const enabled = connection.type === "ssh" && connection.useTmuxSessions !== false && sessionId;

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
        title="Show tmux sessions"
        type="button"
      >
        tmux {sessionId}
      </button>
      {open ? (
        <div className="tmux-session-menu" role="dialog" aria-label="tmux sessions">
          <header>
            <strong>tmux sessions</strong>
            <button
              className="terminal-pane-action"
              aria-label="Refresh tmux sessions"
              onClick={() => void loadSessions()}
              title="Refresh tmux sessions"
              type="button"
            >
              <RefreshCw size={13} />
            </button>
          </header>
          {loading ? <p>Loading...</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {!loading && !error && sessions.length === 0 ? <p>No tmux sessions.</p> : null}
          <div className="tmux-session-list">
            {sessions.map((session) => {
              const location = findSessionPane(session.id);
              const isInApp = location !== null;
              const isExpanded = expandedSessionId === session.id;
              const mouseOn = mouseEnabledIds.has(session.id);

              return (
                <div className="tmux-session-row" key={session.id}>
                  <div className="tmux-session-row-main">
                    <button
                      className={`tmux-session-row-info${isInApp ? " in-app" : ""}`}
                      onClick={() => handleSessionRowClick(session)}
                      title={isInApp ? "Focus pane" : "Open in pane"}
                      type="button"
                    >
                      <strong>{session.id}</strong>
                      <small>
                        {isInApp ? "open" : session.attached ? "attached" : "detached"}
                        {" · "}
                        {session.windows}w
                      </small>
                    </button>
                    <button
                      className={`tmux-mouse-toggle${mouseOn ? " active" : ""}`}
                      aria-label={`${mouseOn ? "Disable" : "Enable"} mouse for ${session.id}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void handleToggleMouse(session.id)}
                      title={`Mouse: ${mouseOn ? "on" : "off"}`}
                      type="button"
                    >
                      <Mouse size={11} />
                    </button>
                    <button
                      className="terminal-pane-action"
                      aria-label={`Close tmux session ${session.id}`}
                      onClick={() => void handleCloseSession(session.id)}
                      title="Close tmux session"
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
                        title="Open left"
                        type="button"
                      >
                        <ArrowLeft size={12} />
                      </button>
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "up")}
                        title="Open above"
                        type="button"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "down")}
                        title="Open below"
                        type="button"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        className="tmux-direction-btn"
                        onClick={() => handleOpenInDirection(session, "right")}
                        title="Open right"
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
      `Connection: ${connection.name}`,
      `Target: ${connection.user}@${connection.host}${connection.port ? `:${connection.port}` : ""}`,
      context.trim(),
    ]
      .filter(Boolean)
      .join("\n");
  } catch (error) {
    return `Connection: ${connection.name}\nTarget: ${connection.user}@${connection.host}${
      connection.port ? `:${connection.port}` : ""
    }\nSSH system context unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function TerminalPaneView({
  isActive,
  tabId,
  pane,
  isFocused,
  onFocus,
}: {
  isActive: boolean;
  tabId: string;
  pane: TerminalPane;
  isFocused: boolean;
  onFocus: () => void;
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
  const [selectedTerminalText, setSelectedTerminalText] = useState("");
  const [contextMenu, setContextMenu] = useState<TerminalContextMenuState | null>(null);
  const terminalSettings = useWorkspaceStore((state) => state.terminalSettings);
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

  useEffect(() => {
    const element = terminalElementRef.current;
    const connection = pane.connection;
    if (!element || !connection || startedRef.current) {
      return;
    }

    startedRef.current = true;
    const terminal = createTerminalRenderer(terminalSettings);
    terminalRendererRef.current = terminal;
    terminal.open(element);
    terminal.fit();
    terminal.focus();
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || !event.ctrlKey) {
        return true;
      }

      const key = event.key.toLowerCase();
      if (key === "c" && event.shiftKey) {
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
    terminal.writeln(`Starting ${terminalSessionType} session for ${connection.name}...`);

    if (!isTauriRuntime()) {
      terminal.writeln("Terminal sessions require the Tauri desktop runtime.");
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
        request: { sessionId, data },
      });
      terminal.focus();
    };
    registerPaneInputWriter(pane.id, writeInputToSession);
    const dataDisposable = terminal.onData((data) => {
      if (terminalSettings.confirmMultilinePaste && isMultilinePaste(data)) {
        const shouldPaste = window.confirm("Paste multiple lines into this terminal?");
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
          terminal.writeln("Verifying SSH host key...");
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
            initialDirectory: connection.type === "ssh" ? pane.cwd.trim() || undefined : undefined,
            cols: terminalDimensions.cols,
            pixelHeight: terminalDimensions.pixelHeight,
            pixelWidth: terminalDimensions.pixelWidth,
            rows: terminalDimensions.rows,
            useTmux: connection.type === "ssh" && connection.useTmuxSessions !== false,
            tmuxSessionId: pane.tmuxSessionId,
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
        terminal.writeln(`[failed to start session: ${String(error)}]`);
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
      renderer.focus();
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
      const shouldPaste = window.confirm("Paste multiple lines into this terminal?");
      if (!shouldPaste) {
        setContextMenu(null);
        terminalRendererRef.current?.focus();
        return;
      }
    }

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      void invokeCommand("write_terminal_input", {
        request: { sessionId, data: text },
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

  function handleSendSelectionToAssistant() {
    const text = normalizeAssistantContextText(selectedTerminalText);
    if (!text) {
      return;
    }

    const sourceLabel = pane.connection
      ? `${pane.connection.name} terminal selection`
      : `${pane.title} terminal selection`;
    setAssistantContextSnippet({
      id: `terminal-selection-${Date.now()}`,
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
        : "No results"
    : "";

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
          {pane.title}
        </span>
        <div className="terminal-pane-actions">
          {pane.connection ? (
            <TmuxSessionTag connection={pane.connection} sessionId={pane.tmuxSessionId} tabId={tabId} />
          ) : null}
          <small>{pane.cwd}</small>
          <button
            className="terminal-pane-action"
            aria-label="Find in terminal scrollback"
            onClick={() => setSearchOpen((open) => !open)}
            title="Find in terminal scrollback"
            type="button"
          >
            <Search size={13} />
          </button>
          <button
            className="terminal-pane-action"
            aria-label="Copy terminal selection"
            disabled={!selectedTerminalText}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleCopyTerminalSelection}
            title="Copy terminal selection (Ctrl+Shift+C)"
            type="button"
          >
            <Copy size={13} />
          </button>
          <ScreenshotMenu
            buttonClassName="terminal-pane-action"
            targetLabel={`${pane.connection?.name ?? pane.title} terminal Pane`}
            targetRef={paneRef}
          />
          <button
            className="terminal-pane-action"
            aria-label="Send selection to AI Assistant"
            disabled={!selectedTerminalText}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSendSelectionToAssistant}
            title="Send selection to AI Assistant"
            type="button"
          >
            <Bot size={13} />
          </button>
          <button
            className="terminal-pane-action terminal-pane-close"
            aria-label={pane.tmuxSessionId ? "Detach tmux session" : "Close pane"}
            onClick={() => closePane(tabId, pane.id)}
            title={pane.tmuxSessionId ? "Detach tmux session" : "Close pane"}
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
            aria-label="Find in terminal scrollback"
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Find"
            ref={searchInputRef}
            value={searchTerm}
          />
          <span className={searchResult.found ? "terminal-search-count" : "terminal-search-count empty"}>
            {searchStatusLabel}
          </span>
          <button
            aria-label="Previous search result"
            className="terminal-pane-action"
            disabled={!searchTerm.trim()}
            onClick={handleSearchPrevious}
            title="Previous search result"
            type="button"
          >
            <ArrowUp size={13} />
          </button>
          <button
            aria-label="Next search result"
            className="terminal-pane-action"
            disabled={!searchTerm.trim()}
            onClick={handleSearchNext}
            title="Next search result"
            type="button"
          >
            <ArrowDown size={13} />
          </button>
          <button
            aria-label="Close terminal search"
            className="terminal-pane-action"
            onClick={handleCloseSearch}
            title="Close terminal search"
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
      {menu.hasSelection ? (
        <button
          onClick={() => {
            onCopy();
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          <Copy size={14} />
          <span>Copy</span>
        </button>
      ) : (
        <button
          onClick={() => {
            onPaste();
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          <ClipboardPaste size={14} />
          <span>Paste</span>
        </button>
      )}
    </div>
  );
}

function isMultilinePaste(data: string) {
  return data.split(/\r\n|\r|\n/).filter((line) => line.length > 0).length > 1;
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

function normalizeAssistantContextText(text: string) {
  const normalized = text.trim();
  if (normalized.length <= ASSISTANT_CONTEXT_MAX_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, ASSISTANT_CONTEXT_MAX_CHARS)}\n[Selection truncated before adding to AI Assistant context.]`;
}
