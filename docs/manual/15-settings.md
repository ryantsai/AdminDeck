# 15 — Settings

## AI grep hints

- Keys: `settings.*` (full namespace — over 400 keys; section roots listed below)
- Topics: General, Appearance, Dashboard, Credentials & MCP, AI Assistant, SSH, Terminal, Screenshots, RDP, VNC, URL, About; settings draft/save/reset; backup ZIP; settings import; reset all
- Synonyms: "preferences", "options", "config", "theme", "dark mode", "language", "API key", "import settings", "factory reset"

> Settings page styling is consistent across sections. Related controls live inside the shared `settings-subsection settings-fieldset` group so the group title sits in the border. Editable controls look editable; disabled / readonly controls stay muted. Delete buttons inside Settings are icon-only red trash cans (no visible "Delete" text). Destructive Settings-wide actions live in **General → Settings data**, behind app-owned confirmation dialogs — not inside feature-specific sections.

Settings is owned by `src/settings/SettingsPage.tsx`. Persisted bootstrap (`useBootstrapSettings`) lives in `src/lib/settings.ts`; add new persisted settings there, not via cloned effects in `src/App.tsx`.

## Page chrome

- Page title `settings.title`.
- Left sidebar label `settings.sectionsNav`. Sections:
  - `settings.sectionGeneral`
  - `settings.sectionAppearance`
  - `settings.sectionDashboard`
  - `settings.sectionCredentials`
  - `settings.sectionAiAssistant`
  - `settings.sectionSsh`
  - `settings.sectionTerminal`
  - `settings.sectionScreenshots`
  - `settings.sectionRdp`
  - `settings.sectionVnc`
  - `settings.sectionUrl`
  - `settings.sectionAbout`
- Save action: `settings.save`. Per-section status, e.g. `settings.appearanceSaved`, `settings.generalDefaultsSaved`.

## General

- Defaults group `settings.generalDefaults`.
- Language picker: label `settings.language`. Native names come from the `languages` namespace. See [16-localization.md](16-localization.md).
- Minimize to tray: toggle `settings.minimizeToTray` (hint `settings.minimizeToTrayHint`). When on, the title-bar close button hides the window; when off, it exits. Tray "Exit" (`app.trayExit`) always quits.
- Settings data subsection (destructive actions live here):
  - Backup: `settings.backupSettings` → `settings.backupSettingsComplete`. Backup ZIP uses the same shape as importable KKTerm settings export.
  - Import: `settings.importSettings`, confirmation `settings.importSettingsConfirm`, success `settings.importSettingsComplete`.
  - Reset all: `settings.resetAllSettings`, confirmation `settings.resetAllSettingsConfirm`, success `settings.resetAllSettingsComplete`.

> Automatic database backups do **not** run from app-window close. The supported shape is startup or manual backup ZIP creation.

## Appearance

- Group `settings.appearanceInterface`.
- Colour scheme: `settings.colorScheme`. Options: `settings.schemeDefault`, `settings.schemeDark`, `settings.schemeLight`, `settings.schemeMac`, `settings.schemeOrange`, `settings.schemePurple`, `settings.schemePink`, `settings.schemeGreenKuaiKuai`, `settings.schemeBlueSee`, `settings.schemeConfetti`, `settings.schemeBubbleTea`. Preview `settings.colorSchemePreview`. App background `settings.appBg`. Theme grouping `settings.theme` (hint `settings.themeHint`).
- App UI font: `settings.appUiFontFamily` / `settings.activeUiFont`. Reset `settings.resetFont`. Validation `settings.appFontFamilyRequired`. Generic `settings.fontFamily` / `settings.fontSize` (range `settings.fontSizeRange`, blank check `settings.fontFamilyRequired`).
- Layout group `settings.layout`. Reset layout: `settings.resetLayout` (description `settings.resetLayoutDescription`) — resets Connections / AI panel widths.
- Save status: `settings.appearanceSaved`. Reset status `settings.appearanceReset`.

## Dashboard

- Section header `settings.sectionDashboard`. Title and description `settings.dashboardTitle` / `settings.dashboardDescription`.
- Toggles for AI Dashboard-tool exposure, default density, default View, etc. (extend this list as the Dashboard section grows.)

## Credentials & MCP

