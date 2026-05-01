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
- tags
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

### Connection Model

Represents all openable resources as saved connections. v0.1 connection types:

- Local Terminal
- SSH Terminal
- SFTP Browser

Later connection types:

- RDP Session
- VNC Session
- Web URL

### Connection Tree

Owns folders, saved connections, tags, search/filter, drag/drop ordering, rename/delete/duplicate, quick connect, SSH config import display, and open-session status badges.

### Terminal Session

Owns local PTY lifecycle, SSH terminal channel lifecycle, input/output streams, resize events, tab integration, split pane integration, and terminal compatibility behavior.

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

Owns SFTP sessions, local/remote listing, upload/download, create folder, rename, delete, refresh, transfer queue, progress, cancellation, overwrite policy, and "open terminal here."

### SSH Config Importer

Parses SSH config and creates draft connection profiles. It should preserve supported directives and visibly report unsupported directives.

### AI Assist

Owns provider adapters, prompt construction, command proposal, approval flow, command execution handoff, and output capture.

v0.1 providers:

- OpenAI-compatible endpoint with BYO API key.
- Claude Code CLI path.
- Codex CLI path.

The AI module must enforce approval-based execution. CLI integrations should be constrained to suggest-only/ask-before-execute where possible.

### Diagnostics

Owns structured local logs, diagnostics bundle creation, and redaction rules. No telemetry or automatic crash upload in v0.1.

## Data Boundaries

SQLite contains local, non-secret data only. OS keychain contains secrets. Terminal contents should not be logged by default. Diagnostics bundles must avoid secrets and terminal output unless the user explicitly includes selected content.

## Frontend Layout

The primary UI is a dense desktop workspace:

- left connection tree
- main tabs/workspace
- terminal split panes inside terminal tabs
- SFTP dual-pane view
- right AI assistant panel
- command palette
- settings

Default visual direction: quiet productivity light chrome with dark terminal panes.

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
- auto-update
