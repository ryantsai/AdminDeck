# AdminDeck Architecture

## Overview

AdminDeck is a Windows-first, cross-platform desktop workspace for local terminals, SSH sessions, and SFTP. The architecture prioritizes startup speed, local-first privacy, testable Rust modules, and a UI that can evolve toward GPU-accelerated terminal rendering without blocking the first usable prototype.

## Platform Shape

- Desktop shell: Tauri v2.
- Core runtime: Rust.
- Frontend: React, TypeScript, Vite.
- Styling: Tailwind with strict CSS variable tokens.
- UI primitives: Radix UI or Ariakit.
- Icons: lucide-react.
- State: Zustand or TanStack Store.
- Storage: SQLite for non-secret local data.
- Secrets: OS keychain.

Windows is the first acceptance platform. macOS and Linux should remain first-class architectural targets, but Windows behavior wins v0.1 acceptance decisions.

## Major Modules

### App Shell

Owns Tauri setup, window lifecycle, command registration, menus, native dialogs, logging setup, and platform-specific capabilities.

### Command Boundary

Provides a typed command wrapper between React and Rust. The frontend should not manually string-build backend calls. Commands should return structured results and structured errors.

### Storage

Owns SQLite migrations and repositories for:

- connection tree nodes
- saved connections
- settings
- UI layout
- recent sessions
- non-secret AI provider metadata
- non-secret SSH tmux launch preferences

Secrets are never stored in SQLite.

### Secrets

Owns OS keychain integration:

- Windows Credential Manager / DPAPI path
- macOS Keychain later
- Linux Secret Service / KWallet/libsecret later

Secrets include passwords, SSH passphrases, and AI API keys.

Optional future direction: a portable vault mode may add encrypted SQLite credential storage for users who need secrets to travel with a portable install. That mode must be explicit opt-in, derive its encryption key from a user-provided master password or OS-protected material, define lock/unlock and password-change behavior, and remain separate from the default OS keychain path.

### Connection Model

Represents all openable resources as saved connections. Current connection types:

- Local Terminal
- SSH Terminal
- URL
- RDP
- VNC

SFTP is a related workspace surface opened from an SSH Connection, not a standalone saved Connection type.

SSH Connections may store a non-secret `useTmuxSessions` preference. This value describes how future terminal Sessions should launch; it does not represent a live remote process.

RDP Sessions are Windows-native child controls hosted through the Microsoft RDP ActiveX COM control in `mstscax.dll`. The Rust backend creates and drives the control from Tauri commands while the frontend owns Tab/workspace placement. VNC is durable Connection data only until its v0.2 transport is implemented.

RDP sizing has an important diagnostic trap: gray left/right gutters or a visible resize after switching Tabs can be caused by frontend workspace layout changes, not by the RDP transport itself. In particular, global chrome such as the right AI Assistant panel must keep one workspace-wide width/collapsed state; it must not load per-Connection panel layout on Tab activation. Per-Connection assistant panel state changes the workspace width during Tab switching, which then forces the native RDP ActiveX HWND to resize and can look like an RDP display-sync bug. When investigating RDP gutters, first verify that `remote-desktop-workspace` bounds and app chrome widths stay identical before and after Tab activation.

### Connection Tree

Owns root-level saved Connections, optional folders, subfolders, search/filter, drag/drop ordering, rename/delete/duplicate, quick connect, and open-session status badges.

Current implementation note: a Connection may have no folder and live directly in the root of the tree. Folders may contain Connections and subfolders. Status badges are derived from active frontend workspace Sessions. Durable Connections load as idle and do not persist live session state in SQLite.

For tmux-enabled SSH Connections, per-Pane friendly tmux session names are generated and remembered in the frontend workspace layer so split Panes can resume independently. Current Pane names use the `admindeck-<sci-fi-name><number>` shape, for example `admindeck-cockpit001`. The frontend stores these Pane names under `admindeck.tmuxSessions.<connectionId>` so the same Connection can reopen its previous Pane-to-tmux mapping. Stored Pane ids that do not match the current friendly format are ignored when new Panes are built. The durable Connection stores only the launch preference and legacy/non-user-facing namespace fields; those fields are not the active Pane tmux session id.

### Terminal Session

Owns local PTY lifecycle, SSH terminal channel lifecycle, input/output streams, resize events, tab integration, split pane integration, and terminal compatibility behavior.

