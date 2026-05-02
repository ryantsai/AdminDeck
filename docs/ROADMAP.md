# AdminDeck Roadmap

## Current Progress

As of May 2, 2026, Milestone A has a usable session spine in place: typed frontend Tauri commands, SQLite-backed durable Connections and folders, OS keychain operations, connection tree CRUD/search/reorder, quick connect, tabs, split terminal panes, xterm-based local terminal sessions, terminal settings, and live status badges derived from active workspace Sessions.

Milestone B has started with the accepted Rust SSH direction, durable SSH `proxyJump` storage, native `russh` SSH terminal lifecycle for key-file, password, and SSH-agent Connections without `ProxyJump`, app-local known-host verification for native SSH sessions with explicit first-use trust and changed-key blocking, system `ssh` debug/fallback support for `ProxyJump` sessions, an SSH config import preview that preserves `HostName`, `User`, `Port`, `IdentityFile`, and `ProxyJump` while reporting unsupported directives before saving drafts as Connections, and persisted SSH defaults for new SSH/SFTP Connections.

Milestone C has started with native `russh-sftp` sessions that reuse stored SFTP Connection credentials, OS-keychain passwords, and app-local SSH known-host verification for non-`ProxyJump` Connections. SFTP tabs now open a backend session, list the remote home directory, close the session with the tab view, present a real dual-pane local/remote file manager with refresh, parent navigation, and folder opening on both sides, support upload/download of selected files or folders with configurable overwrite behavior, provide remote create folder, rename, and delete actions, include a visible transfer queue with byte progress and cancellation for queued or active transfers, and can open an SSH terminal at the current remote directory.

Milestone D has a right-side AI assistant panel that scopes requests to the active workspace Tab, captures explicitly selected terminal output into assistant context, stages command proposals, keeps approval or rejection explicit without executing commands, persists non-secret OpenAI-compatible provider settings including model and CLI adapter paths, stores AI API keys in the OS keychain, constrains CLI adapters to suggest-only policy, and runs command-planning safety classification before a proposal is staged.

Milestone E has started with local-only performance instrumentation that surfaces frontend ready time, local terminal Session start timing, native SSH post-auth terminal readiness timing, Windows process working set, and budget status in the app chrome without adding telemetry or logging terminal contents. Native SSH post-auth readiness is retained in local performance snapshots and diagnostics manifests after a native SSH Session starts, and can be measured repeatably with `npm run measure:ssh-readiness` against a trusted non-`ProxyJump` SSH Connection. The current xterm terminal renderer now sits behind a small renderer-neutral interface, loads hyperlink and scrollback-search support, keeps terminal behavior configured through stored terminal settings, propagates cell and pixel terminal geometry to local PTYs and native SSH channels, and has backend tests covering performance snapshot basics. Manual performance and terminal compatibility checks now live in `docs/PERFORMANCE.md`.

Milestone F has started with a repeatable Windows portable ZIP packaging flow that builds the release executable, stages release/privacy documentation, writes a package manifest, and emits a SHA-256 checksum under `artifacts/`. It now also has a repeatable unsigned Windows NSIS setup executable packaging flow that copies the installer into `artifacts/` with a SHA-256 checksum, plus a repeatable installer smoke test that verifies the checksum, silently installs to a temporary directory, confirms the installed executable, and silently uninstalls.

Latest validation on May 2, 2026: `npm run package:portable`, `npm run package:installer`, `npm run smoke:installer`, `npm run check`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `cargo test --manifest-path src-tauri/Cargo.toml` passed after the packaging batches. `npm run package:portable` and `npm run package:installer` include `npm run build`. The frontend production build still reports Vite's existing chunk-size warning.

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
- [x] Add upload and download for files and folders.
- [x] Add create folder, rename, delete, and refresh.
- [x] Add transfer queue with progress and cancellation.
- [x] Add overwrite behavior setting.
- [x] Add "open terminal here."

## Milestone D: AI Command Assist

- [x] Add AI assistant panel.
- [x] Add OpenAI-compatible provider settings.
- [x] Store API keys in OS keychain.
- [x] Add model selector.
- [x] Add command proposal flow.
- [x] Add explicit approval before execution.
- [x] Capture selected command output back into AI context.
- [x] Add Claude Code CLI path configuration.
- [x] Add Codex CLI path configuration.
- [x] Constrain CLI integrations to suggest-only/ask-before-execute where possible.
- [x] Add command planning safety tests.

## Milestone E: Performance and Terminal Quality

- [x] Add local-only performance instrumentation for frontend ready time, terminal Session start time, and Windows process working set.
- [x] Add backend tests for local-only performance snapshots.
- [x] Define terminal renderer interface in code so xterm can be swapped for a later WGPU renderer.
- [x] Harden the current xterm path for configured scrollback, cursor style, selection/copy handling, multiline paste confirmation, resize propagation, and hyperlinks.
- [x] Add renderer-level terminal scrollback search with pane controls.
- [x] Surface budget-aware status for cold launch, local terminal readiness, SSH terminal readiness, and idle memory.
- [x] Document repeatable performance measurement and terminal compatibility checklist.
- [x] Measure cold launch time.
- [x] Measure new local terminal tab time.
- [ ] Measure SSH terminal readiness after auth.
- [x] Measure idle memory.
- [ ] Run manual compatibility checklist: vim, tmux, htop/btop, git, npm, cargo, and pane scrollback search.
- [x] Harden terminal bracketed paste, mouse support, and alternate screen behavior against the manual compatibility checklist.
- [ ] Start WGPU renderer prototype if Milestone A terminal integration limits are clear.

## Milestone F: Packaging and v0.1 Release

- [x] Build Windows .msi or .exe installer.
- [x] Build Windows portable ZIP.
- [x] Smoke test installer.
- [ ] Publish GitHub Release.
- [x] Document no-telemetry posture.
- [x] Document diagnostics bundle flow.
- [x] Document known limitations.

## Milestone G: v0.2 Expansion

### Assistant Context and Automation

- [ ] Add screenshot capture for the active connection window.
- [ ] Add partial-area screenshot capture from a terminal pane, SFTP view, or other workspace surface.
- [ ] Send captured screenshots to the AI assistant for analysis with explicit user action.
- [ ] Support asking the AI assistant to create extensions.
- [ ] Keep extension-generation flows approval-based before installing or running generated code.

### UI Customization

- [ ] Optimize the overall UI/UX for cleaner, more straightforward daily use.
- [ ] Simplify common workflows and reduce unnecessary visual or interaction complexity.
- [ ] Review navigation, workspace layout, settings, connection management, terminal panes, SFTP flows, and AI assistant entry points for clarity.
- [ ] Add a more colorful default UI while preserving dense, professional workspace ergonomics.
- [ ] Add theme support for app chrome and workspace surfaces.
- [ ] Add editable keybindings.

### Extension Platform

- [ ] Add extension support for user-installed features.
- [ ] Define extension permissions, install/update lifecycle, storage access, and trust boundaries before enabling general extension execution.

### Connection and Workspace Expansion

- [ ] Add macOS packaging with .dmg.
- [ ] Add Linux packaging with AppImage/deb/rpm where reasonable.
- [ ] Add WGPU terminal renderer replacement if not already complete.
- [ ] Add lightweight webview tab.
- [ ] Add RDP connection type.
- [ ] Add VNC connection type.
- [ ] Add MobaXterm/RDCMan import.
- [ ] Add SFTP folder sync/diff/resume.

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
