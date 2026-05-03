# AdminDeck

AdminDeck is a Windows-first, local-first desktop workspace for terminal sessions,
SSH, SFTP, saved connections, and approval-based command assistance.

This repository currently contains the v0.1 foundation:

- Tauri v2 desktop shell
- React, TypeScript, and Vite frontend
- Tailwind design-token setup
- Zustand workspace state
- Dense first-pass AdminDeck app shell with Dashboard and Settings rail entries
- Rust command boundary with a typed frontend wrapper
- SQLite-backed durable Connections, folders, reorder, and settings storage
- OS keychain secret operations
- xterm-based local terminal Sessions over `portable-pty`
- Live workspace-derived connection status badges
- SSH-launched SFTP workspace with dual-pane local/remote browsing, drag/drop transfer, overwrite prompts, clearable transfer history, remote properties, chmod, and chown
- Screenshot capture to clipboard for terminal Panes and non-terminal workspace surfaces, with Region and Entire Window/Panel choices
- SSH config import command/parser with unsupported directive reporting; the visible import entry point is currently deferred from the simplified chrome
- Local logging bootstrap
- Settings placeholder surface for Language (i18n) and Color Scheme
- Windows-first CI skeleton
- Local performance budget status for UI readiness, terminal readiness, and memory

v0.2 work has started with durable RDP/VNC Connection kinds and a Windows-native
RDP Session host built on the Microsoft RDP ActiveX COM control.

## Development

Install dependencies:

```bash
npm install
```

Run the frontend preview:

```bash
npm run dev
```

Run the Tauri desktop app:

```bash
npm run tauri dev
```

Run checks:

```bash
npm run check
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Build a Windows portable ZIP:

```bash
npm run package:portable
```

The package is written to `artifacts/` with a `.sha256` checksum file.

Build a Windows installer:

```bash
npm run package:installer
```

The NSIS setup executable is written to `artifacts/` with a `.sha256` checksum file.

Performance and terminal compatibility checks are documented in
[`docs/PERFORMANCE.md`](docs/PERFORMANCE.md).

Release posture, diagnostics bundle behavior, and known limitations are documented in
[`docs/RELEASE.md`](docs/RELEASE.md).