Lifecycle invariant: switching the active workspace Tab must not disconnect, close, or recreate a local terminal Session, SSH terminal Session, or SFTP Session. Open Tab surfaces stay mounted while inactive so their live Sessions remain attached. Explicit tab close from the tab strip is the user-owned teardown action for the Session or Sessions presented by that Tab.

When an SSH Connection has tmux enabled, each terminal Pane starts by attaching to or creating its generated tmux session with `tmux new-session -A -s <name>`. Native `russh` sessions and system `ssh` fallback sessions use the same remote startup behavior. If `tmux` is not installed on the remote host, AdminDeck starts a normal interactive shell instead. The Pane toolbar shows the tmux session id and can list or close remote tmux sessions without logging terminal contents.

Native SSH terminal Sessions do not set an app-side inactivity timeout; quiet and unfocused Sessions should remain connected. If a tmux-enabled native SSH terminal channel unexpectedly closes after startup, the SSH runtime attempts a small bounded silent reattach to the same Pane tmux session id. This is recovery for a broken transport, not a replacement for normal Session ownership: explicit Tab close still tears down the frontend Session, and non-tmux shells are not auto-restarted because that would create a fresh remote shell rather than resume existing live state.

### Terminal Engine

Owns terminal parsing/state and exposes a renderer-neutral model. Evaluate `alacritty_terminal` first.

The engine boundary should make rendering swappable by separating:

- terminal state/input
- glyph atlas/shaping
- scrollback
- selection/copy
- cursor rendering
- dirty-region updates

### Terminal Renderer

Milestone A may use the fastest reliable terminal view that can prove session lifecycle and product UX. Milestone B introduces or replaces it with WGPU rendering. The renderer must be behind an internal interface from the start.

The current Milestone A renderer is `xterm.js` with the `@xterm/addon-webgl` GPU glyph renderer attached opportunistically inside `XtermTerminalRenderer.open` (`src/terminal/renderer.ts`). The addon is loaded after `Terminal.open(element)` because it needs the host element to mount its WebGL2 canvas. If the `WebglAddon` constructor throws (no WebGL2, blocklisted driver, headless RDP) or `loadAddon` rejects it, the renderer silently stays on the xterm DOM renderer. When the GPU context is later evicted (sleep/wake, GPU reset, driver crash), `WebglAddon.onContextLoss` fires; the renderer disposes the addon and xterm transparently falls back to the DOM renderer for subsequent frames. The renderer is not recreated and the Session is not torn down. This keeps the renderer abstraction unchanged while removing CPU pressure on heavy output (build logs, `journalctl -f`, multi-pane Tabs).

### SSH Transport

Owns in-process SSH connections, host key verification, authentication, terminal channels, resize propagation, idle behavior, bounded tmux reattach behavior, optional system ssh fallback/debug, and noninteractive remote tmux management commands.

Evaluate `russh` first. Evaluate `ssh2` if `russh` does not meet v0.1 needs.

### SFTP

Owns SFTP sessions launched from SSH Connections, local/remote listing, multi-select upload/download by button or drag/drop, create folder, inline rename, delete, refresh, scoped context menu actions, remote properties, chmod/chown updates, transfer queue, progress, cancellation, finished-history clearing, overwrite conflict prompts, overwrite-all queue handling, and "open terminal here."

### Screenshot Capture

Owns explicit user-triggered screenshot capture for active workspace surfaces. Terminal Panes expose the screenshot action in the Pane toolbar; URL, SFTP, RDP, and VNC workspaces expose it in the top workspace toolbar. The frontend owns the menu and Region selection overlay, then calls the typed Tauri command with a client-area rectangle.

On Windows, the Rust backend translates the requested rectangle into physical screen coordinates and uses GDI capture so native child surfaces such as WebView2 and the RDP ActiveX host are included. Captures are written directly to the system clipboard as image data. Screenshot capture does not persist image files, does not log terminal contents, and is separate from the future AI-assistant image-analysis flow, which must remain an explicit user action.

### SSH Config Importer

Parses SSH config and creates draft connections. It should preserve supported directives and visibly report unsupported directives.

