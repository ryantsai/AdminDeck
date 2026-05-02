# AdminDeck PRD

## Problem Statement

Administrators, developers, and operators often juggle separate tools for local terminals, SSH sessions, SFTP transfers, saved host lists, and AI-assisted command work. Existing tools either feel dated and Windows-only, focus narrowly on terminal emulation, or carry heavyweight runtime and UI costs that make them feel slow.

AdminDeck is intended to be a fast, professional desktop workspace for personal/local infrastructure administration. The first version should provide the core experience users expect from a modern MobaXterm/RDCMan/VSCode-inspired tool without taking on team sync, RDP, VNC, or cloud services too early.

## Solution

AdminDeck v0.1 will be a Windows-first desktop app built with a Rust/Tauri core and a React/TypeScript interface. It will provide a left-side activity rail with Dashboard and Settings entry points, a connection tree, VSCode-style tabs, split terminal panes, local terminal sessions, SSH sessions, SFTP dual-pane file management, SSH config import, local SQLite connection storage, OS keychain secret storage, and approval-based AI command assistance.

The product will be light chrome with dark terminal panes by default, optimized for dense professional workflows and fast launch. macOS and Linux will follow using the same architecture. Mobile, RDP, VNC, team vaults, and sync are explicitly later-stage work.

## User Stories

1. As a Windows administrator, I want AdminDeck to launch quickly, so that I can start work without waiting on a heavy desktop app.
2. As an operator, I want a left-side connection tree, so that I can open Connections from the root or organize them into folders when useful.
3. As an operator, I want to create saved SSH connections, so that I do not retype hostnames, usernames, ports, or key paths.
4. As an operator, I want optional folders and subfolders in the connection tree, so that I can group hosts by project, environment, customer, or region without forcing every Connection into a folder.
5. As an operator, I want search and filtering in the connection tree, so that large host lists remain usable.
6. As an operator, I want drag/drop reorder in the tree, so that I can keep my workspace arranged naturally.
7. As an operator, I want rename, delete, and duplicate actions for folders and connections, so that connection maintenance is fast.
8. As an operator, I want quick connect, so that I can connect to a host without saving a full connection first.
9. As an SSH user, I want to import entries from my SSH config, so that AdminDeck can bootstrap my existing workflow.
10. As an SSH user, I want imported SSH config entries to preserve host, user, port, identity file, and proxy jump when possible, so that imported connections behave as expected.
11. As an SSH user, I want unsupported SSH config directives to be visible, so that I understand what may need manual adjustment.
12. As a terminal user, I want local terminal tabs, so that AdminDeck can replace my daily terminal for common work.
13. As a terminal user, I want local terminal connections to require no host details, so that launching the default shell is fast and obvious.
14. As a Windows user, I want saved local terminal options for PowerShell, Command Prompt, and WSL, so that local terminals match the shell I need.
15. As a terminal user, I want SSH terminal tabs, so that remote shell work happens in the same workspace as local work.
16. As a terminal user, I want split terminal panes, so that I can monitor and operate multiple shells in one tab.
17. As a terminal user, I want xterm-compatible behavior, so that tools like vim, tmux, htop, btop, lazygit, git, npm, pnpm, and cargo work correctly.
18. As a terminal user, I want truecolor, mouse support, alternate screen, bracketed paste, hyperlinks, and scrollback search, so that modern terminal apps feel correct.
19. As a terminal user, I want configurable font family, font size, line height, cursor style, and scrollback size, so that the terminal fits my workflow.
20. As a terminal user, I want copy-on-select as a toggle, so that I can choose the selection behavior I prefer.
21. As a terminal user, I want multiline paste confirmation, so that accidental command floods are prevented.
22. As a Windows user, I want a configurable default shell, so that local terminals can use PowerShell, Command Prompt, WSL, or another shell later.
23. As an SSH user, I want password authentication, so that I can connect to hosts that do not use key auth.
24. As an SSH user, I want key-file authentication by path, so that AdminDeck uses my existing SSH keys.
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
38. As a user, I want light app chrome with dark terminal panes, so that the interface feels clear while terminals remain comfortable.
39. As a user, I want a Settings entry point that clearly shows Language (i18n) and Color Scheme as planned areas, so that future customization work has an obvious home without implying unfinished controls work today.
40. As a user, I want local SQLite storage for non-secret settings and connections, so that the app remains local-first and reliable.
41. As a user, I want secrets stored in the OS keychain, so that passwords, passphrases, and API keys are not stored in plaintext config.
42. As a user, I want no telemetry by default, so that my terminal and host data remain private.
43. As a user, I want local logs and a diagnostics bundle command, so that I can debug issues without automatic data upload.
44. As a user, I want AI command assistance to draft commands, so that I can move faster without surrendering control.
45. As a user, I want explicit approval before AI-generated commands run, so that destructive or sensitive actions are not executed silently.
46. As a user, I want AI help scoped to the active local or SSH session, so that context stays clear.
47. As a user, I want OpenAI-compatible API configuration, so that I can use my own endpoint, key, and model.
48. As a user, I want Claude Code CLI and Codex CLI paths configurable, so that local agent tools can be used from AdminDeck.
49. As a user, I want Claude Code CLI and Codex CLI integrations restricted to suggest/ask-before-execute where possible, so that they respect the product trust model.
50. As a contributor, I want an Apache-2.0 open-source project, so that licensing is clear and permissive.
51. As a maintainer, I want dependencies compatible with Apache-2.0/MIT/BSD/MPL-style use, so that runtime licensing stays clean.
52. As a maintainer, I want GPL dependencies avoided in the core runtime, so that copyleft obligations are not introduced unintentionally.
53. As a maintainer, I want performance budgets documented, so that architectural decisions can be judged against measurable targets.
54. As a Windows user of the installed app, I want update checks to be enabled by default, so that I learn about stable signed releases without manually monitoring GitHub.
55. As a Windows user of the installed app, I want update installation to require my confirmation, so that AdminDeck does not silently replace itself while I am using administrative tools.
56. As a privacy-conscious user, I want update checks to be clearly described as contacting GitHub Releases/update metadata only, so that the local-first trust model remains understandable.

