import type { Connection, ConnectionFolder, ConnectionStatus, ConnectionTree } from "../types";

export function upsertRootConnection(tree: ConnectionTree, connection: Connection): ConnectionTree {
  const withoutConnection = removeConnectionFromTree(tree, connection.id);
  return {
    ...withoutConnection,
    connections: [connection, ...withoutConnection.connections],
  };
}

// Display-only. Each connection is shallow-cloned to attach `status`, so the
// returned tree has fresh references on every `activeSessionCounts` change.
// Never feed the result into a workspace component (Terminal/WebView/RDP/VNC/
// SFTP) — `TerminalWorkspace`'s session `useEffect` depends on `pane.connection`
// and reference churn drives an unbounded mount/unmount loop. Look up the raw
// `Connection` by `id` from the un-augmented tree when handing it to a
// workspace; see `AGENTS.md` and `ConnectionWidgetBody.tsx`.
export function withLiveConnectionStatuses(
  tree: ConnectionTree,
  activeSessionCounts: Record<string, number>,
): ConnectionTree {
  return {
    connections: tree.connections.map((connection) => ({
      ...connection,
      status: liveConnectionStatus(connection.id, activeSessionCounts),
    })),
    folders: tree.folders.map((folder) => withLiveFolderStatuses(folder, activeSessionCounts)),
  };
}

function withLiveFolderStatuses(
  folder: ConnectionFolder,
  activeSessionCounts: Record<string, number>,
): ConnectionFolder {
  return {
    ...folder,
    connections: folder.connections.map((connection) => ({
      ...connection,
      status: liveConnectionStatus(connection.id, activeSessionCounts),
    })),
    folders: folder.folders.map((childFolder) =>
      withLiveFolderStatuses(childFolder, activeSessionCounts),
    ),
  };
}

function removeConnectionFromTree(tree: ConnectionTree, connectionId: string): ConnectionTree {
  return {
    connections: tree.connections.filter((connection) => connection.id !== connectionId),
    folders: tree.folders.map((folder) => removeConnectionFromFolder(folder, connectionId)),
  };
}

function removeConnectionFromFolder(
  folder: ConnectionFolder,
  connectionId: string,
): ConnectionFolder {
  return {
    ...folder,
    connections: folder.connections.filter((connection) => connection.id !== connectionId),
    folders: folder.folders.map((childFolder) =>
      removeConnectionFromFolder(childFolder, connectionId),
    ),
  };
}

export function filterConnectionTree(tree: ConnectionTree, normalizedQuery: string): ConnectionTree {
  return {
    connections: tree.connections.filter((connection) =>
      connectionMatchesQuery(connection, normalizedQuery),
    ),
    folders: tree.folders
      .map((folder) => filterConnectionFolder(folder, normalizedQuery))
      .filter((folder): folder is ConnectionFolder => Boolean(folder)),
  };
}

function filterConnectionFolder(
  folder: ConnectionFolder,
  normalizedQuery: string,
): ConnectionFolder | null {
  const folderMatches = folder.name.toLowerCase().includes(normalizedQuery);
  const connections = folderMatches
    ? folder.connections
    : folder.connections.filter((connection) => connectionMatchesQuery(connection, normalizedQuery));
  const folders = folder.folders
    .map((childFolder) => filterConnectionFolder(childFolder, normalizedQuery))
    .filter((childFolder): childFolder is ConnectionFolder => Boolean(childFolder));

  if (!folderMatches && connections.length === 0 && folders.length === 0) {
    return null;
  }

  return {
    ...folder,
    connections,
    folders: folderMatches ? folder.folders : folders,
  };
}

function connectionMatchesQuery(connection: Connection, normalizedQuery: string) {
  return [connection.name, connection.host, connection.user, connection.type]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function flattenConnections(tree: ConnectionTree): Connection[] {
  return [
    ...tree.connections,
    ...tree.folders.flatMap((folder) => flattenFolderConnections(folder)),
  ];
}

function flattenFolderConnections(folder: ConnectionFolder): Connection[] {
  return [
    ...folder.connections,
    ...folder.folders.flatMap((childFolder) => flattenFolderConnections(childFolder)),
  ];
}

export function flattenFolders(
  folders: ConnectionFolder[],
  level = 0,
): Array<{ folder: ConnectionFolder; level: number }> {
  return folders.flatMap((folder) => [
    { folder, level },
    ...flattenFolders(folder.folders, level + 1),
  ]);
}

export function collectConnectionFolderIds(folders: ConnectionFolder[]): string[] {
  return folders.flatMap((folder) => [folder.id, ...collectConnectionFolderIds(folder.folders)]);
}

export function countConnections(folder: ConnectionFolder): number {
  return (
    folder.connections.length +
    folder.folders.reduce((total, childFolder) => total + countConnections(childFolder), 0)
  );
}

export function countFolders(folders: ConnectionFolder[]): number {
  return folders.reduce(
    (total, folder) => total + 1 + countFolders(folder.folders),
    0,
  );
}

function liveConnectionStatus(
  connectionId: string,
  activeSessionCounts: Record<string, number>,
): ConnectionStatus {
  return activeSessionCounts[connectionId] ? "connected" : "idle";
}
