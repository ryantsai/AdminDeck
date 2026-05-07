# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

### workspace.workspace

- English value: `Workspace`
- Namespace: `workspace`
- File/component: `src/connections/utils.tsx`, rendered in `src/ai/AssistantPanel.tsx`
- UI role: fragment
- Surrounding user flow: AI Assistant active-session hint shows the current tab title followed by the tab/workspace kind when a terminal tab contains multiple panes.
- Tone: Short, neutral product label.
- Placeholder details: None.
- Domain notes: Refers to a frontend workspace/pane container, not a durable Connection or live backend Session.

### workspace.terminal

- English value: `Terminal`
- Namespace: `workspace`
- File/component: `src/connections/utils.tsx`, rendered in `src/ai/AssistantPanel.tsx`
- UI role: fragment
- Surrounding user flow: AI Assistant active-session hint shows the current tab title followed by the tab/workspace kind for a terminal tab.
- Tone: Short, neutral product label.
- Placeholder details: None.
- Domain notes: Refers to the terminal workspace surface, not the saved Connection. Technical term may remain English where local convention prefers it.

### workspace.connectionKind

- English value: `{{type}} connection`
- Namespace: `workspace`
- File/component: `src/connections/utils.tsx`, rendered in `src/ai/AssistantPanel.tsx`
- UI role: fragment
- Surrounding user flow: AI Assistant active-session hint shows the current tab title followed by the selected remote desktop or embedded pane Connection kind, such as `RDP connection` or `VNC connection`.
- Tone: Short, neutral descriptive fragment.
- Placeholder details: `{{type}}` is a localized Connection type label from the `connections` namespace, such as `RDP`, `VNC`, or `URL`.
- Domain notes: Connection means a durable openable resource; keep protocol abbreviations such as RDP, VNC, SSH, and URL unchanged unless the locale commonly translates them.

### ai.pastedImageSource

- English value: `Pasted image`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: label
- Surrounding user flow: User pastes an image into the AI Assistant composer and the composer shows the attached image preview.
- Tone: Short, neutral, descriptive.
- Placeholder details: None.
- Domain notes: Refers to an image/screenshot pasted from the clipboard, not a saved Connection or Session artifact.

### ai.imageInputNotSupported

- English value: `This model does not support image input, so pasted screenshots are not sent.`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: status notice
- Surrounding user flow: User pastes a screenshot or has an image context while the selected AI provider/model cannot accept image input.
- Tone: Subtle, factual, non-blocking.
- Placeholder details: None.
- Domain notes: "Model" means the selected AI model in Settings/assistant picker; image input means multimodal image content sent to the provider API.

### ai.pastedImageSourceWithNumber

- English value: `Pasted image {{number}}`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: label
- Surrounding user flow: User pastes multiple images into the AI Assistant composer and each attached preview gets a numbered source label.
- Tone: Short, neutral, descriptive.
- Placeholder details: `{{number}}` is a 1-based index for the pasted image within the paste action.
- Domain notes: Refers to images/screenshots pasted from the clipboard, not saved Connections or Sessions.

### ai.pastedImages

- English value: `Pasted images ({{count}})`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: section label
- Surrounding user flow: User has one or more pasted image attachments staged above the AI Assistant input.
- Tone: Short, neutral, descriptive.
- Placeholder details: `{{count}}` is the number of currently staged image attachments.
- Domain notes: Refers only to pending pasted image attachments in the composer.

### ai.removeImageAttachment

- English value: `Remove {{label}}`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: button aria-label and tooltip
- Surrounding user flow: User removes a single pasted image attachment from the AI Assistant composer before sending.
- Tone: Direct action label.
- Placeholder details: `{{label}}` is the image attachment label, such as `Pasted image 1`.
- Domain notes: Removing only detaches the pending image from the outgoing AI Assistant prompt.

### ai.openImagePreview

- English value: `Open {{label}} preview`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: button aria-label and tooltip
- Surrounding user flow: User clicks a small image attachment preview in the AI Assistant chat history to open a larger preview dialog.
- Tone: Direct action label.
- Placeholder details: `{{label}}` is the stored image attachment label, such as `Pasted image 1` or a screenshot source label.
- Domain notes: Opens an in-app preview of an already stored chat attachment; it does not send the image again or persist new data.

