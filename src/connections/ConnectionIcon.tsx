import type { ConnectionType } from "../types";
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
};

export function ConnectionIcon({
  className,
  localShell,
  size = 16,
  type,
}: {
  className?: string;
  localShell?: string;
  size?: number;
  type: ConnectionType;
}) {
  const src =
    type === "local" && localShell === "wsl.exe"
      ? wslIcon
      : CONNECTION_ICON_SRC[type];
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
