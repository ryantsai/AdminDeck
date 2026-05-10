import { create } from "zustand";
import {
  defaultAppearanceSettings,
  defaultAiProviderSettings,
  defaultSftpSettings,
  defaultSshSettings,
  defaultUrlSettings,
  defaultGeneralSettings,
  defaultTerminalSettings,
  initialTabs,
} from "./app-defaults";
import {
  defaultLayoutFor,
  ensureLayout,
  hydrateLayout,
  leafOrder,
  serializeLayout,
  splitLayout,
} from "./workspace/layout";
import type {
  AppearanceSettings,
  AiProviderSettings,
  AssistantContextSnippet,
  Connection,
  PerformanceMetrics,
  PerformanceSnapshot,
  HostUsageSnapshot,
  SftpSettings,
  SplitDirection,
  UrlSettings,
  SshSettings,
  StoredConnectionLayout,
  TerminalPane,
  GeneralSettings,
  TerminalSettings,
  TerminalStartMetric,
  WorkspacePane,
  StatusBarNotice,
  WorkspaceTab,
} from "./types";
import i18next from "./i18n/config";

const LAYOUT_STORAGE_PREFIX = "kkterm.layout.";
const TMUX_SESSION_STORAGE_PREFIX = "kkterm.tmuxSessions.";
const TMUX_SESSION_ID_PATTERN = /^[^\s:;]+$/u;
// Stable fallback slugs. New tmux session ids use ai.tmuxSessionLabels
// for the active locale when those labels are safe for tmux.
// ja, zh-CN, zh-TW: anime sci-fi themed labels
// All other locales: normal sci-fi themed labels
const TMUX_SESSION_NAMES = [
  "airlock",
  "andromeda",
  "antimatter",
  "asteroid",
  "astronaut",
  "atmosphere",
  "aurora",
  "binary",
  "biosphere",
  "blackhole",
  "blazar",
  "capsule",
  "celestial",
  "chromosphere",
  "chronos",
  "cluster",
  "comet",
  "constellation",
  "corona",
  "cosmos",
  "crater",
  "cryo",
  "cyber",
  "datasphere",
  "deepspace",
  "docking",
  "domeshield",
  "drift",
  "dwarfstar",
  "eclipse",
  "electromag",
  "equinox",
  "event",
  "exoplanet",
  "exosphere",
  "filament",
  "flyby",
  "fusion",
  "galaxy",
  "gateway",
  "geodesic",
  "gluon",
  "gravity",
  "hangar",
  "helix",
  "holodeck",
  "horizon",
  "hydrogen",
  "hypernova",
  "hyperspace",
  "ignition",
  "impulse",
  "inertia",
  "infrared",
  "iondrive",
  "ionosphere",
  "jetstream",
  "jumpgate",
  "jupiter",
  "kepler",
  "launchpad",
  "lightyear",
  "lithium",
  "lodestar",
  "mainframe",
  "mars",
  "mercury",
  "meteor",
  "mission",
  "moonbase",
  "moonshot",
  "nebula",
  "neptune",
  "netrunner",
  "neutron",
  "nextgen",
  "nova",
  "observatory",
  "orbit",
  "orion",
  "parsec",
  "payload",
  "photon",
  "planetoid",
  "plasma",
  "polaris",
  "probe",
  "pulsar",
  "quantum",
  "quasar",
  "redshift",
  "rover",
  "satellite",
  "singularity",
  "solarwind",
  "spacelab",
  "stardust",
  "starship",
  "sunspot",
  "supernova",
];

export function getTmuxSessionLabel(slug: string): string {
  const match = /^(?:kkterm-)?([a-z]+)((?:[0-9]{2}|[0-9]{3})?)$/.exec(slug);
  const baseSlug = match?.[1] ?? slug;
  const suffix = match?.[2] ?? "";
  const index = TMUX_SESSION_NAMES.indexOf(baseSlug);
  if (index === -1) return slug;
  try {
    const labels = i18next.t("ai.tmuxSessionLabels", { returnObjects: true });
    if (Array.isArray(labels) && index < labels.length && typeof labels[index] === "string") {
      return `${labels[index]}${suffix}`;
    }
  } catch {
    // Fall through to slug
  }
  return slug;
}