### ai.imagePreviewTitle

- English value: `{{label}} preview`
- Namespace: `ai`
- File/component: `src/ai/AssistantPanel.tsx`
- UI role: dialog aria-label
- Surrounding user flow: User has opened a larger preview dialog for an image attachment from AI Assistant chat history.
- Tone: Short, descriptive.
- Placeholder details: `{{label}}` is the stored image attachment label, such as `Pasted image 1` or a screenshot source label.
- Domain notes: Refers to the in-app preview dialog for an already stored chat attachment.

## Pending translations — URL password autofill and URL settings

- `webview.goBack` — "Go back" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: aria-label; flow: URL toolbar browser navigation; tone: concise action; placeholders: none; domain notes: browser history back action for a URL Connection.)
- `webview.back` — "Back" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: tooltip; flow: URL toolbar browser navigation; tone: concise action; placeholders: none; domain notes: browser history back action.)
- `webview.goForward` — "Go forward" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: aria-label; flow: URL toolbar browser navigation; tone: concise action; placeholders: none; domain notes: browser history forward action.)
- `webview.forward` — "Forward" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: tooltip; flow: URL toolbar browser navigation; tone: concise action; placeholders: none; domain notes: browser history forward action.)
- `webview.reload` — "Reload" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: aria-label/tooltip; flow: URL toolbar page refresh; tone: concise action; placeholders: none; domain notes: browser reload action.)
- `webview.address` — "Address" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: input aria-label; flow: URL toolbar address entry; tone: concise label; placeholders: none; domain notes: URL address field.)
- `webview.urlPlaceholder` — "https://example.com" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: placeholder; flow: URL toolbar address entry; tone: example value; placeholders: none; domain notes: URL example should remain a valid URL.)
- `webview.savePassword` — "Save password" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: button; flow: user types username/password into embedded site then saves without submitting; tone: direct action; placeholders: none; domain notes: saves website password in OS keychain.)
- `webview.savePasswordTitle` — "Save the username and password currently typed into this page" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: tooltip; flow: URL toolbar password save; tone: explanatory; placeholders: none; domain notes: capture does not submit the web form.)
- `webview.fill` — "Autofill" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: button; flow: URL toolbar saved credential fill; tone: concise action; placeholders: none; domain notes: fills saved website credentials without submitting.)
- `webview.fillSavedCredential` — "Autofill saved credential" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: tooltip; flow: URL toolbar saved credential fill; tone: concise action; placeholders: none; domain notes: does not submit.)
- `webview.noSavedCredential` — "No saved URL credential" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: disabled tooltip; flow: URL toolbar saved credential unavailable; tone: explanatory; placeholders: none; domain notes: URL credential belongs to URL Connection.)
- `webview.screenshotTarget` — "{{title}} URL view" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: screenshot target label; flow: screenshot menu; tone: descriptive; placeholders: `title` is the current tab title; domain notes: URL view means embedded URL Connection browser.)
- `webview.noUrlConfigured` — "This URL Connection has no URL configured." (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: empty state; flow: opening incomplete URL Connection; tone: explanatory; placeholders: none; domain notes: use Connection terminology.)
- `webview.desktopRuntimeOnly` — "Embedded browser only available in the desktop runtime. Open externally:" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: empty state; flow: web preview outside Tauri runtime; tone: explanatory; placeholders: none; domain notes: desktop runtime means Tauri app.)
- `webview.downloadStarted` — "Download started" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: status; flow: embedded browser download; tone: brief status; placeholders: none; domain notes: download from website.)
- `webview.downloadComplete` — "Download complete" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: status; flow: embedded browser download; tone: brief status; placeholders: none; domain notes: download from website.)
- `webview.downloadFailed` — "Download failed" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: status; flow: embedded browser download; tone: brief status; placeholders: none; domain notes: download from website.)
- `webview.capturingPassword` — "Looking for typed credentials" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: status; flow: URL toolbar Save password; tone: brief progress; placeholders: none; domain notes: reads current page fields only.)
- `webview.savingPassword` — "Saving password" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: status; flow: URL toolbar Save password; tone: brief progress; placeholders: none; domain notes: stores password in OS keychain.)
- `webview.passwordSaved` — "Password saved" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: status; flow: URL toolbar Save password success; tone: brief success; placeholders: none; domain notes: password saved for URL Connection.)
- `webview.fillingCredential` — "Autofilling credential" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: status; flow: URL toolbar Autofill; tone: brief progress; placeholders: none; domain notes: does not submit form.)
- `webview.credentialFilled` — "Credential autofilled" (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: status; flow: URL toolbar Autofill success; tone: brief success; placeholders: none; domain notes: does not submit form.)
- `webview.savePasswordInvalidCapture` — "The page returned an invalid credential capture response." (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: error; flow: Save password failure; tone: clear error; placeholders: none; domain notes: technical capture failure.)
- `webview.savePasswordNoPasswordField` — "No typed password field was found on this page." (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: error; flow: Save password validation; tone: corrective; placeholders: none; domain notes: user may need to click/type into site first.)
- `webview.savePasswordEmptyPassword` — "Type a password before saving it." (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: error; flow: Save password validation; tone: corrective; placeholders: none; domain notes: no password value is stored.)
- `webview.savePasswordEmptyUsername` — "Type a username before saving the password." (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: error; flow: Save password validation; tone: corrective; placeholders: none; domain notes: username is required so Settings can identify the saved website password.)
- `webview.savePasswordFailed` — "Could not save the password from this page." (namespace: `webview`; file/component: `src/webview/WebViewWorkspace.tsx`; UI role: error; flow: Save password generic failure; tone: clear error; placeholders: none; domain notes: page field capture failed.)
- `settings.sectionUrl` — "URL" (namespace: `settings`; file/component: `src/settings/SettingsPage.tsx`, `src/settings/UrlSettings.tsx`; UI role: nav label/section label; flow: Settings navigation; tone: short technical label; placeholders: none; domain notes: URL Connection settings.)
- `settings.urlDefaults` — "URL data and credentials" (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: heading; flow: Settings → URL; tone: descriptive; placeholders: none; domain notes: credentials and data shards for URL Connections.)
- `settings.savedWebsitePasswords` — "Saved website passwords" (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: heading/list aria-label; flow: manage saved URL credentials; tone: descriptive; placeholders: none; domain notes: passwords are website credentials for URL Connections.)
- `settings.savedWebsitePasswordsHint` — "Passwords are stored in the OS keychain. AdminDeck keeps the URL Connection, username, and detected field selectors in SQLite so Autofill can target the same fields without submitting the form." (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: help text; flow: manage saved URL credentials; tone: explanatory; placeholders: none; domain notes: preserve OS keychain, SQLite, URL Connection, Autofill terminology.)
- `settings.noSavedWebsitePasswords` — "No saved website passwords yet." (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: empty state; flow: manage saved URL credentials; tone: neutral; placeholders: none; domain notes: none.)
- `settings.urlPasswordDeleted` — "Saved website password deleted." (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: status; flow: deleting saved URL credential; tone: brief success; placeholders: none; domain notes: deletes keychain password and SQLite metadata.)
- `settings.urlPasswordDetails` — "Username: {{username}} · Updated: {{updatedAt}}" (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: list metadata; flow: manage saved URL credentials; tone: compact metadata; placeholders: `username` saved username, `updatedAt` localized date/time string; domain notes: no password value is displayed.)
- `settings.urlDataShards` — "URL data shards" (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: heading/list aria-label; flow: manage URL data partitions; tone: product terminology; placeholders: none; domain notes: data shard means URL Connection data partition.)
- `settings.urlDataShardsHint` — "Data shards are URL Connection data partition names. Clearing a shard removes that partition assignment from matching URL Connections; browser engine storage cleanup depends on the shared WebView2 data store." (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: help text; flow: manage URL data partitions; tone: explanatory; placeholders: none; domain notes: preserve URL Connection and WebView2 terms.)
- `settings.noUrlDataShards` — "No URL data shards configured." (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: empty state; flow: manage URL data partitions; tone: neutral; placeholders: none; domain notes: data shard means data partition.)
- `settings.urlDataShardConnectionCount` — "{{count}} URL Connection" (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: list metadata; flow: manage URL data partitions; tone: compact metadata; placeholders: `count` number of URL Connections using shard; domain notes: singular form.)
- `settings.urlDataShardConnectionCountPlural` — "{{count}} URL Connections" (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: list metadata; flow: manage URL data partitions; tone: compact metadata; placeholders: `count` number of URL Connections using shard; domain notes: plural form.)
- `settings.clearShard` — "Clear shard" (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: button; flow: remove data partition assignment from URL Connections; tone: concise action; placeholders: none; domain notes: does not delete OS files directly.)
- `settings.urlDataShardCleared` — "Cleared URL data shard {{name}}." (namespace: `settings`; file/component: `src/settings/UrlSettings.tsx`; UI role: status; flow: clearing URL data partition assignment; tone: brief success; placeholders: `name` data shard name; domain notes: data shard means data partition.)

