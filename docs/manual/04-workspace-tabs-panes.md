# 04 — Workspace, Tabs, and Panes

## AI grep hints

- Keys: `workspace.tabs`, `workspace.newTab`, `workspace.closeTab`, `workspace.noActiveSession`, `workspace.openFromTree`, `workspace.terminalPane`, `workspace.sftpBrowser`, `workspace.webview`, `terminal.splitLayout`, `terminal.splitRight`, `terminal.splitLeft`, `terminal.splitDown`, `terminal.splitUp`, `terminal.closePane`, `terminal.closePaneTitle`, `terminal.focusPane`, `terminal.openLeft`, `terminal.openRight`, `terminal.openAbove`, `terminal.openBelow`
- Topics: tab strip, new tab, close tab, drag tabs, split panes, focus pane
- Synonyms: "split view", "open side by side", "horizontal split", "new pane"

## Tab Strip

Horizontal row above the Workspace Canvas. Accessible label `workspace.tabs`. Scroll affordances: `workspace.scrollTabsLeft`, `workspace.scrollTabsRight`. Per-tab close label uses `workspace.closeTab` with the tab title interpolated as `{{title}}`.

A new tab opens via:

- Opening a Connection from the tree (`workspace.openFromTree`).
- The `workspace.newTab` button.
- Quick Connect.
- "Open in pane" from the rail (`app.openConnectedConnection`).

Empty state (no Tabs open) shows `workspace.noActiveSession` over the Default Launch State.

## Tab right-click menu

Native Tauri context menu (`src/lib/nativeContextMenu.ts`). Items vary by Tab kind but typically include rename, close, and split actions. Tab drag/drop reorders Tabs.

## Panes

A Tab subdivides into Panes. Each Pane is a single terminal surface or workspace view. Panes are arranged in a recursive split tree.

### Splitting

From the Pane toolbar `terminal.splitLayout`:

- `terminal.splitRight`, `terminal.splitLeft`, `terminal.splitUp`, `terminal.splitDown`.

When opening a Connection from the tree with a target Pane focused, the `connections.layout` submenu (`connections.left`, `connections.right`, `connections.upper`, `connections.lower`) controls placement. Tmux session menus offer `terminal.openLeft`, `terminal.openRight`, `terminal.openAbove`, `terminal.openBelow` for spawning attached Panes (see [06-ssh-and-tmux.md](06-ssh-and-tmux.md)).

### Focus

`terminal.focusPane` switches the active Pane. Pane focus follows mouse click and keyboard tab cycling. Terminal Panes use xterm.js, which is backed by a hidden textarea — WebView2 focus quirks can affect input. Validate focus behaviour with the real Tauri runtime, not a browser preview.

### Closing

`terminal.closePane` / `terminal.closePaneTitle` closes a single Pane. Closing the last Pane in a Tab closes the Tab. Closing the last Tab returns to the Default Launch State.

> A Session ends only when its presenting Tab/Pane is explicitly closed or the remote/process ends itself. Switching Tabs does **not** end Sessions. Quiet SSH Sessions stay connected indefinitely — there is no app-side idle timeout.

## Pane content types

Each Pane renders one of:

- `workspace.terminalPane` — terminal (local, SSH, Telnet, Serial). See [05-terminal.md](05-terminal.md).
- `workspace.sftpBrowser` — SFTP dual-pane browser. See [07-sftp.md](07-sftp.md).
- `workspace.webview` — URL Connection (WebView2). See [08-url-webview.md](08-url-webview.md).
- RDP / VNC surface (`remoteDesktop.session`). See [09-remote-desktop.md](09-remote-desktop.md).

## Sending content to the AI Assistant

From a Pane right-click menu:

- `terminal.copySelection` — copy current xterm selection.
- `terminal.sendToAi` — push selection or full buffer into the AI Assistant input. Status: `ai.addedToPane`.
- `terminal.terminalSelection` / `terminal.terminalBuffer` — chooses between the selection or full scrollback.

Screenshot capture from a Pane is covered in [14-screenshots.md](14-screenshots.md).