This is the central manager for OS-keychain-backed secrets.

- Section header `settings.sectionCredentials`. Stored credentials list `settings.credentialsTitle` / `settings.credentialsStored` (hint `settings.credentialsHint`, empty `settings.credentialsEmpty`).
- Per-credential fields: username `settings.credentialUsername`. Kinds (badges): `settings.credentialKindConnectionPassword`, `…UrlPassword`, `…AiApiKey`, `…EmailApiKey`, `…EmailSmtpPassword`, `…WidgetSecret`.
- Save status: `settings.credentialSavedPassword`, `…SavedApiKey`, `…SavedSecret`. Updated: `settings.credentialUpdated`. Missing secret error: `settings.credentialMissingSecret`. Stored marker: `settings.credentialStored`.
- Delete: red trash button `settings.deleteCredential`, confirmation body `settings.deleteCredentialConfirmBody`, status `settings.credentialDeleted`.
- Widget secrets subgroup: `settings.widgetCredentialsStored` (hint `…Hint`, empty `…Empty`).
- **MCP Servers** subgroup: title `settings.mcpServersTitle` (hint `…Hint`, empty `…Empty`). Actions:
  - Add: `settings.mcpAddServer` / `settings.mcpCreateServer`. Paste-JSON shortcut `settings.mcpPasteHint`, placeholder `…PastePlaceholder`, continue `…PasteContinue`, confirm hint `…ConfirmHint`.
  - Fields: `settings.mcpServerName`, `…ServerUrl`, `…HeadersLabel`. Detected secret hint `…DetectedSecretHint`. Per-secret header name / value template `…SecretHeaderName`, `…SecretValueTemplate`, `…SecretValue`.
  - Add-flow validation: `settings.mcpAddInvalidJson`, `…AddInvalidShape`, `…AddNoServers`, `…AddMissingUrl`, `…AddStdioUnsupported` (with stdio guidance `…StdioGuidance`).
  - Errors: `settings.mcpErrorNotFound`, `…ErrorDuplicateName`, `…ErrorKeychain`.
  - Status badges: `settings.mcpStatusOk`, `…Unreachable`, `…AuthError`, `…ProtocolError`, `…Unknown`. Tools count `settings.mcpToolsCount` / `…_one`. Auth badge `…AuthBadge`.
  - Refresh tools: `settings.mcpRefreshTools`. Delete: `settings.mcpDeleteServer`, body `…DeleteConfirmBody`.

## AI Assistant

Section header `settings.sectionAiAssistant`. Owned by `src/settings/AiSettings.tsx`. Per-provider configuration lives in `src/ai/providerRegistry/`.

- Provider picker; known-model picker is a real `<select>` showing every model — not an `<input list>`/`datalist` (Chromium hides non-matching options behind a `datalist`).
- Custom model ID is a separate text input.
- API keys go into the OS keychain under `AI_PROVIDER_SECRET_OWNER_ID`; never written to SQLite or settings JSON.
- Tool permission default (`ai.toolPermissionMode`) is set here as well.

## SSH

Section header `settings.sectionSsh`. Default username, default identity file, agent forwarding, tmux defaults, etc. (Keep this section keyed under `settings.*` — exact field keys live in `en.json`.)

## Terminal

Section header `settings.sectionTerminal`. Font family + size, line height, cursor style, scrollback length, bell behaviour, default shell on Local.

## Screenshots

Section header `settings.sectionScreenshots`.

- Folder picker: `settings.screenshotFolder` (path display `settings.screenshotFolderPath`, hint `settings.screenshotFolderHint`).
- Choose folder: `settings.chooseFolder`. Open the folder: `settings.openScreenshotFolder`.
- Save status: `settings.screenshotsSaved`.

## RDP and VNC

- `settings.sectionRdp` — RDP defaults: resolution, colour depth, redirection toggles.
- `settings.sectionVnc` — VNC defaults: colour depth, view-only, encoding preferences.

## URL

`settings.sectionUrl` — defaults for URL Connections (e.g. default auto-refresh).

## About

`settings.sectionAbout`. Shows version (`settings.version`) and slogan (`settings.appSlogan`). The version value should match `package.json`'s `version` field. License info, GitHub link, and acknowledgements live here.
