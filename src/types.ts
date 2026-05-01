export type ConnectionType = "local" | "ssh" | "sftp";
export type ConnectionStatus = "connected" | "idle" | "offline";

export interface Connection {
  id: string;
  name: string;
  host: string;
  user: string;
  type: ConnectionType;
  tags: string[];
  status: ConnectionStatus;
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
}
