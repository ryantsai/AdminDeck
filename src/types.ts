export type ConnectionType =
  | "local"
  | "ssh"
  | "telnet"
  | "serial"
  | "url"
  | "rdp"
  | "vnc";
export type ConnectionStatus = "connected" | "idle" | "offline";
export type SshAuthMethod = "keyFile" | "password" | "agent";

export interface Connection {
  id: string;
  name: string;
  host: string;
  user: string;
  port?: number;
  keyPath?: string;
  proxyJump?: string;
  authMethod?: SshAuthMethod;
  hasPassword?: boolean;
  localShell?: string;
  serialLine?: string;
  serialSpeed?: number;
  url?: string;
  dataPartition?: string;
  useTmuxSessions?: boolean;
  tmuxConnectionId?: string;
  urlCredentialUsername?: string;
  hasUrlCredential?: boolean;
  type: ConnectionType;
  status: ConnectionStatus;
}

export interface ConnectionFolder {
  id: string;
  name: string;
  connections: Connection[];
  folders: ConnectionFolder[];
}

export interface ConnectionTree {
  connections: Connection[];
  folders: ConnectionFolder[];
}

export interface CreateConnectionRequest {
  name: string;
  host?: string;
  user?: string;
  type: ConnectionType;
  folderId?: string;
  port?: number;
  keyPath?: string;
  proxyJump?: string;
  authMethod?: SshAuthMethod;
  localShell?: string;
  serialLine?: string;
  serialSpeed?: number;
  url?: string;
  dataPartition?: string;
  useTmuxSessions?: boolean;
}

export interface CreateConnectionFolderRequest {
  name: string;
  parentFolderId?: string;
}

export interface RenameConnectionFolderRequest {
  id: string;
  name: string;
}

export interface RenameConnectionRequest {
  id: string;
  name: string;
}

export interface UpdateConnectionRequest extends CreateConnectionRequest {
  id: string;
}

export interface DuplicateConnectionRequest {
  id: string;
  name?: string;
}

export interface MoveConnectionFolderRequest {
  id: string;
  parentFolderId?: string;
  targetIndex: number;
}

export interface MoveConnectionRequest {
  id: string;
  folderId?: string;
  targetIndex: number;
}

export interface TerminalPane {
  kind?: "terminal";
  id: string;
  title: string;
  cwd: string;
  buffer: string;
  connection?: Connection;
  tmuxSessionId?: string;
}

export interface UrlPane {
  kind: "webview";
  id: string;
  title: string;
  connection: Connection;
  url: string;
  dataPartition?: string;
}

export interface RemoteDesktopPane {
  kind: "remoteDesktop";
  id: string;
  title: string;
  connection: Connection;
}

export type WorkspacePane = TerminalPane | UrlPane | RemoteDesktopPane;

export type SplitDirection = "right" | "left" | "down" | "up";
export type SplitOrientation = "horizontal" | "vertical";

export type LayoutNode =
  | { type: "leaf"; paneId: string }
  | { type: "split"; orientation: SplitOrientation; children: LayoutNode[] };

export type StoredLayoutNode =
  | { type: "leaf"; paneIndex: number }
  | {
      type: "split";
      orientation: SplitOrientation;
      children: StoredLayoutNode[];
    };

export interface StoredConnectionLayout {
  paneCount: number;
  layout: StoredLayoutNode;
  panes?: StoredLayoutPane[];
}

export interface StoredLayoutPane {
  connection: Connection;
  title?: string;
  cwd?: string;
  tmuxSessionId?: string;
}

export type TerminalCursorStyle = "block" | "bar" | "underline";

export interface GeneralSettings {
  autoBackupEnabled: boolean;
  lastBackupAt?: string | null;
}

export interface DatabaseBackupInfo {
  path: string;
  filename: string;
  createdAt: string;
}

export interface ImportedDatabaseSnapshot {
  generalSettings: GeneralSettings;
  terminalSettings: TerminalSettings;
  appearanceSettings: AppearanceSettings;
  sshSettings: SshSettings;
  sftpSettings: SftpSettings;
  aiProviderSettings: AiProviderSettings;
  connectionTree: ConnectionTree;
  backup: DatabaseBackupInfo;
}

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: TerminalCursorStyle;
  scrollbackLines: number;
  copyOnSelect: boolean;
  confirmMultilinePaste: boolean;
  defaultShell: string;
}

