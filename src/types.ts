export type ConnectionType = "local" | "ssh" | "sftp";
export type ConnectionStatus = "connected" | "idle" | "offline";

export interface Connection {
  id: string;
  name: string;
  host: string;
  user: string;
  port?: number;
  keyPath?: string;
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

export interface WorkspaceTab {
  id: string;
  title: string;
  subtitle: string;
  kind: "terminal" | "sftp";
  panes: TerminalPane[];
}

export interface FileEntry {
  name: string;
  kind: "file" | "folder";
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
