# 08 — URL Connections (Embedded WebView)

## AI grep hints

- Keys: `webview.*` (full namespace), `connections.embeddedWebApp`
- Topics: URL Connection, address bar, back/forward/reload, auto-refresh, credential fill, password capture, external open, downloads
- Synonyms: "open a webpage", "embed a site", "browser tab", "internal web tool", "fill in saved password"

> **Term:** a **URL Connection** is a Connection of kind `url` storing one http(s) URL plus an optional `dataPartition` label. The `dataPartition` field is persisted but currently a no-op — Phase 1 WebView2 shares one user-data folder across all URL Connections. Real per-Connection isolation is deferred to Phase 2.

## Surface

A URL Pane hosts a child WebView2 surface positioned over its Tab. The surface is not a Tab — it follows the Tab's geometry and is hidden when the Tab is inactive. This is the only lifecycle event that hides the WebView2; menu overlays do **not** suppress WebView2 (RDP is the only kind that uses overlay parking).

## Toolbar

- Back: `webview.goBack` (`webview.back`)
- Forward: `webview.goForward` (`webview.forward`)
- Reload: `webview.reload`
- Address bar: `webview.address`, placeholder `webview.urlPlaceholder`. The bar accepts hosts without a scheme; the backend assumes `https://` when no scheme is present.
- Auto-refresh: `webview.autoRefresh` / `webview.autoRefreshOff`. Interval label `webview.autoRefreshSeconds`.
- Open externally: `webview.openExternally` (opens in the OS default browser).
- Fill saved credential: `webview.fill` / `webview.fillCredential` / `webview.fillSavedCredential`.
- Save password: `webview.savePassword`, dialog title `webview.savePasswordTitle`.

## Credential fill

KKTerm can fill a saved username/password into the active form. Status lifecycle:

- `webview.fillingCredential` (in flight)
- `webview.credentialFilled` (success)
- `webview.noSavedCredential` (nothing stored for this Connection)

Saving a password from an in-page login form:

- `webview.capturingPassword` → `webview.savingPassword` → `webview.passwordSaved`.
- Validation failures: `webview.savePasswordInvalidCapture`, `webview.savePasswordNoPasswordField`, `webview.savePasswordEmptyUsername`, `webview.savePasswordEmptyPassword`. Generic failure: `webview.savePasswordFailed`.

Saved credentials live in the OS keychain, never in SQLite. Manage stored credentials from Settings → Credentials ([15-settings.md](15-settings.md)).

## Downloads

The host WebView2 emits download events. KKTerm shows transient status messages on the Status Bar:

- Started: `webview.downloadStarted`
- Complete: `webview.downloadComplete`
- Failed: `webview.downloadFailed`

## Empty / runtime states

- `webview.noUrlConfigured` — Connection has no URL set.
- `webview.onlyDesktopRuntime`, `webview.desktopRuntimeOnly` — shown in a non-Tauri runtime (Vite preview); the WebView2 surface is unavailable.

## Screenshot target label

For [14-screenshots.md](14-screenshots.md): `webview.screenshotTarget`.
