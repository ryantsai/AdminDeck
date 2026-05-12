# KKTerm Roadmap

## Current Progress

The detailed status for each milestone lives in the checkboxes below. Quick snapshot as of May 12, 2026:

- **Milestones A–F** are in or past usable shape: session spine, native SSH/SFTP, AI command-assist with approval and CLI adapters, performance instrumentation behind a renderer-neutral interface, Windows portable ZIP and unsigned NSIS installer with smoke test.
- **Milestone G (v0.2)** is in progress: screenshot capture into AI Assistant context, review-only Assistant extension draft mode, accepted extension platform ADR (`docs/ADR/0005-extension-platform-architecture.md`), and the Dashboard redesign (`docs/DASHBOARD.md`) shipped. RDP ActiveX and VNC `vnc-rs` Connections work end-to-end with snapshot/parking for DOM overlays. SSH config import, diagnostics, and updater UI still need user-facing entry points.
- **Latest validation (May 7, 2026)**: `npm run check`, `npm run build`, `cargo check`, and `cargo test` (103 passed) all clean. `npm run build` still reports Vite's existing chunk-size warning. Previous May 2, 2026 packaging validation passed for `npm run package:portable`, `npm run package:installer`, and `npm run smoke:installer`.

For the operational measurement records (machine specs, numbers vs. budgets) see `docs/PERFORMANCE.md`. For packaging/release artifacts see `docs/RELEASE.md`.

## Milestone 0: Project Foundation

- [x] Confirm working product name: KKTerm.
- [x] Initialize repository structure.
- [x] Add MIT license.
- [x] Add Rust/Tauri/React/Vite scaffold.
- [x] Add Tailwind design tokens.
- [x] Add basic app shell with light chrome and dark terminal surface placeholder.
- [x] Add local logging foundation.
- [x] Add CI skeleton for Windows-first builds.

## Milestone A: Usable Session Spine

- [x] Implement typed Tauri command wrapper.
- [x] Add SQLite schema initialization and repository layer.
- [x] Add OS keychain abstraction.
- [x] Add connection model for local terminal and SSH terminal.
- [x] Add connection tree with root Connections, optional nested folders, search/filter, drag/drop reorder, rename/delete/duplicate, quick connect, and live status badges.
- [x] Add tab workspace.
- [x] Add split panes inside terminal tabs.
- [x] Add local terminal session lifecycle.
- [x] Add Windows local terminal creation options for PowerShell, Command Prompt, and WSL.
- [x] Add initial terminal view using the fastest reliable implementation.
- [x] Add left activity rail with Dashboard and Settings entries.
- [x] Add initial Settings shell with Language (i18n) and Color Scheme placeholders.
- [x] Reintroduce terminal font, line height, cursor, scrollback, copy-on-select, multiline paste confirmation, and default shell controls.

## Milestone B: SSH Core

- [x] Evaluate and choose Rust SSH library. See `docs/ADR/0004-ssh-transport-library.md`.
- [x] Implement in-process SSH connection lifecycle.
- [x] Implement host key verification.
- [x] Implement password auth.
- [x] Implement key-file auth by path.
- [x] Implement SSH agent support where practical.
- [x] Implement terminal channel allocation.
- [x] Implement resize events.
- [x] Keep native SSH terminal Sessions connected while idle and unfocused by avoiding app-side inactivity timeouts.
- [x] Add optional system ssh fallback/debug path.
- [x] Persist SSH defaults for new SSH Connections.
- [x] Add optional tmux session resume for SSH terminal Panes with remote session list and close actions.
- [x] Add bounded silent reattach for tmux-backed native SSH terminal channels after unexpected transport closure.
- [x] Reintroduce SSH defaults controls after the Settings UX is redesigned.
- [x] Add SSH config import command with unsupported directive reporting.

## Milestone C: SFTP Core

- [x] Implement SFTP session reuse from connection credentials where possible.
- [x] Launch SFTP from SSH terminal tabs instead of standalone SFTP Connections.
- [x] Add dual-pane local/remote file manager.
- [x] Add upload and download for files and folders.
- [x] Add multi-select drag/drop upload and download between local and remote panes.
- [x] Add create folder, rename, delete, and refresh.
- [x] Add SFTP context menu with transfer, inline rename, delete, and properties.
- [x] Add remote file properties with chmod and chown editing.
- [x] Add transfer queue with progress and cancellation.
- [x] Add clear transfer history action for finished SFTP transfers.
- [x] Add overwrite behavior setting.
- [x] Prompt on SFTP destination conflicts with overwrite and overwrite-all choices.
- [x] Add "open terminal here."

## Milestone D: AI Command Assist

