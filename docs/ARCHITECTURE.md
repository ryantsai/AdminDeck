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

### Frontend Settings

`src/settings/SettingsPage.tsx` owns the Settings shell — the header, sidebar nav, and section routing. Each settings section is a separate page component under `src/settings/`, owning its own draft state, save/reset handlers, and helper controls:

- `src/settings/GeneralSettings.tsx` — Language (i18n) selector.
- `src/settings/AppearanceSettings.tsx` — App UI font family, layout reset, Color Scheme placeholder.
- `src/settings/AiSettings.tsx` — AI provider kind, dynamic provider fields, API key, output language.
- `src/settings/SshSettings.tsx` — Read-only SSH defaults and SFTP transfer defaults summary.
- `src/settings/TerminalSettings.tsx` — Terminal font, size, line height, scrollback, cursor, default shell, toggles.
- `src/settings/RdpSettings.tsx` — Planned RDP quality defaults summary.
- `src/settings/VncSettings.tsx` — Planned VNC quality defaults summary.
- `src/settings/AboutSettings.tsx` — Product info, version, open-source component tables.
- `src/settings/shared.tsx` — Reusable `SettingsSummary` and `PlannedSettingsGrid` components.
- `src/settings/aboutData.ts` — Static product metadata and open-source component groups.

`src/App.tsx` only routes to Settings; the persisted-settings bootstrap into the workspace store lives in `src/lib/settings.ts` as a single `useBootstrapSettings()` hook so new persisted settings can be added in one place. The OS keychain owner id for the AI API key (`AI_PROVIDER_SECRET_OWNER_ID`) is also defined in `src/lib/settings.ts` so SettingsPage and bootstrap share one constant. New Settings sections should stay in the settings module unless they become large enough to justify a submodule under `src/settings/`.

### Internationalization

The i18n layer lives in `src/i18n/` and uses **i18next** with **react-i18next**.

- **`src/i18n/config.ts`** owns the i18next instance, language detection (`localStorage` key `admindeck.language`), dynamic locale chunk loading, the `switchLanguage()` API, and the `ensureI18nReady()` startup guard.
- **`src/i18n/useT.ts`** provides a typed `useT()` hook with full key autocompletion from the English locale shape.
- **`src/i18n/locales/en.json`** is the source-of-truth translation file (11 namespaces, ~500 keys). English is bundled with the app; the 12 other locales (`fr`, `it`, `de`, `es`, `es-MX`, `pt-BR`, `zh-TW`, `zh-CN`, `ja`, `ko`, `th`, `id`) load on demand via dynamic `import()` and are automatically code-split by Vite.
- **Settings → General → Language** exposes a dropdown that calls `switchLanguage()`, which hot-swaps the locale bundle and persists the choice.
- **All user-visible strings must go through `t()` or `useTranslation()`**. Hardcoded English text in JSX is forbidden. New keys go into `en.json` first, then are propagated to all 12 other locale files. Renamed or removed keys must be updated in every file. Pure helper functions that cannot use React hooks import `i18next` from `src/i18n/config` and call `i18next.t(key)`.

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
- Telnet Terminal
- Serial Terminal
- URL
- RDP
- VNC

SFTP is a related workspace surface opened from an SSH Connection, not a standalone saved Connection type.

SSH Connections may store a non-secret `useTmuxSessions` preference. This value describes how future terminal Sessions should launch; it does not represent a live remote process.

RDP Sessions are Windows-native child controls hosted through the Microsoft RDP ActiveX COM control in `mstscax.dll`. The Rust backend creates and drives the control from Tauri commands while the frontend owns Tab/workspace placement. VNC Sessions use the Rust `vnc-rs` client for RFB handshakes, password auth, framebuffer updates, CopyRect handling, and pointer/key input; the frontend renders RGBA framebuffer rectangles into a canvas in `src/remote-desktop/RemoteDesktopWorkspace.tsx`.

RDP ActiveX is a native child HWND, not a DOM element. It can draw above React dialogs and menus regardless of CSS `z-index`. When a DOM overlay must appear above an active RDP view, `src/workspace/nativeOverlay.ts` detects the overlay and `src/remote-desktop/RemoteDesktopWorkspace.tsx` captures the current RDP host rectangle through the screenshot command, renders that transient bitmap inside the workspace, then hides/parks the ActiveX HWND until the overlay is gone. This preserves the user's visual context for Add Connection dialogs, screenshot menus, Region selection, and other app-owned overlays without allowing the native control to cover them. Any new app-level overlay that should stack above WebView2 or RDP must be added to the shared native overlay detector.

