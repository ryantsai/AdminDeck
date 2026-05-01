import { create } from "zustand";
import { initialTabs } from "./sample-data";
import type { Connection, WorkspaceTab } from "./types";

interface WorkspaceState {
  query: string;
  tabs: WorkspaceTab[];
  activeTabId: string;
  setQuery: (query: string) => void;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  openConnection: (connection: Connection) => void;
  openLocalTerminal: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  query: "",
  tabs: initialTabs,
  activeTabId: initialTabs[0]?.id ?? "",
  setQuery: (query) => set({ query }),
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
  openLocalTerminal: () => {
    const id = `local-${Date.now()}`;
    get().openConnection({
      id,
      name: "PowerShell",
      host: "localhost",
      user: "local",
      type: "local",
      tags: ["local", "shell"],
      status: "idle",
    });
  },
}));
