import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type {
  AppearanceSettings,
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
  UpdateConnectionRequest,
} from "../types";

type BrowserFileHandle = {
  createWritable: () => Promise<{
    close: () => Promise<void>;
    write: (contents: string) => Promise<void>;
  }>;
};

type BrowserSavePicker = (options: {
  suggestedName: string;
  types: Array<{
    accept: Record<string, string[]>;
    description: string;
  }>;
}) => Promise<BrowserFileHandle>;

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: BrowserSavePicker;
};

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
  useTmux?: boolean;
  tmuxSessionId?: string;
}

export interface TerminalSessionStarted {
  sessionId: string;
  terminalReadyMs?: number;
}

export interface TerminalOutput {
  sessionId: string;
  data: string;
}

export interface TmuxSession {
  id: string;
  attached: boolean;
  windows: number;
  created?: number;
  internalId?: string;
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

export interface AgentChatMessage {
  role: "assistant" | "user";
  content: string;
}

export interface AgentRunRequest {
  prompt: string;
  contextLabel: string;
  selectedOutput?: string;
  systemContext?: string;
  messages: AgentChatMessage[];
}

export interface AgentRunResponse {
  providerKind: string;
  model: string;
  content: string;
}

export interface DiagnosticsBundle {
  path: string;
  files: string[];
  warnings: string[];
}

export interface CaptureScreenshotRequest {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StartWebviewSessionRequest {
  sessionId: string;
  url: string;
  dataPartition?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebviewSessionStarted {
  sessionId: string;
  label: string;
  partition: string;
}

export interface UpdateWebviewBoundsRequest {
  sessionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SetWebviewVisibilityRequest {
  sessionId: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebviewNavigateRequest {
  sessionId: string;
  url: string;
}

export interface WebviewSimpleRequest {
  sessionId: string;
}

export interface FillWebviewCredentialRequest {
  sessionId: string;
  secretOwnerId: string;
  username: string;
}

export interface StartRdpSessionRequest {
  sessionId: string;
  host: string;
  user: string;
  port?: number;
  secretOwnerId?: string;
  password?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RdpSessionStarted {
  sessionId: string;
  host: string;
  port: number;
  control: string;
}

export interface RdpSessionStatus {
  sessionId: string;
  connectionState: number;
  connected: boolean;
}

export interface UpdateRdpBoundsRequest {
  sessionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SetRdpVisibilityRequest {
  sessionId: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SyncRdpDisplaySizeRequest {
  sessionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RdpDisplaySizeSync {
  sessionId: string;
  connectionState: number;
  connected: boolean;
  displaySynced: boolean;
  desktopWidth: number;
  desktopHeight: number;
}

export interface RdpSimpleRequest {
  sessionId: string;
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
  update_connection: {
    args: { request: UpdateConnectionRequest };
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
  upsert_url_credential: {
    args: { request: { connectionId: string; username: string } };
    result: Connection;
  };
  get_terminal_settings: {
    args: undefined;
    result: TerminalSettings;
  };
  update_terminal_settings: {
    args: { request: TerminalSettings };
    result: TerminalSettings;
  };
  get_appearance_settings: {
    args: undefined;
    result: AppearanceSettings;
  };
  update_appearance_settings: {
    args: { request: AppearanceSettings };
    result: AppearanceSettings;
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
  run_ai_agent: {
    args: { request: AgentRunRequest };
    result: AgentRunResponse;
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
  capture_screenshot_to_clipboard: {
    args: { request: CaptureScreenshotRequest };
    result: null;
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
  list_tmux_sessions: {
    args: {
      request: {
        host: string;
        user: string;
        port?: number;
        keyPath?: string;
        proxyJump?: string;
        authMethod?: "keyFile" | "password" | "agent";
        secretOwnerId?: string;
      };
    };
    result: TmuxSession[];
  };
  set_tmux_mouse: {
    args: {
      request: {
        host: string;
        user: string;
        port?: number;
        keyPath?: string;
        proxyJump?: string;
        authMethod?: "keyFile" | "password" | "agent";
        secretOwnerId?: string;
        tmuxSessionId: string;
        enabled: boolean;
      };
    };
    result: null;
  };
  close_tmux_session: {
    args: {
      request: {
        host: string;
        user: string;
        port?: number;
        keyPath?: string;
        proxyJump?: string;
        authMethod?: "keyFile" | "password" | "agent";
        secretOwnerId?: string;
        tmuxSessionId: string;
      };
    };
    result: null;
  };
  capture_tmux_pane: {
    args: {
      request: {
        host: string;
        user: string;
        port?: number;
        keyPath?: string;
        proxyJump?: string;
        authMethod?: "keyFile" | "password" | "agent";
        secretOwnerId?: string;
        tmuxSessionId: string;
      };
    };
    result: string;
  };
  inspect_ssh_system_context: {
    args: {
      request: {
        host: string;
        user: string;
        port?: number;
        keyPath?: string;
        proxyJump?: string;
        authMethod?: "keyFile" | "password" | "agent";
        secretOwnerId?: string;
      };
    };
    result: string;
  };
  launch_elevated_terminal: {
    args: { request: { shell: string } };
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
  start_webview_session: {
    args: { request: StartWebviewSessionRequest };
    result: WebviewSessionStarted;
  };
  update_webview_bounds: {
    args: { request: UpdateWebviewBoundsRequest };
    result: null;
  };
  set_webview_visibility: {
    args: { request: SetWebviewVisibilityRequest };
    result: null;
  };
  webview_navigate: {
    args: { request: WebviewNavigateRequest };
    result: null;
  };
  webview_reload: {
    args: { request: WebviewSimpleRequest };
    result: null;
  };
  webview_go_back: {
    args: { request: WebviewSimpleRequest };
    result: null;
  };
  webview_go_forward: {
    args: { request: WebviewSimpleRequest };
    result: null;
  };
  fill_webview_credential: {
    args: { request: FillWebviewCredentialRequest };
    result: null;
  };
  close_webview_session: {
    args: { request: WebviewSimpleRequest };
    result: null;
  };
  start_rdp_session: {
    args: { request: StartRdpSessionRequest };
    result: RdpSessionStarted;
  };
  update_rdp_bounds: {
    args: { request: UpdateRdpBoundsRequest };
    result: null;
  };
  set_rdp_visibility: {
    args: { request: SetRdpVisibilityRequest };
    result: null;
  };
  sync_rdp_display_size: {
    args: { request: SyncRdpDisplaySizeRequest };
    result: RdpDisplaySizeSync;
  };
  close_rdp_session: {
    args: { request: RdpSimpleRequest };
    result: null;
  };
  get_rdp_session_status: {
    args: { request: RdpSimpleRequest };
    result: RdpSessionStatus;
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

export async function selectKeyFile(defaultPath?: string) {
  if (!isTauriRuntime()) {
    return null;
  }

  const selectedPath = await openDialog({
    defaultPath,
    directory: false,
    multiple: false,
    title: "Select SSH key file",
  });

  return typeof selectedPath === "string" ? selectedPath : null;
}

export async function saveTextFile(defaultFilename: string, contents: string) {
  if (isTauriRuntime()) {
    try {
      const path = await saveDialog({
        defaultPath: defaultFilename,
        filters: [
          { name: "Log files", extensions: ["log"] },
          { name: "Text files", extensions: ["txt"] },
        ],
        title: "Save Buffer",
      });

      if (!path) {
        return null;
      }

      await writeTextFile(path, contents);
      return path;
    } catch (error) {
      if (!canUseBrowserSaveDialog()) {
        throw error;
      }
    }
  }

  return saveTextFileWithBrowserPicker(defaultFilename, contents);
}

async function saveTextFileWithBrowserPicker(defaultFilename: string, contents: string) {
  const picker = (window as WindowWithSavePicker).showSaveFilePicker;
  if (!picker) {
    throw new Error("No save dialog is available in this runtime");
  }

  try {
    const handle = await picker({
      suggestedName: defaultFilename,
      types: [
        {
          accept: { "text/plain": [".log", ".txt"] },
          description: "Log files",
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
    return defaultFilename;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    throw error;
  }
}

function canUseBrowserSaveDialog() {
  if (typeof window === "undefined") {
    return false;
  }

  return typeof (window as WindowWithSavePicker).showSaveFilePicker === "function";
}

export function isTauriRuntime() {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as Window & { __TAURI_INTERNALS__?: unknown })
  );
}
