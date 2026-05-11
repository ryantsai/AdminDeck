# KKTerm Context

KKTerm is a local-first desktop administration workspace for terminal, SSH, SFTP, and approval-based command assistance workflows. This context captures the product language used to keep storage, runtime session handling, and UI workspace concepts distinct.

## Language

**i18n / Localization**:
KKTerm supports 13 UI languages through i18next. The English locale (`src/i18n/locales/en.json`) is the source-of-truth key structure. All user-visible strings must be routed through `t()` or `useTranslation()`; bare English text in JSX is a bug.

**Locale**:
A language-region bundle stored as a JSON file under `src/i18n/locales/`. English is bundled with the app; 12 additional locales load on demand via dynamic `import()`. The active locale is persisted in `localStorage` (`kkterm.language`) and survives app restarts.

**Translation key**:
A dot-notation path into the locale JSON (e.g. `settings.general.language`, `ai.waitingPhrases`). Keys are organized by namespace matching the frontend module map. New UI strings require a new key in all 13 locale files.

**Namespace**:
A top-level section of the locale JSON mapping to a frontend module: `app`, `settings`, `connections`, `terminal`, `sftp`, `webview`, `remoteDesktop`, `ai`, `workspace`, `common`, `languages`. Keep new keys in the namespace closest to the owning component.


**Connection**:
A durable openable resource stored in SQLite. The supported kinds are local terminal, SSH terminal, Telnet terminal, Serial terminal, URL (an embedded WebView2 browser surface targeting a single http(s) origin), RDP, and VNC. SFTP is opened from an SSH Connection and is not stored as a standalone Connection.
_Avoid_: Profile, saved session, host entry

SSH Connections may persist non-secret tmux launch preferences, including whether KKTerm should start terminal Panes inside named tmux sessions. The remote tmux process itself remains live Session/runtime state and is not the durable Connection.

**URL Connection**:
A Connection of kind `url`. It stores an http(s) URL plus an optional `dataPartition` label. The address bar accepts hosts without a scheme; the backend assumes `https://` when no scheme is present. The `dataPartition` field is persisted but currently a no-op: WebView2 enforces one user-data folder per process, so all URL Connections share the host app's WebView2 cookie/storage in Phase 1. Real per-Connection isolation is deferred until Phase 2 explores out-of-process WebView2 environments.
_Avoid_: Web tab, browser bookmark, URL profile

**RDP/VNC Connection**:
A Connection of kind `rdp` or `vnc`. It stores host, optional port, and non-secret account metadata in SQLite; passwords stay in the OS keychain. RDP Connections start Windows-native remote desktop Sessions through the Microsoft RDP ActiveX control in `mstscax.dll`. VNC Connections start RFB/VNC Sessions through the Rust `vnc-rs` client and render the remote framebuffer in the workspace canvas.
_Avoid_: Remote desktop session, screen profile, saved desktop

**Quick Connect**:
An unsaved one-off connection draft used to start a session without creating a durable connection.
_Avoid_: Temporary profile, ad hoc host

**Session**:
A live runtime instance for a process, SSH channel, or SFTP browser state.
_Avoid_: Connection, profile, tab

**Tab**:
A frontend workspace container that presents one session or a set of related panes.
_Avoid_: Session, connection, backend tab

**Dashboard Module**:
A built-in activity-rail module that provides a dynamic widget playground. Users select from prebuilt widgets (hash calculators, IP subnet calculators, quick tools) or reports. The built-in AI Assistant and coding agents can create new widgets.
_Avoid_: landing page, overview

**Default Launch State**:
The default landing view when no Sessions are open, showing recent Connections and a workspace overview. This replaces the old "Dashboard" concept that was the landing page.
_Avoid_: dashboard, home

**App Launcher Widget**:
A Dashboard widget where users add local desktop apps, shortcuts, scripts, or files for quick launch. The widget presents each launcher entry as an icon with text; add/edit/remove actions, launch mode choices, and other entry management controls belong in an app-owned right-click context menu instead of the default widget surface.
_Avoid_: dock, taskbar

**File Explorer Module**:
A built-in activity-rail module providing a lightning-fast alternative local file explorer optimized for speed and dense professional workflows. Distinct from the SFTP browser, which handles remote file operations over SSH connections.
_Avoid_: SFTP browser, remote file pane

**Pane**:
A subdivision of a tab that presents one terminal surface or workspace view.
_Avoid_: Session, split