### connections.import.tileTitle

- English value: `Import`
- Namespace: `connections`
- File/component: `src/connections/ConnectionSidebar.tsx` (Connection wizard type-picker tile).
- UI role: button label.
- Surrounding user flow: User opens the New Connection wizard and sees an Import tile alongside SSH, RDP, etc.; clicking it opens the batch import dialog.
- Tone: Short, action-oriented product label.
- Placeholder details: None.
- Domain notes: Entry point to the bulk Connection import flow (file or network scan). Not related to importing application Settings backups.

### connections.import.tileSubtitle

- English value: `From file or network scan`
- Namespace: `connections`
- File/component: `src/connections/ConnectionSidebar.tsx` (Import tile subtitle).
- UI role: tile descriptor.
- Surrounding user flow: Subtitle below the Import tile in the connection wizard explaining the two import sources.
- Tone: Short, neutral descriptor.
- Placeholder details: None.
- Domain notes: Two sources: an exported file (CSV/RDCMan/MobaXterm/PuTTY) or an in-app TCP port scan over a host range.

### connections.import.title

- English value: `Import connections`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (panel-label header).
- UI role: dialog header label.
- Surrounding user flow: Top of the Import dialog reached from the wizard's Import tile.
- Tone: Short, neutral product label.
- Placeholder details: None.
- Domain notes: Refers to durable Connections, not live Sessions.

