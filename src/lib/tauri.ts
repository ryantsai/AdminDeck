import { invoke } from "@tauri-apps/api/core";
import type {
  AppBootstrap,
  Connection,
  ConnectionGroup,
  CreateConnectionRequest,
  DuplicateConnectionRequest,
  KeychainStatus,
  RenameConnectionRequest,
  SecretPresence,
  SecretReferenceRequest,
  StoreSecretRequest,
} from "../types";

export interface StartTerminalSessionRequest {
  sessionId?: string;
  title: string;
  type: "local" | "ssh";
  host: string;
  user: string;
  port?: number;
  keyPath?: string;
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
  return invoke<CommandMap[Name]["result"]>(name, args);
}
