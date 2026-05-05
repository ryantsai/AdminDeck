import type { ConnectionType } from "../types";
import rdpIcon from "../assets/connection-icons/rdp.png";
import serialIcon from "../assets/connection-icons/serial.png";
import sshIcon from "../assets/connection-icons/ssh.png";
import telnetIcon from "../assets/connection-icons/telnet.png";
import terminalIcon from "../assets/connection-icons/terminal.png";
import urlIcon from "../assets/connection-icons/url.png";
import vncIcon from "../assets/connection-icons/vnc.png";

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
  size = 16,
  type,
}: {
  className?: string;
  size?: number;
  type: ConnectionType;
}) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={["connection-icon-image", className].filter(Boolean).join(" ")}
      draggable={false}
      height={size}
      src={CONNECTION_ICON_SRC[type]}
      width={size}
    />
  );
}
