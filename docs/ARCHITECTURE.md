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

Secrets are never stored in SQLite.

### Secrets

Owns OS keychain integration:

- Windows Credential Manager / DPAPI path
- macOS Keychain later
- Linux Secret Service / KWallet/libsecret later

Secrets include passwords, SSH passphrases, and AI API keys.

Optional future direction: a portable vault mode may add encrypted SQLite credential storage for users who need secrets to travel with a portable install. That mode must be explicit opt-in, derive its encryption key from a user-provided master password or OS-protected material, define lock/unlock and password-change behavior, and remain separate from the default OS keychain path.

### Connection Model

Represents all openable resources as saved connections. v0.1 connection types:

- Local Terminal
- SSH Terminal

SFTP is a related workspace surface opened from an SSH Connection, not a standalone saved Connection type.

Later connection types:

- RDP Session
- VNC Session
- Web URL

### Connection Tree

Owns folders, saved connections, search/filter, drag/drop ordering, rename/delete/duplicate, quick connect, SSH config import display, and open-session status badges.

Current implementation note: status badges are derived from active frontend workspace Sessions. Durable Connections load as idle and do not persist live session state in SQLite.

### Terminal Session

Owns local PTY lifecycle, SSH terminal channel lifecycle, input/output streams, resize events, tab integration, split pane integration, and terminal compatibility behavior.

Lifecycle invariant: switching the active workspace Tab must not disconnect, close, or recreate a local terminal Session, SSH terminal Session, or SFTP Session. Open Tab surfaces stay mounted while inactive so their live Sessions remain attached. Explicit tab close from the tab strip is the user-owned teardown action for the Session or Sessions presented by that Tab.

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

### SSH Transport

Owns in-process SSH connections, host key verification, authentication, terminal channels, resize propagation, reconnect behavior, and optional system ssh fallback/debug.

Evaluate `russh` first. Evaluate `ssh2` if `russh` does not meet v0.1 needs.

### SFTP

Owns SFTP sessions launched from SSH Connections, local/remote listing, multi-select upload/download by button or drag/drop, create folder, inline rename, delete, refresh, scoped context menu actions, remote properties, chmod/chown updates, transfer queue, progress, cancellation, finished-history clearing, overwrite conflict prompts, overwrite-all queue handling, and "open terminal here."

### SSH Config Importer

Parses SSH config and creates draft connections. It should preserve supported directives and visibly report unsupported directives.

Current implementation note: the importer supports `Host`, `HostName`, `User`, `Port`, `IdentityFile`, and `ProxyJump`. It skips wildcard-only host patterns, reports unsupported global or host-scoped directives with line numbers, previews draft Connections in the UI, and only persists them after explicit user confirmation.

### AI Assist

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

- left connection tree
- main tabs/workspace
- terminal split panes inside terminal tabs
- SFTP dual-pane view
- right AI assistant panel
- settings

Default visual direction: quiet productivity light chrome with dark terminal panes.

AdminDeck does not include a global command palette in the current product scope; navigation and workflow entry points should stay visible in the connection tree, tab workspace, SFTP toolbar/context actions, assistant panel, and Settings.

The main workspace treats Tabs as frontend containers over live Sessions. Selecting another Tab changes visibility and focus only; it must not run backend Session close commands. Closing a Tab via the tab-strip close control removes that container and tears down the live Session resources it owns.

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
