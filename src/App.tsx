import {
  Bot,
  Check,
  ChevronDown,
  Circle,
  Columns2,
  Command,
  Copy,
  Database,
  Download,
  FileCode2,
  Folder,
  HardDrive,
  KeyRound,
  Laptop,
  LayoutPanelLeft,
  MoreHorizontal,
  PanelRight,
  Play,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SplitSquareHorizontal,
  Tags,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { invokeCommand } from "./lib/tauri";
import {
  aiSuggestions,
  connectionGroups,
  localFiles,
  remoteFiles,
  transferQueue,
} from "./sample-data";
import { useWorkspaceStore } from "./store";
import type { Connection, ConnectionGroup, FileEntry, WorkspaceTab } from "./types";

function App() {
  const [bootstrap, setBootstrap] = useState("Starting local runtime");

  useEffect(() => {
    invokeCommand("app_bootstrap")
      .then((result) => setBootstrap(`${result.logStatus} | ${result.storageStatus}`))
      .catch(() => setBootstrap("Frontend preview mode"));
  }, []);

  return (
    <div className="app-shell">
      <ActivityRail />
      <ConnectionSidebar />
      <main className="workspace">
        <TopBar runtimeStatus={bootstrap} />
        <TabStrip />
        <WorkspaceCanvas />
        <StatusBar />
      </main>
      <AssistantPanel />
    </div>
  );
}

function ActivityRail() {
  return (
    <nav className="activity-rail" aria-label="Primary">
      <button className="rail-button active" aria-label="Connections">
        <LayoutPanelLeft size={18} />
      </button>
      <button className="rail-button" aria-label="Terminal sessions">
        <Terminal size={18} />
      </button>
      <button className="rail-button" aria-label="SFTP browser">
        <Columns2 size={18} />
      </button>
      <button className="rail-button" aria-label="Command palette">
        <Command size={18} />
      </button>
      <button className="rail-button bottom" aria-label="Settings">
        <Settings size={18} />
      </button>
    </nav>
  );
}

function ConnectionSidebar() {
  const query = useWorkspaceStore((state) => state.query);
  const setQuery = useWorkspaceStore((state) => state.setQuery);
  const openConnection = useWorkspaceStore((state) => state.openConnection);
  const [groups, setGroups] = useState<ConnectionGroup[]>(connectionGroups);

  useEffect(() => {
    invokeCommand("list_connection_groups")
      .then(setGroups)
      .catch(() => setGroups(connectionGroups));
  }, []);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        connections: group.connections.filter((connection) =>
          [
            connection.name,
            connection.host,
            connection.user,
            connection.type,
            ...connection.tags,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.connections.length > 0);
  }, [groups, query]);

  return (
    <aside className="connection-sidebar">
      <div className="sidebar-header">
        <div>
          <p className="panel-label">AdminDeck</p>
          <h1>Connections</h1>
        </div>
        <button className="icon-button" aria-label="Add connection">
          <Plus size={16} />
        </button>
      </div>

      <label className="search-box">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search hosts, tags, folders"
        />
      </label>

      <button className="quick-connect">
        <Play size={15} />
        Quick connect
      </button>

      <div className="tree-list" aria-label="Connection tree">
        {filteredGroups.map((group) => (
          <section className="tree-group" key={group.id}>
            <button className="tree-folder">
              <ChevronDown size={14} />
              <Folder size={15} />
              <span>{group.name}</span>
              <small>{group.connections.length}</small>
            </button>
            {group.connections.map((connection) => (
              <ConnectionRow
                connection={connection}
                key={connection.id}
                onOpen={() => openConnection(connection)}
              />
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

function ConnectionRow({
  connection,
  onOpen,
}: {
  connection: Connection;
  onOpen: () => void;
}) {
  const Icon = connection.type === "local" ? Laptop : connection.type === "sftp" ? Columns2 : Server;

  return (
    <button className="connection-row" onClick={onOpen}>
      <Icon size={15} />
      <span className="connection-main">
        <strong>{connection.name}</strong>
        <small>{connection.host}</small>
      </span>
      <span className={`status-dot ${connection.status}`} />
    </button>
  );
}

function TopBar({ runtimeStatus }: { runtimeStatus: string }) {
  return (
    <header className="top-bar">
      <div className="command-search">
        <Command size={15} />
        <span>Open command palette</span>
        <kbd>Ctrl</kbd>
        <kbd>K</kbd>
      </div>
      <div className="top-actions">
        <span className="runtime-status">
          <ShieldCheck size={14} />
          {runtimeStatus}
        </span>
        <button className="icon-button" aria-label="Import SSH config" title="Import SSH config">
          <FileCode2 size={15} />
        </button>
        <button className="icon-button" aria-label="Secrets" title="Secrets">
          <KeyRound size={15} />
        </button>
      </div>
    </header>
  );
}

function TabStrip() {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);

  return (
    <div className="tab-strip" role="tablist" aria-label="Workspace tabs">
      {tabs.map((tab) => (
        <button
          className={tab.id === activeTabId ? "tab active" : "tab"}
          key={tab.id}
          onClick={() => activateTab(tab.id)}
          role="tab"
          aria-selected={tab.id === activeTabId}
        >
          {tab.kind === "sftp" ? <Columns2 size={14} /> : <Terminal size={14} />}
          <span>{tab.title}</span>
          <X
            className="tab-close"
            size={13}
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
          />
        </button>
      ))}
      <button className="new-tab" aria-label="New local terminal">
        <Plus size={15} />
      </button>
    </div>
  );
}

function WorkspaceCanvas() {
  const activeTab = useWorkspaceStore((state) =>
    state.tabs.find((tab) => tab.id === state.activeTabId),
  );

  if (!activeTab) {
    return (
      <section className="empty-workspace">
        <Terminal size={28} />
        <h2>No active session</h2>
        <p>Open a local terminal, SSH connection, or SFTP browser from the tree.</p>
      </section>
    );
  }

  if (activeTab.kind === "sftp") {
    return <SftpWorkspace tab={activeTab} />;
  }

  return <TerminalWorkspace tab={activeTab} />;
}

function TerminalWorkspace({ tab }: { tab: WorkspaceTab }) {
  return (
    <section className="terminal-workspace">
      <div className="workspace-toolbar">
        <div>
          <strong>{tab.title}</strong>
          <span>{tab.subtitle}</span>
        </div>
        <div className="toolbar-cluster">
          <button className="icon-button" aria-label="Split terminal">
            <SplitSquareHorizontal size={15} />
          </button>
          <button className="icon-button" aria-label="Copy terminal selection">
            <Copy size={15} />
          </button>
          <button className="icon-button" aria-label="More terminal actions">
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>

      <div className="terminal-grid">
        {tab.panes.map((pane) => (
          <article className="terminal-pane" key={pane.id}>
            <header>
              <span>
                <Circle size={9} fill="currentColor" />
                {pane.title}
              </span>
              <small>{pane.cwd}</small>
            </header>
            <pre>
              <code>{pane.buffer}</code>
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function SftpWorkspace({ tab }: { tab: WorkspaceTab }) {
  return (
    <section className="sftp-workspace">
      <div className="workspace-toolbar">
        <div>
          <strong>{tab.title}</strong>
          <span>{tab.subtitle}</span>
        </div>
        <div className="toolbar-cluster">
          <button className="toolbar-button">
            <Upload size={15} />
            Upload
          </button>
          <button className="toolbar-button">
            <Download size={15} />
            Download
          </button>
        </div>
      </div>

      <div className="file-manager">
        <FilePane title="Local" path="C:\\Users\\ryan\\deployments" files={localFiles} />
        <FilePane title="Remote" path="/srv/admin-deck/releases" files={remoteFiles} />
      </div>

      <div className="transfer-queue">
        <header>
          <strong>Transfer queue</strong>
          <span>{transferQueue.length} active</span>
        </header>
        {transferQueue.map((transfer) => (
          <div className="transfer-row" key={transfer.id}>
            <span>{transfer.name}</span>
            <progress value={transfer.progress} max="100" />
            <small>{transfer.progress}%</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilePane({
  title,
  path,
  files,
}: {
  title: string;
  path: string;
  files: FileEntry[];
}) {
  return (
    <article className="file-pane">
      <header>
        <div>
          <strong>{title}</strong>
          <span>{path}</span>
        </div>
        <button className="icon-button" aria-label={`Refresh ${title.toLowerCase()} files`}>
          <MoreHorizontal size={15} />
        </button>
      </header>
      <div className="file-table">
        {files.map((file) => (
          <div className="file-row" key={file.name}>
            {file.kind === "folder" ? <Folder size={15} /> : <FileCode2 size={15} />}
            <span>{file.name}</span>
            <small>{file.size}</small>
            <small>{file.modified}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function AssistantPanel() {
  const [selectedSuggestion, setSelectedSuggestion] = useState(aiSuggestions[0].id);
  const suggestion = aiSuggestions.find((item) => item.id === selectedSuggestion) ?? aiSuggestions[0];

  return (
    <aside className="assistant-panel">
      <div className="assistant-header">
        <div>
          <p className="panel-label">Command assist</p>
          <h2>Ask before execute</h2>
        </div>
        <PanelRight size={17} />
      </div>

      <div className="assistant-context">
        <Bot size={16} />
        <span>Scoped to active session output. No command runs without approval.</span>
      </div>

      <div className="suggestion-list">
        {aiSuggestions.map((item) => (
          <button
            className={item.id === selectedSuggestion ? "suggestion active" : "suggestion"}
            key={item.id}
            onClick={() => setSelectedSuggestion(item.id)}
          >
            <span>{item.title}</span>
            <small>{item.risk}</small>
          </button>
        ))}
      </div>

      <section className="approval-card">
        <header>
          <span>Proposed command</span>
          <strong>{suggestion.risk}</strong>
        </header>
        <pre>
          <code>{suggestion.command}</code>
        </pre>
        <p>{suggestion.reason}</p>
        <div className="approval-actions">
          <button className="toolbar-button">
            <X size={15} />
            Reject
          </button>
          <button className="approve-button">
            <Check size={15} />
            Approve
          </button>
        </div>
      </section>

      <section className="settings-stack">
        <div>
          <Database size={15} />
          <span>SQLite profiles</span>
          <strong>Planned</strong>
        </div>
        <div>
          <KeyRound size={15} />
          <span>OS keychain</span>
          <strong>Planned</strong>
        </div>
        <div>
          <Tags size={15} />
          <span>OpenAI-compatible endpoint</span>
          <strong>BYO key</strong>
        </div>
      </section>
    </aside>
  );
}

function StatusBar() {
  return (
    <footer className="status-bar">
      <span>
        <HardDrive size={13} />
        Local-first
      </span>
      <span>Telemetry off</span>
      <span>Windows acceptance target</span>
    </footer>
  );
}

export default App;