- [x] Add AI Assistant panel.
- [x] Add OpenAI-compatible provider settings storage.
- [x] Store API keys in OS keychain.
- [x] Add provider-specific model selector with a separate custom model ID field.
- [x] Add command proposal flow.
- [x] Add explicit approval before execution.
- [x] Capture selected command output back into AI context.
- [x] Add Claude Code CLI path configuration.
- [x] Add Codex CLI path configuration.
- [x] Constrain CLI integrations to suggest-only/ask-before-execute where possible.
- [x] Add command planning safety tests.

## Milestone E: Performance and Terminal Quality

- [x] Add local-only performance instrumentation for frontend ready time, terminal Session start time, and Windows process working set.
- [x] Move the bottom Status Bar away from debug timing readouts and toward module-owned status content plus universal transient notices.
- [x] Add backend tests for local-only performance snapshots.
- [x] Define terminal renderer interface in code so xterm can be swapped for a later WGPU renderer.
- [x] Harden the current xterm path for configured scrollback, cursor style, selection/copy handling, multiline paste confirmation, resize propagation, and hyperlinks.
- [x] Add renderer-level terminal scrollback search with pane controls.
- [x] Surface budget-aware status for cold launch, local terminal readiness, SSH terminal readiness, and idle memory.
- [x] Document repeatable performance measurement and terminal compatibility checklist.
- [x] Measure cold launch time.
- [x] Measure new local terminal tab time.
- [x] Measure SSH terminal readiness after auth.
- [x] Measure idle memory.
- [x] Run manual compatibility checklist: vim, tmux, htop/btop, git, npm, cargo, and pane scrollback search.
- [x] Harden terminal bracketed paste, mouse support, and alternate screen behavior against the manual compatibility checklist.
- [x] Fix xterm fit/pixel geometry so maximized Windows terminal panes do not clip bottom status lines.
- [x] Decide against starting a WGPU renderer prototype for now; keep the xterm WebGL fast path.

## Milestone F: Packaging and v0.1 Release

- [x] Build Windows .msi or .exe installer.
- [x] Build Windows portable ZIP.
- [x] Smoke test installer.
- [x] Publish GitHub Release.
- [x] Document no-telemetry posture.
- [x] Document diagnostics bundle flow.
- [x] Document known limitations.

## Milestone G: v0.2 Expansion

### Assistant Context and Automation

- [x] Add screenshot capture for the active connection window/workspace surface, copied to the system clipboard.
- [x] Add partial-area screenshot capture from a terminal Pane, SFTP view, URL view, RDP view, VNC shell, or other workspace surface.
- [x] Send captured screenshots to the AI Assistant for analysis with explicit user action.
- [x] Add review-only AI Assistant extension draft mode.
- [ ] Implement AI Assistant composer context attachments for files/photos, screenshots, and terminal buffer snippets from the `+` menu.
- [ ] Support asking the AI Assistant to create installable extensions against the approved extension platform architecture.
- [ ] Keep extension-generation flows approval-based before installing or running generated code.
- [x] Language output setting for UI assistant - follow UI language or specific language.
- [ ] Expand AI Assistant orchestration so it can (with explicit approval) automate more workflows: import Connection entries from multiple formats, monitor existing Connections, rename/reorganize layouts, help create plugins, and optionally relay remote-assistant interactions through Telegram/WhatsApp/LINE integrations.

### UI Customization

- [x] Optimize the overall UI/UX for cleaner, more straightforward daily use.
- [ ] Simplify common workflows and reduce unnecessary visual or interaction complexity.
- [x] Review navigation, workspace layout, settings, connection management, terminal panes, SFTP flows, and AI Assistant entry points for clarity.
- [x] Add a more colorful default UI while preserving dense, professional workspace ergonomics.
- [x] Implement Color Scheme settings for app chrome and workspace surfaces.
- [x] Implement Language (i18n) settings.

### Extension Platform

- [ ] Add extension support for user-installed features.
- [x] Define extension permissions, install/update lifecycle, storage access, and trust boundaries before enabling general extension execution. See `docs/ADR/0005-extension-platform-architecture.md`.

### Connection and Workspace Expansion

- [ ] Add macOS packaging with .dmg.
- [ ] Add Linux packaging with AppImage/deb/rpm where reasonable.
- [ ] Add WGPU terminal renderer replacement if not already complete.
- [x] Add durable RDP connection type.
- [x] Add durable VNC connection type.
- [x] Implement Windows-native RDP session transport with Microsoft RDP ActiveX COM hosting.
- [x] Add RDP ActiveX snapshot/parking for app-owned DOM overlays so dialogs, screenshot menus, and Region selection are not covered by the native child HWND.
- [ ] Add configurable RDP session options (for example: display quality/performance tuning, clipboard mapping, and related redirect/security controls).
- [x] Implement VNC session transport with `vnc-rs` framebuffer rendering and pointer/key input.
- [x] Add MobaXterm/RDCMan import.
- [ ] Add SFTP folder sync/diff/resume.

### Workspace Modules and Dashboard Widgets

