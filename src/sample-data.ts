import type { ConnectionGroup, FileEntry, TerminalSettings, WorkspaceTab } from "./types";

export const connectionGroups: ConnectionGroup[] = [
  {
    id: "local",
    name: "Local workspace",
    connections: [
      {
        id: "local-pwsh",
        name: "PowerShell",
        host: "localhost",
        user: "ryan",
        type: "local",
        tags: ["local", "shell"],
        status: "connected",
      },
      {
        id: "local-wsl",
        name: "WSL Ubuntu",
        host: "wsl.local",
        user: "ryan",
        type: "local",
        tags: ["local", "linux"],
        status: "idle",
      },
    ],
  },
  {
    id: "production",
    name: "Production",
    connections: [
      {
        id: "bastion-east",
        name: "Bastion East",
        host: "bastion-east.internal",
        user: "admin",
        type: "ssh",
        tags: ["prod", "ssh", "jump"],
        status: "connected",
      },
      {
        id: "files-prod",
        name: "Release Files",
        host: "files01.internal",
        user: "deploy",
        type: "sftp",
        tags: ["prod", "sftp"],
        status: "idle",
      },
    ],
  },
  {
    id: "staging",
    name: "Staging",
    connections: [
      {
        id: "api-stage",
        name: "API Stage",
        host: "api-stage.internal",
        user: "ops",
        type: "ssh",
        tags: ["stage", "api"],
        status: "offline",
      },
    ],
  },
];

export const initialTabs: WorkspaceTab[] = [];

export const defaultTerminalSettings: TerminalSettings = {
  fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.25,
  cursorStyle: "block",
  scrollbackLines: 5000,
  copyOnSelect: false,
  confirmMultilinePaste: true,
  defaultShell: "powershell.exe",
};

export const localFiles: FileEntry[] = [
  { name: "admin-deck-0.1.0.zip", kind: "file", size: "18.4 MB", modified: "10:38" },
  { name: "release-notes.md", kind: "file", size: "12 KB", modified: "10:16" },
  { name: "symbols", kind: "folder", size: "-", modified: "09:52" },
  { name: "checksums.txt", kind: "file", size: "2 KB", modified: "09:43" },
];

export const remoteFiles: FileEntry[] = [
  { name: "current", kind: "folder", size: "-", modified: "10:02" },
  { name: "incoming", kind: "folder", size: "-", modified: "09:58" },
  { name: "admin-deck-0.0.9.zip", kind: "file", size: "17.8 MB", modified: "Apr 29" },
  { name: "manifest.json", kind: "file", size: "4 KB", modified: "Apr 29" },
];

export const transferQueue = [
  { id: "upload-release", name: "admin-deck-0.1.0.zip", progress: 64 },
  { id: "download-manifest", name: "manifest.json", progress: 100 },
];

export const aiSuggestions = [
  {
    id: "disk",
    title: "Check disk pressure",
    risk: "Low risk",
    command: "Get-PSDrive -PSProvider FileSystem | Sort-Object Free -Descending",
    reason: "Reads local filesystem capacity only and does not modify files.",
  },
  {
    id: "service",
    title: "Restart staged service",
    risk: "Needs approval",
    command: "sudo systemctl restart admindeck-agent && systemctl status admindeck-agent",
    reason: "Restarts a remote service, so AdminDeck keeps it behind explicit approval.",
  },
  {
    id: "logs",
    title: "Tail recent errors",
    risk: "Low risk",
    command: "journalctl -u admindeck-agent --since '30 minutes ago' --priority=warning",
    reason: "Reads recent warning and error logs scoped to the selected service.",
  },
];
