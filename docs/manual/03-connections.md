# 03 — Connections

## AI grep hints

- Keys: `connections.*` (full namespace), `app.connectionRail`
- Topics: Connection Tree, folders, search, Quick Connect, Add Connection, rename, delete, duplicate, pin to rail, drag/drop, properties dialog
- Synonyms: "saved host", "profile", "ssh entry", "create folder", "favourites"

> **Term:** "Connection" is the canonical name for a durable openable resource. Do not use "profile", "host entry", or "saved session". A Connection only becomes a live **Session** when opened; switching Tabs does not end the Session.

## Connection kinds

| Kind | i18n label | Notes |
|------|------------|-------|
| Local terminal | `connections.localShell` | Local PTY (ConPTY/`portable_pty`). |
| SSH terminal | `connections.secureShell`, type label `connections.ssh` | Backed by the `NativeSsh` transport. May persist tmux launch prefs. |
| Telnet | `connections.telnetShell`, type label `connections.telnet` | Password terminal. |
| Serial | `connections.serialLine`, type label `connections.serial` | Serial line. |
| URL | `connections.embeddedWebApp` | Embedded WebView2. See [08-url-webview.md](08-url-webview.md). |
| RDP | `connections.windowsRdp` | Windows native via mstscax. See [09-remote-desktop.md](09-remote-desktop.md). |
| VNC | `connections.screenControl` | RFB through `vnc-rs`. |

SFTP is not a standalone Connection kind — it is opened from an SSH Connection (`terminal.openSftp`, `terminal.sftp`).

## Connections Panel UI

Header row (top of the panel):

- Title: `connections.title`
- Add Connection: `connections.addConnection`
- Quick Connect: `connections.quickConnect`
- New Folder: `connections.newFolder`
- Collapse / Expand all: `connections.collapseAll`, `connections.expandAll`
- Search box: placeholder `connections.searchPlaceholder`
- Column collapse: `connections.collapseColumn`

Tree accessible label: `connections.connectionTree`. Expand/collapse chevrons use `connections.expand` / `connections.collapse`.

## Right-click context menu (native Tauri menu)

Driven by `src/lib/nativeContextMenu.ts`. On a Connection or folder node:

- `connections.newConnection`
- `connections.newSubfolderIn` (when the right-clicked node is a folder)
- `connections.rename`, dialogs `connections.renameFolder` / `connections.renameConnection`
- `connections.delete`, confirmation copy `connections.deleteFolderConfirm` or `connections.deleteConnectionConfirm`, with caveat `connections.cannotBeUndone`
- Pin to rail: `connections.pinToRail` / `connections.unpinFromRail`. Status: `connections.pinnedToRailStatus`, `connections.unpinnedFromRailStatus`. Error: `connections.pinRailError`.
- Add to folder: `connections.addTo`
- Layout (Pane placement when opening): `connections.layout` with directions `connections.left`, `connections.right`, `connections.lower`, `connections.upper`
- `connections.properties`

Icons are rasterized to 16 px PNG bytes via `src/lib/nativeContextMenu.ts`. Do not pass raw SVG paths to Tauri menu APIs.

## Add Connection / Quick Connect dialogs

Both are app-owned DOM dialogs (not browser-native `prompt`).

**Quick Connect** (`connections.quickConnectDialog`) is an unsaved one-off draft that starts a single Session. Fields shown depend on the chosen kind:

- Hostname (`connections.hostname`, placeholder `connections.exampleHost`)
- Port (`connections.port`)
- Connect button (`connections.connect`), Cancel (`connections.cancel`)
- Permission tier toggle: `connections.normal` / `connections.admin`
- Recently used Connections list, empty state `connections.noRecent`

**Add Connection** uses the same form shape but persists to SQLite. The Type selector label is `connections.type`.

## Drag and drop

Drag a Connection onto a folder to move it; drag onto another Connection to reorder. Folders can be nested. Order is persisted.

## Status badges

Each Connection in the tree shows a live status dot when it has one or more Sessions open. The dot is derived from `withLiveConnectionStatuses` in `src/connections/treeUtils.ts` and is **display-only**. Do not pass the live-status Connection to workspace components that own Session lifecycle (TerminalWorkspace, WebViewWorkspace, RemoteDesktopWorkspace, SftpWorkspace) — they look up the stable Connection by id from the raw tree. See `src/dashboard/widgets/ConnectionWidgetBody.tsx` for the safe pattern.

## Pinned Connections on the Activity Rail

Pinning a Connection (`connections.pinToRail`) adds it to the `app.connectedConnectionsRail` group on the Activity Rail. Pinned icons survive launches; status dots reflect live Sessions. Unpinning is reversible — Connections themselves are not affected.