export function forgetTmuxSessionId(connectionId: string, sessionId: string) {
  const sessionIds = loadStoredTmuxSessionIds(connectionId).filter((entry) => entry !== sessionId);
  persistTmuxSessionIds(connectionId, sessionIds);
}

function loadStoredLayout(
  connectionId: string,
): StoredConnectionLayout | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(
      `${LAYOUT_STORAGE_PREFIX}${connectionId}`,
    );
    return raw ? (JSON.parse(raw) as StoredConnectionLayout) : undefined;
  } catch {
    return undefined;
  }
}

function persistLayout(
  connectionId: string,
  stored: StoredConnectionLayout | undefined,
) {
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

function clearStoredLayouts() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(LAYOUT_STORAGE_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable (private mode, quota); fail silently.
  }
}

function loadStoredTmuxSessionIds(connectionId: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(
      `${TMUX_SESSION_STORAGE_PREFIX}${connectionId}`,
    );
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isCurrentTmuxSessionId) : [];
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

function isRemoteDesktopConnection(connection: Connection) {
  return connection.type === "rdp" || connection.type === "vnc";
}

function tmuxSessionIdsForConnection(connection: Connection, count: number) {
  if (!connectionUsesTmux(connection)) {
    return [];
  }
  const sessionIds = loadStoredTmuxSessionIds(connection.id).slice(0, count);
  while (sessionIds.length < count) {
    sessionIds.push(generateTmuxSessionId(sessionIds));
  }
  persistTmuxSessionIds(connection.id, sessionIds);
  return sessionIds;
}

function appendTmuxSessionId(connection: Connection) {
  if (!connectionUsesTmux(connection)) {
    return undefined;
  }
  const sessionIds = loadStoredTmuxSessionIds(connection.id);
  const sessionId = generateTmuxSessionId(sessionIds);
  sessionIds.push(sessionId);
  persistTmuxSessionIds(connection.id, sessionIds);
  return sessionId;
}

function generateTmuxSessionId(existingSessionIds: string[]) {
  const existing = new Set(existingSessionIds);

  for (let attempt = 0; attempt < TMUX_SESSION_NAMES.length * 2; attempt += 1) {
    const candidate = randomTmuxName();
    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  for (let suffix = 2; suffix <= 99; suffix += 1) {
    for (let attempt = 0; attempt < TMUX_SESSION_NAMES.length; attempt += 1) {
      const candidate = `${randomTmuxName()}${formatTmuxSessionNumber(suffix)}`;
      if (!existing.has(candidate)) {
        return candidate;
      }
    }
  }

  return `${randomTmuxName()}${formatTmuxSessionNumber((Date.now() % 98) + 2)}`;
}

function isCurrentTmuxSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    TMUX_SESSION_ID_PATTERN.test(value) &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}

function randomTmuxName() {
  const index = randomTmuxIndex(TMUX_SESSION_NAMES.length);
  return localizedTmuxSessionName(index) ?? TMUX_SESSION_NAMES[index] ?? "airlock";
}

function localizedTmuxSessionName(index: number) {
  try {
    const labels = i18next.t("ai.tmuxSessionLabels", { returnObjects: true });
    const label = Array.isArray(labels) ? labels[index] : undefined;
    return typeof label === "string" && isCurrentTmuxSessionId(label) ? label : undefined;
  } catch {
    return undefined;
  }
}

function randomTmuxIndex(max: number) {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return (bytes[0] ?? 0) % max;
  }
  return Math.floor(Math.random() * max);
}

function formatTmuxSessionNumber(value: number) {
  return String(Math.max(2, value)).padStart(2, "0");
}

function buildPanesForConnection(
  connection: Connection,
  count: number,
): TerminalPane[] {
  const baseId = connection.id;
  const baseTitle = terminalPaneTitleForConnection(connection);
  const baseCwd = defaultTerminalCwdForConnection(connection);
  const tmuxSessionIds = tmuxSessionIdsForConnection(connection, count);
  const panes: TerminalPane[] = [];
  for (let index = 0; index < count; index += 1) {
    panes.push({
      id:
        index === 0
          ? `pane-${baseId}`
          : `pane-${baseId}-${index}-${Date.now()}`,
      title: index === 0 ? baseTitle : `${baseTitle} ${index + 1}`,
      toolbarTitle: toolbarTitleForConnection(connection),
      cwd: baseCwd,
      buffer: "",
      connection,
      tmuxSessionId: tmuxSessionIds[index],
    });
  }
  return panes;
}

