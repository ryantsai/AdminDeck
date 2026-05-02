import { create } from "zustand";
import {
  defaultSftpSettings,
  defaultSshSettings,
  defaultTerminalSettings,
  initialTabs,
} from "./sample-data";
import type { Connection, SftpSettings, SshSettings, TerminalSettings, WorkspaceTab } from "./types";

interface WorkspaceState {
  query: string;
  tabs: WorkspaceTab[];
  activeTabId: string;
  terminalSettings: TerminalSettings;
  sshSettings: SshSettings;
  sftpSettings: SftpSettings;
  activeSessionCounts: Record<string, number>;
  setQuery: (query: string) => void;
  setTerminalSettings: (settings: TerminalSettings) => void;
  setSshSettings: (settings: SshSettings) => void;
  setSftpSettings: (settings: SftpSettings) => void;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  openConnection: (connection: Connection) => void;
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
  activeSessionCounts: {},
  setQuery: (query) => set({ query }),
  setTerminalSettings: (terminalSettings) => set({ terminalSettings }),
  setSshSettings: (sshSettings) => set({ sshSettings }),
  setSftpSettings: (sftpSettings) => set({ sftpSettings }),
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
    const existingTab = get().tabs.find((tab) => tab.id === `tab-${connection.id}`);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const tab: WorkspaceTab =
      connection.type === "sftp"
        ? {
            id: `tab-${connection.id}`,
            title: connection.name,
            subtitle: `${connection.user}@${connection.host}`,
            kind: "sftp",
            panes: [],
            connection,
          }
        : {
            id: `tab-${connection.id}`,
            title: connection.name,
            subtitle:
              connection.type === "local"
                ? "Local terminal session"
                : `${connection.user}@${connection.host}`,
            kind: "terminal",
            panes: [
              {
                id: `pane-${connection.id}`,
                title: connection.type === "local" ? "local shell" : "ssh",
                cwd: connection.type === "local" ? "C:\\Users\\ryan" : "~",
                buffer: "",
                connection,
              },
            ],
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
      type: "local",
      tags: ["local", "shell"],
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
