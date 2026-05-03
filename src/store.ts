import { create } from "zustand";
import {
  defaultAiProviderSettings,
  defaultSftpSettings,
  defaultSshSettings,
  defaultTerminalSettings,
  initialTabs,
} from "./sample-data";
import {
  defaultLayoutFor,
  ensureLayout,
  hydrateLayout,
  leafOrder,
  serializeLayout,
  splitLayout,
} from "./workspace/layout";
import type {
  AiProviderSettings,
  AssistantContextSnippet,
  Connection,
  PerformanceMetrics,
  PerformanceSnapshot,
  SftpSettings,
  SplitDirection,
  SshSettings,
  StoredConnectionLayout,
  TerminalPane,
  TerminalSettings,
  TerminalStartMetric,
  WorkspaceTab,
} from "./types";

const LAYOUT_STORAGE_PREFIX = "admindeck.layout.";
const TMUX_SESSION_STORAGE_PREFIX = "admindeck.tmuxSessions.";

function loadStoredLayout(connectionId: string): StoredConnectionLayout | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(`${LAYOUT_STORAGE_PREFIX}${connectionId}`);
    return raw ? (JSON.parse(raw) as StoredConnectionLayout) : undefined;
  } catch {
    return undefined;
  }
}

function persistLayout(connectionId: string, stored: StoredConnectionLayout | undefined) {
  if (typeof window === "undefined") {
    return;
  }
  const key = `${LAYOUT_STORAGE_PREFIX}${connectionId}`;
  try {
    if (!stored) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Storage may be unavailable (private mode, quota); fail silently.
  }
}

function loadStoredTmuxSessionIds(connectionId: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(`${TMUX_SESSION_STORAGE_PREFIX}${connectionId}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim() !== "")
      : [];
  } catch {
    return [];
  }
}

function persistTmuxSessionIds(connectionId: string, sessionIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      `${TMUX_SESSION_STORAGE_PREFIX}${connectionId}`,
      JSON.stringify(sessionIds),
    );
  } catch {
    // Storage may be unavailable (private mode, quota); fail silently.
  }
}

function connectionUsesTmux(connection: Connection) {
  return connection.type === "ssh" && connection.useTmuxSessions !== false;
}

function tmuxPrefixFor(connection: Connection) {
  return normalizeTmuxIdPart(connection.tmuxConnectionId ?? `admindeck-${connection.id}`);
}

function tmuxSessionIdsForConnection(connection: Connection, count: number) {
  if (!connectionUsesTmux(connection)) {
    return [];
  }
  const sessionIds = loadStoredTmuxSessionIds(connection.id).slice(0, count);
  while (sessionIds.length < count) {
    sessionIds.push(generateTmuxSessionId(connection));
  }
  persistTmuxSessionIds(connection.id, sessionIds);
  return sessionIds;
}

function appendTmuxSessionId(connection: Connection) {
  if (!connectionUsesTmux(connection)) {
    return undefined;
  }
  const sessionIds = loadStoredTmuxSessionIds(connection.id);
  const sessionId = generateTmuxSessionId(connection);
  sessionIds.push(sessionId);
  persistTmuxSessionIds(connection.id, sessionIds);
  return sessionId;
}

function generateTmuxSessionId(connection: Connection) {
  return `${tmuxPrefixFor(connection)}-${randomTmuxSuffix()}`;
}

function randomTmuxSuffix() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(16)}`;
}

function normalizeTmuxIdPart(value: string) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "admindeck"
  );
}

function buildPanesForConnection(connection: Connection, count: number): TerminalPane[] {
  const baseId = connection.id;
  const baseTitle = connection.type === "local" ? connection.name : "ssh";
  const baseCwd = connection.type === "local" ? "C:\\Users\\ryan" : "~";
  const tmuxSessionIds = tmuxSessionIdsForConnection(connection, count);
  const panes: TerminalPane[] = [];
  for (let index = 0; index < count; index += 1) {
    panes.push({
      id: index === 0 ? `pane-${baseId}` : `pane-${baseId}-${index}-${Date.now()}`,
      title: index === 0 ? baseTitle : `${baseTitle} ${index + 1}`,
      cwd: baseCwd,
      buffer: "",
      connection,
      tmuxSessionId: tmuxSessionIds[index],
    });
  }
  return panes;
}