RDP sizing has an important diagnostic trap: gray left/right gutters or a visible resize after switching Tabs can be caused by frontend workspace layout changes, not by the RDP transport itself. In particular, global chrome such as the right AI Assistant panel must keep one workspace-wide width/collapsed state; it must not load per-Connection panel layout on Tab activation. Per-Connection assistant panel state changes the workspace width during Tab switching, which then forces the native RDP ActiveX HWND to resize and can look like an RDP display-sync bug. When investigating RDP gutters, first verify that `remote-desktop-workspace` bounds and app chrome widths stay identical before and after Tab activation.

### Connection Tree

Owns root-level saved Connections, optional folders, subfolders, search/filter, drag/drop ordering, rename/delete/duplicate, quick connect, and open-session status badges.

Current implementation note: a Connection may have no folder and live directly in the root of the tree. Folders may contain Connections and subfolders. Status badges are derived from active frontend workspace Sessions. Durable Connections load as idle and do not persist live session state in SQLite.

For tmux-enabled SSH Connections, per-Pane friendly tmux session names are generated and remembered in the frontend workspace layer so split Panes can resume independently. Current Pane names use the `admindeck-<sci-fi-name><number>` shape, for example `admindeck-cockpit001`. The frontend stores these Pane names under `admindeck.tmuxSessions.<connectionId>` so the same Connection can reopen its previous Pane-to-tmux mapping. Stored Pane ids that do not match the current friendly format are ignored when new Panes are built. The durable Connection stores only the launch preference and legacy/non-user-facing namespace fields; those fields are not the active Pane tmux session id.

### Backend Command Runtime Boundaries

Tauri commands that need synchronous native integrations, OS process calls, network control loops, or helper functions that internally create and `block_on` a Tokio runtime must cross that boundary with `run_blocking_command`/`tauri::async_runtime::spawn_blocking` before calling the helper. Async command handlers must not directly call code that starts a nested runtime or blocks the current Tokio worker; doing so can panic with "Cannot start a runtime from within a runtime" and can also starve unrelated Connection types. This invariant applies across all live Session families: local terminal helpers, SSH/tmux/AI context inspection, SFTP transfers, URL/WebView2 lifecycle calls, RDP ActiveX operations, and VNC RFB operations. When adding a command for any Connection or Session type, choose one of these shapes explicitly: pure async all the way down, synchronous command with no nested async runtime, or async command that immediately moves the blocking/nested-runtime work into `run_blocking_command`.

### Terminal Session

Owns local PTY lifecycle, SSH terminal channel lifecycle, Telnet TCP lifecycle, Serial port lifecycle, input/output streams, resize events, tab integration, split pane integration, and terminal compatibility behavior.

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

On Windows, the Rust backend translates the requested rectangle into physical screen coordinates and uses GDI capture so native child surfaces such as WebView2 and the RDP ActiveX host are included. Captures can be written directly to the system clipboard as image data, or encoded as a transient PNG data URL and attached to the AI Assistant context through an explicit Send to AI Assistant action. Screenshot capture does not persist image files and does not log terminal contents.

The same screenshot path is also used internally for RDP overlay suppression. Before hiding the ActiveX HWND for a menu/dialog/Region overlay, the frontend captures the RDP host rectangle and displays the resulting transient bitmap under the DOM overlay. That internal capture is not persisted and is distinct from user-requested clipboard or AI Assistant captures.

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

Screenshot context is user-attached and transient. The Assistant sends it through OpenAI-compatible multimodal chat content only when the user submits a prompt with that screenshot context still attached.

Extension creation is currently an Assistant draft mode, not a general extension runtime. The frontend can mark a chat request as `extensionCreation`, and the backend prompt builder adds guardrails requiring reviewable designs, manifests, permission requests, and source files only. AdminDeck must not claim that generated extension code was installed, enabled, executed, loaded, written to disk, or verified unless a future explicit approval flow and extension platform provide that behavior. The platform shape is defined in `docs/ADR/0005-extension-platform-architecture.md`.

### Extensions

Owns user-installed extension manifests, permissions, install/update lifecycle, isolated storage, and runtime boundaries. Extension execution is deferred until this platform exists in code. The accepted direction is manifest-first, permissioned, user-mediated, and isolated from secrets and raw live session contents by default.

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

The activity rail uses icons with delayed hover labels for top-level destinations. The top rail entry is Dashboard, and the second entry is Settings. The current Settings surface lives in `src/settings/SettingsPage.tsx`; it is ordered as General, Appearance, AI Assistant, SSH, Terminal, Remote Desktop(RDP), VNC, and About. General exposes Language (i18n) as a selectable dropdown, Appearance owns App UI font, layout reset, and Color Scheme as a placeholder, SSH folds in SFTP transfer defaults, Terminal owns editable terminal behavior, and RDP/VNC expose planned quality default summaries.

