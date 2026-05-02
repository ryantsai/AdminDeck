# AdminDeck

AdminDeck is a Windows-first, local-first desktop workspace for terminal sessions,
SSH, SFTP, saved connections, and approval-based command assistance.

This repository currently contains the v0.1 foundation:

- Tauri v2 desktop shell
- React, TypeScript, and Vite frontend
- Tailwind design-token setup
- Zustand workspace state
- Dense first-pass AdminDeck app shell
- Rust command boundary with a typed frontend wrapper
- SQLite-backed durable Connections, folders, tags, reorder, and terminal settings
- OS keychain secret operations
- xterm-based local terminal Sessions over `portable-pty`
- Live workspace-derived connection status badges
- SSH config import preview with unsupported directive reporting
- Local logging bootstrap
- Windows-first CI skeleton
- Local performance budget status for UI readiness, terminal readiness, and memory

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

Performance and terminal compatibility checks are documented in
[`docs/PERFORMANCE.md`](docs/PERFORMANCE.md).
