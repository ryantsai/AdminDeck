# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

### `connections.telnet`

- English: "Telnet"
- Namespace: `connections`
- Appears in: `src/connections/ConnectionSidebar.tsx`
- UI role: Connection type label
- Context: Connection creation/type picker tile for password-based Telnet terminal Connections.
- Tone: Protocol name, concise
- Placeholders: None
- Domain notes: Keep `Telnet` in English unless the locale has a standard transliteration.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `connections.serial`

- English: "Serial"
- Namespace: `connections`
- Appears in: `src/connections/ConnectionSidebar.tsx`
- UI role: Connection type label
- Context: Connection creation/type picker tile for Serial terminal Connections over COM-style lines.
- Tone: Technical noun, concise
- Placeholders: None
- Domain notes: Refers to serial-port communication, not ordinal ordering.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `connections.telnetShell`

- English: "Password terminal"
- Namespace: `connections`
- Appears in: `src/connections/ConnectionSidebar.tsx`
- UI role: Connection type subtitle
- Context: Subtitle under the Telnet connection type tile, distinguishing it from SSH key/agent auth.
- Tone: Short descriptive phrase
- Placeholders: None
- Domain notes: Password is stored in the OS keychain when saved.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `connections.serialLine`

- English: "Serial line"
- Namespace: `connections`
- Appears in: `src/connections/ConnectionSidebar.tsx`
- UI role: Connection type subtitle
- Context: Subtitle under the Serial connection type tile, and nearby copy for COM-line setup.
- Tone: Technical, concise
- Placeholders: None
- Domain notes: `Line` maps to values such as `COM1`; do not translate examples like COM port names.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `connections.line`

- English: "Line"
- Namespace: `connections`
- Appears in: `src/connections/ConnectionSidebar.tsx`
- UI role: Form field label
- Context: Serial Connection field for the serial port line, defaulting to `COM1`.
- Tone: Compact field label
- Placeholders: None
- Domain notes: Means serial port line/device, not a text line.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `connections.speed`

- English: "Speed"
- Namespace: `connections`
- Appears in: `src/connections/ConnectionSidebar.tsx`
- UI role: Form field label
- Context: Serial Connection baud-rate/speed field, defaulting to `9600`.
- Tone: Compact field label
- Placeholders: None
- Domain notes: Numeric serial baud rate; nearby input placeholder is `9600`.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `connections.serialLinePlaceholder`

- English: "COM1"
- Namespace: `connections`
- Appears in: `src/connections/ConnectionSidebar.tsx`
- UI role: Input placeholder
- Context: Placeholder/default example for the Serial Connection line field on Windows.
- Tone: Literal device identifier example
- Placeholders: None
- Domain notes: Keep `COM1` untranslated.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `workspace.copyRegion`

- English: "Capture Region(Clipboard)"
- Namespace: `workspace`
- Appears in: `src/workspace/ScreenshotMenu.tsx`
- UI role: Menu item
- Context: Screenshot button submenu item. The user selects this item, then draws a rectangular region inside the active workspace surface; the selected pixels are copied to the OS clipboard.
- Tone: Concise command label
- Placeholders: None
- Domain notes: `Clipboard` refers to the operating system clipboard destination.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `workspace.sendRegionToAi`

- English: "Capture Region(AI Assistant)"
- Namespace: `workspace`
- Appears in: `src/workspace/ScreenshotMenu.tsx`
- UI role: Menu item
- Context: Screenshot button submenu item. The user selects this item, then draws a rectangular region inside the active workspace surface; the selected pixels are attached to AI Assistant context.
- Tone: Concise command label
- Placeholders: None
- Domain notes: Keep `AI Assistant` aligned with the product feature name.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `workspace.copyEntirePanel`

- English: "Capture Entire Window(Clipboard)"
- Namespace: `workspace`
- Appears in: `src/workspace/ScreenshotMenu.tsx`
- UI role: Menu item
- Context: Screenshot button submenu item. Captures the entire target workspace surface or pane immediately and copies it to the OS clipboard.
- Tone: Concise command label
- Placeholders: None
- Domain notes: `Window` refers to the visible target workspace area for the screenshot command, not necessarily the full desktop app window.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `workspace.sendEntirePanelToAi`

- English: "Capture Entire Window(AI Assistant)"
- Namespace: `workspace`
- Appears in: `src/workspace/ScreenshotMenu.tsx`
- UI role: Menu item
- Context: Screenshot button submenu item. Captures the entire target workspace surface or pane immediately and attaches it to AI Assistant context.
- Tone: Concise command label
- Placeholders: None
- Domain notes: Keep `AI Assistant` aligned with the product feature name. `Window` refers to the visible target workspace area for the screenshot command.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `workspace.screenshotCaptureError`

- English: "Could not capture screenshot: {{message}}"
- Namespace: `workspace`
- Appears in: `src/workspace/ScreenshotMenu.tsx`
- UI role: Error
- Context: Alert shown when screenshot capture fails for either clipboard or AI Assistant destinations.
- Tone: Direct error
- Placeholders: `{{message}}` is the runtime error returned by the screenshot capture command.
- Domain notes: Screenshot capture may include native Windows surfaces such as RDP ActiveX and WebView2.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `workspace.workspaceSurface`

- English: "Workspace surface"
- Namespace: `workspace`
- Appears in: `src/workspace/ScreenshotMenu.tsx`
- UI role: Fallback label fragment
- Context: Fallback source label used for screenshots when a caller does not provide a more specific surface label such as terminal pane, SFTP view, URL view, or RDP view.
- Tone: Neutral noun phrase
- Placeholders: None
- Domain notes: Refers to the visible capture target, not a backend Session or durable Connection.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `ai.noMessages`

- English: "No messages"
- Namespace: `ai`
- Appears in: `src/ai/AssistantPanel.tsx`
- UI role: Chat history preview fallback
- Context: Fallback preview text for a saved AI Assistant chat row if no last message content is available after history normalization.
- Tone: Neutral, concise
- Placeholders: None
- Domain notes: Refers to chat messages inside the AI Assistant panel, not workspace Sessions or terminal output.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

### `ai.deleteChat`

- English: "Delete chat {{title}}"
- Namespace: `ai`
- Appears in: `src/ai/AssistantPanel.tsx`
- UI role: Button aria-label and tooltip
- Context: X button beside each saved chat title in the AI Assistant panel's View All chat history list. Activating it removes that saved chat from local history.
- Tone: Direct, concise
- Placeholders: `{{title}}` is the saved chat title, usually an AI-generated short summary of the first user request.
- Domain notes: The chat is AI Assistant history stored locally in browser/Tauri local storage; it is not a backend Session, Tab, or durable Connection.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id

## Entry Template

```markdown
### `namespace.key.path`

- English: "Text shown in the UI"
- Namespace: `namespace`
- Appears in: `src/path/Component.tsx`
- UI role: Button label | field label | aria-label | tooltip | status | error | dialog title | sentence fragment
- Context: Explain what the user is doing, what state causes this text to appear, and what surrounding labels or controls are nearby.
- Tone: Neutral | concise | warning | destructive | friendly
- Placeholders: Describe each placeholder, including example values and whether order may change in other languages.
- Domain notes: Explain product-specific meaning, and list technical terms that should remain in English.
- Translation status: Pending for fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id
```
