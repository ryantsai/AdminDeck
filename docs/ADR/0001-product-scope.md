bunv# ADR 0001: Product Scope

## Status

Accepted

## Context

AdminDeck started as a request for a fast, modern terminal emulator and remote administration workspace combining ideas from Ghostty, RDCMan, VSCode, and MobaXterm. The desired long-term platform includes Windows, macOS, Linux, iOS, and Android, with support for SSH, RDP, VNC, browser tabs, AI command assistance, and SFTP.

That full scope is too broad for a first release. RDP, VNC, mobile, browser tabs, cloud sync, team vaults, and autonomous AI all introduce different security and UX constraints.

## Decision

v0.1 will be a desktop-first, Windows-first personal/local app.

v0.1 includes:

- local terminal
- SSH terminal
- SFTP dual-pane file manager
- left activity rail with Dashboard and Settings entries
- left-side connection tree with root Connections and optional nested folders
- SSH config import command support, with the user-facing entry point deferred from the simplified chrome
- SQLite connection/settings storage
- OS keychain secret storage
- approval-based AI command assistance
- OpenAI-compatible BYO API key
- Claude Code CLI and Codex CLI path configuration
- light app chrome with dark terminal panes
- Settings placeholder surface for Language (i18n) and Color Scheme

v0.1 excludes:

- mobile apps
- RDP
- VNC
- webview/browser tabs
- team sharing/sync
- managed AI service
- auto-update
- MobaXterm/RDCMan import
- autonomous AI execution

## Consequences

The first release can focus on a polished and performant terminal/SSH/SFTP core. The architecture must still leave room for later connection types, but future protocols should not distort the v0.1 implementation.