function buildPanesFromStoredLayout(
  connection: Connection,
  stored?: StoredConnectionLayout,
): TerminalPane[] {
  const paneCount = Math.max(1, stored?.paneCount ?? 1);
  const fallback = buildPanesForConnection(connection, paneCount);
  if (!stored?.panes?.length) {
    return fallback;
  }
  return fallback.map((pane, index) => {
    const storedPane = stored.panes?.[index];
    if (!storedPane?.connection) {
      return pane;
    }
    return {
      ...pane,
      title: storedPane.title?.trim() || pane.title,
      toolbarTitle: toolbarTitleForConnection(storedPane.connection),
      cwd: storedPane.cwd?.trim() || pane.cwd,
      connection: storedPane.connection,
      tmuxSessionId: storedPane.tmuxSessionId,
    };
  });
}

function titleForConnectionPane(connection: Connection) {
  if (connection.type === "url") {
    return connection.name;
  }
  if (isRemoteDesktopConnection(connection)) {
    return connection.name;
  }
  return terminalPaneTitleForConnection(connection);
}

function toolbarTitleForConnection(connection: Connection) {
  if (connection.type === "url") {
    return connection.name;
  }
  if (connection.type === "serial") {
    return connection.serialLine?.trim() || connection.host || connection.name;
  }
  if (connection.type === "local") {
    return localTerminalToolbarTitle(connection);
  }
  return formatConnectionAddress(connection);
}

function localTerminalToolbarTitle(connection: Connection) {
  const shell = connection.localShell?.trim();
  const normalizedShell = shell?.toLowerCase() ?? "";
  if (normalizedShell.endsWith("cmd.exe") || normalizedShell === "cmd") {
    return i18next.t("settings.commandPrompt");
  }
  if (
    normalizedShell.endsWith("powershell.exe") ||
    normalizedShell === "powershell" ||
    normalizedShell.endsWith("pwsh.exe") ||
    normalizedShell === "pwsh"
  ) {
    return i18next.t("settings.powerShell");
  }
  if (normalizedShell.endsWith("wsl.exe") || normalizedShell === "wsl") {
    return i18next.t("settings.wsl");
  }
  return shell || connection.name;
}

function terminalPaneTitleForConnection(connection: Connection) {
  switch (connection.type) {
    case "local":
      return connection.name;
    case "telnet":
      return "telnet";
    case "serial":
      return "serial";
    case "ssh":
    default:
      return "ssh";
  }
}

function buildPaneForConnection(
  connection: Connection,
  focusedPane?: WorkspacePane,
): WorkspacePane | null {
  if (connection.type === "url") {
    if (!connection.url) {
      return null;
    }
    return {
      kind: "webview",
      id: `pane-${connection.id}-${Date.now()}`,
      title: titleForConnectionPane(connection),
      toolbarTitle: toolbarTitleForConnection(connection),
      connection,
      url: connection.url,
      dataPartition: connection.dataPartition,
    };
  }

  if (isRemoteDesktopConnection(connection)) {
    return {
      kind: "remoteDesktop",
      id: `pane-${connection.id}-${Date.now()}`,
      title: titleForConnectionPane(connection),
      toolbarTitle: toolbarTitleForConnection(connection),
      connection,
    };
  }

  return {
    kind: "terminal",
    id: `pane-${connection.id}-${Date.now()}`,
    title: titleForConnectionPane(connection),
    toolbarTitle: toolbarTitleForConnection(connection),
    cwd: inheritedTerminalCwdForConnection(connection, focusedPane),
    buffer: "",
    connection,
    tmuxSessionId: appendTmuxSessionId(connection),
  };
}

function defaultTerminalCwdForConnection(connection: Connection) {
  return connection.type === "local" ? "C:\\Users\\ryan" : "~";
}

function inheritedTerminalCwdForConnection(
  connection: Connection,
  focusedPane?: WorkspacePane,
) {
  if (
    focusedPane &&
    "cwd" in focusedPane &&
    focusedPane.connection?.id === connection.id
  ) {
    return focusedPane.cwd;
  }

  return defaultTerminalCwdForConnection(connection);
}

