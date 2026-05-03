import type {
  AiProviderSettings,
  ConnectionTree,
  SftpSettings,
  SshSettings,
  TerminalSettings,
  WorkspaceTab,
} from "./types";

export const connectionTree: ConnectionTree = {
  connections: [],
  folders: [],
};

export const initialTabs: WorkspaceTab[] = [];

export const defaultTerminalSettings: TerminalSettings = {
  fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.25,
  cursorStyle: "block",
  scrollbackLines: 10000,
  copyOnSelect: false,
  confirmMultilinePaste: true,
  defaultShell: "powershell.exe",
};

export const defaultSshSettings: SshSettings = {
  defaultUser: "admin",
  defaultPort: 22,
  defaultKeyPath: "C:\\Users\\ryan\\.ssh\\id_ed25519",
  defaultProxyJump: "",
};

export const defaultSftpSettings: SftpSettings = {
  overwriteBehavior: "fail",
};

export const defaultAiProviderSettings: AiProviderSettings = {
  enabled: false,
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5-mini",
  cliExecutionPolicy: "suggestOnly",
  claudeCliPath: "",
  codexCliPath: "",
};

export type AiSuggestion = {
  id: string;
  title: string;
  risk: string;
  command: string;
  reason: string;
};

export const aiSuggestions: AiSuggestion[] = [];
