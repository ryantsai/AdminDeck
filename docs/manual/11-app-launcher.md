# 11 — App Launcher Widget

## AI grep hints

- Keys: `appLauncher.*` (full namespace)
- Topics: launch local apps from Dashboard, run as admin, run as user, pinned apps, rail shortcuts, add/edit/remove entry, icon/list/details view mode
- Synonyms: "shortcuts", "dock", "quick launch", "run as administrator", "launch program", "Explorer view", "details view", "list view"

> **Term:** the App Launcher is a Dashboard widget, **not** an Activity Rail module. The label that appears on its widget surface is `appLauncher.title` (module-style label `appLauncher.moduleLabel`, summary `appLauncher.subtitle`, status `appLauncher.statusReady`).

## Entries

Each entry represents a desktop app, shortcut, script, or file. Stored fields (presented in `appLauncher.dialogTitle`):

- Name (`appLauncher.name`)
- Path (`appLauncher.path`) — required; missing path indicator `appLauncher.missingPath`.
- Arguments (`appLauncher.arguments`, placeholder `appLauncher.argumentsPlaceholder`)
- Working directory (`appLauncher.workingDirectory`, placeholder `appLauncher.workingDirectoryPlaceholder`)
- Pin to rail toggle (`appLauncher.pinToRail`). Pinned state badge `appLauncher.railPinned`.

The dialog itself is accessible-labelled `appLauncher.dialogLabel`. Summary line groups: `appLauncher.summaryLabel`, `appLauncher.pinnedApps`, `appLauncher.railShortcuts` (`appLauncher.railShortcutsLabel`), `appLauncher.entriesLabel`.

## Adding an entry

`appLauncher.addApp` opens the picker submenu:

- `appLauncher.addMenuApp` — pick an executable. Dialog title `appLauncher.selectAppTitle`.
- `appLauncher.addMenuFile` — pick a file. Dialog title `appLauncher.selectFileTitle`. File filter `appLauncher.fileFilter`; all-files fallback `appLauncher.allFilesFilter`.
- `appLauncher.addMenuFolder` — pick a folder. Title `appLauncher.selectFolderTitle`.
- `appLauncher.addFolder` — add a grouping folder inside the widget.

Loading state during picker: `appLauncher.loading`. Empty state: `appLauncher.emptyTitle`, `appLauncher.emptyHint`. Selection failure: `appLauncher.selectError`. Save failure: `appLauncher.saveError`. Save status: `appLauncher.savedStatus`.

## View modes

The widget surface supports Explorer-style view modes. The view-mode control is labelled `appLauncher.viewModeLabel` and offers:

- `appLauncher.iconView` — icon grid, the default for existing widgets.
- `appLauncher.listView` — compact row list.
- `appLauncher.detailsView` — row list with `appLauncher.detailsNameColumn` and `appLauncher.detailsPathColumn` headers.

File-name labels may wrap to two lines in the launcher surface so longer local app or document names remain readable.

## Right-click context menu on an entry

App Launcher actions live in the right-click menu, not the default surface. Icon and list views show the icon and label; details view also shows the stored local path for comparison.

- Launch: `appLauncher.launchApp`. Variants: `appLauncher.runNormal`, `appLauncher.runAdmin` (UAC elevation), `appLauncher.runAsUser` (run as a different user).
- `appLauncher.editApp` / `appLauncher.edit` — open the edit dialog.
- `appLauncher.removeApp` / `appLauncher.remove` — delete. Status `appLauncher.removedStatus`.
- `appLauncher.moreActions` — overflow menu.

Launch lifecycle status:

- In flight: `appLauncher.launchStatus`.
- Failure: `appLauncher.launchError`.
- General load failure: `appLauncher.loadError`.

## Pin to Activity Rail

Pinning an entry (`appLauncher.pinToRail`) places its icon in the Activity Rail's Connection Rail group (`app.connectionRail`) alongside pinned Connections — see [02-app-layout.md](02-app-layout.md). Unpinning is reversible without destroying the entry.