function isTerminalPane(pane: WorkspacePane): pane is TerminalPane {
  return pane.kind === undefined || pane.kind === "terminal";
}

function urlConnectionIdsForTab(tab: WorkspaceTab) {
  return tab.panes.flatMap((pane) =>
    pane.kind === "webview" && pane.connection.type === "url"
      ? [pane.connection.id]
      : [],
  );
}

function incrementActiveSessionCounts(
  activeSessionCounts: Record<string, number>,
  connectionIds: string[],
) {
  if (connectionIds.length === 0) {
    return activeSessionCounts;
  }
  const nextCounts = { ...activeSessionCounts };
  connectionIds.forEach((connectionId) => {
    nextCounts[connectionId] = (nextCounts[connectionId] ?? 0) + 1;
  });
  return nextCounts;
}

function decrementActiveSessionCounts(
  activeSessionCounts: Record<string, number>,
  connectionIds: string[],
) {
  if (connectionIds.length === 0) {
    return activeSessionCounts;
  }
  const nextCounts = { ...activeSessionCounts };
  connectionIds.forEach((connectionId) => {
    const currentCount = nextCounts[connectionId] ?? 0;
    if (currentCount <= 1) {
      delete nextCounts[connectionId];
      return;
    }
    nextCounts[connectionId] = currentCount - 1;
  });
  return nextCounts;
}