### connections.import.back

- English value: `Back`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (back-arrow button aria-label and tooltip).
- UI role: navigation button label.
- Surrounding user flow: User has selected file or scan mode and wants to return to the source-picker step.
- Tone: Short navigation label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.chooseSource

- English value: `Choose an import source`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (menu step heading).
- UI role: dialog heading.
- Surrounding user flow: Initial step of the Import dialog; user picks file vs. scan.
- Tone: Short instructional heading.
- Placeholder details: None.
- Domain notes: None.

### connections.import.fromFileTitle

- English value: `Import from file`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (menu tile label and file-stage heading).
- UI role: button label and dialog heading.
- Surrounding user flow: User picks the file source on the menu step or sees the heading after entering the file step.
- Tone: Short, action-oriented.
- Placeholder details: None.
- Domain notes: File formats include CSV, TSV, RDCMan, MobaXterm, PuTTY exports; technical names typically remain English.

### connections.import.fromFileSubtitle

- English value: `CSV, TSV, RDCMan, MobaXterm, PuTTY`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (menu tile subtitle).
- UI role: tile descriptor.
- Surrounding user flow: Beneath the file-import menu tile.
- Tone: Short comma-separated list of formats.
- Placeholder details: None.
- Domain notes: Format names (CSV, TSV, RDCMan, MobaXterm, PuTTY) typically stay English across locales.

### connections.import.scanTitle

- English value: `Scan network`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (menu tile label and scan-stage heading).
- UI role: button label and dialog heading.
- Surrounding user flow: User picks the scan source on the menu step or sees the heading after entering the scan step.
- Tone: Short action label.
- Placeholder details: None.
- Domain notes: A light TCP port probe that creates Connection drafts from open ports.

### connections.import.scanSubtitle

- English value: `Probe a range for open SSH, Telnet, RDP`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (menu tile subtitle).
- UI role: tile descriptor.
- Surrounding user flow: Beneath the scan menu tile.
- Tone: Short descriptive sentence fragment.
- Placeholder details: None.
- Domain notes: Protocol abbreviations stay English.

### connections.import.chooseFile

- English value: `Choose file`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (file picker trigger).
- UI role: button label.
- Surrounding user flow: User opens the OS file picker to select an exported connections file.
- Tone: Short action label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.noFileChosen