- [x] Implement the Dashboard module v1: localStorage-backed widget playground with prebuilt widgets (hash, subnet, quick tools, maintenance report, App Launcher) and an AI-Assistant `agent` widget path.
- [x] Replace the standalone App Launcher module direction with a Dashboard App Launcher widget: users add the widget to a Dashboard view, add local app/shortcut/script/file entries inside it, and see each entry as an icon with text while edit/remove/alternate launch actions stay in a right-click context menu.
- [ ] Redesign the Dashboard module per `docs/DASHBOARD.md`: SQLite-backed views/instances/custom widgets, nine visual presets, per-widget accent/icon/title customization, drag-and-drop layout via `react-grid-layout`, AI Assistant atomic Tauri-command tool surface, and a three-kind widget model (`builtIn`, `content`, `script`) with `iframe srcdoc` script hosting. Ship with one Default view containing one App Launcher widget. Legacy bodies (hash/subnet/quick tools/report) keep their internals and are slated for follow-up redesign.
- [ ] Follow-up: redesign legacy widget bodies (hash, subnet, quick tools, maintenance report) to take full advantage of the new preset chrome.
- [ ] Follow-up: add native data widgets (Clock, Weather, CPU, Memory, Recent Hosts, Session Activity, Today's Brief) once the underlying Tauri data sources land.
- [ ] Follow-up: add a user-facing "Create custom widget" dialog so authoring is not AI-only.
- [ ] Implement the File Explorer module: a lightning-fast alternative local file explorer optimized for speed and dense professional workflows.
- [ ] Wire the built-in modules (Workspace, Dashboard, File Explorer) into the activity rail as peer top-level entries, each with its own content area and active-page routing.

### Distribution, Sync, and Trust

- [ ] Add Windows installed-app auto-update mechanism for v0.2.
- [ ] Use signed Tauri updater artifacts as a release gate for any user-facing update flow.
- [ ] Use GitHub Releases static updater metadata for the stable update channel.
- [ ] Enable update checks by default with clear local-first wording and no telemetry beyond the updater request.
- [ ] Keep update installation user-mediated through Settings plus a lightweight app-chrome update notification.
- [ ] Support normal forward updates only; defer rollback, downgrade, preview channels, managed update servers, silent installs, and portable ZIP self-update.
- [ ] Add optional portable encrypted credential vault for users who need secrets to travel with a portable install.
- [ ] Add optional crash reporting after explicit opt-in design.
- [ ] Evaluate team sharing/sync as a major product-scope decision before implementation.
- [ ] Evaluate mobile apps as a major platform-scope decision after desktop architecture proves itself.

## Milestone H: v0.3 Horizon

### AI Assistant Tool Calling and Context

- [ ] Add AI Assistant tool calling support for local tools (rg, curl, filesystem search) and web search.
- [ ] Allow AI Assistant to read the current active Connection text buffer.
- [ ] Allow AI Assistant to reference previous session text buffers via RAG/agentic search.
- [ ] Add voice input for AI Assistant with local model support.
- [ ] Add MCP (Model Context Protocol) server support so the AI Assistant and external agents can automate KKTerm workflows through the MCP protocol.

### Session Logging and Universal Search

- [ ] Autosave all SSH/Terminal/Telnet/Serial text buffers to plain-text log files by default, organized by Connection name and random serial number under a sensible folder structure.
- [ ] Add a button in the Connection pane to browse the session log list for a Connection.
- [ ] Add universal search across all session logs and Connection items.

### Recording

- [ ] Add RDP/VNC screen recording.

### Additional Protocol Support

- [ ] Add Apple Remote Desktop support (low priority).
- [ ] Add Hyper-V client support (low priority).
- [ ] Add VMware vSphere support (low priority).

### IT Ops Center (Future Idea)

- [ ] Add a simple workflow engine for IT operations that runs against selected SSH/Telnet/Serial Connections with explicit per-run approval.
- [ ] Add batch command broadcast to multiple Connections (target by tag, folder, or multi-select) with per-host output panes and a consolidated result view.
- [ ] Add automated server-update playbooks (e.g. `apt`, `dnf`, `yum`, Windows Update via WinRM) with dry-run preview, host grouping, and rollback-aware sequencing.
- [ ] Add AI-enabled triggers that watch terminal output, SFTP changes, or scheduled probes and propose follow-up workflow runs through the AI Assistant approval flow.
- [ ] Add a workflow library with reusable steps (run command, copy file via SFTP, wait, conditional branch) and durable run history, scoped to local-first storage with no telemetry.
- [ ] Decide credential, secret-redaction, and audit-log boundaries for workflow execution before enabling general operator use.

### Content Comparison and Sync

- [ ] Add a Beyond Compare-like diff/merge tool for side-by-side file and directory comparison, with sync and merge actions across local and remote (SFTP) paths.

### System Utilities

- [x] Add a "Don't Sleep" tool that, when enabled, prevents Windows from sleeping, suspending, hibernating, or shutting down.

### UI/UX optimizations

- [ ] Add editable keybindings.
