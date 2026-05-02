import { invoke } from "@tauri-apps/api/core";
import type {
  AiProviderSettings,
  AppBootstrap,
  Connection,
  ConnectionFolder,
  ConnectionTree,
  CreateConnectionFolderRequest,
  CreateConnectionRequest,
  DuplicateConnectionRequest,
  KeychainStatus,
  MoveConnectionFolderRequest,
  MoveConnectionRequest,
  PerformanceSnapshot,
  RenameConnectionFolderRequest,
  RenameConnectionRequest,
  SecretPresence,
  SecretReferenceRequest,
  SftpSettings,
  SshSettings,
  StoreSecretRequest,
  TerminalSettings,
} from "../types";

export interface StartTerminalSessionRequest {
  sessionId?: string;
  title: string;
  type: "local" | "ssh";
  host: string;
  user: string;
  port?: number;
  keyPath?: string;
  proxyJump?: string;
  authMethod?: "keyFile" | "password" | "agent";
  secretOwnerId?: string;
  shell?: string;
  initialDirectory?: string;
  cols?: number;
  pixelHeight?: number;
  pixelWidth?: number;
  rows?: number;
}

export interface TerminalSessionStarted {
  sessionId: string;
  terminalReadyMs?: number;
}

export interface TerminalOutput {
  sessionId: string;
  data: string;
}

export interface StartSftpSessionRequest {
  sessionId?: string;
  title: string;
  host: string;
  user: string;
  port?: number;
  keyPath?: string;
  proxyJump?: string;
  authMethod?: "keyFile" | "password" | "agent";
  secretOwnerId?: string;
  path?: string;
}

export interface SftpDirectoryEntry {
  name: string;
  kind: "file" | "folder" | "symlink" | "other";
  size?: number;
  modified?: number;
  accessed?: number;
  permissions?: number;
  uid?: number;
  user?: string;
  gid?: number;
  group?: string;
}

export interface SftpDirectoryListing {
  sessionId: string;
  path: string;
  entries: SftpDirectoryEntry[];
}

export interface SftpSessionStarted extends SftpDirectoryListing {}

export interface LocalDirectoryEntry {
  name: string;
  kind: "file" | "folder" | "symlink" | "other";
  size?: number;
  modified?: number;
}

export interface LocalDirectoryListing {
  path: string;
  entries: LocalDirectoryEntry[];
}

export interface SftpTransferResult {
  name: string;
  files: number;
  folders: number;
  bytes: number;
}

export interface SftpTransferProgress {
  transferId: string;
  transferredBytes: number;
  totalBytes: number;
  progress: number;
}

export interface SftpPathProperties {
  path: string;
  name: string;
  kind: "file" | "folder" | "symlink" | "other";
  size?: number;
  modified?: number;
  accessed?: number;
  permissions?: number;
  mode?: string;
  uid?: number;
  user?: string;
  gid?: number;
  group?: string;
}

export interface SshTransportPlan {
  primaryLibrary: string;
  sftpCandidate: string;
  fallbackLibrary: string;
  systemSshRole: string;
}

export interface SshConfigConnectionDraft extends CreateConnectionRequest {}

export interface UnsupportedSshDirective {
  line: number;
  hostPattern?: string;
  directive: string;
  value: string;
}

export interface SshConfigImportPreview {
  drafts: SshConfigConnectionDraft[];
  unsupportedDirectives: UnsupportedSshDirective[];
}

export interface SshHostKeyPreview {
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  publicKey: string;
  status: "trusted" | "unknown" | "changed";
}

export interface CommandProposalPlan {
  prompt: string;
  command: string;
  reason: string;
  contextLabel: string;
  riskLabel: string;
  approvalRequired: boolean;
  extraConfirmationRequired: boolean;
  safetyNotes: string[];
}

export interface DiagnosticsBundle {
  path: string;
  files: string[];
  warnings: string[];
}

