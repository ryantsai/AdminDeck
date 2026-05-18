# 02 — App Layout

## AI grep hints

- Keys: `app.primaryNav`, `app.connectionRail`, `app.connectedConnectionsRail`, `app.resizeConnections`, `app.resizeAiAssistant`, `app.openConnectedConnection`, `app.openPinnedConnection`, `workspace.workspaceSurface`, `workspace.hostUsage`
- Topics: Activity Rail, panel resize, pinned Connections on the rail, Connections panel collapse, AI Assistant panel collapse
- Synonyms: "left bar", "sidebar", "right panel", "AI sidebar", "make panel wider", "hide the AI panel"

## Activity Rail (48 px, left edge)

Vertical icon bar. Owned by `src/app/`. Always visible. Sections, top to bottom:

1. **Built-in modules** — Workspace, Dashboard, File Explorer, Wiki.
2. **Connection Rail** (`app.connectionRail`) — a divider group `app.connectedConnectionsRail` that shows:
   - Pinned Connections (kept across launches; pin from the Connection Tree right-click menu, `connections.pinToRail`).
   - Connections that currently have at least one live Session.
   Each icon's tooltip uses `app.openPinnedConnection` or `app.openConnectedConnection` with the Connection name interpolated as `{{name}}`.
3. **Settings** — anchored to the bottom of the rail.

The whole rail uses `app.primaryNav` as its accessible label. Tooltips come from `RailTooltip` (delayed hover/focus). Native `title` tooltips are forbidden here.

Non-Workspace pages (Dashboard, App Launcher, File Explorer, Settings, Wiki) stay inset from the 48 px rail so its hover tooltips keep working while those pages are active.

## Connections Panel (left, inside Workspace module)

Resizable. Collapsed/expanded state persists across launches. See [03-connections.md](03-connections.md) for the tree itself.

- Collapse: `connections.collapseColumn`
- Resize handle: `app.resizeConnections`

The panel only appears inside the Workspace module. Switching to Dashboard, File Explorer, Wiki, or Settings replaces this region with that module's own content.

## Workspace Canvas (centre)

The active built-in module owns this area. Each module renders its own layout inside it. For the Workspace module specifically, the Canvas contains the Tab Strip and active Tab content (terminal, SFTP, WebView, RDP, VNC, Pane splits). See [04-workspace-tabs-panes.md](04-workspace-tabs-panes.md).

Accessibility label: `workspace.workspaceSurface`. Per-Connection-kind labels use `workspace.connectionKind` with the kind interpolated.

## AI Assistant Panel (right)

Resizable, collapsible. State is workspace-wide — the same width and collapsed state apply across all Tabs.

- Title: `ai.title`
- Collapse: `ai.collapsePanel`
- Resize handle: `app.resizeAiAssistant`

Panel internals are covered in [13-ai-assistant.md](13-ai-assistant.md).

## Status Bar (bottom)

Owned by `src/workspace/StatusBar.tsx`. Two roles:

1. **Host usage metrics** (left side):
   - `workspace.cpu` / `workspace.cpuUsage`
   - `workspace.ram` / `workspace.ramUsage` / `workspace.memory`
   - `workspace.network` / `workspace.networkUsage`, broken into `workspace.networkDownstream` and `workspace.networkUpstream`
   - Timing readouts: `workspace.uiReady`, `workspace.localReady`, `workspace.sshReady` (and `…TimingPending` siblings).
2. **Transient notifications** — driven by the shared `showWorkspaceStatus` store action. Success messages default to 5 seconds, then fade. Do not implement one-off toast surfaces; route through `showWorkspaceStatus`.

## Workspace chrome resize behaviour

Both side panels can be dragged to any width within their minimum/maximum. The drag divider shows a thin blue full-height indicator after the pointer rests on it briefly, using resize handles `app.resizeConnections` and `app.resizeAiAssistant`. Widths persist immediately to settings. There is no "reset layout" affordance inside the chrome itself; resetting layout is a Settings action (`settings.resetLayout`, see [15-settings.md](15-settings.md) §Appearance).
