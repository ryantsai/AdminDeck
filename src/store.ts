import { create } from "zustand";
import {
  defaultAiProviderSettings,
  defaultSftpSettings,
  defaultSshSettings,
  defaultTerminalSettings,
  initialTabs,
} from "./sample-data";
import type {
  AiProviderSettings,
  AssistantContextSnippet,
  Connection,
  PerformanceMetrics,
  PerformanceSnapshot,
  SftpSettings,
  SshSettings,
  TerminalSettings,
  TerminalStartMetric,
  WorkspaceTab,
} from "./types";

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

    const tab: WorkspaceTab = {
      id: `tab-${connection.id}`,
      title: connection.name,
      subtitle:
        connection.type === "local" ? "Local terminal session" : `${connection.user}@${connection.host}`,
      kind: "terminal",
      panes: [
        {
          id: `pane-${connection.id}`,
          title: connection.type === "local" ? connection.name : "ssh",
          cwd: connection.type === "local" ? "C:\\Users\\ryan" : "~",
          buffer: "",
          connection,
        },
      ],
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
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.kind !== "terminal") {
          return tab;
        }

        const sourcePane = tab.panes[0];
        const connection = sourcePane?.connection;
        if (!sourcePane || !connection) {
          return tab;
        }

        const paneCount = tab.panes.length + 1;
        return {
          ...tab,
          panes: [
            ...tab.panes,
            {
              id: `pane-${connection.id}-${Date.now()}`,
              title: `${sourcePane.title} ${paneCount}`,
              cwd: sourcePane.cwd,
              buffer: "",
              connection,
            },
          ],
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
