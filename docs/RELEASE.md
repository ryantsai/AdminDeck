# KKTerm Release Notes and Gates

This document captures KKTerm release posture, packaging procedures, and current known limitations.

## No-Telemetry Posture

KKTerm is local-first by default.

- The app does not include analytics, automatic crash upload, or background telemetry.
- The app-wide Status Bar shows Workspace host usage metrics and universal transient notices only. It does not upload telemetry and no longer presents debug timing budgets.
- Terminal contents are not logged by default.
- Durable Connection metadata is stored in local SQLite.
- Secrets such as passwords, passphrases, and AI API keys are stored in the OS keychain.
- Update checks are currently disabled while release signing is deferred. When re-enabled, update checks contact GitHub Releases updater metadata only. This is separate from telemetry: KKTerm does not send analytics, crash reports, terminal contents, Connection data, or secrets as part of update checking.

## Diagnostics Bundle Flow

Diagnostics bundle creation is implemented as a local app command, but the current simplified Settings surface does not expose the diagnostics action. The user-facing diagnostics entry point should be reintroduced only after the Settings UX is redesigned.

The current bundle is a local folder under the app data directory. It includes:

- `README.txt` with sharing guidance.
- `manifest.json` with app version, target OS/architecture, local performance snapshot, last native SSH terminal readiness when measured, and included-file list.
- `kkterm.log` when the local startup log is available.

Debug builds may also create `aiassistant.debug.log` beside `kkterm.log`. This file is not ordinary release telemetry and must not be emitted by release builds. It is a raw local troubleshooting log for AI Assistant interactions, including provider payloads, stream chunks, tool calls/results, permission blocks, live Session bridge traffic, and Dashboard widget creation checkpoints. It may contain prompts, attached context, terminal buffer text returned through tools, generated widget source, and other user-provided content. Review it carefully before sharing.

The bundle intentionally excludes by default:

- terminal output
- connection passwords and passphrases
- AI API keys
- the SQLite connection database
- known-host material

Users should review the generated files before sharing them. Future diagnostics work may add opt-in selected terminal output or redacted database summaries, but those must remain explicit user actions.

## Windows Installer

Create the Windows installer with:

```bash
npm run package:installer
```

The script runs the Tauri NSIS bundle target, copies the generated setup executable to a stable release filename, and writes:

- `artifacts/kkterm-<version>-windows-x64-setup.exe`
- `artifacts/kkterm-<version>-windows-x64-setup.exe.sha256`

The installer uses a current-user install mode by default, creates KKTerm Start Menu entries, and downloads the WebView2 bootstrapper only if the target machine needs WebView2 during install.

TODO: Restore Windows Authenticode signing and the Tauri updater signing flow before enabling public update checks. The Tauri updater signature validates self-update artifacts and is distinct from Windows Authenticode signing, which validates publisher identity to Windows.

Smoke test the installer artifact with:

```bash
npm run smoke:installer
```

The smoke test verifies the release artifact checksum, silently installs into a temporary directory, confirms `kkterm.exe` is present and non-empty, then silently uninstalls and removes only the temporary smoke-test directory it created.

## GitHub Release

Publish the next build release with:

```bash
npm run release:github
```

The script increments the `<major>.<minor>.<build>` version across npm, Tauri, and Cargo metadata, builds the NSIS installer artifact, smoke tests the installer, runs frontend and Rust checks, commits the version bump, tags it as `v<version>`, pushes to `origin/main`, and creates a GitHub release with the installer and checksum. Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-github.ps1 -DryRun` to preview the next version, add `-Draft` for a draft release, or add `-SkipBuild` to publish from existing artifacts.

## Known Limitations

- Windows is the primary supported platform. macOS and Linux packaging are planned.
- The Windows installer build and smoke test are repeatable, but the installer is unsigned until release signing is configured.
- SSH readiness performance is instrumented for native post-auth terminal setup and retained in local performance snapshots after a native SSH Session starts. The repeatable `npm run measure:ssh-readiness` helper can validate the `<= 150 ms` budget against a trusted non-`ProxyJump` SSH Connection, but the latest documented run still lacks a measured value because valid SSH auth was not available in the measurement environment.
- Native SSH-launched SFTP does not support `ProxyJump`; SSH terminal sessions with `ProxyJump` use the system `ssh` fallback/debug path where available.
- SSH config import support exists behind the local command boundary, but the current Settings surface does not expose a user-facing import action. The same applies to the diagnostics bundle action.
- SFTP supports recursive file and folder transfer, multi-select drag/drop, overwrite prompts with overwrite-all handling, clearable finished transfer history, remote properties, chmod, and chown, but folder sync, diff/compare, transfer resume, archive/extract, and remote file editing remain deferred.
- Screenshot capture is available from terminal Pane toolbars and non-terminal workspace top toolbars. Region and Entire Window/Panel captures can be copied to the system clipboard or attached transiently to the AI Assistant through explicit user action.
- RDP uses the Windows ActiveX host and VNC uses a canvas-rendered `vnc-rs` framebuffer path; advanced VNC options, richer clipboard handling, sync, and team sharing remain deferred.
- AI command assistance and app tool use are bounded by assistant tool settings. Prompt mode is the default and blocks mutating tools with a permission-required result; Allow All is an explicit setting that lets enabled tools execute automatically. The Assistant can use typed tools for Dashboard changes, saved Connection management, and active Session interaction, but it should not be treated as an unattended autonomous operator.
- Settings exposes Color Scheme, Language (i18n), editable Terminal behavior, AI provider, App UI font, and layout reset controls. Update checks, editable SSH/SFTP defaults, SSH config import, and keybinding controls are not yet exposed.
- Diagnostics bundles are folders, not compressed archives.