- English value: `No file chosen`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (file path placeholder).
- UI role: input placeholder.
- Surrounding user flow: Empty path field next to the Choose File button before any selection.
- Tone: Neutral placeholder.
- Placeholder details: None.
- Domain notes: None.

### connections.import.fileFormatsHint

- English value: `Supported: CSV/TSV/text, RDCMan (.rdg), MobaXterm (.mxtsessions), PuTTY (.reg).`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (hint paragraph).
- UI role: hint text.
- Surrounding user flow: Beneath the file picker; clarifies which exported formats the parser accepts.
- Tone: Short factual hint.
- Placeholder details: None.
- Domain notes: Format names and extensions stay English.

### connections.import.scanTargetLabel

- English value: `Target`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (scan target field label).
- UI role: form field label.
- Surrounding user flow: Field where user enters the IP, range, or CIDR to scan.
- Tone: Short field label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.scanTargetPlaceholder

- English value: `192.168.1.0/24, 10.0.0.10-10.0.0.50, or single IP/host`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (target input placeholder).
- UI role: input placeholder.
- Surrounding user flow: Empty target input on the scan step.
- Tone: Example syntax hint.
- Placeholder details: Sample IPs and ranges; do not localize the IP examples.
- Domain notes: CIDR notation stays the same across locales.

### connections.import.scanTargetHint

- English value: `Light TCP probe of the selected ports. Limited to 1024 hosts per scan.`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (hint paragraph).
- UI role: hint text.
- Surrounding user flow: Beneath the target input.
- Tone: Short factual hint.
- Placeholder details: None.
- Domain notes: TCP stays English.

### connections.import.scanPortsLabel

- English value: `Ports to probe`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (port checkbox group legend).
- UI role: fieldset legend.
- Surrounding user flow: Fieldset listing SSH, Telnet, RDP toggles.
- Tone: Short label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.portSsh

- English value: `SSH`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (port checkbox label).
- UI role: checkbox label.
- Surrounding user flow: Toggles whether the scan probes port 22.
- Tone: Protocol acronym.
- Placeholder details: Rendered as `SSH (22)` via concatenation in the component.
- Domain notes: SSH stays English.

### connections.import.portTelnet

- English value: `Telnet`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (port checkbox label).
- UI role: checkbox label.
- Surrounding user flow: Toggles whether the scan probes port 23.
- Tone: Protocol name.
- Placeholder details: Rendered as `Telnet (23)`.
- Domain notes: Telnet stays English.

### connections.import.portRdp

- English value: `RDP`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (port checkbox label).
- UI role: checkbox label.
- Surrounding user flow: Toggles whether the scan probes port 3389.
- Tone: Protocol acronym.
- Placeholder details: Rendered as `RDP (3389)`.
- Domain notes: RDP stays English.

### connections.import.scanStart

- English value: `Start scan`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (start scan button).
- UI role: button label.
- Surrounding user flow: Begins the TCP port probe across the configured target.
- Tone: Short action label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.scanRunning

- English value: `Scanning`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (start scan button while busy).
- UI role: button label (busy state).
- Surrounding user flow: Replaces "Start scan" while the probe is still in flight.
- Tone: Short progress indicator.
- Placeholder details: None.
- Domain notes: None.

### connections.import.scanNoResults

- English value: `No open ports found in the scanned range.`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (empty state).
- UI role: empty-state message.
- Surrounding user flow: Shown after a scan finishes with zero matches.
- Tone: Neutral status sentence.
- Placeholder details: None.
- Domain notes: None.

### connections.import.scanTargetRequired

- English value: `Enter a target IP, hostname, range, or CIDR.`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (validation error).
- UI role: error message.
- Surrounding user flow: User clicked Start scan with an empty target.
- Tone: Direct validation message.
- Placeholder details: None.
- Domain notes: CIDR stays English.

### connections.import.scanPortRequired

- English value: `Select at least one port to probe.`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (validation error).
- UI role: error message.
- Surrounding user flow: User clicked Start scan with no ports enabled.
- Tone: Direct validation message.
- Placeholder details: None.
- Domain notes: None.

### connections.import.previewHeading

- English value: `{{selected}} of {{count}} selected`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (preview toolbar).
- UI role: status fragment.
- Surrounding user flow: Toolbar above the import preview table summarizes how many candidate Connection drafts are checked.
- Tone: Short status fragment.
- Placeholder details: `{{selected}}` is the number checked; `{{count}}` is the total parsed/scanned candidates.
- Domain notes: Refers to draft Connections that will be persisted on confirm.

