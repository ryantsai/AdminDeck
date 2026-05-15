<p align="center">
  <img src="src-tauri/icons/logo.png" alt="KKTerm" width="128" />
</p>

<h1 align="center">KKTerm</h1>

<p align="center">
  <strong>A local-first Windows administration workspace for terminals, remote connections, file transfer, dashboards, and approval-based AI help.</strong>
</p>

<p align="center">
  <a href="https://github.com/ryantsai/KKTerm/stargazers">
    <img src="https://img.shields.io/github/stars/ryantsai/KKTerm?style=social" alt="GitHub stars" />
  </a>
  <a href="https://github.com/ryantsai/KKTerm/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ryantsai/KKTerm" alt="MIT License" />
  </a>
  <br />
  <sub><a href="README.zh-TW.md">繁體中文</a></sub>
</p>

---

KKTerm is a desktop app for people who live in terminals, remote hosts, file browsers, and small admin tools all day. It combines saved Connections, live Sessions, split terminal panes, SFTP/FTP file transfer, URL webviews, RDP/VNC workspaces, a widget Dashboard, and an AI Assistant in one native Tauri v2 app.

The important part: KKTerm is local-first. Durable data lives in SQLite on your machine, secrets live in the OS keychain, terminal contents are not logged by default, and there is no analytics or cloud account requirement.

## What Makes It Different

- **One workspace for many connection types**: local shells, SSH, Telnet, Serial, URL/WebView2, RDP, VNC, FTP, FTPS, and SFTP launched from SSH.
- **Session-aware terminal panes**: split a terminal Tab, keep live Sessions mounted while switching Tabs, and use tmux-backed SSH panes that can attach to stable per-pane tmux sessions.
- **Real file transfer tools**: dual-pane local/remote browser, recursive upload/download, transfer queue, overwrite prompts, remote properties, chmod, and chown for SFTP.
- **Native Windows integrations**: ConPTY/local PTY, WebView2, Microsoft RDP ActiveX hosting, tray menu, current-user NSIS installer, and Windows host CPU/RAM/network status.
- **Dashboard widgets**: multiple durable Dashboard views with a 12-column drag/resize grid, an App Launcher widget, and AI-authored custom widgets rendered as validated content or isolated script iframes.
- **AI with approval boundaries**: chat, selected terminal context, screenshots, command proposals, Dashboard tools, saved Connection tools, and live Session interaction tools governed by Prompt or Allow All permission mode.
- **Local backups and import**: settings and Connection data can be exported/imported through KKTerm settings ZIPs; startup/manual backups use the same importable format.
- **No telemetry posture**: no analytics, no automatic crash upload, and diagnostics are local files the user reviews before sharing.

## Current Feature Map

| Area | Implemented today |
| --- | --- |
| **Connections** | SQLite-backed tree with folders/subfolders, search, drag/drop order, rename, duplicate, delete, Quick Connect, custom icons, pinned/active rail shortcuts |
| **Terminal** | Local shells, SSH, Telnet, Serial, split panes, xterm.js renderer, opportunistic WebGL glyph rendering, scrollback search, local startup directory/script |
| **SSH** | Native `russh` path, agent/key/password auth, host-key trust flow, optional system SSH fallback, ProxyJump field, SSH port forwarding, tmux session attach/list/rename/close/mouse controls |
| **SFTP / FTP** | SSH-launched SFTP plus FTP/FTPS Connections, dual-pane browser, recursive transfers, queue/cancel/clear history, conflicts, properties, chmod/chown where supported |
| **URL WebView** | Embedded WebView2 URL Sessions, navigation toolbar, favicon capture, stored website credential metadata/fill, data partition metadata |
| **Remote Desktop** | RDP through Windows ActiveX with geometry-scoped overlay parking; VNC through `vnc-rs` framebuffer rendered in the workspace canvas |
| **Dashboard** | Durable views, widget instances, edit mode, drag/resize, App Launcher, AI-created content/script widgets, per-widget presets/accent/icon/title/settings |
| **AI Assistant** | Streaming chat, OpenAI-compatible runtime, provider registry, command proposal safety classification, screenshot/context attachments, Dashboard tool calls, saved Connection management tools, and live Session tools for terminal, RDP/VNC, and SFTP/FTP interaction |
| **Settings** | General, Appearance, Credentials, AI, SSH, Terminal, URL, RDP, VNC, Dashboard, and About sections; custom UI fonts; minimize-to-tray; Don't Sleep; backup/import |
| **Localization** | i18next UI with English source and dynamic locale bundles including zh-TW, zh-CN, ja, ko, fr, de, es, es-MX, it, pt-BR, th, id, and vi |

