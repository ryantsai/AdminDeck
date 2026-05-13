import type { ConnectionType } from "../types";
import ftpIcon from "../assets/connection-icons/ftp.png";
import rdpIcon from "../assets/connection-icons/rdp.png";
import serialIcon from "../assets/connection-icons/serial.png";
import sshIcon from "../assets/connection-icons/ssh.png";
import telnetIcon from "../assets/connection-icons/telnet.png";
import terminalIcon from "../assets/connection-icons/terminal.png";
import urlIcon from "../assets/connection-icons/url.png";
import vncIcon from "../assets/connection-icons/vnc.png";
import wslIcon from "../assets/connection-icons/wsl.png";

const CONNECTION_ICON_SRC: Record<ConnectionType, string> = {
  local: terminalIcon,
  ssh: sshIcon,
  telnet: telnetIcon,
  serial: serialIcon,
  url: urlIcon,
  rdp: rdpIcon,
  vnc: vncIcon,
  ftp: ftpIcon,
};

export function connectionIconSrcForConnection({
  iconDataUrl,
  localShell,
  type,
}: {
  iconDataUrl?: string | null;
  localShell?: string;
  type: ConnectionType;
}) {
  return type === "url" && iconDataUrl
    ? iconDataUrl
    : type === "local" && localShell === "wsl.exe"
      ? wslIcon
      : CONNECTION_ICON_SRC[type];
}

export function ConnectionIcon({
  className,
  iconDataUrl,
  localShell,
  size = 16,
  type,
}: {
  className?: string;
  iconDataUrl?: string | null;
  localShell?: string;
  size?: number;
  type: ConnectionType;
}) {
  const src = connectionIconSrcForConnection({ iconDataUrl, localShell, type });
  return (
    <img
      alt=""
      aria-hidden="true"
      className={["connection-icon-image", className].filter(Boolean).join(" ")}
      draggable={false}
      height={size}
      src={src}
      width={size}
    />
  );
}
