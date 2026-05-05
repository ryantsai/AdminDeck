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