## AI Providers

The frontend registry currently includes:

OpenAI, Anthropic, OpenRouter, DeepSeek, Grok, Azure OpenAI, LiteLLM, GitHub Copilot, Ollama, NVIDIA, and generic OpenAI-compatible endpoints.

Provider metadata and model choices live in `src/ai/providerRegistry/`; Rust-side provider adapters live in `src-tauri/src/ai/providers/`. API keys are stored through the OS keychain, not SQLite.

Assistant tool access is controlled in two layers. Settings -> AI Assistant -> Assistant tools enables or disables tool families such as Dashboard, Connections, and Live Sessions. The chat composer also exposes a tool permission mode: **Prompt** is the default and blocks mutating tool calls until the user chooses a more permissive mode; **Allow All** lets enabled tools execute automatically for the current saved setting. Live Session tools operate on open Tabs/Panes, not durable Connection rows.

## Local-First Data Model

KKTerm uses precise domain boundaries:

- **Connection**: a durable saved resource in SQLite, such as an SSH host or URL.
- **Quick Connect**: an unsaved one-off draft that starts a Session.
- **Session**: live runtime state, such as a PTY, SSH channel, SFTP browser, WebView2 host, RDP control, or VNC framebuffer.
- **Tab**: frontend workspace container for one Session or related panes.

This keeps saved data separate from live process/channel state. Closing a Tab ends the live Session; switching Tabs does not.

## Quick Start

Requirements:

- Windows is the primary supported platform.
- Node.js and npm.
- Rust toolchain.
- Tauri v2 prerequisites for Windows, including WebView2.

```bash
npm install
npm run tauri dev
```

Common checks:

```bash
npm run check
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Build the Windows installer:

```bash
npm run package:installer
```

The installer script writes `artifacts/kkterm-<version>-windows-x64-setup.exe` and a matching `.sha256` file.

## Native Debugging

Use the real Tauri runtime for validation:

```bash
npm run tauri dev
```

Browser/Vite preview is useful for some frontend inspection, but it is not valid for native behavior such as local ConPTY focus, WebView2 hosting, RDP/VNC, keychain access, native menus, tray behavior, dialogs, or OS integration.

For Windows debugging, use the VS Code `Run KKTerm exe` configuration to start `src-tauri/target/debug/kkterm.exe` with Rust backtraces. Use `Attach KKTerm WebView2` when you need DevTools inside the native WebView2 host.

## Current Limits

KKTerm is moving quickly, so this README describes the codebase as it exists now rather than treating the roadmap as truth.

- Windows is the v0.1 acceptance platform.
- The installer is currently unsigned.
- Update checks are disabled while release signing is deferred.
- SFTP over ProxyJump is not supported in the native SFTP path.
- File transfer resume, folder sync/diff, archive/extract, and remote editing are deferred.
- RDP and VNC are active work areas; richer clipboard/device sync and advanced quality controls are still evolving.
- AI assists, proposes, and can operate enabled tools within the configured Prompt/Allow All permission boundary, but it should not be treated as an unattended autonomous operator.

## Project Docs

- [Product context](CONTEXT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Dashboard architecture](docs/DASHBOARD.md)
- [AI provider guide](docs/AI_PROVIDERS.md)
- [Performance notes](docs/PERFORMANCE.md)
- [Release notes and gates](docs/RELEASE.md)

## Stack

Rust, Tauri v2, React 19, TypeScript, Vite, Tailwind CSS, Zustand, xterm.js, SQLite, WebView2, `russh`, `russh-sftp`, `vnc-rs`, `suppaftp`, and OS keychain storage.

## License

MIT. See [LICENSE](LICENSE).
