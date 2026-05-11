# KKTerm PRD

## Problem Statement

Administrators, developers, and operators often juggle separate tools for local terminals, SSH sessions, SFTP transfers, saved host lists, and AI-assisted command work. Existing tools either feel dated and Windows-only, focus narrowly on terminal emulation, or carry heavyweight runtime and UI costs that make them feel slow.

KKTerm is intended to be a fast, professional desktop workspace for personal/local infrastructure administration. The first version should provide the core experience users expect from a modern MobaXterm/RDCMan/VSCode-inspired tool without taking on team sync, RDP, VNC, or cloud services too early.

## Solution

KKTerm v0.1 will be a Windows-first desktop app built with a Rust/Tauri core and a React/TypeScript interface. It organizes functionality into built-in modules accessible from a left-side activity rail: **Workspace** (remote connection manager with VSCode-style tabs, split terminal panes, local terminal sessions, SSH sessions with optional tmux resume, SFTP dual-pane file management, RDP, VNC, and URL connections), **Dashboard** (dynamic widget playground with prebuilt tools, reports, and an App Launcher widget for quick-launch apps/files), and **File Explorer** (lightning-fast alternative local file browser).

Under the hood it provides explicit screenshot capture to clipboard for workspace surfaces, backend SSH config import support, local SQLite connection storage, OS keychain secret storage, and approval-based AI command assistance.

The product will be light chrome with dark terminal panes by default, optimized for dense professional workflows and fast launch. macOS and Linux will follow using the same architecture. Mobile, RDP, VNC, team vaults, and sync are explicitly later-stage work.

## User Stories

