import { ConnectionIcon } from "./ConnectionIcon";
import { connectionSubtitle as describeConnection, connectionTypeLabel } from "./utils";
import i18next from "../i18n/config";
import type { Connection, ConnectionType } from "../types";

export function connectionTypeSubtitle(type: ConnectionType) {
  switch (type) {
    case "local":
      return i18next.t("connections.localShell");
    case "ssh":
      return i18next.t("connections.secureShell");
    case "telnet":
      return i18next.t("connections.telnetShell");
    case "serial":
      return i18next.t("connections.serialLine");
    case "url":
      return i18next.t("connections.embeddedWebApp");
    case "rdp":
      return i18next.t("connections.windowsRdp");
    case "vnc":
      return i18next.t("connections.screenControl");
  }
}

export function connectionTypeTitle(type: ConnectionType) {
  return connectionTypeLabel(type);
}

export function connectionSubtitle(connection: Connection) {
  return describeConnection(connection);
}

export function ConnectionTypeGlyph({
  className,
  size = 16,
  type,
}: {
  className?: string;
  size?: number;
  type: ConnectionType;
}) {
  return <ConnectionIcon className={className} size={size} type={type} />;
}

export function ConnectionGlyph({
  className,
  iconBackgroundColor,
  iconDataUrl,
  localShell,
  size = 16,
  type,
}: {
  className?: string;
  iconBackgroundColor?: string | null;
  iconDataUrl?: string | null;
  localShell?: string;
  size?: number;
  type: ConnectionType;
}) {
  return (
    <ConnectionIcon
      className={className}
      iconBackgroundColor={iconBackgroundColor}
      iconDataUrl={iconDataUrl}
      localShell={localShell}
      size={size}
      type={type}
    />
  );
}
