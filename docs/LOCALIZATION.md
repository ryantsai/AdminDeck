# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

All keys are structurally present in every locale file (flushed via `scripts/flush-locales.mjs`). Non-English locales currently carry the English fallback value for the entries below. They need real translation.

| Key | Namespace | English |
|-----|-----------|---------|
| app.dontSleep | app | Don't Sleep |
| app.dontSleepEnable | app | Enable Don't Sleep mode |
| app.dontSleepDisable | app | Disable Don't Sleep mode |
| app.dontSleepEnabled | app | Don't Sleep mode enabled. |
| app.dontSleepDisabled | app | Don't Sleep mode disabled. |
| app.dontSleepError | app | Could not change Don't Sleep mode: {{message}} |
| app.connectedConnectionsRail | app | Connected Connections |
| app.openConnectedConnection | app | Open {{name}} |
| settings.navToolbar | settings | Nav toolbar |
| settings.toolbarText | settings | Toolbar text |
| settings.urlSecurity | settings | URL security |
| settings.urlSecurityHint | settings | Controls certificate handling for URL Connections. Keep bypass off unless you trust the internal site and network. |
| settings.ignoreCertificateErrors | settings | Ignore invalid HTTPS certificates |
| settings.ignoreCertificateErrorsHint | settings | Loads URL Connections with self-signed or untrusted certificates without the browser warning. Applies to newly opened URL tabs. |
| settings.urlSettingsSaved | settings | URL settings saved. |
| settings.sshBufferLines | settings | SSH buffer lines |
| settings.sshBufferHint | settings | Default is 5,000. Used for SSH terminal scrollback and tmux pane history. |
| settings.sshBufferRange | settings | SSH buffer must be between 100 and 100000 lines. |
| settings.sshKeyEmailDialogTitle | settings | Generate SSH key |
| settings.sshKeyEmailDialogHint | settings | Add an email address as the public key comment so the key is easy to recognize later. |
| settings.sshKeyEmailPlaceholder | settings | admin@example.com |
| settings.sshKeyGenerating | settings | Generating... |
| settings.scrollbackHint | settings | Default is 5,000. Valid range is 100 to 100,000. (Most non-en locales still say 10,000) |
| settings.aiToolsTitle | settings | Assistant tools |
| settings.aiToolsDescription | settings | Choose which built-in tools the AI Assistant may call while answering. Keep risky tools off unless you need them. |
| settings.aiToolsSafety | settings | Safeguards: file tools are confined to AdminDeck app data, shell commands run from app data only, and deletion/destructive requests are blocked until a future explicit approval prompt can review them. |
| settings.aiTools.*.label/description | settings | 6 tool toggles (currentTime, webSearch, webFetch, appDataFileSearch, appDataFileRead, shellCommand) |
| settings.connectedConnectionsRail | settings | Show connected Connection icons in the left rail |
| settings.connectedConnectionsRailHint | settings | Adds an icon for each connected Connection to the left rail so you can switch back to it quickly. |
| settings.connectedConnectionsRailSaved | settings | Connected Connection icons setting saved. |
| connections.createConnectionComplete | connections | Connection "{{name}}" added. |
| connections.deleteConnectionComplete | connections | Connection "{{name}}" deleted. |
| connections.import.importFileComplete | connections | Imported {{count}} Connections from file. |
| connections.import.importScanComplete | connections | Imported {{count}} Connections from scan. |
| connections.import.bookmarksTitle | connections | Import browser bookmarks |
| connections.import.bookmarksSubtitle | connections | Edge, Chrome, Firefox URL bookmarks |
| connections.import.bookmarksLoading | connections | Looking for browser bookmark sources... |
| connections.import.bookmarksNoSources | connections | No Edge, Chrome, or Firefox bookmark sources were found on this device. |
| connections.import.bookmarksSourceLabel | connections | Browser profile |
| connections.import.bookmarksSourcePath | connections | Source file: {{path}} |
| connections.import.bookmarksTreeLabel | connections | Bookmark folders and links |
| connections.import.bookmarksPreview | connections | Preview {{count}} selected |
| connections.import.bookmarksSourceRequired | connections | Choose a browser bookmark source. |
| connections.import.bookmarksSelectionRequired | connections | Select at least one folder or bookmark to import. |
| connections.import.bookmarksNoImportable | connections | The selected bookmarks did not include any http or https URLs. |
| connections.import.bookmarkFallbackName | connections | Imported bookmark |
| connections.import.importBookmarksComplete | connections | Imported {{count}} Connections from bookmarks. |
| terminal.terminalBuffer | terminal | terminal buffer |
| terminal.sendToAi | terminal | Send terminal buffer to AI Assistant |
| workspace.hostUsage | workspace | Host usage |
| workspace.cpu | workspace | CPU |
| workspace.cpuUsage | workspace | CPU usage |
| workspace.ram | workspace | RAM |
| workspace.ramUsage | workspace | RAM usage |
| workspace.network | workspace | Network |
| workspace.networkUsage | workspace | Network throughput |
| wiki.backlinks | wiki | Backlinks |
| wiki.noBacklinks | wiki | No backlinks yet. |
| wiki.tags | wiki | Tags |
| wiki.noTags | wiki | No tags in this page. |
| wiki.filterByTag | wiki | Filter wiki by #{{tag}} |
| wiki.bodyPlaceholder | wiki | Write in Markdown. Use [[Page Name]] to link pages, #tags to organize notes, and {{connection:id}} to embed a connection. |
| wiki.deletePageTitle | wiki | Delete wiki page? |
| wiki.viewMode | wiki | View |