1. As a Windows administrator, I want KKTerm to launch quickly, so that I can start work without waiting on a heavy desktop app.
2. As an operator, I want a left-side connection tree, so that I can open Connections from the root or organize them into folders when useful.
3. As an operator, I want to create saved SSH connections, so that I do not retype hostnames, usernames, ports, or key paths.
4. As an operator, I want optional folders and subfolders in the connection tree, so that I can group hosts by project, environment, customer, or region without forcing every Connection into a folder.
5. As an operator, I want search and filtering in the connection tree, so that large host lists remain usable.
6. As an operator, I want drag/drop reorder in the tree, so that I can keep my workspace arranged naturally.
7. As an operator, I want rename, delete, and duplicate actions for folders and connections, so that connection maintenance is fast.
8. As an operator, I want quick connect, so that I can connect to a host without saving a full connection first.
9. As an SSH user, I want to import entries from my SSH config, so that KKTerm can bootstrap my existing workflow.
10. As an SSH user, I want imported SSH config entries to preserve host, user, port, identity file, and proxy jump when possible, so that imported connections behave as expected.
11. As an SSH user, I want unsupported SSH config directives to be visible, so that I understand what may need manual adjustment.
11a. As an operator coming from another tool, I want to import Connections in bulk from CSV/TSV, RDCMan `.rdg`, MobaXterm `.mxtsessions`, or PuTTY `.reg` exports, so that I can populate KKTerm without retyping every host. Imported nested folders should round-trip as ConnectionFolders.
11b. As an operator on a new network, I want a light TCP port scan over a single host, hyphen range, or CIDR (capped per scan) with SSH/Telnet/RDP probes, so that I can seed Connection drafts from what is actually reachable.
11c. As an operator, I want an editable preview before imported Connections are persisted, with bulk username and optional bulk password actions across the current selection, so that I can fix placeholder values once instead of per row.
12. As a terminal user, I want local terminal tabs, so that KKTerm can replace my daily terminal for common work.
13. As a terminal user, I want local terminal connections to require no host details, so that launching the default shell is fast and obvious.
14. As a Windows user, I want saved local terminal options for PowerShell, Command Prompt, and WSL, so that local terminals match the shell I need.
15. As a terminal user, I want SSH terminal tabs with optional named tmux session resume per Pane, so that remote shell work happens in the same workspace as local work and can return to the same remote context.
16. As a terminal user, I want split terminal panes, so that I can monitor and operate multiple shells in one tab.
17. As a terminal user, I want xterm-compatible behavior, so that tools like vim, tmux, htop, btop, lazygit, git, npm, pnpm, and cargo work correctly.
18. As a terminal user, I want truecolor, mouse support, alternate screen, bracketed paste, hyperlinks, and scrollback search, so that modern terminal apps feel correct.
19. As a terminal user, I want configurable font family, font size, line height, cursor style, and scrollback size, so that the terminal fits my workflow.
20. As a terminal user, I want copy-on-select as a toggle, so that I can choose the selection behavior I prefer.
21. As a terminal user, I want multiline paste confirmation, so that accidental command floods are prevented.
22. As a Windows user, I want a configurable default shell, so that local terminals can use PowerShell, Command Prompt, WSL, or another shell later.
23. As an SSH user, I want password authentication, so that I can connect to hosts that do not use key auth.
24. As an SSH user, I want key-file authentication by path, so that KKTerm uses my existing SSH keys.
25. As an SSH user, I want SSH agent support where practical, so that I can use existing key workflows.
26. As an SSH user, I want known-host verification, so that first connections and host-key changes are explicit.
27. As an SSH user, I want resize events to propagate to remote terminals, so that full-screen terminal apps render correctly.
28. As an SSH user, I want to open SFTP from an SSH terminal, so that file transfer uses the same saved Connection instead of a separate SFTP entry.
29. As an SFTP user, I want a dual-pane file manager, so that local and remote files can be transferred without switching tools.
30. As an SFTP user, I want upload and download for files and folders, so that common transfer work is covered.
31. As an SFTP user, I want create folder, rename, delete, and refresh, so that I can manage remote files.
32. As an SFTP user, I want multi-select drag/drop transfer between local and remote panes, so that batch upload and download feels natural.
33. As an SFTP user, I want a focused right-click menu with transfer, rename, delete, and properties, so that file actions stay predictable in the SFTP workspace.
34. As an SFTP user, I want remote properties with chmod and chown controls, so that permission and ownership fixes can be made without leaving the app.
35. As an SFTP user, I want a transfer queue with progress, cancellation, and clearable finished history, so that long operations are visible without old records piling up.
36. As an SFTP user, I want an "open terminal here" action, so that I can jump from remote file navigation to shell work.
37. As an SFTP user, I want overwrite prompts with an overwrite-all option, so that file transfer conflicts stay explicit without slowing down large batches.
38. As a user, I want to capture an entire active workspace surface or a selected Region to the clipboard, so that I can share visible terminal, SFTP, URL, RDP, or VNC context without saving files.
39. As a user, I want light app chrome with dark terminal panes, so that the interface feels clear while terminals remain comfortable.
40. As a user, I want a Settings entry point that clearly shows Language (i18n) and Color Scheme as planned areas, so that future customization work has an obvious home without implying unfinished controls work today.
41. As a user, I want local SQLite storage for non-secret settings and connections, so that the app remains local-first and reliable.
42. As a user, I want secrets stored in the OS keychain, so that passwords, passphrases, and API keys are not stored in plaintext config.
43. As a user, I want no telemetry by default, so that my terminal and host data remain private.
44. As a user, I want local logs and a diagnostics bundle command, so that I can debug issues without automatic data upload.
45. As a user, I want AI command assistance to draft commands, so that I can move faster without surrendering control.
46. As a user, I want explicit approval before AI-generated commands run, so that destructive or sensitive actions are not executed silently.
47. As a user, I want AI help scoped to the active local or SSH session, so that context stays clear.
48. As a user, I want OpenAI-compatible API configuration, so that I can use my own endpoint, key, and model.
49. As a user, I want Claude Code CLI and Codex CLI paths configurable, so that local agent tools can be used from KKTerm.
50. As a user, I want Claude Code CLI and Codex CLI integrations restricted to suggest/ask-before-execute where possible, so that they respect the product trust model.
51. As a contributor, I want an MIT open-source project, so that licensing is clear and permissive.
52. As a maintainer, I want dependencies compatible with MIT/Apache-2.0/BSD/MPL-style use, so that runtime licensing stays clean.
53. As a maintainer, I want GPL dependencies avoided in the core runtime, so that copyleft obligations are not introduced unintentionally.
54. As a maintainer, I want performance budgets documented, so that architectural decisions can be judged against measurable targets.
55. As a Windows user of the installed app, I want update checks to be enabled by default, so that I learn about stable signed releases without manually monitoring GitHub.
56. As a Windows user of the installed app, I want update installation to require my confirmation, so that KKTerm does not silently replace itself while I am using administrative tools.
57. As a privacy-conscious user, I want update checks to be clearly described as contacting GitHub Releases/update metadata only, so that the local-first trust model remains understandable.
58. As a power user, I want the AI Assistant to draft KKTerm extensions with manifests, permissions, and source files, so that I can explore workflow automation without generated code being installed or run automatically.

## Implementation Decisions

