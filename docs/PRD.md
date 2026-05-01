# AdminDeck PRD

## Problem Statement

Administrators, developers, and operators often juggle separate tools for local terminals, SSH sessions, SFTP transfers, saved host lists, and AI-assisted command work. Existing tools either feel dated and Windows-only, focus narrowly on terminal emulation, or carry heavyweight runtime and UI costs that make them feel slow.

AdminDeck is intended to be a fast, professional desktop workspace for personal/local infrastructure administration. The first version should provide the core experience users expect from a modern MobaXterm/RDCMan/VSCode-inspired tool without taking on team sync, RDP, VNC, or cloud services too early.

## Solution

AdminDeck v0.1 will be a Windows-first desktop app built with a Rust/Tauri core and a React/TypeScript interface. It will provide a left-side connection tree, VSCode-style tabs, split terminal panes, local terminal sessions, SSH sessions, SFTP dual-pane file management, SSH config import, local SQLite connection storage, OS keychain secret storage, and approval-based AI command assistance.

The product will be light chrome with dark terminal panes by default, optimized for dense professional workflows and fast launch. macOS and Linux will follow using the same architecture. Mobile, RDP, VNC, team vaults, and sync are explicitly later-stage work.

## User Stories

1. As a Windows administrator, I want AdminDeck to launch quickly, so that I can start work without waiting on a heavy desktop app.
2. As an operator, I want a left-side connection tree, so that I can organize hosts in folders like RDCMan or MobaXterm.
3. As an operator, I want to create saved SSH connections, so that I do not retype hostnames, usernames, ports, or key paths.
4. As an operator, I want folders in the connection tree, so that I can group hosts by project, environment, customer, or region.
5. As an operator, I want tags on connections, so that I can find related hosts across folder boundaries.
6. As an operator, I want search and filtering in the connection tree, so that large host lists remain usable.
7. As an operator, I want drag/drop reorder in the tree, so that I can keep my workspace arranged naturally.
8. As an operator, I want rename, delete, and duplicate actions for folders and connections, so that connection maintenance is fast.
9. As an operator, I want quick connect, so that I can connect to a host without saving a full connection first.
10. As an SSH user, I want to import entries from my SSH config, so that AdminDeck can bootstrap my existing workflow.
11. As an SSH user, I want imported SSH config entries to preserve host, user, port, identity file, and proxy jump when possible, so that imported connections behave as expected.
12. As an SSH user, I want unsupported SSH config directives to be visible, so that I understand what may need manual adjustment.
13. As a terminal user, I want local terminal tabs, so that AdminDeck can replace my daily terminal for common work.
14. As a terminal user, I want SSH terminal tabs, so that remote shell work happens in the same workspace as local work.
15. As a terminal user, I want split terminal panes, so that I can monitor and operate multiple shells in one tab.
16. As a terminal user, I want xterm-compatible behavior, so that tools like vim, tmux, htop, btop, lazygit, git, npm, pnpm, and cargo work correctly.
17. As a terminal user, I want truecolor, mouse support, alternate screen, bracketed paste, hyperlinks, and scrollback search, so that modern terminal apps feel correct.
18. As a terminal user, I want configurable font family, font size, line height, cursor style, and scrollback size, so that the terminal fits my workflow.
19. As a terminal user, I want copy-on-select as a toggle, so that I can choose the selection behavior I prefer.
20. As a terminal user, I want multiline paste confirmation, so that accidental command floods are prevented.
21. As a Windows user, I want a configurable default shell, so that local terminals can use PowerShell, Command Prompt, WSL, or another shell later.
22. As an SSH user, I want password authentication, so that I can connect to hosts that do not use key auth.
23. As an SSH user, I want key-file authentication by path, so that AdminDeck uses my existing SSH keys.
24. As an SSH user, I want SSH agent support where practical, so that I can use existing key workflows.
25. As an SSH user, I want known-host verification, so that first connections and host-key changes are explicit.
26. As an SSH user, I want resize events to propagate to remote terminals, so that full-screen terminal apps render correctly.
27. As an SFTP user, I want a dual-pane file manager, so that local and remote files can be transferred without switching tools.
28. As an SFTP user, I want upload and download for files and folders, so that common transfer work is covered.
29. As an SFTP user, I want create folder, rename, delete, and refresh, so that I can manage remote files.
30. As an SFTP user, I want a transfer queue with progress and cancellation, so that long operations are visible and controllable.
31. As an SFTP user, I want an "open terminal here" action, so that I can jump from remote file navigation to shell work.
32. As an SFTP user, I want overwrite behavior settings, so that file transfer conflicts are predictable.
33. As a user, I want a command palette, so that I can navigate and trigger common actions without reaching for the mouse.
34. As a user, I want the command palette to open connections, create terminals, split panes, search scrollback, open settings, and import SSH config, so that common workflows are keyboard-first.
35. As a user, I want light app chrome with dark terminal panes, so that the interface feels clear while terminals remain comfortable.
36. As a user, I want theme settings, so that dark chrome can be added later without changing the product architecture.
37. As a user, I want local SQLite storage for non-secret settings and connections, so that the app remains local-first and reliable.
38. As a user, I want secrets stored in the OS keychain, so that passwords, passphrases, and API keys are not stored in plaintext config.
39. As a user, I want no telemetry by default, so that my terminal and host data remain private.
40. As a user, I want local logs and a diagnostics bundle command, so that I can debug issues without automatic data upload.
41. As a user, I want AI command assistance to draft commands, so that I can move faster without surrendering control.
42. As a user, I want explicit approval before AI-generated commands run, so that destructive or sensitive actions are not executed silently.
43. As a user, I want AI help scoped to the active local or SSH session, so that context stays clear.
44. As a user, I want OpenAI-compatible API configuration, so that I can use my own endpoint, key, and model.
45. As a user, I want Claude Code CLI and Codex CLI paths configurable, so that local agent tools can be used from AdminDeck.
46. As a user, I want Claude Code CLI and Codex CLI integrations restricted to suggest/ask-before-execute where possible, so that they respect the product trust model.
47. As a contributor, I want an Apache-2.0 open-source project, so that licensing is clear and permissive.
48. As a maintainer, I want dependencies compatible with Apache-2.0/MIT/BSD/MPL-style use, so that runtime licensing stays clean.
49. As a maintainer, I want GPL dependencies avoided in the core runtime, so that copyleft obligations are not introduced unintentionally.
50. As a maintainer, I want performance budgets documented, so that architectural decisions can be judged against measurable targets.

