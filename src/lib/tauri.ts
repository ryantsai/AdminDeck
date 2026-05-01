import { invoke } from "@tauri-apps/api/core";
import type {
  AppBootstrap,
  Connection,
  ConnectionGroup,
  CreateConnectionFolderRequest,
  CreateConnectionRequest,
  DuplicateConnectionRequest,
  KeychainStatus,
  MoveConnectionFolderRequest,
  MoveConnectionRequest,
  RenameConnectionFolderRequest,
  RenameConnectionRequest,
  SecretPresence,
  SecretReferenceRequest,
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
  shell?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalSessionStarted {
  sessionId: string;
}

export interface TerminalOutput {
  sessionId: string;
  data: string;
}

type CommandMap = {
  app_bootstrap: {
    args: undefined;
    result: AppBootstrap;
  };
  list_connection_groups: {
    args: undefined;
    result: ConnectionGroup[];
  };
  create_connection: {
    args: { request: CreateConnectionRequest };
    result: Connection;
  };
  create_connection_folder: {
    args: { request: CreateConnectionFolderRequest };
    result: ConnectionGroup;
  };
  rename_connection_folder: {
    args: { request: RenameConnectionFolderRequest };
    result: ConnectionGroup;
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
    result: ConnectionGroup[];
  };
  move_connection: {
    args: { request: MoveConnectionRequest };
    result: ConnectionGroup[];
  };
  get_terminal_settings: {
    args: undefined;
    result: TerminalSettings;
  };
  update_terminal_settings: {
    args: { request: TerminalSettings };
    result: TerminalSettings;
  };
  keychain_status: {
    args: undefined;
    result: KeychainStatus;
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
    args: { request: { sessionId: string; cols: number; rows: number } };
    result: null;
  };
  close_terminal_session: {
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