AdminDeck does not include a global command palette in the current product scope; navigation and workflow entry points should stay visible in the Dashboard/connection tree, tab workspace, SFTP toolbar/context actions, assistant panel, and Settings.

The main workspace treats Tabs as frontend containers over live Sessions. Selecting another Tab changes visibility and focus only; it must not run backend Session close commands. Closing a Tab via the tab-strip close control removes that container and tears down the live Session resources it owns.

Workspace chrome layout is global state. Connection-specific live context may change assistant copy, selected terminal context, or prompt construction, but should not change the left/right panel widths or collapsed state when the active Tab changes. Native HWND-backed surfaces such as WebView2 and RDP depend on stable host bounds; changing chrome dimensions as a side effect of Tab activation creates visible native resize artifacts.

## Frontend Module Map

`src/App.tsx` is intentionally a small shell now. It owns page routing, global left/right panel layout, startup/bootstrap effects, Settings routing, and the activity rail. Workspace surfaces and connection UI live in feature modules so terminal, SFTP, URL, RDP/VNC, assistant, and connection-tree work can proceed independently without repeatedly touching the app shell.

- `src/App.tsx` — `App`, `ActivityRail`, panel resize handles, global chrome layout persistence, Settings routing, startup performance polling.
- `src/connections/ConnectionSidebar.tsx` — connection tree, search, drag/drop, CRUD, quick connect, connection dialog, connection glyphs, folder rows, tree context menu.
- `src/connections/treeUtils.ts` — pure connection tree transforms, filtering, flattening, folder counts, and live status projection.
- `src/connections/utils.tsx` — connection labels/icons, default ports, Quick Connect runtime ids, local shell options, and SSH host-key confirmation helpers shared by terminal/SFTP.
- `src/workspace/WorkspaceCanvas.tsx` — `TabStrip` and `WorkspaceCanvas`, including active Tab dispatch to terminal, SFTP, URL, and remote desktop surfaces.
- `src/workspace/ScreenshotMenu.tsx` — screenshot menu, Region overlay, screenshot-to-clipboard, and screenshot-to-AI handoff.
- `src/workspace/StatusBar.tsx` — performance/budget status presentation.
- `src/workspace/nativeOverlay.ts` — shared overlay suppression detection for native HWND-backed surfaces; update this when a new DOM menu, dialog, or overlay needs to appear above WebView2 or RDP.
- `src/terminal/TerminalWorkspace.tsx` — terminal workspace, split layout view, pane host, tmux session tag/popover, terminal context menu, SSH tmux inspection helpers.
- `src/terminal/renderer.ts` — renderer abstraction and xterm/WebGL renderer implementation.
- `src/sftp/SftpWorkspace.tsx` — SFTP dual-pane browser, file panes, transfers, overwrite conflicts, context menu, properties popup.
- `src/webview/WebViewWorkspace.tsx` — URL Connection WebView2 host, webview session lease management, toolbar navigation, credential fill.
- `src/remote-desktop/RemoteDesktopWorkspace.tsx` — RDP/VNC workspace host, RDP ActiveX visibility/bounds synchronization, RDP snapshot/parking for DOM overlays, and VNC canvas framebuffer/input handling.
- `src/ai/AssistantPanel.tsx` — AI Assistant chat surface, markdown rendering, chat history, extension draft intent UI, terminal send handoff.
- `src/ai/providers.ts` — provider definitions and frontend provider validation.
- `src/settings/SettingsPage.tsx` — Settings shell with sidebar nav and section routing.
- `src/settings/shared.tsx` — Shared `SettingsSummary` and `PlannedSettingsGrid` for settings pages.
- `src/settings/aboutData.ts` — Product metadata and open-source component groups.
- `src/lib/clipboard.ts` — shared clipboard read/write fallback helpers.
- `src/i18n/config.ts` — i18next instance, language detection, dynamic locale loading, `switchLanguage()`, `ensureI18nReady()`.
- `src/i18n/useT.ts` — typed translation hook with key autocompletion.
- `src/i18n/locales/en.json` — English source-of-truth; 12 additional locale files under the same directory.

New feature code should land in the owning module above. Keep `src/App.tsx` limited to app chrome and cross-cutting bootstrap. Workspace state, settings I/O, layout serialization, terminal rendering, pane input routing, and the Tauri command boundary remain separated under `src/store.ts`, `src/lib/`, `src/workspace/`, `src/terminal/`, and `src/lib/tauri.ts`.

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
