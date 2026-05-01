# AdminDeck Roadmap

## Current Progress

As of May 1, 2026, Milestone A has a usable session spine in place: typed frontend Tauri commands, SQLite-backed durable Connections and folders, OS keychain operations, connection tree CRUD/search/reorder, quick connect, tabs, split terminal panes, xterm-based local terminal sessions, terminal settings, and live status badges derived from active workspace Sessions.

Milestone B has started with the accepted Rust SSH direction, durable SSH `proxyJump` storage, native `russh` SSH terminal lifecycle for key-file, password, and SSH-agent Connections without `ProxyJump`, app-local known-host verification for native SSH sessions with explicit first-use trust and changed-key blocking, system `ssh` debug/fallback support for `ProxyJump` sessions, an SSH config import preview that preserves `HostName`, `User`, `Port`, `IdentityFile`, and `ProxyJump` while reporting unsupported directives before saving drafts as Connections, and persisted SSH defaults for new SSH/SFTP Connections.

Milestone C has started with native `russh-sftp` sessions that reuse stored SFTP Connection credentials, OS-keychain passwords, and app-local SSH known-host verification for non-`ProxyJump` Connections. SFTP tabs now open a backend session, list the remote home directory, close the session with the tab view, and present a real dual-pane local/remote file manager with refresh, parent navigation, and folder opening on both sides.

## Milestone 0: Project Foundation

- [x] Confirm working product name: AdminDeck.
- [x] Initialize repository structure.
- [x] Add Apache-2.0 license.
- [x] Add Rust/Tauri/React/Vite scaffold.
- [x] Add Tailwind design tokens.
- [x] Add basic app shell with light chrome and dark terminal surface placeholder.
- [x] Add local logging foundation.
- [x] Add CI skeleton for Windows-first builds.

## Milestone A: Usable Session Spine

- [x] Implement typed Tauri command wrapper.
- [x] Add SQLite migrations and repository layer.
- [x] Add OS keychain abstraction.
- [x] Add connection model for local terminal, SSH terminal, and SFTP.
- [x] Add connection tree with folders, saved connections, tags, search/filter, drag/drop reorder, rename/delete/duplicate, quick connect, and live status badges.
- [x] Add tab workspace.
- [x] Add split panes inside terminal tabs.
- [x] Add local terminal session lifecycle.
- [x] Add initial terminal view using the fastest reliable implementation.
- [x] Add settings shell for terminal font, line height, cursor, scrollback, copy-on-select, multiline paste confirmation, and default shell.

## Milestone B: SSH Core

- [x] Evaluate and choose Rust SSH library. See `docs/ADR/0004-ssh-transport-library.md`.
- [x] Implement in-process SSH connection lifecycle.
- [x] Implement host key verification.
- [x] Implement password auth.
- [x] Implement key-file auth by path.
- [x] Implement SSH agent support where practical.
- [x] Implement terminal channel allocation.
- [x] Implement resize events.
- [x] Add optional system ssh fallback/debug path.
- [x] Add SSH defaults in settings.
- [x] Add SSH config import with unsupported directive reporting.

## Milestone C: SFTP Core

- [x] Implement SFTP session reuse from connection credentials where possible.
- [x] Add dual-pane local/remote file manager.
- Add upload and download for files and folders.
- Add create folder, rename, delete, and refresh.
- Add transfer queue with progress and cancellation.
- Add overwrite behavior setting.
- Add "open terminal here."

## Milestone D: AI Command Assist

- Add AI assistant panel.
- Add OpenAI-compatible provider settings.
- Store API keys in OS keychain.
- Add model selector.
- Add command proposal flow.
- Add explicit approval before execution.
- Capture selected command output back into AI context.
- Add Claude Code CLI path configuration.
- Add Codex CLI path configuration.
- Constrain CLI integrations to suggest-only/ask-before-execute where possible.
- Add command planning safety tests.

## Milestone E: Performance and Terminal Quality

- Measure cold launch time.
- Measure new local terminal tab time.
- Measure SSH terminal readiness after auth.
- Measure idle memory.
- Run manual compatibility checklist: vim, tmux, htop/btop, git, npm, cargo.
- Harden terminal scrollback, selection, copy/paste, bracketed paste, mouse support, alternate screen, and hyperlinks.
- Define WGPU renderer interface in code.
- Start WGPU renderer prototype if Milestone A terminal integration limits are clear.

## Milestone F: Packaging and v0.1 Release

- Build Windows .msi or .exe installer.
- Build Windows portable ZIP.
- Smoke test installer.
- Publish GitHub Release.
- Document no-telemetry posture.
- Document diagnostics bundle flow.
- Document known limitations.

## Later

- macOS packaging with .dmg.
- Linux packaging with AppImage/deb/rpm where reasonable.
- WGPU terminal renderer replacement if not already complete.
- Lightweight webview tab.
- RDP connection type.
- VNC connection type.
- Editable keybindings.
- MobaXterm/RDCMan import.
- SFTP folder sync/diff/resume.
- Team sharing/sync.
- Managed update channel and auto-update.
- Optional crash reporting after explicit opt-in design.
- Mobile apps after desktop architecture proves itself.