export type ColorScheme =
  | "default"
  | "dark"
  | "light"
  | "mac"
  | "orange"
  | "purple"
  | "pink";

export interface AppearanceSettings {
  appFontFamily: string;
  colorScheme: ColorScheme;
}

export interface SshSettings {
  defaultUser: string;
  defaultPort: number;
  defaultKeyPath?: string;
  defaultProxyJump?: string;
}

export type SftpOverwriteBehavior = "fail" | "overwrite";

export interface SftpSettings {
  overwriteBehavior: SftpOverwriteBehavior;
}

export type AiProviderKind =
  | "openai"
  | "anthropic"
  | "openrouter"
  | "deepseek"
  | "grok"
  | "azure-openai"
  | "litellm"
  | "github-copilot"
  | "ollama"
  | "nvidia"
  | "openai-compatible";

export type AiReasoningEffort = "default" | "low" | "medium" | "high" | "max";

export interface AiProviderSettings {
  providerKind: AiProviderKind;
  baseUrl: string;
  model: string;
  reasoningEffort: AiReasoningEffort;
  outputLanguage: string;
  cliExecutionPolicy: "suggestOnly";
  claudeCliPath?: string;
  codexCliPath?: string;
}

export interface WorkspaceTab {
  id: string;
  title: string;
  subtitle: string;
  kind: "terminal" | "sftp" | "webview" | "remoteDesktop";
  panes: WorkspacePane[];
  layout?: LayoutNode;
  focusedPaneId?: string;
  connection?: Connection;
  url?: string;
  dataPartition?: string;
}

export interface FileEntry {
  name: string;
  kind: "file" | "folder" | "symlink" | "other";
  size: string;
  sizeBytes?: number;
  modified: string;
  modifiedTimestamp?: number;
  accessedTimestamp?: number;
  permissions?: number;
  mode?: string;
  uid?: number;
  user?: string;
  gid?: number;
  group?: string;
}

export interface AppBootstrap {
  productName: string;
  version: string;
  logStatus: string;
  storageStatus: string;
  keychainStatus: KeychainStatus;
}

export interface PerformanceSnapshot {
  uptimeMs: number;
  workingSetBytes?: number;
  memorySource: string;
  lastSshTerminalReadyMs?: number;
  lastSshTerminalReadyAtUnixSeconds?: number;
}

export interface TerminalStartMetric {
  kind: "local" | "ssh" | "telnet" | "serial";
  title: string;
  durationMs: number;
  recordedAt: string;
}

export interface PerformanceMetrics {
  frontendLaunchMs?: number;
  backendUptimeMs?: number;
  workingSetBytes?: number;
  memorySource?: string;
  lastTerminalStart?: TerminalStartMetric;
  lastLocalTerminalStart?: TerminalStartMetric;
  lastSshTerminalStart?: TerminalStartMetric;
}

export type SecretKind =
  | "connectionPassword"
  | "connectionPassphrase"
  | "urlPassword"
  | "aiApiKey";

export interface KeychainStatus {
  available: boolean;
  service: string;
  backend: string;
}

export interface UrlCredentialSummary {
  connectionId: string;
  connectionName: string;
  url?: string;
  username: string;
  usernameSelector?: string;
  passwordSelector?: string;
  updatedAt: string;
}

export interface UrlDataPartitionSummary {
  name: string;
  connectionCount: number;
}

export interface SecretReferenceRequest {
  kind: SecretKind;
  ownerId: string;
}

export interface StoreSecretRequest extends SecretReferenceRequest {
  secret: string;
}

export interface SecretPresence {
  exists: boolean;
}

export type AssistantContextSnippet =
  | {
      id: string;
      kind: "text";
      sourceLabel: string;
      text: string;
      capturedAt: string;
    }
  | {
      id: string;
      kind: "screenshot";
      sourceLabel: string;
      imageDataUrl: string;
      width: number;
      height: number;
      capturedAt: string;
    };