interface WorkspaceState {
  query: string;
  tabs: WorkspaceTab[];
  activeTabId: string;
  generalSettings: GeneralSettings;
  terminalSettings: TerminalSettings;
  appearanceSettings: AppearanceSettings;
  sshSettings: SshSettings;
  sftpSettings: SftpSettings;
  urlSettings: UrlSettings;
  aiProviderSettings: AiProviderSettings;
  aiProviderHasApiKey: boolean;
  assistantContextSnippet?: AssistantContextSnippet;
  rdpPreCaptureSignal: number;
  activeSessionCounts: Record<string, number>;
  performanceMetrics: PerformanceMetrics;
  statusBarNotice?: StatusBarNotice;
  setQuery: (query: string) => void;
  setGeneralSettings: (settings: GeneralSettings) => void;
  setTerminalSettings: (settings: TerminalSettings) => void;
  setAppearanceSettings: (settings: AppearanceSettings) => void;
  setSshSettings: (settings: SshSettings) => void;
  setSftpSettings: (settings: SftpSettings) => void;
  setUrlSettings: (settings: UrlSettings) => void;
  setAiProviderSettings: (settings: AiProviderSettings) => void;
  setAiProviderHasApiKey: (hasApiKey: boolean) => void;
  setAssistantContextSnippet: (snippet: AssistantContextSnippet) => void;
  clearAssistantContextSnippet: () => void;
  requestRdpPreCapture: () => void;
  setFrontendLaunchMs: (frontendLaunchMs: number) => void;
  setPerformanceSnapshot: (snapshot: PerformanceSnapshot) => void;
  setHostUsageSnapshot: (snapshot: HostUsageSnapshot) => void;
  recordTerminalStartMetric: (metric: TerminalStartMetric) => void;
  clearTerminalStartMetric: (kind: TerminalStartMetric["kind"]) => void;
  showStatusBarNotice: (
    message: string,
    options?: { tone?: StatusBarNotice["tone"]; durationMs?: number },
  ) => void;
  clearStatusBarNotice: (id: number) => void;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  openConnection: (connection: Connection) => void;
  openUrlConnection: (connection: Connection) => void;
  openSshPortForwardBrowser: (
    sourceConnection: Connection,
    forward: { forwardId: string; localPort: number; remotePort: number; url: string },
  ) => void;
  openRemoteDesktopConnection: (connection: Connection) => void;
  openSftpBrowser: (connection: Connection) => void;
  openTerminalHere: (connection: Connection, remotePath: string) => void;
  openLocalTerminal: () => void;
  splitTerminalPane: (tabId: string) => void;
  splitTerminalPaneDirected: (tabId: string, direction: SplitDirection) => void;
  addConnectionToTerminalPane: (
    tabId: string,
    connection: Connection,
    direction: SplitDirection,
  ) => void;
  closePane: (tabId: string, paneId: string) => void;
  openTmuxSessionInPane: (
    tabId: string,
    connection: Connection,
    tmuxSessionId: string,
    direction: SplitDirection,
  ) => void;
  setFocusedPane: (tabId: string, paneId: string) => void;
  saveTabLayout: (tabId: string) => void;
  resetTabLayout: (tabId: string) => void;
  resetAllLayouts: () => void;
  updateWebviewTabMetadata: (
    tabId: string,
    metadata: { title?: string; subtitle?: string; url?: string },
  ) => void;
  refreshOpenConnectionMetadata: (connection: Connection) => void;
  markConnectionSessionStarted: (connectionId: string) => void;
  markConnectionSessionEnded: (connectionId: string) => void;
  closeAllTabs: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  query: "",
  tabs: initialTabs,
  activeTabId: initialTabs[0]?.id ?? "",
  generalSettings: defaultGeneralSettings,
  terminalSettings: defaultTerminalSettings,
  appearanceSettings: defaultAppearanceSettings,
  sshSettings: defaultSshSettings,
  sftpSettings: defaultSftpSettings,
  urlSettings: defaultUrlSettings,
  aiProviderSettings: defaultAiProviderSettings,
  aiProviderHasApiKey: false,
  assistantContextSnippet: undefined,
  rdpPreCaptureSignal: 0,
  activeSessionCounts: {},
  performanceMetrics: {},
  statusBarNotice: undefined,
  setQuery: (query) => set({ query }),
  setGeneralSettings: (generalSettings) => set({ generalSettings }),
  setTerminalSettings: (terminalSettings) => set({ terminalSettings }),
  setAppearanceSettings: (appearanceSettings) => set({ appearanceSettings }),
  setSshSettings: (sshSettings) => set({ sshSettings }),
  setSftpSettings: (sftpSettings) => set({ sftpSettings }),
  setUrlSettings: (urlSettings) => set({ urlSettings }),
  setAiProviderSettings: (aiProviderSettings) => set({ aiProviderSettings }),
  setAiProviderHasApiKey: (aiProviderHasApiKey) => set({ aiProviderHasApiKey }),
  setAssistantContextSnippet: (assistantContextSnippet) =>
    set({ assistantContextSnippet }),
  clearAssistantContextSnippet: () =>
    set({ assistantContextSnippet: undefined }),
  requestRdpPreCapture: () =>
    set((state) => ({ rdpPreCaptureSignal: state.rdpPreCaptureSignal + 1 })),
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
                  ? new Date(
                      snapshot.lastSshTerminalReadyAtUnixSeconds * 1000,
                    ).toISOString()
                  : new Date().toISOString(),
              },
            }),
      },
    })),
  setHostUsageSnapshot: (snapshot) =>
    set((state) => ({
      performanceMetrics: {
        ...state.performanceMetrics,
        hostUsage: snapshot,
      },
    })),
  recordTerminalStartMetric: (lastTerminalStart) =>
    set((state) => ({
      performanceMetrics: {
        ...state.performanceMetrics,
        lastTerminalStart,
        ...(lastTerminalStart.kind === "local"
          ? { lastLocalTerminalStart: lastTerminalStart }
          : {}),
        ...(lastTerminalStart.kind === "ssh"
          ? { lastSshTerminalStart: lastTerminalStart }
          : {}),
      },
    })),
  clearTerminalStartMetric: (kind) =>
    set((state) => ({
      performanceMetrics: {
        ...state.performanceMetrics,
        ...(kind === "local" ? { lastLocalTerminalStart: undefined } : {}),
        ...(kind === "ssh" ? { lastSshTerminalStart: undefined } : {}),
      },
    })),
  showStatusBarNotice: (message, options) => {
    const durationMs = options?.durationMs ?? 5_000;
    set({
      statusBarNotice: {
        id: Date.now(),
        message,
        tone: options?.tone ?? "info",
        expiresAt: Date.now() + durationMs,
      },
    });
  },
  clearStatusBarNotice: (id) =>
    set((state) =>
      state.statusBarNotice?.id === id
        ? { statusBarNotice: undefined }
        : {},
    ),
  activateTab: (tabId) => set({ activeTabId: tabId }),
  closeAllTabs: () => {
    const urlConnectionIds = get().tabs.flatMap(urlConnectionIdsForTab);
    set((state) => ({
      tabs: [],
      activeTabId: "",
      activeSessionCounts: decrementActiveSessionCounts(
        state.activeSessionCounts,
        urlConnectionIds,
      ),
    }));
  },
  closeTab: (tabId) => {
    const closingTab = get().tabs.find((tab) => tab.id === tabId);
    const remainingTabs = get().tabs.filter((tab) => tab.id !== tabId);
    set({
      tabs: remainingTabs,
      activeTabId:
        get().activeTabId === tabId
          ? (remainingTabs[0]?.id ?? "")
          : get().activeTabId,
      activeSessionCounts: decrementActiveSessionCounts(
        get().activeSessionCounts,
        closingTab ? urlConnectionIdsForTab(closingTab) : [],
      ),
    });
  },
  openConnection: (connection) => {
    if (connection.type === "url") {
      get().openUrlConnection(connection);
      return;
    }
    if (isRemoteDesktopConnection(connection)) {
      get().openRemoteDesktopConnection(connection);
      return;
    }

    const existingTab = get().tabs.find(
      (tab) => tab.id === `tab-${connection.id}`,
    );
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const stored = loadStoredLayout(connection.id);
    const panes = buildPanesFromStoredLayout(connection, stored);
    const paneIds = panes.map((pane) => pane.id);
    const layout =
      (stored ? hydrateLayout(stored.layout, paneIds) : undefined) ??
      defaultLayoutFor(panes);

    const tab: WorkspaceTab = {
      id: `tab-${connection.id}`,
      title: connection.name,
      toolbarTitle: toolbarTitleForConnection(connection),
      subtitle: terminalConnectionSubtitle(connection),
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
  openRemoteDesktopConnection: (connection) => {
    if (!isRemoteDesktopConnection(connection)) {
      return;
    }

    const existingTab = get().tabs.find(
      (tab) => tab.id === `tab-${connection.id}`,
    );
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const pane = buildPaneForConnection(connection);
    if (!pane) {
      return;
    }
    const tab: WorkspaceTab = {
      id: `tab-${connection.id}`,
      title: connection.name,
      toolbarTitle: toolbarTitleForConnection(connection),
      subtitle: remoteDesktopSubtitle(connection),
      kind: "terminal",
      panes: [pane],
      layout: defaultLayoutFor([pane]),
      focusedPaneId: pane.id,
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

    const existingTab = get().tabs.find(
      (tab) => tab.id === `tab-${connection.id}`,
    );
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
      toolbarTitle: toolbarTitleForConnection(connection),
      subtitle,
      kind: "terminal",
      panes: [
        {
          kind: "webview",
          id: `pane-${connection.id}-${Date.now()}`,
          title: connection.name,
          toolbarTitle: toolbarTitleForConnection(connection),
          connection,
          url: connection.url,
          dataPartition: connection.dataPartition,
        },
      ],
      connection,
      url: connection.url,
      dataPartition: connection.dataPartition,
    };
    tab.layout = defaultLayoutFor(tab.panes);
    tab.focusedPaneId = tab.panes[0]?.id;

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
      activeSessionCounts: incrementActiveSessionCounts(
        state.activeSessionCounts,
        urlConnectionIdsForTab(tab),
      ),
    }));
  },
  openSshPortForwardBrowser: (sourceConnection, forward) => {
    if (sourceConnection.type !== "ssh") {
      return;
    }

    const tabId = `tab-${forward.forwardId}`;
    const title = `${sourceConnection.name} :${forward.remotePort}`;
    const connection: Connection = {
      id: forward.forwardId,
      name: title,
      host: "127.0.0.1",
      user: sourceConnection.user,
      type: "url",
      status: "idle",
      url: forward.url,
    };
    const pane = {
      kind: "webview" as const,
      id: tabId,
      title,
      toolbarTitle: title,
      connection,
      url: forward.url,
      sshPortForwardSessionId: forward.forwardId,
      sshPortForwardRemotePort: forward.remotePort,
    };
    const tab: WorkspaceTab = {
      id: tabId,
      title,
      toolbarTitle: title,
      subtitle: `127.0.0.1:${forward.localPort} -> ${sourceConnection.host}:${forward.remotePort}`,
      kind: "terminal",
      panes: [pane],
      layout: defaultLayoutFor([pane]),
      focusedPaneId: pane.id,
      connection,
      url: forward.url,
      sshPortForwardSessionId: forward.forwardId,
      sshPortForwardRemotePort: forward.remotePort,
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
      toolbarTitle: toolbarTitleForConnection(connection),
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
      toolbarTitle: toolbarTitleForConnection(connection),
      subtitle: `${connection.user}@${connection.host}:${normalizedPath}`,
      kind: "terminal",
      panes: [
        {
          id: `pane-${connection.id}-terminal-${Date.now()}`,
          title: "ssh",
          toolbarTitle: toolbarTitleForConnection(connection),
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
    set((state) => {
      const openedUrlConnectionIds: string[] = [];
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.kind !== "terminal") {
          return tab;
        }

        const focusedPane =
          tab.panes.find((pane) => pane.id === tab.focusedPaneId) ??
          tab.panes[0];
        const connection = focusedPane?.connection;
        if (!focusedPane || !connection) {
          return tab;
        }

        const newPane = buildPaneForConnection(connection, focusedPane);
        if (!newPane) {
          return tab;
        }
        newPane.title = `${focusedPane.title} ${tab.panes.length + 1}`;
        if (newPane.kind === "webview") {
          openedUrlConnectionIds.push(newPane.connection.id);
        }

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
      });
      return {
        tabs,
        activeSessionCounts: incrementActiveSessionCounts(
          state.activeSessionCounts,
          openedUrlConnectionIds,
        ),
      };
    });
  },
  addConnectionToTerminalPane: (tabId, connection, direction) => {
    set((state) => {
      const openedUrlConnectionIds: string[] = [];
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.kind !== "terminal") {
          return tab;
        }
        const focusedPane =
          tab.panes.find((pane) => pane.id === tab.focusedPaneId) ??
          tab.panes[0];
        if (!focusedPane) {
          return tab;
        }
        const newPane = buildPaneForConnection(connection, focusedPane);
        if (!newPane) {
          return tab;
        }
        if (newPane.kind === "webview") {
          openedUrlConnectionIds.push(newPane.connection.id);
        }
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
      });
      return {
        tabs,
        activeSessionCounts: incrementActiveSessionCounts(
          state.activeSessionCounts,
          openedUrlConnectionIds,
        ),
      };
    });
  },
  closePane: (tabId, paneId) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab || tab.kind !== "terminal") {
      return;
    }
    if (tab.panes.length <= 1) {
      get().closeTab(tabId);
      return;
    }
    const closingPane = tab.panes.find((pane) => pane.id === paneId);
    const nextPanes = tab.panes.filter((p) => p.id !== paneId);
    const nextLayout = ensureLayout(tab.layout, nextPanes);
    const nextFocusedPaneId =
      tab.focusedPaneId === paneId
        ? (leafOrder(nextLayout)[0] ?? nextPanes[0]?.id)
        : tab.focusedPaneId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id !== tabId
          ? t
          : {
              ...t,
              panes: nextPanes,
              layout: nextLayout,
              focusedPaneId: nextFocusedPaneId,
            },
      ),
      activeSessionCounts:
        closingPane?.kind === "webview"
          ? decrementActiveSessionCounts(s.activeSessionCounts, [closingPane.connection.id])
          : s.activeSessionCounts,
    }));
  },
  openTmuxSessionInPane: (tabId, connection, tmuxSessionId, direction) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId || tab.kind !== "terminal") {
          return tab;
        }

        const focusedPane =
          tab.panes.find((pane) => pane.id === tab.focusedPaneId) ??
          tab.panes[0];
        if (!focusedPane || !isTerminalPane(focusedPane)) {
          return tab;
        }

        const newPane: TerminalPane = {
          id: `pane-${connection.id}-${Date.now()}`,
          title: tmuxSessionId,
          toolbarTitle: toolbarTitleForConnection(connection),
          cwd: focusedPane.cwd,
          buffer: "",
          connection,
          tmuxSessionId,
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
      .filter(
        (pane): pane is TerminalPane =>
          pane !== undefined && isTerminalPane(pane),
      );
    if (orderedPanes.length !== tab.panes.length) {
      return;
    }
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
  resetAllLayouts: () => {
    clearStoredLayouts();
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.kind !== "terminal"
          ? tab
          : {
              ...tab,
              layout: defaultLayoutFor(tab.panes),
              focusedPaneId: tab.panes[0]?.id,
            },
      ),
    }));
  },
  updateWebviewTabMetadata: (tabId, metadata) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.kind === "terminal") {
          const updatesTab = tab.id === tabId;
          const updatesPane = tab.panes.some(
            (pane) => pane.kind === "webview" && pane.id === tabId,
          );
          if (!updatesTab && !updatesPane) {
            return tab;
          }
          const updatesSinglePaneTab = updatesPane && tab.panes.length === 1;

          return {
            ...tab,
            title:
              updatesTab || updatesSinglePaneTab
                ? (metadata.title ?? tab.title)
                : tab.title,
            subtitle:
              updatesTab || updatesSinglePaneTab
                ? (metadata.subtitle ?? tab.subtitle)
                : tab.subtitle,
            url:
              updatesTab || updatesSinglePaneTab
                ? (metadata.url ?? tab.url)
                : tab.url,
            panes: tab.panes.map((pane) =>
              pane.kind === "webview" && pane.id === tabId
                ? {
                    ...pane,
                    title: metadata.title ?? pane.title,
                    url: metadata.url ?? pane.url,
                  }
                : pane,
            ),
          };
        }

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
  refreshOpenConnectionMetadata: (connection) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => refreshTabConnectionMetadata(tab, connection)),
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