type CommandMap = {
  app_bootstrap: {
    args: undefined;
    result: AppBootstrap;
  };
  list_connection_groups: {
    args: undefined;
    result: ConnectionTree;
  };
  list_connection_tree: {
    args: undefined;
    result: ConnectionTree;
  };
  create_connection: {
    args: { request: CreateConnectionRequest };
    result: Connection;
  };
  create_connection_folder: {
    args: { request: CreateConnectionFolderRequest };
    result: ConnectionFolder;
  };
  rename_connection_folder: {
    args: { request: RenameConnectionFolderRequest };
    result: ConnectionFolder;
  };
  delete_connection_folder: {
    args: { folderId: string };
    result: null;
  };
  rename_connection: {
    args: { request: RenameConnectionRequest };
    result: Connection;
  };
  delete_connection: {
    args: { connectionId: string };
    result: null;
  };
  duplicate_connection: {
    args: { request: DuplicateConnectionRequest };
    result: Connection;
  };
  move_connection_folder: {
    args: { request: MoveConnectionFolderRequest };
    result: ConnectionTree;
  };
  move_connection: {
    args: { request: MoveConnectionRequest };
    result: ConnectionTree;
  };
  get_terminal_settings: {
    args: undefined;
    result: TerminalSettings;
  };
  update_terminal_settings: {
    args: { request: TerminalSettings };
    result: TerminalSettings;
  };
  get_ssh_settings: {
    args: undefined;
    result: SshSettings;
  };
  update_ssh_settings: {
    args: { request: SshSettings };
    result: SshSettings;
  };
  get_sftp_settings: {
    args: undefined;
    result: SftpSettings;
  };
  update_sftp_settings: {
    args: { request: SftpSettings };
    result: SftpSettings;
  };
  get_ai_provider_settings: {
    args: undefined;
    result: AiProviderSettings;
  };
  update_ai_provider_settings: {
    args: { request: AiProviderSettings };
    result: AiProviderSettings;
  };
  plan_command_proposal: {
    args: {
      request: {
        prompt: string;
        command: string;
        reason: string;
        contextLabel: string;
        selectedOutput?: string;
      };
    };
    result: CommandProposalPlan;
  };
  keychain_status: {
    args: undefined;
    result: KeychainStatus;
  };
  get_performance_snapshot: {
    args: undefined;
    result: PerformanceSnapshot;
  };
  create_diagnostics_bundle: {
    args: undefined;
    result: DiagnosticsBundle;
  };
  ssh_transport_plan: {
    args: undefined;
    result: SshTransportPlan;
  };
  import_ssh_config: {
    args: { request: { content: string; folderId?: string } };
    result: SshConfigImportPreview;
  };
  inspect_ssh_host_key: {
    args: { request: { host: string; port?: number } };
    result: SshHostKeyPreview;
  };
  trust_ssh_host_key: {
    args: { request: { host: string; port?: number; publicKey: string } };
    result: SshHostKeyPreview;
  };
  store_secret: {
    args: { request: StoreSecretRequest };
    result: null;
  };
  secret_exists: {
    args: { request: SecretReferenceRequest };
    result: SecretPresence;
  };
  delete_secret: {
    args: { request: SecretReferenceRequest };
    result: null;
  };
  start_terminal_session: {
    args: { request: StartTerminalSessionRequest };
    result: TerminalSessionStarted;
  };
  write_terminal_input: {
    args: { request: { sessionId: string; data: string } };
    result: null;
  };
  resize_terminal: {
    args: {
      request: {
        sessionId: string;
        cols: number;
        pixelHeight?: number;
        pixelWidth?: number;
        rows: number;
      };
    };
    result: null;
  };
  close_terminal_session: {
    args: { sessionId: string };
    result: null;
  };
  start_sftp_session: {
    args: { request: StartSftpSessionRequest };
    result: SftpSessionStarted;
  };
  list_sftp_directory: {
    args: { request: { sessionId: string; path: string } };
    result: SftpDirectoryListing;
  };
  list_local_directory: {
    args: { request: { path?: string } };
    result: LocalDirectoryListing;
  };
  upload_sftp_path: {
    args: {
      request: {
        sessionId: string;
        transferId: string;
        localPath: string;
        remoteDirectory: string;
        overwriteBehavior: SftpSettings["overwriteBehavior"];
      };
    };
    result: SftpTransferResult;
  };
  download_sftp_path: {
    args: {
      request: {
        sessionId: string;
        transferId: string;
        remotePath: string;
        localDirectory: string;
        overwriteBehavior: SftpSettings["overwriteBehavior"];
      };
    };
    result: SftpTransferResult;
  };
  cancel_sftp_transfer: {
    args: { request: { transferId: string } };
    result: null;
  };
  create_sftp_folder: {
    args: { request: { sessionId: string; parentPath: string; name: string } };
    result: null;
  };
  rename_sftp_path: {
    args: { request: { sessionId: string; path: string; newName: string } };
    result: null;
  };
  delete_sftp_path: {
    args: { request: { sessionId: string; path: string } };
    result: null;
  };
  sftp_path_properties: {
    args: { request: { sessionId: string; path: string } };
    result: SftpPathProperties;
  };
  update_sftp_path_properties: {
    args: {
      request: {
        sessionId: string;
        path: string;
        permissions?: string;
        uid?: number;
        gid?: number;
      };
    };
    result: SftpPathProperties;
  };
  close_sftp_session: {
    args: { sessionId: string };
    result: null;
  };
};

export function invokeCommand<Name extends keyof CommandMap>(
  name: Name,
  args?: CommandMap[Name]["args"],
): Promise<CommandMap[Name]["result"]> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Tauri runtime unavailable"));
  }

  return invoke<CommandMap[Name]["result"]>(name, args);
}

export function isTauriRuntime() {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as Window & { __TAURI_INTERNALS__?: unknown })
  );
}
