import { ChevronDown, Download, Server, Terminal } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConnectionGlyph, ConnectionTypeGlyph, connectionSubtitle } from "./ConnectionGlyph";
import { uniqueRuntimeId, type LocalShellOption } from "./utils";
import type { Connection, ConnectionType, SshSettings } from "../types";

export function QuickConnectMenu({
  recentConnections,
  shellOptions,
  sshSettings,
  onOpenConnection,
  onOpenElevatedShell,
  onOpenLocalShell,
  onOpenSsh,
}: {
  recentConnections: Connection[];
  shellOptions: LocalShellOption[];
  sshSettings: SshSettings;
  onOpenConnection: (connection: Connection) => void;
  onOpenElevatedShell: (option: LocalShellOption) => void;
  onOpenLocalShell: (option: LocalShellOption) => void;
  onOpenSsh: (connection: Connection) => void;
}) {
  const [sshDialogOpen, setSshDialogOpen] = useState(false);
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState(String(sshSettings.defaultPort));
  const { t } = useTranslation();
  const normalizedSshPort = Number(sshPort || sshSettings.defaultPort);
  const canSubmitSsh =
    Boolean(sshHost.trim()) &&
    Number.isInteger(normalizedSshPort) &&
    normalizedSshPort >= 1 &&
    normalizedSshPort <= 65535;

  function handleSshSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const host = sshHost.trim();
    if (!canSubmitSsh) {
      return;
    }

    onOpenSsh({
      id: uniqueRuntimeId("quick"),
      name: host,
      host,
      user: sshSettings.defaultUser,
      port: normalizedSshPort,
      authMethod: "agent",
      type: "ssh",
      useTmuxSessions: false,
      status: "idle",
    });
  }

  return (
    <div className="quick-connect-menu" role="dialog" aria-label={t("connections.quickConnectDialog")}>
      {sshDialogOpen ? (
        <form className="quick-connect-mini-dialog" onSubmit={handleSshSubmit}>
          <label>
            <span>{t("connections.hostname")}</span>
            <input
              autoFocus
              onChange={(event) => setSshHost(event.currentTarget.value)}
              placeholder={t("connections.exampleHost")}
              required
              value={sshHost}
            />
          </label>
          <label>
            <span>{t("connections.port")}</span>
            <input
              inputMode="numeric"
              max="65535"
              min="1"
              onChange={(event) => setSshPort(event.currentTarget.value)}
              placeholder={String(sshSettings.defaultPort)}
              type="number"
              value={sshPort}
            />
          </label>
          <div className="quick-connect-mini-actions">
            <button disabled={!canSubmitSsh} type="submit">
              {t("connections.connect")}
            </button>
            <button onClick={() => setSshDialogOpen(false)} type="button">
              {t("connections.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setSshDialogOpen(true)} type="button">
          <Server size={15} />
          <span>{t("connections.ssh")}</span>
        </button>
      )}
      {shellOptions.map((option) =>
        option.canElevate ? (
          <div className="quick-connect-submenu" key={option.value ?? option.label}>
            <button aria-haspopup="menu" onClick={() => onOpenLocalShell(option)} type="button">
              <Terminal size={15} />
              <span>{option.label}</span>
              <ChevronDown size={13} />
            </button>
            <div className="quick-connect-submenu-panel">
              <button onClick={() => onOpenLocalShell(option)} type="button">
                {t("connections.normal")}
              </button>
              <button onClick={() => onOpenElevatedShell(option)} type="button">
                {t("connections.admin")}
              </button>
            </div>
          </div>
        ) : (
          <button
            key={option.value ?? option.label}
            onClick={() => onOpenLocalShell(option)}
            type="button"
          >
            <Terminal size={15} />
            <span>{option.label}</span>
          </button>
        ),
      )}
      <div className="quick-connect-menu-separator" aria-hidden="true" />
      {recentConnections.length > 0 ? (
        recentConnections.map((connection) => (
          <button
            key={connection.id}
            onClick={() => onOpenConnection(connection)}
            type="button"
          >
            <ConnectionGlyph localShell={connection.localShell} size={15} type={connection.type} />
            <span className="connection-main">
              <strong>{connection.name}</strong>
              <small>{connectionSubtitle(connection)}</small>
            </span>
            <span className={`status-dot ${connection.status}`} />
          </button>
        ))
      ) : (
        <button disabled type="button">
          <Server size={15} />
          <span>{t("connections.noRecent")}</span>
        </button>
      )}
    </div>
  );
}

export function AddConnectionMenu({
  onImportRequested,
  onSelectType,
}: {
  onImportRequested: () => void;
  onSelectType: (connectionType: ConnectionType) => void;
}) {
  const { t } = useTranslation();
  const connectionTypeOptions: Array<{
    type: ConnectionType;
    title: string;
  }> = [
    {
      type: "local",
      title: t("connections.localTerminal"),
    },
    {
      type: "ssh",
      title: t("connections.ssh"),
    },
    {
      type: "telnet",
      title: t("connections.telnet"),
    },
    {
      type: "serial",
      title: t("connections.serial"),
    },
    {
      type: "url",
      title: t("connections.url"),
    },
    {
      type: "rdp",
      title: t("connections.rdp"),
    },
    {
      type: "vnc",
      title: t("connections.vnc"),
    },
  ];

  return (
    <div className="add-connection-menu" role="menu" aria-label={t("connections.addConnection")}>
      {connectionTypeOptions.map((option) => (
        <button key={option.type} onClick={() => onSelectType(option.type)} role="menuitem" type="button">
          <ConnectionTypeGlyph className="menu-item-icon" size={15} type={option.type} />
          <span className="connection-main">
            <strong>{option.title}</strong>
          </span>
        </button>
      ))}
      <div className="quick-connect-menu-separator" aria-hidden="true" />
      <button onClick={onImportRequested} role="menuitem" type="button">
        <Download className="menu-item-icon" size={15} />
        <span className="connection-main">
          <strong>{t("connections.import.tileTitle")}</strong>
        </span>
      </button>
    </div>
  );
}