Terminal Panes for tmux-enabled SSH Connections may carry a generated friendly tmux session id, such as `kkterm-cockpit001`, used to resume that Pane's remote tmux session when the Pane is recreated. Current Pane tmux ids use the `kkterm-<sci-fi-name><number>` shape and are remembered in frontend workspace storage. That id belongs to the frontend workspace/Pane layer, not the backend Connection model.

## UI Layout

**Activity Rail (Left Rail)**:
The vertical icon bar on the far left of the app. Shows top-level built-in modules (Workspace, Dashboard, File Explorer), connected Connection shortcuts when enabled, and Settings at the bottom. Icons use app-owned delayed hover labels via `RailTooltip`, not native `title` tooltips. App Launcher is intentionally not a rail module; it lives inside Dashboard as a widget.
_Avoid_: sidebar, left sidebar, nav bar

**Connection Tree (Connections Panel)**:
The left-side tree view of saved Connections, folders, and subfolders. Visible inside the Workspace module. Supports search, filtering, drag/drop ordering, rename, delete, duplicate, Quick Connect, and open-Session status badges. Collapsed/expanded state is persisted.
_Avoid_: connection sidebar, host list

**AI Assistant Panel**:
The right-side resizable panel for AI chat interactions. Collapsed/expanded state is workspace-wide.
_Avoid_: AI sidebar, chat panel

**Dashboard Widget Playground**:
The content area of the Dashboard module. Hosts dynamic, user-selectable widgets and reports, including the App Launcher Widget. The AI Assistant can create new widgets on request.
_Avoid_: landing page, overview

**Default Launch State**:
The fallback view shown when no Sessions are open, displaying recent Connections and a brief workspace overview. Not a user-navigable module; it is reached by closing all Tabs.
_Avoid_: dashboard page, home screen

**Workspace Canvas**:
The central content area for the active built-in module. Each module (Workspace, Dashboard, File Explorer) owns its own content layout within this area. For the Workspace module, this includes the Tab Strip, active Tab content (terminals, RDP/VNC surfaces, WebView2 surfaces, SFTP browsers), and optional pane splits.
_Avoid_: main area, content area

**Tab Strip**:
The horizontal row of workspace tabs above the Canvas. Each Tab represents a workspace container presenting a Session or set of related Panes.
_Avoid_: tab bar, tab row

**Pane**:
A subdivision within a Tab that presents one terminal surface or view. Pane toolbars carry terminal/connection controls.

**Status Bar**:
The bottom workspace bar showing left-aligned host usage metrics and transient workspace notifications.
_Avoid_: footer bar, bottom bar

**Settings Sidebar**:
The left-side navigation within the Settings page, routing between General, AI, Connections, Terminal, and other settings sections.
_Avoid_: settings nav, settings menu

## Relationships

- A **Connection** may start zero or more **Sessions** over time.
- An SSH **Connection** may start terminal **Sessions** and related SFTP browser **Sessions**.
- A **URL Connection** starts a webview **Session** that owns one child WebView2 surface positioned over its **Tab**.
- An **RDP Connection** starts a Windows-native remote-desktop **Session** hosted as a native child control over its **Tab**.
- A **VNC Connection** starts a Rust-managed remote framebuffer **Session** rendered into its **Tab**.
- A **Quick Connect** starts exactly one **Session** unless the user saves it as a **Connection**.
- A **Session** may be presented by one **Tab**.
- A terminal **Tab** may contain one or more **Panes**.
- A tmux-enabled SSH terminal **Pane** may start or attach to a named remote tmux session. If `tmux` is unavailable on the remote host, the Pane falls back to the normal remote shell.
- A **Tab** is UI state only and is not the durable backend model.
- Switching the active **Tab** does not end, disconnect, or recreate its **Session**.
- A native SSH **Session** must not use an app-side idle timeout. Quiet, unfocused SSH Sessions are expected to remain connected unless the remote server, network, or an explicit user close ends them.
- A tmux-enabled native SSH **Session** may silently attempt a small bounded reattach to the same Pane tmux id if the SSH channel unexpectedly closes.
- A **Session** is intentionally ended only by an explicit close action on the presenting **Tab** or by the remote/process ending itself.

## Example Dialogue

> **Dev:** "When the user opens the Bastion East **Connection**, should we mutate that row to mark it active?"
> **Domain expert:** "No — opening the **Connection** creates a **Session**. The **Connection** stays durable resource data; live state belongs to the **Session** and its **Tab**."

## Flagged Ambiguities

- "Profile" and "saved connection" were both used for durable openable resources. Resolved: use **Connection** as the canonical term.
- "Session" was previously easy to confuse with a saved connection or visible tab. Resolved: a **Session** is live runtime state, while a **Tab** is only the frontend container.
