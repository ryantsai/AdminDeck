# AdminDeck Roadmap

## Milestone 0: Project Foundation

- Confirm working product name: AdminDeck.
- Initialize repository structure.
- Add Apache-2.0 license.
- Add Rust/Tauri/React/Vite scaffold.
- Add Tailwind design tokens.
- Add basic app shell with light chrome and dark terminal surface placeholder.
- Add local logging foundation.
- Add CI skeleton for Windows-first builds.

## Milestone A: Usable Session Spine

- Implement typed Tauri command wrapper.
- Add SQLite migrations and repository layer.
- Add OS keychain abstraction.
- Add connection model for local terminal, SSH terminal, and SFTP.
- Add connection tree with folders, saved connections, tags, search/filter, drag/drop reorder, rename/delete/duplicate, quick connect, and status badges.
- Add tab workspace.
- Add split panes inside terminal tabs.
- Add local terminal session lifecycle.
- Add initial terminal view using the fastest reliable implementation.
- Add settings shell for terminal font, line height, cursor, scrollback, copy-on-select, multiline paste confirmation, and default shell.

## Milestone B: SSH Core

- Evaluate and choose Rust SSH library.
- Implement in-process SSH connection lifecycle.
- Implement host key verification.
- Implement password auth.
- Implement key-file auth by path.
- Implement SSH agent support where practical.
- Implement terminal channel allocation.
- Implement resize events.
- Add optional system ssh fallback/debug path.
- Add SSH defaults in settings.
- Add SSH config import with unsupported directive reporting.

## Milestone C: SFTP Core

- Implement SFTP session reuse from connection credentials where possible.
- Add dual-pane local/remote file manager.
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