- Product name: KKTerm.
- First shippable target: desktop app.
- Primary acceptance platform: Windows.
- Follow-on platforms: macOS and Linux using the same architecture.
- v0.1 protocols: local terminal, SSH terminal, and SFTP launched from SSH connections only.
- v0.2 protocols in progress: URL, RDP, and VNC Connections.
- Deferred protocols beyond the current desktop set: additional remote desktop/import integrations and any team/cloud transport.
- Desktop shell: Tauri v2.
- Core/backend: Rust.
- Frontend: React, TypeScript, and Vite.
- UI primitives: Radix UI or Ariakit.
- Icons: lucide-react.
- Styling: Tailwind with strict design tokens and CSS variables.
- Variant helpers: class-variance-authority where useful.
- State management: Zustand or TanStack Store.
- Command boundary: typed Tauri command wrapper.
- Terminal parsing/state: evaluate and prefer alacritty_terminal.
- PTY/session handling: evaluate portable-pty and lower-level platform-specific options.
- Rendering: staged approach. Prove sessions/UI first with the fastest reliable terminal view, while isolating renderer responsibilities for a later WGPU renderer.
- Renderer boundary must isolate terminal state/input, glyph atlas/shaping, scrollback, selection/copy, cursor rendering, and dirty-region updates.
- SSH/SFTP implementation: in-process Rust implementation as primary path.
- SSH library candidates: evaluate russh first, ssh2/libssh2 as fallback candidate.
- System ssh: optional fallback/debug path only.
- Storage: local SQLite for connections, optional nested tree folders, settings, layout, recent sessions, non-secret SSH tmux launch preferences, and non-secret AI provider metadata.
- Secrets: OS keychain for passwords, SSH passphrases, and AI API keys.
- Optional later idea: portable vault mode could store credentials encrypted in SQLite for portable installs, but only with explicit opt-in, a user-supplied master password, clear lock/unlock behavior, and no plaintext or disk-stored encryption key.
- SSH keys: reference existing key files by path; do not manage/generate keypairs in v0.1.
- AI model: approval-based command assist only.
- AI providers: OpenAI-compatible BYO API key plus Claude Code CLI and Codex CLI adapters.
- CLI agent integrations: suggest-only/ask-before-execute where possible.
- UI model: left Activity Rail with Workspace, Dashboard, File Explorer, and Settings entries, left-side connection manager/tree with root Connections and optional nested folders (visible inside the Workspace module), main module content area, right AI Assistant panel, and a bottom app-wide **Status Bar** that remains visible across modules and pages.
- Dashboard/App Launcher model: App Launcher is a Dashboard widget, not a standalone module. Users add the App Launcher widget to a Dashboard view, then add local app, shortcut, script, or file entries inside that widget. Once an entry exists, the visible widget surface should stay reduced to an icon and text label per entry; edit, remove, launch-as-administrator, launch-as-different-user, and other management controls belong in an app-owned right-click context menu.
- Status Bar model: the left segment is module-owned; Workspace shows host CPU, RAM, downstream transfer rate, and upstream transfer rate, while Settings intentionally leaves this segment empty for now. The center segment is the universal notifications text area used by all modules for transient status and error notices.
- Tab model: VSCode-style tabs with split panes inside terminal tabs. Switching Tabs preserves live local terminal, SSH terminal, and SSH-launched SFTP Sessions; only an explicit tab close action should disconnect or tear down the Session owned by that Tab.
- SSH tmux model: SSH Connections can opt into tmux session launch by default. Each SSH terminal Pane gets a generated friendly tmux session id like `kkterm-cockpit001`, starts or attaches with `tmux new-session -A`, falls back to a normal remote shell if `tmux` is missing, and exposes a Pane-toolbar tag that lists attached and detached remote tmux sessions with explicit close actions. Quiet native SSH Sessions should not disconnect because the app is idle or unfocused; tmux-backed native SSH terminal Sessions may silently make a small bounded attempt to reattach to the same Pane tmux id if the transport breaks.
- SFTP model: dual-pane file manager with multi-select drag/drop transfer, scoped file actions, remote properties, chmod/chown editing, and transfer queue, opened from an SSH terminal tab rather than saved as a standalone Connection.
- Screenshot model: explicit user action only. Terminal Panes expose screenshot capture in the Pane toolbar; SFTP, URL, RDP, and VNC workspaces expose it in the top toolbar. Region and Entire Window/Panel captures can be copied to the system clipboard or attached as transient AI Assistant screenshot context. KKTerm does not persist captured screenshots. There is no standalone screenshot gallery page.
- RDP overlay model: the Windows RDP ActiveX host is a native child HWND and must not be expected to layer beneath React UI through CSS alone. When app-owned DOM overlays such as Add Connection, connection tree context menus, screenshot menus, or Region selection appear over an active RDP workspace, KKTerm should snapshot the visible RDP view, park/hide the ActiveX host, and show the snapshot beneath the overlay until normal RDP visibility resumes. Product designs that require live UI above RDP without parking the host require a native popup/owned-window overlay or a different RDP rendering architecture, not z-index tuning.
- Extension draft model: the AI Assistant may draft extension designs, manifests, permission requests, and source files when explicitly asked. Until the extension platform exists, this is review-only and must not install, enable, write, run, load, or verify generated extension code.
- Extension platform model: v0.2 extension support must be manifest-first, permissioned, user-mediated, and isolated. See `docs/ADR/0005-extension-platform-architecture.md` for the initial permission, lifecycle, storage, and trust-boundary decision.
- Settings: each section is a separate page component under `src/settings/`, routed by the Settings shell (`src/settings/SettingsPage.tsx`) with a sidebar nav. Sections are General, Appearance, AI Assistant, SSH, Terminal, URL, Remote Desktop (RDP), VNC, and About. General contains Language (i18n), workspace access toggles, Settings data actions, backup/import/database-folder actions, and Reset All Settings; Appearance contains App UI font, layout reset, and Color Scheme; AI Assistant contains provider connection, response defaults, and Assistant tool calling; SSH contains SSH defaults, authentication defaults, SSH terminal behavior, and port redirect visibility; Terminal contains editable local terminal behavior; URL contains URL security, saved website password metadata, and URL data shard management; RDP and VNC expose planned quality default summaries. Settings controls should use consistent fieldset/legend group boxes, editable inputs should look editable in the default color scheme, and destructive global actions should stay in General → Settings data with app-owned confirmation dialogs. Diagnostics, update, SSH config import, and keybinding controls should be reintroduced only when their UX is clear and backed by the existing local storage/keychain boundaries.
- SSH config import: the parser and typed Tauri command remain in place, but the previous top chrome import button has been removed. A visible import entry point should return through the connection tree or Settings only when that flow has a clear home.
- Privacy: no telemetry or automatic crash upload in v0.1.
- Distribution: Windows .msi or .exe installer, portable ZIP for dev/test, GitHub Releases. macOS .dmg and Linux AppImage/deb/rpm later.
- v0.2 update mechanism: Windows installed app only, stable channel only, GitHub Releases static updater metadata, signed Tauri updater artifacts required for any user-facing update flow, update checks enabled by default with clear local-first wording, and user-mediated install from Settings plus a lightweight app-chrome update notification.
- v0.2 update limitations: normal forward updates only. Defer rollback, downgrade, preview channels, managed update servers, silent installs, cross-platform updater support, and portable ZIP self-update.

