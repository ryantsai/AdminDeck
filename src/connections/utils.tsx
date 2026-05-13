import { Cable, FolderInput, Globe2, Laptop, Monitor, Mouse, Network, Server } from "lucide-react";
import { invokeCommand, type SshHostKeyPreview } from "../lib/tauri";
import i18next from "../i18n/config";
import type { Connection, ConnectionType, SshSettings, WorkspaceTab } from "../types";

const WINDOWS_LOCAL_SHELL_OPTIONS = [
  { labelKey: "settings.powerShell", value: "powershell.exe" },
  { labelKey: "settings.commandPrompt", value: "cmd.exe" },
  { labelKey: "settings.wsl", value: "wsl.exe" },
];

export type LocalShellOption = {
  canElevate?: boolean;
  label: string;
  value?: string;
};

function isWindowsPlatform() {
  if (typeof navigator === "undefined") {
    return true;
  }

  return /windows/i.test(`${navigator.userAgent} ${navigator.platform}`);
}

export function localShellOptionsForPlatform(): LocalShellOption[] {
  if (!isWindowsPlatform()) {
    return [{ label: i18next.t("workspace.terminal") }];
  }

  return [
    { canElevate: true, label: i18next.t("settings.commandPrompt"), value: "cmd.exe" },
    ...WINDOWS_LOCAL_SHELL_OPTIONS.filter((option) => option.value !== "cmd.exe").map((option) => ({
      label: i18next.t(option.labelKey),
      value: option.value,
      canElevate: option.value === "powershell.exe",
    })),
  ];
}

export function uniqueRuntimeId(prefix: string) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

export function isRemoteDesktopConnectionType(type: ConnectionType) {
  return type === "rdp" || type === "vnc";
}

export function defaultPortForConnectionType(type: ConnectionType, sshSettings: SshSettings) {
  if (type === "rdp") {
    return 3389;
  }
  if (type === "vnc") {
    return 5900;
  }
  if (type === "telnet") {
    return 23;
  }
  if (type === "ftp") {
    return 21;
  }
  return sshSettings.defaultPort;
}

export function ftpPortForProtocolSelection(
  protocol: string,
  currentPort: string,
  tlsMode = "explicit",
) {
  const trimmedPort = currentPort.trim();
  if (trimmedPort && trimmedPort !== "21") {
    return Number(trimmedPort);
  }
  if (protocol === "sftp") {
    return 22;
  }
  if (protocol === "ftps" && tlsMode === "implicit") {
    return 990;
  }
  return 21;
}

export function connectionTypeLabel(type: ConnectionType) {
  switch (type) {
    case "local":
      return i18next.t("connections.localTerminal");
    case "ssh":
      return i18next.t("connections.sshTerminal");
    case "telnet":
      return i18next.t("connections.telnet");
    case "serial":
      return i18next.t("connections.serial");
    case "url":
      return i18next.t("connections.url");
    case "rdp":
      return i18next.t("connections.rdp");
    case "vnc":
      return i18next.t("connections.vnc");
    case "ftp":
      return i18next.t("connections.ftp");
  }
}

export function connectionSubtitle(connection: Connection) {
  if (connection.type === "local") {
    return connection.host;
  }
  if (connection.type === "url") {
    return connection.url ?? connection.host;
  }
  if (connection.type === "serial") {
    return `${connection.serialLine ?? connection.host} @ ${connection.serialSpeed ?? 9600}`;
  }
  const address = connection.port ? `${connection.host}:${connection.port}` : connection.host;
  if (connection.user) {
    return `${connection.user}@${address}`;
  }
  return address;
}

export function connectionToolbarTitle(connection: Connection) {
  if (connection.type === "url") {
    return connection.name;
  }
  if (connection.type === "serial") {
    return connection.serialLine?.trim() || connection.host || connection.name;
  }
  if (connection.type === "local") {
    return localTerminalToolbarTitle(connection);
  }
  return connection.port ? `${connection.host}:${connection.port}` : connection.host;
}

function localTerminalToolbarTitle(connection: Connection) {
  const shell = connection.localShell?.trim();
  const normalizedShell = shell?.toLowerCase() ?? "";
  if (normalizedShell.endsWith("cmd.exe") || normalizedShell === "cmd") {
    return i18next.t("settings.commandPrompt");
  }
  if (
    normalizedShell.endsWith("powershell.exe") ||
    normalizedShell === "powershell" ||
    normalizedShell.endsWith("pwsh.exe") ||
    normalizedShell === "pwsh"
  ) {
    return i18next.t("settings.powerShell");
  }
  if (normalizedShell.endsWith("wsl.exe") || normalizedShell === "wsl") {
    return i18next.t("settings.wsl");
  }
  return shell || connection.name;
}

export function connectionIconForType(type: ConnectionType) {
  switch (type) {
    case "local":
      return Laptop;
    case "url":
      return Globe2;
    case "rdp":
      return Monitor;
    case "vnc":
      return Mouse;
    case "telnet":
      return Network;
    case "serial":
      return Cable;
    case "ssh":
      return Server;
    case "ftp":
      return FolderInput;
  }
}

export function connectionTypeForTab(tab: WorkspaceTab): {
  type: ConnectionType;
  iconDataUrl?: string | null;
  localShell?: string;
} {
  if (tab.connection) {
    return {
      type: tab.connection.type,
      iconDataUrl: tab.connection.iconDataUrl,
      localShell: tab.connection.localShell,
    };
  }
  return { type: "local" };
}


export function workspaceKindLabel(tab: WorkspaceTab) {
  switch (tab.kind) {
    case "sftp":
      return i18next.t("workspace.sftpBrowser");
    case "webview":
      return i18next.t("workspace.webview");
    case "remoteDesktop":
      return i18next.t("workspace.connectionKind", {
        type: connectionTypeLabel(tab.connection?.type ?? "rdp"),
      });
    case "terminal":
      if (tab.panes.length > 1) {
        return i18next.t("workspace.workspace");
      }
      if (tab.panes[0]?.kind === "webview") {
        return i18next.t("workspace.webview");
      }
      if (tab.panes[0]?.kind === "remoteDesktop") {
        return i18next.t("workspace.connectionKind", {
          type: connectionTypeLabel(tab.panes[0].connection.type),
        });
      }
      return i18next.t("workspace.terminal");
  }
}

export function usesNativeSshHostKeyVerification(connection: Connection) {
  return (
    connection.type === "ssh" &&
    (Boolean(connection.keyPath?.trim()) ||
      Boolean(connection.hasPassword) ||
      connection.authMethod === "password" ||
      connection.authMethod === "agent") &&
    !connection.proxyJump?.trim()
  );
}

export async function confirmTrustedSshHostKey(preview: SshHostKeyPreview) {
  if (preview.status === "trusted") {
    return;
  }

  if (preview.status === "changed") {
    throw new Error(
      i18next.t("terminal.sshHostKeyChangeDetail", {
        host: `${preview.host}:${preview.port}`,
        algorithm: preview.algorithm,
        fingerprint: preview.fingerprint,
      }),
    );
  }

  const shouldTrust = window.confirm(
    `${i18next.t("terminal.trustHostKey")} ${preview.host}:${preview.port}\n\n${preview.algorithm} ${preview.fingerprint}`,
  );
  if (!shouldTrust) {
    throw new Error(i18next.t("terminal.hostKeyNotTrusted"));
  }

  await invokeCommand("trust_ssh_host_key", {
    request: {
      host: preview.host,
      port: preview.port,
      publicKey: preview.publicKey,
    },
  });
}
