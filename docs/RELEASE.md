# AdminDeck Release Notes and Gates

This document captures v0.1 release-facing posture that is not tied to a single feature milestone.

## No-Telemetry Posture

AdminDeck is local-first by default.

- The app does not include analytics, automatic crash upload, or background telemetry.
- Performance metrics shown in the status bar are local process measurements.
- Terminal contents are not logged by default.
- Durable Connection metadata is stored in local SQLite.
- Secrets such as passwords, passphrases, and AI API keys are stored in the OS keychain.
- Update checks are deferred to v0.2 and must be described separately from telemetry because they contact update metadata only after the updater flow exists.

## Diagnostics Bundle Flow

Diagnostics bundle creation is implemented as a local app command, but the current simplified Settings surface does not expose the diagnostics action. The user-facing diagnostics entry point should be reintroduced only after the Settings UX is redesigned.

The current bundle is a local folder under the app data directory. It includes:

- `README.txt` with sharing guidance.
- `manifest.json` with app version, target OS/architecture, local performance snapshot, last native SSH terminal readiness when measured, and included-file list.
- `admin-deck.log` when the local startup log is available.

The bundle intentionally excludes by default:

- terminal output
- connection passwords and passphrases
- AI API keys
- the SQLite connection database
- known-host material

Users should review the generated files before sharing them. Future diagnostics work may add opt-in selected terminal output or redacted database summaries, but those must remain explicit user actions.

## Windows Portable ZIP

Create the v0.1 portable package with:

```bash
npm run package:portable
```

The script builds the frontend and release executable, stages `admin-deck.exe`, license/readme files, release/performance docs, a portable package manifest, and a local-only portable readme, then writes:

- `artifacts/admin-deck-<version>-windows-x64-portable.zip`
- `artifacts/admin-deck-<version>-windows-x64-portable.zip.sha256`

Portable ZIP installs are intentionally manual and do not self-update. The v0.2 updater scope is limited to normal forward updates for installed Windows builds.

## Windows Installer

Create the v0.1 Windows installer with:

```bash
npm run package:installer
```

The script runs the Tauri NSIS bundle target without code signing, copies the generated setup executable to a stable release filename, and writes:

- `artifacts/admin-deck-<version>-windows-x64-setup.exe`
- `artifacts/admin-deck-<version>-windows-x64-setup.exe.sha256`

The installer uses a current-user install mode by default, creates AdminDeck Start Menu entries, and downloads the WebView2 bootstrapper only if the target machine needs WebView2 during install. The v0.1 installer is unsigned until release signing is configured.

Smoke test the installer artifact with:

```bash
npm run smoke:installer
```

The smoke test verifies the release artifact checksum, silently installs into a temporary directory, confirms `admin-deck.exe` is present and non-empty, then silently uninstalls and removes only the temporary smoke-test directory it created.

## Known Limitations

- Windows is the only v0.1 acceptance platform.
- The Windows installer build and smoke test are repeatable, but the v0.1 installer is unsigned until release signing is configured.
- SSH readiness performance is instrumented for native post-auth terminal setup and retained in local performance snapshots after a native SSH Session starts. The repeatable `npm run measure:ssh-readiness` helper can validate the `<= 150 ms` budget against a trusted non-`ProxyJump` SSH Connection, but the latest documented run still lacks a measured value because valid SSH auth was not available in the measurement environment.
- Native SSH-launched SFTP does not support `ProxyJump`; SSH terminal sessions with `ProxyJump` use the system `ssh` fallback/debug path where available.
- SFTP supports recursive file and folder transfer, multi-select drag/drop, overwrite prompts with overwrite-all handling, clearable finished transfer history, remote properties, chmod, and chown, but folder sync, diff/compare, transfer resume, archive/extract, and remote file editing remain deferred.
- RDP, VNC, webview tabs, sync, team sharing, and portable encrypted credential vaults are deferred.
- AI command assistance stages proposals only; it does not autonomously execute commands.
- The current Settings surface only shows Language (i18n) and Color Scheme placeholders; diagnostics, terminal, SSH, SFTP, AI provider, update, and keybinding controls are not exposed there yet.
- Diagnostics bundles are folders, not compressed archives.
