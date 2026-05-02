export type ConnectionType = "local" | "ssh" | "url";
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
  url?: string;
  dataPartition?: string;
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
  url?: string;
  dataPartition?: string;
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
  id: string;
  title: string;
  cwd: string;
  buffer: string;
  connection?: Connection;
}

export type TerminalCursorStyle = "block" | "bar" | "underline";

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

export interface AiProviderSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  cliExecutionPolicy: "suggestOnly";
  claudeCliPath?: string;
  codexCliPath?: string;
}

export interface WorkspaceTab {
  id: string;
  title: string;
  subtitle: string;
  kind: "terminal" | "sftp" | "webview";
  panes: TerminalPane[];
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
  kind: "local" | "ssh";
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

export type SecretKind = "connectionPassword" | "connectionPassphrase" | "aiApiKey";

export interface KeychainStatus {
  available: boolean;
  service: string;
  backend: string;
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

export interface AssistantContextSnippet {
  id: string;
  sourceLabel: string;
  text: string;
  capturedAt: string;
}
