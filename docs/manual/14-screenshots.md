# 14 — Screenshots

## AI grep hints

- Keys: `screenshots.*` (full namespace), `workspace.takeScreenshot`, `workspace.copyRegion`, `workspace.copyEntirePanel`, `workspace.sendRegionToAi`, `workspace.sendEntirePanelToAi`, `workspace.sentToAi`, `workspace.copied`, `workspace.selectRegion`, `workspace.screenshot`, `workspace.screenshotsRequireRuntime`, `workspace.screenshotCaptureError`, `sftp.screenshotTarget`, `webview.screenshotTarget`
- Topics: capture region / window / fullscreen, send to AI, copy to clipboard, screenshots library
- Synonyms: "snip", "grab", "screen capture", "send to AI"

## Capture from a Pane

Each workspace surface exposes a screenshot toolbar menu (native Tauri context menu). The menu label is `workspace.takeScreenshot`. Variants:

- `workspace.copyRegion` — region capture → clipboard. Status `workspace.copied`.
- `workspace.copyEntirePanel` — whole window/Pane → clipboard.
- `workspace.sendRegionToAi` — region capture → AI Assistant input. Status `workspace.sentToAi`.
- `workspace.sendEntirePanelToAi` — whole Pane → AI Assistant input.

Region selection overlay accessible label: `workspace.selectRegion`. Generic noun: `workspace.screenshot`.

Per-surface "screenshot target" labels used in dialog headings:

- SFTP: `sftp.screenshotTarget`
- WebView (URL Connections): `webview.screenshotTarget`

Failure: `workspace.screenshotCaptureError`. Outside the Tauri runtime: `workspace.screenshotsRequireRuntime`.

## Screenshots library

A dedicated module page for browsing past captures.

- Header: `screenshots.title`, summary `screenshots.subtitle`. Collection grouping label `screenshots.collection`.
- View toggle: `screenshots.viewOptions` (`screenshots.gridView`, `screenshots.listView`).
- Capture from inside the library: `screenshots.takeScreenshot` opens a submenu with `screenshots.fullScreenOption`, `screenshots.windowOption`, `screenshots.regionOption`. Backing actions: `screenshots.captureRegion`, `screenshots.captureFullscreen`, `screenshots.captureWindow`. Type labels: `screenshots.regionCapture`, `screenshots.fullscreenCapture`, `screenshots.windowCapture`.
- Paging: `screenshots.loadMore`, loading `screenshots.loading`.
- Clear all: `screenshots.clearAll` → status `screenshots.clearSuccess`.
- Empty state: `screenshots.emptyTitle`, `screenshots.emptyHint`.

Per-item actions:

- Metadata: `screenshots.metadata`.
- Copy: `screenshots.copyScreenshot` → `screenshots.copySuccess`. Error `screenshots.copyError`.
- Delete: `screenshots.deleteScreenshot` → `screenshots.deleteSuccess`. Error `screenshots.deleteError`.

Capture status: `screenshots.captureSuccess` / `screenshots.captureError`. Library load failure: `screenshots.loadError`.

## Storage location

Screenshots are saved to the folder configured in Settings → Screenshots — see [15-settings.md](15-settings.md) §Screenshots. The folder picker is `settings.chooseFolder` and the open-folder action is `settings.openScreenshotFolder`.

## RDP screenshots

RDP captures use a dedicated typed Tauri command that asks the OS for the visible RDP host bitmap, because the native HWND behind RDP cannot be composited into a normal DOM screenshot. Other surface kinds use the standard capture path. Do not generalise the RDP screenshot code path to other surfaces — see [09-remote-desktop.md](09-remote-desktop.md).