## Performance Budgets

- Cold launch to usable window: under 500 ms target, under 1 second acceptable on a normal development machine.
- New local terminal tab: under 100 ms.
- SSH tab after authentication: under 150 ms to terminal ready, excluding network time.
- Terminal rendering: 60 FPS under normal output and graceful behavior under heavy output.
- Idle memory: under 150 MB target.
- Package size: small enough to feel native, not Electron-scale if avoidable.

## Testing Decisions

- Test external behavior rather than implementation details.
- Rust unit tests cover config, storage, SSH config import, and AI command planning safety.
- SQLite schema initialization gets integration tests.
- Frontend component tests cover connection tree, search/filter, tabs, and split pane behavior where useful.
- Playwright smoke tests cover core UI flows.
- Manual terminal compatibility checklist includes vim, tmux, htop/btop, git, npm, and cargo.
- Windows installer gets a smoke test before v0.1 release.
- Performance checks verify the documented budgets.

## Out of Scope

- Mobile apps for iOS or Android.
- Additional remote desktop protocols beyond RDP and VNC.
- Team sharing, team vaults, RBAC, SSO, managed cloud services, or paid AI service.
- Settings sync.
- Global command palette or command launcher.
- Silent, portable ZIP, rollback/downgrade, preview-channel, managed-server, or cross-platform auto-update behavior.
- Dynamic inventory from cloud APIs, Terraform, CMDB, or other external sources beyond the supported file imports (CSV/TSV, RDCMan `.rdg`, MobaXterm `.mxtsessions`, PuTTY `.reg`) and the bundled light TCP port scan.
- Folder sync, diff/compare, transfer resume, archive/extract, and remote file editing in SFTP.
- Fully autonomous AI agent execution.
- Editable keybinding UI.
- Optional encrypted SQLite credential vault for portable mode.

## Further Notes

KKTerm is open-source under MIT. The codebase should prefer deep modules with small, testable interfaces for storage, connections, terminal sessions, SSH/SFTP transport, renderer abstraction, AI provider adapters, command approval, and importers.

The product should feel like a quiet, dense, professional desktop tool. Avoid marketing-style layouts, decorative gradients, oversized cards, or generic admin-dashboard styling.