Current implementation note: the importer supports `Host`, `HostName`, `User`, `Port`, `IdentityFile`, and `ProxyJump`. It skips wildcard-only host patterns and reports unsupported global or host-scoped directives with line numbers through the typed Tauri command. The previous top chrome import button has been removed; a future visible entry point should live in the connection tree or Settings rather than a standalone global button bar.

### AI Assistant

Owns provider adapters, prompt construction, command proposal, approval flow, command execution handoff, and output capture.

v0.1 providers:

- OpenAI-compatible endpoint with BYO API key.
- Claude Code CLI path.
- Codex CLI path.

The AI module must enforce approval-based execution. CLI integrations should be constrained to suggest-only/ask-before-execute where possible.

### Diagnostics

Owns structured local logs, diagnostics bundle creation, and redaction rules. No telemetry or automatic crash upload in v0.1.

### Updates

Owns update discovery and installation for packaged desktop builds. v0.2 targets the installed Windows app only, using the Tauri updater with signed update artifacts and GitHub Releases static updater metadata for a single stable channel.

Update checks are enabled by default and may contact the configured GitHub Releases/update metadata endpoint. This network request is part of the updater flow and must be described clearly in Settings as distinct from telemetry. AdminDeck must not add analytics or crash upload as part of update checking.

Installation is user-mediated. Settings owns manual update checks and update preferences, while app chrome may show a lightweight update-available notification after a successful check. The first v0.2 updater supports normal forward updates only. Rollback, downgrade, preview channels, managed update servers, silent installs, cross-platform updater support, and portable ZIP self-update are deferred.

## Data Boundaries

SQLite contains local, non-secret data only. OS keychain contains secrets. Terminal contents should not be logged by default. Diagnostics bundles must avoid secrets and terminal output unless the user explicitly includes selected content. Any future encrypted SQLite vault must be treated as a separate secret backend, not as ordinary settings storage.

## Frontend Layout

The primary UI is a dense desktop workspace:

- left activity rail with Dashboard and Settings entries
- left connection tree with root Connections and optional nested folders
- main tabs/workspace
- terminal split panes inside terminal tabs
- tmux session tags and management popovers inside SSH terminal Pane toolbars
- screenshot Region and Entire Window/Panel actions, shown in terminal Pane toolbars for terminal Sessions and top workspace toolbars for non-terminal surfaces
- SFTP dual-pane view
- right AI Assistant panel
- settings

Default visual direction: quiet productivity light chrome with dark terminal panes.

The activity rail uses icons with delayed hover labels for top-level destinations. The top rail entry is Dashboard, and the second entry is Settings. The current Settings surface intentionally exposes only Language (i18n) and Color Scheme as to-be-implemented placeholders.

AdminDeck does not include a global command palette in the current product scope; navigation and workflow entry points should stay visible in the Dashboard/connection tree, tab workspace, SFTP toolbar/context actions, assistant panel, and Settings.

The main workspace treats Tabs as frontend containers over live Sessions. Selecting another Tab changes visibility and focus only; it must not run backend Session close commands. Closing a Tab via the tab-strip close control removes that container and tears down the live Session resources it owns.

Workspace chrome layout is global state. Connection-specific live context may change assistant copy, selected terminal context, or prompt construction, but should not change the left/right panel widths or collapsed state when the active Tab changes. Native HWND-backed surfaces such as WebView2 and RDP depend on stable host bounds; changing chrome dimensions as a side effect of Tab activation creates visible native resize artifacts.

## Performance Strategy

Startup and session creation should avoid unnecessary frontend work, heavyweight dependencies, and eager initialization. Expensive subsystems should initialize lazily where possible.

Budgets:

- cold launch to usable window: under 500 ms target, under 1 second acceptable
- new local terminal tab: under 100 ms
- SSH tab after auth: under 150 ms to terminal ready, excluding network
- idle memory: under 150 MB target
- rendering: 60 FPS under normal output

## Release Strategy

v0.1 distribution targets:

- Windows .msi or .exe installer
- Windows portable ZIP for dev/test
- GitHub Releases

Deferred:

- macOS .dmg
- Linux AppImage/deb/rpm
- optional portable encrypted credential vault

v0.2 update target:

- Windows installed-app auto-update mechanism
- signed Tauri updater artifacts as a release gate
- GitHub Releases static updater metadata
- stable update channel only
- update checks enabled by default with local-first privacy wording
- user-mediated install from Settings plus a lightweight app-chrome notification
