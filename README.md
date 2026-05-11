<p align="center">
  <img src="src-tauri/icons/logo.png" alt="KKTerm" width="128" />
</p>

<h1 align="center">KKTerm</h1>

<p align="center">
  <em>Your terminals called. They want their own operating system.</em>
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

**KKTerm** is a <kbd>local-first</kbd>, <kbd>Windows-first</kbd> desktop workspace that unifies your terminal sessions, SSH hosts, SFTP transfers, remote desktops, and approval-based AI command assistance — all inside one fast, native Tauri v2 app. No cloud. No telemetry. No Electron.

Think of it as what happens when a terminal emulator, a connection manager, a file browser, and an AI sidekick walk into a bar and decide to stop being four separate apps.

## Design Philosophy

We have opinions. Here they are, in ascending order of stubbornness:

### 1. Local-first, for real

Your connections, settings, and secrets live on your machine. SQLite stores the durable stuff. The OS keychain owns your passwords and API keys. There is no cloud backend, no account, no sync service that "anonymously" collects your `~/.ssh/config` for product improvement. The app works fully offline. The only thing that ever leaves your machine is the command you explicitly paste into a remote shell.

### 2. Fast is a feature

If your terminal app takes longer to cold-launch than it takes you to regret opening it, the terminal app is wrong. KKTerm starts in under a second on modern Windows hardware. The Rust backend handles the heavy lifting. Tauri v2 keeps the runtime lean. We benchmark this. We will not apologise for caring about startup time.

### 3. Windows gets real love

KKTerm is Windows-first by design, not by accident. That means native ConPTY for local shells, Microsoft RDP ActiveX for remote desktop, and WebView2 for embedded browser surfaces. macOS and Linux are first-class architectural targets — they just aren't the ones we yell at during 2 AM debugging sessions. (Yet.)

### 4. AI drafts. You decide. Always.

The AI assistant can suggest commands, write scripts, and draft configuration. It cannot execute anything without your explicit approval. No auto-apply. No silent copilot. If the AI wants to `rm -rf /`, it has to convince you first — and we designed the UI so that conversation is visible, not hidden behind a three-dot menu.

### 5. Dense, not distracting

Light chrome. Dark terminals. No onboarding wizards, no "what's new" popups, no tooltips that follow your mouse like a lost puppy. The interface gets out of your way. Split panes, tabbed workspaces, and a collapsible connection tree give you density when you need it and whitespace when you don't.

### 6. One tool, not a toolbox catalogue

Local terminals, SSH, SFTP, RDP, VNC, URL webviews, an AI panel — these live in the same window, not scattered across six different app icons on your taskbar. If you have to Alt+Tab three times to get from your SSH session to your SFTP transfer, you're using the wrong tool.

### 7. MIT, because copyleft at 3 AM is not the kind of drama we enjoy

Every runtime dependency is MIT, Apache 2.0, BSD, or MPL-compatible. No GPL in the core. Fork it, ship it, embed it — the license won't be the reason you can't.

---

## What's Inside

| Module | Status | What it does |
|--------|--------|--------------|
| **Terminal** | Stable | Local shells (PowerShell, CMD, WSL), SSH with tmux resume, xterm-compatible rendering, split panes |
| **SFTP** | Stable | Dual-pane file browser, drag-drop transfer, chmod/chown, overwrite prompts, transfer queue |
| **RDP** | Beta | Windows-native remote desktop via ActiveX, parked/screenshotted under DOM overlays |
| **VNC** | Beta | Rust-native VNC client rendering to workspace canvas |
| **AI Assistant** | Active | Approval-based command drafting, OpenAI-compatible providers, session-scoped context |
| **Connections** | Stable | SQLite-backed tree with folders, search, drag-drop reorder, Quick Connect, SSH config import |
| **Dashboard** | Growing | Widget playground, App Launcher, hash calculators, IP subnet tools |
| **File Explorer** | Early | Native-speed alternative local file browser |
| **URL WebView** | Stable | Embedded http(s) surfaces per-connection |

---

## Quick Start

```bash
npm install          # Install frontend dependencies
npm run tauri dev    # Launch the desktop app
npm run check        # Type-check everything
```

```bash
npm run package:portable   # Build a portable ZIP
npm run package:installer  # Build the NSIS installer
```

Both land in `artifacts/` with SHA-256 checksums.

---

## Stack

Rust (Tauri v2) · React 19 · TypeScript · Vite · Tailwind · Zustand · xterm.js · SQLite · OS keychain

---

<p align="center">
  <strong>If KKTerm saves you from one more PuTTY window, consider dropping a ⭐</strong><br />
  <sub>Stars are free. The dopamine hit from seeing the counter tick up is also free, but much harder to explain.</sub>
</p>
