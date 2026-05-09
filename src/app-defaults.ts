import type {
  AppearanceSettings,
  AiProviderSettings,
  ConnectionTree,
  GeneralSettings,
  ScreenshotSettings,
  SftpSettings,
  SshSettings,
  UrlSettings,
  TerminalSettings,
  WorkspaceTab,
} from "./types";

export const connectionTree: ConnectionTree = {
  connections: [],
  folders: [],
};

export const initialTabs: WorkspaceTab[] = [];

export const defaultGeneralSettings: GeneralSettings = {
  autoBackupEnabled: true,
  showConnectedConnectionsInRail: true,
  pinnedConnectionIds: [],
  allowClipboardRead: true,
  minimizeToTray: false,
  lastBackupAt: null,
};

export const defaultTerminalSettings: TerminalSettings = {
  fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.25,
  cursorStyle: "block",
  scrollbackLines: 5000,
  copyOnSelect: false,
  allowOsc52Clipboard: true,
  confirmMultilinePaste: true,
  defaultShell: "powershell.exe",
};

export const defaultAppearanceSettings: AppearanceSettings = {
  appFontFamily:
    '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  colorScheme: "default",
};

export const defaultSshSettings: SshSettings = {
  defaultUser: "admin",
  defaultPort: 22,
  defaultKeyPath: "C:\\Users\\ryan\\.ssh\\id_ed25519",
  defaultProxyJump: "",
  bufferLines: 5000,
  hideCommonPortRedirects: true,
  allowOsc52Clipboard: true,
};

export const defaultSftpSettings: SftpSettings = {
  overwriteBehavior: "fail",
};

export const defaultUrlSettings: UrlSettings = {
  ignoreCertificateErrors: false,
};

export const defaultScreenshotSettings: ScreenshotSettings = {
  folderPath: "%USERPROFILE%\\Pictures\\Screenshots",
};

export const defaultAiAssistantToolSettings = {
  webSearch: false,
  webFetch: false,
  shellCommand: false,
  appDataFileSearch: false,
  appDataFileRead: false,
  currentTime: false,
};

export const defaultAiProviderSettings: AiProviderSettings = {
  providerKind: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.5",
  reasoningEffort: "medium",
  outputLanguage: "",
  cliExecutionPolicy: "suggestOnly",
  claudeCliPath: "",
  codexCliPath: "",
  tools: defaultAiAssistantToolSettings,
};

export type AiSuggestion = {
  id: string;
  title: string;
  risk: string;
  command: string;
  reason: string;
};

export const aiSuggestions: AiSuggestion[] = [];
