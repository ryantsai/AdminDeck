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

Users can create a diagnostics bundle from Settings with **Create diagnostics bundle**.

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

## Known Limitations

- Windows is the only v0.1 acceptance platform.
- Packaging still needs a successful Windows installer build and smoke test before release.
- SSH readiness performance is instrumented for native post-auth terminal setup and retained in local performance snapshots after a native SSH Session starts, but the latest documented run still lacks a measured value because it requires a trusted non-`ProxyJump` SSH Connection with valid auth in the measurement environment.
- Native SSH and SFTP do not support `ProxyJump`; those sessions use the system `ssh` fallback/debug path where available.
- RDP, VNC, webview tabs, sync, team sharing, and portable encrypted credential vaults are deferred.
- AI command assistance stages proposals only; it does not autonomously execute commands.
- Diagnostics bundles are folders, not compressed archives.