interface WorkspaceState {
  query: string;
  tabs: WorkspaceTab[];
  activeTabId: string;
  terminalSettings: TerminalSettings;
  sshSettings: SshSettings;
  sftpSettings: SftpSettings;
  aiProviderSettings: AiProviderSettings;
  aiProviderHasApiKey: boolean;
  assistantContextSnippet?: AssistantContextSnippet;
  activeSessionCounts: Record<string, number>;
  performanceMetrics: PerformanceMetrics;
  setQuery: (query: string) => void;
  setTerminalSettings: (settings: TerminalSettings) => void;
  setSshSettings: (settings: SshSettings) => void;
  setSftpSettings: (settings: SftpSettings) => void;
  setAiProviderSettings: (settings: AiProviderSettings) => void;
  setAiProviderHasApiKey: (hasApiKey: boolean) => void;
  setAssistantContextSnippet: (snippet: AssistantContextSnippet) => void;
  clearAssistantContextSnippet: () => void;
  setFrontendLaunchMs: (frontendLaunchMs: number) => void;
  setPerformanceSnapshot: (snapshot: PerformanceSnapshot) => void;
  recordTerminalStartMetric: (metric: TerminalStartMetric) => void;
  clearTerminalStartMetric: (kind: TerminalStartMetric["kind"]) => void;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  openConnection: (connection: Connection) => void;
  openUrlConnection: (connection: Connection) => void;
  openSftpBrowser: (connection: Connection) => void;
  openTerminalHere: (connection: Connection, remotePath: string) => void;
  openLocalTerminal: () => void;
  splitTerminalPane: (tabId: string) => void;
  splitTerminalPaneDirected: (tabId: string, direction: SplitDirection) => void;
  setFocusedPane: (tabId: string, paneId: string) => void;
  saveTabLayout: (tabId: string) => void;
  resetTabLayout: (tabId: string) => void;
  updateWebviewTabMetadata: (
    tabId: string,
    metadata: { title?: string; subtitle?: string; url?: string },
  ) => void;
  markConnectionSessionStarted: (connectionId: string) => void;
  markConnectionSessionEnded: (connectionId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  query: "",
  tabs: initialTabs,
  activeTabId: initialTabs[0]?.id ?? "",
  terminalSettings: defaultTerminalSettings,
  sshSettings: defaultSshSettings,
  sftpSettings: defaultSftpSettings,
  aiProviderSettings: defaultAiProviderSettings,
  aiProviderHasApiKey: false,
  assistantContextSnippet: undefined,
  activeSessionCounts: {},
  performanceMetrics: {},
  setQuery: (query) => set({ query }),
  setTerminalSettings: (terminalSettings) => set({ terminalSettings }),
  setSshSettings: (sshSettings) => set({ sshSettings }),
  setSftpSettings: (sftpSettings) => set({ sftpSettings }),
  setAiProviderSettings: (aiProviderSettings) => set({ aiProviderSettings }),
  setAiProviderHasApiKey: (aiProviderHasApiKey) => set({ aiProviderHasApiKey }),
  setAssistantContextSnippet: (assistantContextSnippet) => set({ assistantContextSnippet }),
  clearAssistantContextSnippet: () => set({ assistantContextSnippet: undefined }),
  setFrontendLaunchMs: (frontendLaunchMs) =>
    set((state) => ({
      performanceMetrics: {
        ...state.performanceMetrics,
        frontendLaunchMs,
      },
    })),
  setPerformanceSnapshot: (snapshot) =>
    set((state) => ({
      performanceMetrics: {
        ...state.performanceMetrics,
        backendUptimeMs: snapshot.uptimeMs,
        workingSetBytes: snapshot.workingSetBytes,
        memorySource: snapshot.memorySource,
        ...(snapshot.lastSshTerminalReadyMs === undefined
          ? {}
          : {
              lastSshTerminalStart: {
                kind: "ssh",
                title: "Native SSH terminal",
                durationMs: snapshot.lastSshTerminalReadyMs,
                recordedAt: snapshot.lastSshTerminalReadyAtUnixSeconds
                  ? new Date(snapshot.lastSshTerminalReadyAtUnixSeconds * 1000).toISOString()
                  : new Date().toISOString(),
              },
            }),
      },
    })),
  recordTerminalStartMetric: (lastTerminalStart) =>
    set((state) => ({
      performanceMetrics: {
        ...state.performanceMetrics,
        lastTerminalStart,
        ...(lastTerminalStart.kind === "local"
          ? { lastLocalTerminalStart: lastTerminalStart }
          : { lastSshTerminalStart: lastTerminalStart }),
      },
    })),
  clearTerminalStartMetric: (kind) =>
    set((state) => ({
      performanceMetrics: {
        ...state.performanceMetrics,
        ...(kind === "local"
          ? { lastLocalTerminalStart: undefined }
          : { lastSshTerminalStart: undefined }),
      },
    })),
  activateTab: (tabId) => set({ activeTabId: tabId }),
  closeTab: (tabId) => {
    const remainingTabs = get().tabs.filter((tab) => tab.id !== tabId);
    set({
      tabs: remainingTabs,
      activeTabId:
        get().activeTabId === tabId
          ? remainingTabs[0]?.id ?? ""
          : get().activeTabId,
    });
  },
  openConnection: (connection) => {
    if (connection.type === "url") {
      get().openUrlConnection(connection);
      return;
    }

    const existingTab = get().tabs.find((tab) => tab.id === `tab-${connection.id}`);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const stored = loadStoredLayout(connection.id);
    const paneCount = Math.max(1, stored?.paneCount ?? 1);
    const panes = buildPanesForConnection(connection, paneCount);
    const paneIds = panes.map((pane) => pane.id);
    const layout =
      (stored ? hydrateLayout(stored.layout, paneIds) : undefined) ?? defaultLayoutFor(panes);

    const tab: WorkspaceTab = {
      id: `tab-${connection.id}`,
      title: connection.name,
      subtitle:
        connection.type === "local" ? "Local terminal session" : `${connection.user}@${connection.host}`,
      kind: "terminal",
      panes,
      layout,
      focusedPaneId: panes[0]?.id,
      connection,
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
  },
  openUrlConnection: (connection) => {
    if (connection.type !== "url" || !connection.url) {
      return;
    }

    const existingTab = get().tabs.find((tab) => tab.id === `tab-${connection.id}`);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    let subtitle = connection.url;
    try {
      subtitle = new URL(connection.url).host;
    } catch {
      subtitle = connection.url;
    }

    const tab: WorkspaceTab = {
      id: `tab-${connection.id}`,
      title: connection.name,
      subtitle,
      kind: "webview",
      panes: [],
      connection,
      url: connection.url,
      dataPartition: connection.dataPartition,
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
  },
  openSftpBrowser: (connection) => {
    if (connection.type !== "ssh") {
      return;
    }

    const tabId = `tab-${connection.id}-sftp`;
    const existingTab = get().tabs.find((tab) => tab.id === tabId);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const tab: WorkspaceTab = {
      id: tabId,
      title: `${connection.name} SFTP`,
      subtitle: `${connection.user}@${connection.host}`,
      kind: "sftp",
      panes: [],
      connection,
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
  },
  openTerminalHere: (connection, remotePath) => {
    const normalizedPath = remotePath.trim() || ".";
    const tabId = `tab-${connection.id}-terminal-${Date.now()}`;
    const tab: WorkspaceTab = {
      id: tabId,
      title: `${connection.name} terminal`,
      subtitle: `${connection.user}@${connection.host}:${normalizedPath}`,
      kind: "terminal",
      panes: [
        {
          id: `pane-${connection.id}-terminal-${Date.now()}`,
          title: "ssh",
          cwd: normalizedPath,
          buffer: "",
          connection,
          tmuxSessionId: appendTmuxSessionId(connection),
        },
      ],
      connection,
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
  },
  openLocalTerminal: () => {
    const id = `local-${Date.now()}`;
    const shell = get().terminalSettings.defaultShell;
    get().openConnection({
      id,
      name: shell,
      host: "localhost",
      user: "local",
      localShell: shell,
      type: "local",
      status: "idle",
    });
  },
  splitTerminalPane: (tabId) => {
    get().splitTerminalPaneDirected(tabId, "right");
  },
  splitTerminalPaneDirected: (tabId, direction) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.kind !== "terminal") {
          return tab;
        }

        const focusedPane =
          tab.panes.find((pane) => pane.id === tab.focusedPaneId) ?? tab.panes[0];
        const connection = focusedPane?.connection;
        if (!focusedPane || !connection) {
          return tab;
        }

        const newPane: TerminalPane = {
          id: `pane-${connection.id}-${Date.now()}`,
          title: `${focusedPane.title} ${tab.panes.length + 1}`,
          cwd: focusedPane.cwd,
          buffer: "",
          connection,
          tmuxSessionId: appendTmuxSessionId(connection),
        };

        const nextPanes = [...tab.panes, newPane];
        const baseLayout = ensureLayout(tab.layout, tab.panes);
        const nextLayout = splitLayout(
          baseLayout,
          focusedPane.id,
          direction,
          newPane.id,
          tab.panes.map((pane) => pane.id),
        );

        return {
          ...tab,
          panes: nextPanes,
          layout: nextLayout,
          focusedPaneId: newPane.id,
        };
      }),
    }));
  },
  setFocusedPane: (tabId, paneId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.focusedPaneId === paneId) {
          return tab;
        }
        return { ...tab, focusedPaneId: paneId };
      }),
    }));
  },
  saveTabLayout: (tabId) => {
    const tab = get().tabs.find((entry) => entry.id === tabId);
    if (!tab || tab.kind !== "terminal" || !tab.connection) {
      return;
    }
    const layout = ensureLayout(tab.layout, tab.panes);
    if (!layout) {
      return;
    }
    const orderedIds = leafOrder(layout);
    const orderedPanes = orderedIds
      .map((id) => tab.panes.find((pane) => pane.id === id))
      .filter((pane): pane is TerminalPane => Boolean(pane));
    const stored = serializeLayout(layout, orderedPanes);
    persistLayout(tab.connection.id, stored);
  },
  resetTabLayout: (tabId) => {
    const tab = get().tabs.find((entry) => entry.id === tabId);
    if (!tab || tab.kind !== "terminal" || !tab.connection) {
      return;
    }
    persistLayout(tab.connection.id, undefined);
  },
  updateWebviewTabMetadata: (tabId, metadata) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.kind !== "webview") {
          return tab;
        }

        return {
          ...tab,
          title: metadata.title ?? tab.title,
          subtitle: metadata.subtitle ?? tab.subtitle,
          url: metadata.url ?? tab.url,
        };
      }),
    }));
  },
  markConnectionSessionStarted: (connectionId) => {
    set((state) => ({
      activeSessionCounts: {
        ...state.activeSessionCounts,
        [connectionId]: (state.activeSessionCounts[connectionId] ?? 0) + 1,
      },
    }));
  },
  markConnectionSessionEnded: (connectionId) => {
    set((state) => {
      const currentCount = state.activeSessionCounts[connectionId] ?? 0;
      if (currentCount <= 1) {
        const remainingCounts = { ...state.activeSessionCounts };
        delete remainingCounts[connectionId];
        return { activeSessionCounts: remainingCounts };
      }

      return {
        activeSessionCounts: {
          ...state.activeSessionCounts,
          [connectionId]: currentCount - 1,
        },
      };
    });
  },
}));