## Implementation Decisions

- Product name: AdminDeck.
- First shippable target: desktop app.
- Primary acceptance platform: Windows.
- Follow-on platforms: macOS and Linux using the same architecture.
- v0.1 protocols: local terminal, SSH terminal, and SFTP launched from SSH connections only.
- Deferred protocols: RDP, VNC, and lightweight webview tabs.
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
- Storage: local SQLite for connections, optional nested tree folders, settings, layout, recent sessions, and non-secret AI provider metadata.
- Secrets: OS keychain for passwords, SSH passphrases, and AI API keys.
- Optional later idea: portable vault mode could store credentials encrypted in SQLite for portable installs, but only with explicit opt-in, a user-supplied master password, clear lock/unlock behavior, and no plaintext or disk-stored encryption key.
- SSH keys: reference existing key files by path; do not manage/generate keypairs in v0.1.
- AI model: approval-based command assist only.
- AI providers: OpenAI-compatible BYO API key plus Claude Code CLI and Codex CLI adapters.
- CLI agent integrations: suggest-only/ask-before-execute where possible.
- UI model: left activity rail with Dashboard and Settings entries, left-side connection manager/tree with root Connections and optional nested folders, main tab/workspace area, optional bottom/output panel, right AI assistant panel.
- Tab model: VSCode-style tabs with split panes inside terminal tabs. Switching Tabs preserves live local terminal, SSH terminal, and SSH-launched SFTP Sessions; only an explicit tab close action should disconnect or tear down the Session owned by that Tab.
- SFTP model: dual-pane file manager with multi-select drag/drop transfer, scoped file actions, remote properties, chmod/chown editing, and transfer queue, opened from an SSH terminal tab rather than saved as a standalone Connection.
- Settings: current surface is intentionally limited to two to-be-implemented placeholders, Language (i18n) and Color Scheme. Deeper terminal, SSH, SFTP, AI provider, diagnostics, update, and keybinding controls should be reintroduced only when their UX is clear and backed by the existing local storage/keychain boundaries.
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
- SQLite migrations get integration tests.
- Frontend component tests cover connection tree, search/filter, tabs, and split pane behavior where useful.
- Playwright smoke tests cover core UI flows.
- Manual terminal compatibility checklist includes vim, tmux, htop/btop, git, npm, and cargo.
- Windows installer gets a smoke test before v0.1 release.
- Performance checks verify the documented budgets.

## Out of Scope

- Mobile apps for iOS or Android.
- RDP and VNC protocols.
- Lightweight webview/browser tabs.
- Team sharing, team vaults, RBAC, SSO, managed cloud services, or paid AI service.
- Settings sync.
- Global command palette or command launcher.
- Silent, portable ZIP, rollback/downgrade, preview-channel, managed-server, or cross-platform auto-update behavior.
- MobaXterm or RDCMan import.
- Dynamic inventory from files, cloud APIs, Terraform, CMDB, or other external sources.
- Folder sync, diff/compare, transfer resume, archive/extract, and remote file editing in SFTP.
- Fully autonomous AI agent execution.
- Editable keybinding UI.
- Built-in SSH key generation/import/export.
- Optional encrypted SQLite credential vault for portable mode.

## Further Notes

AdminDeck is open-source under Apache-2.0. The codebase should prefer deep modules with small, testable interfaces for storage, connections, terminal sessions, SSH/SFTP transport, renderer abstraction, AI provider adapters, command approval, and importers.

The product should feel like a quiet, dense, professional desktop tool. Avoid marketing-style layouts, decorative gradients, oversized cards, or generic admin-dashboard styling.
