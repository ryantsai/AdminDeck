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