## Implementation Decisions

- Product name: AdminDeck.
- First shippable target: desktop app.
- Primary acceptance platform: Windows.
- Follow-on platforms: macOS and Linux using the same architecture.
- v0.1 protocols: local terminal, SSH terminal, and SFTP only.
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
- Storage: local SQLite for connections, tree, tags, settings, layout, recent sessions, and non-secret AI provider metadata.
- Secrets: OS keychain for passwords, SSH passphrases, and AI API keys.
- SSH keys: reference existing key files by path; do not manage/generate keypairs in v0.1.
- AI model: approval-based command assist only.
- AI providers: OpenAI-compatible BYO API key plus Claude Code CLI and Codex CLI adapters.
- CLI agent integrations: suggest-only/ask-before-execute where possible.
- UI model: left-side connection manager/tree, main tab/workspace area, optional bottom/output panel, right AI assistant panel.
- Tab model: VSCode-style tabs with split panes inside terminal tabs.
- SFTP model: dual-pane file manager with basic operations and transfer queue.
- Settings: light-first app chrome, dark terminal panes by default, font settings, terminal cursor, scrollback, copy-on-select, multiline paste confirmation, local shell default, SSH defaults, SFTP defaults, AI provider settings, fixed keybindings in v0.1.
- Privacy: no telemetry or automatic crash upload in v0.1.
- Distribution: Windows .msi or .exe installer, portable ZIP for dev/test, GitHub Releases. macOS .dmg and Linux AppImage/deb/rpm later. No auto-update until signing/release channel is settled.

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
- Auto-update.
- MobaXterm or RDCMan import.
- Dynamic inventory from files, cloud APIs, Terraform, CMDB, or other external sources.
- Folder sync, diff/compare, transfer resume, archive/extract, and remote file editing in SFTP.
- Fully autonomous AI agent execution.
- Editable keybinding UI.
- Built-in SSH key generation/import/export.

## Further Notes

AdminDeck is open-source under Apache-2.0. The codebase should prefer deep modules with small, testable interfaces for storage, connections, terminal sessions, SSH/SFTP transport, renderer abstraction, AI provider adapters, command approval, and importers.

The product should feel like a quiet, dense, professional desktop tool. Avoid marketing-style layouts, decorative gradients, oversized cards, or generic admin-dashboard styling.