### connections.import.selectAll

- English value: `Select all`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (toolbar button).
- UI role: button label.
- Surrounding user flow: Toggles every preview row's checkbox on.
- Tone: Short action label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.selectNone

- English value: `Select none`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (toolbar button).
- UI role: button label.
- Surrounding user flow: Clears every preview row's checkbox.
- Tone: Short action label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.selectColumn

- English value: `Select`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (preview table column header aria-label).
- UI role: column header aria-label.
- Surrounding user flow: Header of the preview table's checkbox column.
- Tone: Short label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.selectRow

- English value: `Select row`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (preview table row checkbox aria-label).
- UI role: checkbox aria-label.
- Surrounding user flow: Per-row checkbox in the preview table.
- Tone: Short accessibility label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.colName

- English value: `Name`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (preview table column header).
- UI role: table column header.
- Surrounding user flow: Editable Connection display name column.
- Tone: Short label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.colType

- English value: `Type`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (preview table column header).
- UI role: table column header.
- Surrounding user flow: Connection type select column (SSH/Telnet/RDP/VNC/Serial/URL/Local).
- Tone: Short label.
- Placeholder details: None.
- Domain notes: Refers to durable Connection kind.

### connections.import.colHost

- English value: `Host`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (preview table column header).
- UI role: table column header.
- Surrounding user flow: Editable host/IP column.
- Tone: Short label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.colPort

- English value: `Port`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (preview table column header).
- UI role: table column header.
- Surrounding user flow: Editable TCP port column.
- Tone: Short label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.colUser

- English value: `User`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (preview table column header).
- UI role: table column header.
- Surrounding user flow: Editable username column for the imported Connection draft.
- Tone: Short label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.warningsHeading

- English value: `Warnings`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (warnings list heading).
- UI role: section heading.
- Surrounding user flow: Heads a bullet list of parser warnings (rows skipped, unsupported types, etc.).
- Tone: Short label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.destinationLabel

- English value: `Destination`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (destination fieldset legend).
- UI role: fieldset legend.
- Surrounding user flow: Section where the user picks where the imported Connections will live in the connection tree.
- Tone: Short label.
- Placeholder details: None.
- Domain notes: None.

### connections.import.destinationNewFolder

- English value: `Create new folder`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (destination select option).
- UI role: select option label.
- Surrounding user flow: Default destination — creates a new ConnectionFolder for the imported batch.
- Tone: Short action label.
- Placeholder details: None.
- Domain notes: Refers to a ConnectionFolder, not OS folders.

### connections.import.destinationRoot

- English value: `Root`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (destination select option).
- UI role: select option label.
- Surrounding user flow: Places imported Connections at the connection tree root.
- Tone: Short label.
- Placeholder details: None.
- Domain notes: Tree root, not filesystem root.

### connections.import.newFolderNameLabel

- English value: `New folder name`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (folder name input label/placeholder).
- UI role: input label and placeholder.
- Surrounding user flow: When user keeps the default destination ("Create new folder"), this input names the new ConnectionFolder.
- Tone: Short label.
- Placeholder details: None.
- Domain notes: ConnectionFolder, not filesystem.

### connections.import.folderNameRequired

- English value: `Enter a folder name.`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (validation error).
- UI role: error message.
- Surrounding user flow: User clicked Import without typing a name for the new ConnectionFolder.
- Tone: Direct validation message.
- Placeholder details: None.
- Domain notes: None.

### connections.import.noneSelected

- English value: `Select at least one row to import.`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (validation error).
- UI role: error message.
- Surrounding user flow: User clicked Import with every preview row unchecked.
- Tone: Direct validation message.
- Placeholder details: None.
- Domain notes: None.

### connections.import.importCount

- English value: `Import {{count}}`
- Namespace: `connections`
- File/component: `src/connections/ImportDialog.tsx` (final import button).
- UI role: button label.
- Surrounding user flow: Confirms creating `{{count}}` Connection rows from the previewed candidates.
- Tone: Short action label with count.
- Placeholder details: `{{count}}` is the number of selected candidate rows.
- Domain notes: Each created row is a durable Connection.