function refreshTabConnectionMetadata(tab: WorkspaceTab, connection: Connection): WorkspaceTab {
  const tabConnectionMatches = tab.connection?.id === connection.id;
  const toolbarTitle = toolbarTitleForConnection(connection);
  const panes = tab.panes.map((pane) => {
    if (pane.connection?.id !== connection.id) {
      return pane;
    }
    return {
      ...pane,
      title: refreshedPaneTitle(pane, connection),
      toolbarTitle,
    };
  });
  const panesChanged = panes.some((pane, index) => pane !== tab.panes[index]);
  if (!tabConnectionMatches && !panesChanged) {
    return tab;
  }

  if (!tabConnectionMatches) {
    return { ...tab, panes };
  }

  return {
    ...tab,
    title: refreshedTabTitle(tab, connection),
    toolbarTitle,
    subtitle: refreshedTabSubtitle(tab, connection),
    panes,
  };
}

function refreshedTabTitle(tab: WorkspaceTab, connection: Connection) {
  if (tab.kind === "sftp") {
    return `${connection.name} SFTP`;
  }
  if (tab.id.startsWith(`tab-${connection.id}-terminal-`)) {
    return `${connection.name} terminal`;
  }
  return connection.name;
}

function refreshedTabSubtitle(tab: WorkspaceTab, connection: Connection) {
  if (tab.kind === "sftp") {
    return `${connection.user}@${connection.host}`;
  }
  if (tab.kind === "webview") {
    return tab.subtitle;
  }
  if (tab.id.startsWith(`tab-${connection.id}-terminal-`)) {
    const firstPane = tab.panes.find((pane): pane is TerminalPane => isTerminalPane(pane));
    const path = firstPane?.cwd?.trim() || ".";
    return `${connection.user}@${formatConnectionAddress(connection)}:${path}`;
  }
  if (tab.panes[0]?.kind === "remoteDesktop") {
    return remoteDesktopSubtitle(connection);
  }
  return terminalConnectionSubtitle(connection);
}

function refreshedPaneTitle(pane: WorkspacePane, connection: Connection) {
  if (pane.kind === "webview" || pane.kind === "remoteDesktop") {
    return connection.name;
  }
  return pane.title;
}

function formatConnectionAddress(connection: Connection) {
  return connection.port
    ? `${connection.host}:${connection.port}`
    : connection.host;
}

function remoteDesktopSubtitle(connection: Connection) {
  return connection.user?.trim() || formatConnectionAddress(connection);
}

function terminalConnectionSubtitle(connection: Connection) {
  if (connection.type === "local") {
    return "Local terminal session";
  }
  if (connection.type === "serial") {
    return `${connection.serialLine ?? connection.host} @ ${connection.serialSpeed ?? 9600}`;
  }
  if (connection.user.trim()) {
    return `${connection.user}@${formatConnectionAddress(connection)}`;
  }
  return formatConnectionAddress(connection);
}
