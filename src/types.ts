export type ConnectionType = "local" | "ssh" | "sftp";
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
  type: ConnectionType;
  tags: string[];
  status: ConnectionStatus;
}

export interface CreateConnectionRequest {
  name: string;
  host: string;
  user: string;
  type: ConnectionType;
  folderId?: string;
  port?: number;
  keyPath?: string;
  proxyJump?: string;
  authMethod?: SshAuthMethod;
  tags: string[];
}

export interface CreateConnectionFolderRequest {
  name: string;
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
  targetIndex: number;
}

export interface MoveConnectionRequest {
  id: string;
  folderId: string;
  targetIndex: number;
}

export interface ConnectionGroup {
  id: string;
  name: string;
  connections: Connection[];
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
  kind: "terminal" | "sftp";
  panes: TerminalPane[];
  connection?: Connection;
}

export interface FileEntry {
  name: string;
  kind: "file" | "folder" | "symlink" | "other";
  size: string;
  modified: string;
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
