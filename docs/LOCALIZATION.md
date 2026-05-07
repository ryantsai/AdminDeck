# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

### app.dontSleep

- English value: "Don't Sleep"
- Namespace: `app`
- File/component: `src/App.tsx` / `ActivityRail`
- UI role: left navigation toggle tooltip
- Surrounding user flow: The user hovers or focuses the rail control above Settings that toggles Don't Sleep mode for the current AdminDeck runtime.
- Tone: compact tool name.
- Placeholder details: none.
- Domain notes: This is a Windows power-management tool name. Keep the apostrophe meaning "do not sleep"; it is not a literal sleep session.

### app.dontSleepEnable

- English value: "Enable Don't Sleep mode"
- Namespace: `app`
- File/component: `src/App.tsx` / `ActivityRail`
- UI role: button aria-label/title
- Surrounding user flow: The rail control is off and clicking it asks Windows to keep the system awake and block session shutdown while AdminDeck remains running.
- Tone: direct action label.
- Placeholder details: none.
- Domain notes: The underlying Windows backend uses an execution-state request and shutdown block reason; "mode" refers to the app-level toggle state.

### app.dontSleepDisable

- English value: "Disable Don't Sleep mode"
- Namespace: `app`
- File/component: `src/App.tsx` / `ActivityRail`
- UI role: button aria-label/title
- Surrounding user flow: The rail control is on and clicking it releases the Windows power-management request and shutdown block reason.
- Tone: direct action label.
- Placeholder details: none.
- Domain notes: Disabling returns Windows power behavior to the user's normal OS power settings.

### app.dontSleepEnabled

- English value: "Don't Sleep mode enabled."
- Namespace: `app`
- File/component: `src/App.tsx` / `ActivityRail`
- UI role: transient status
- Surrounding user flow: Appears in the bottom workspace status bar after the user turns on the Don't Sleep rail control.
- Tone: brief success confirmation.
- Placeholder details: none.
- Domain notes: The status confirms the runtime toggle, not a persisted setting.

### app.dontSleepDisabled

- English value: "Don't Sleep mode disabled."
- Namespace: `app`
- File/component: `src/App.tsx` / `ActivityRail`
- UI role: transient status
- Surrounding user flow: Appears in the bottom workspace status bar after the user turns off the Don't Sleep rail control.
- Tone: brief confirmation.
- Placeholder details: none.
- Domain notes: Disabling releases the temporary Windows power-management request.

### app.dontSleepError

- English value: "Could not change Don't Sleep mode: {{message}}"
- Namespace: `app`
- File/component: `src/App.tsx` / `ActivityRail`
- UI role: transient error status
- Surrounding user flow: Appears in the bottom workspace status bar if the backend cannot start or stop Don't Sleep mode.
- Tone: concise error with implementation detail appended.
- Placeholder details: `{{message}}` is the backend or runtime error text.
- Domain notes: This is expected mainly when the Windows-only backend API is unavailable or the OS rejects the power/shutdown request.

### terminal.sendToAi

- English value: "Send terminal buffer to AI Assistant"
- Namespace: `terminal`
- File/component: `src/terminal/TerminalWorkspace.tsx`
- UI role: toolbar button label/tooltip
- Surrounding user flow: The AI robot icon in a terminal or SSH Pane toolbar attaches the terminal buffer text to the AI Assistant context.
- Tone: direct action label.
- Placeholder details: none.
- Domain notes: For regular terminal panes this is AdminDeck's xterm scrollback buffer. For tmux-backed SSH panes this uses tmux capture-pane history when available. AI Assistant can remain English where locales already use that product term.

### terminal.terminalBuffer

- English value: "terminal buffer"
- Namespace: `terminal`
- File/component: `src/terminal/TerminalWorkspace.tsx`
- UI role: AI Assistant context source label fragment
- Surrounding user flow: Appears as part of the context source label after a user clicks the AI robot icon in a terminal or SSH Pane toolbar.
- Tone: compact descriptive fragment, lower-case because it follows the Connection or Pane title.
- Placeholder details: none.
- Domain notes: Refers to terminal scrollback or tmux pane history, depending on the active Pane transport.

### settings.scrollbackHint

- English value: "Default is 5,000. Valid range is 100 to 100,000."
- Namespace: `settings`
- File/component: `src/settings/TerminalSettings.tsx`
- UI role: helper text
- Surrounding user flow: Settings -> Terminal -> Scrollback lines explains the default and valid range for terminal buffer/scrollback size.
- Tone: concise settings helper.
- Placeholder details: none.
- Domain notes: The default changed from 10,000 to 5,000 lines; the valid range did not change.

### settings.sshBufferLines

- English value: "SSH buffer lines"
- Namespace: `settings`
- File/component: `src/settings/SshSettings.tsx`
- UI role: input label
- Surrounding user flow: Settings -> SSH -> SSH defaults lets the user configure the default SSH-specific terminal buffer size separately from local terminal scrollback.
- Tone: concise settings label.
- Placeholder details: none.
- Domain notes: Applies to SSH terminal panes and AdminDeck-launched tmux pane history, not local terminal panes.

### settings.sshBufferHint

- English value: "Default is 5,000. Used for SSH terminal scrollback and tmux pane history."
- Namespace: `settings`
- File/component: `src/settings/SshSettings.tsx`
- UI role: helper text
- Surrounding user flow: Shown below the SSH buffer lines input to explain how the setting affects native SSH and tmux-backed SSH panes.
- Tone: concise explanatory helper.
- Placeholder details: none.
- Domain notes: tmux can remain English as the terminal multiplexer command name.

### settings.sshBufferRange

- English value: "SSH buffer must be between 100 and 100000 lines."
- Namespace: `settings`
- File/component: `src/settings/SshSettings.tsx`
- UI role: validation error
- Surrounding user flow: Shown when saving SSH defaults with an SSH buffer size outside the accepted range.
- Tone: direct validation message.
- Placeholder details: none.
- Domain notes: The valid range matches terminal scrollback limits.

### settings.sshKeyEmailDialogTitle

- English value: "Generate SSH key"
- Namespace: `settings`
- File/component: `src/settings/SshSettings.tsx` / `SshKeyEmailDialog`
- UI role: dialog title
- Surrounding user flow: Settings -> SSH -> Generate key opens an app-owned popup asking for the email comment before creating the SSH key pair.
- Tone: concise action title.
- Placeholder details: none.
- Domain notes: SSH stays English as a technical protocol name.

### settings.sshKeyEmailDialogHint

- English value: "Add an email address as the public key comment so the key is easy to recognize later."
- Namespace: `settings`
- File/component: `src/settings/SshSettings.tsx` / `SshKeyEmailDialog`
- UI role: helper text
- Surrounding user flow: Shown inside the SSH key generation popup above the email field.
- Tone: practical, reassuring explanation.
- Placeholder details: none.
- Domain notes: Public key comment is metadata added to the generated SSH public key, not a credential or account email requirement.

### settings.sshKeyEmailPlaceholder

- English value: "admin@example.com"
- Namespace: `settings`
- File/component: `src/settings/SshSettings.tsx` / `SshKeyEmailDialog`
- UI role: input placeholder
- Surrounding user flow: Example value in the email field for SSH key generation.
- Tone: neutral example.
- Placeholder details: literal example email address; keep the `example.com` domain.
- Domain notes: This is only an SSH key comment example.

### settings.sshKeyGenerating

- English value: "Generating..."
- Namespace: `settings`
- File/component: `src/settings/SshSettings.tsx` / `SshKeyEmailDialog`
- UI role: button loading state
- Surrounding user flow: Replaces the Generate key submit label while AdminDeck creates the SSH key pair.
- Tone: brief progress status.
- Placeholder details: none.
- Domain notes: Refers to SSH key pair creation.

### workspace.hostUsage

- English value: "Host usage"
- Namespace: `workspace`
- File/component: `src/workspace/StatusBar.tsx`
- UI role: ARIA label
- Surrounding user flow: Labels the bottom status-bar group that shows local host resource usage.
- Tone: concise utility label.
- Placeholder details: none.
- Domain notes: "Host" means the current local Windows machine running AdminDeck.

### connections.createConnectionComplete

- English value: "Connection \"{{name}}\" added."
- Namespace: `connections`
- File/component: `src/connections/ConnectionSidebar.tsx`
- UI role: transient status
- Surrounding user flow: Appears in the bottom workspace status bar after a stored Connection is saved from the New Connection dialog.
- Tone: brief success confirmation.
- Placeholder details: `{{name}}` is the saved Connection name.
- Domain notes: Connection is the durable stored resource, not a live Session.

### connections.deleteConnectionComplete

- English value: "Connection \"{{name}}\" deleted."
- Namespace: `connections`
- File/component: `src/connections/ConnectionSidebar.tsx`
- UI role: transient status
- Surrounding user flow: Appears in the bottom workspace status bar after a user confirms deleting a Connection from the tree.
- Tone: brief success confirmation.
- Placeholder details: `{{name}}` is the deleted Connection name.
- Domain notes: Connection is the durable stored resource, not a live Session.

### connections.import.importFileComplete

- English value: "Imported {{count}} Connections from file."
- Namespace: `connections`
- File/component: `src/connections/ConnectionSidebar.tsx`, `src/connections/ImportDialog.tsx`
- UI role: transient status
- Surrounding user flow: Appears in the bottom workspace status bar after selected import preview rows from a file are saved.
- Tone: brief success confirmation.
- Placeholder details: `{{count}}` is the number of imported Connection rows.
- Domain notes: Connection is capitalized for the durable stored resource.

### connections.import.importScanComplete

- English value: "Imported {{count}} Connections from scan."
- Namespace: `connections`
- File/component: `src/connections/ConnectionSidebar.tsx`, `src/connections/ImportDialog.tsx`
- UI role: transient status
- Surrounding user flow: Appears in the bottom workspace status bar after selected network scan results are saved as Connections.
- Tone: brief success confirmation.
- Placeholder details: `{{count}}` is the number of imported scan result rows.
- Domain notes: Connection is capitalized for the durable stored resource.

### workspace.cpu

- English value: "CPU"
- Namespace: `workspace`
- File/component: `src/workspace/StatusBar.tsx`
- UI role: metric label
- Surrounding user flow: Short label beside the CPU usage percentage in the bottom status bar.
- Tone: compact Task Manager-style metric label.
- Placeholder details: none.
- Domain notes: CPU can remain English as a common hardware abbreviation.

### workspace.cpuUsage

- English value: "CPU usage"
- Namespace: `workspace`
- File/component: `src/workspace/StatusBar.tsx`
- UI role: tooltip
- Surrounding user flow: Tooltip for the CPU metric in the bottom status bar.
- Tone: concise descriptive tooltip.
- Placeholder details: none.
- Domain notes: Describes local host CPU utilization percentage.

### workspace.ram

- English value: "RAM"
- Namespace: `workspace`
- File/component: `src/workspace/StatusBar.tsx`
- UI role: metric label
- Surrounding user flow: Short label beside the RAM usage percentage in the bottom status bar.
- Tone: compact Task Manager-style metric label.
- Placeholder details: none.
- Domain notes: RAM can remain English as a common hardware abbreviation.

### workspace.ramUsage

- English value: "RAM usage"
- Namespace: `workspace`
- File/component: `src/workspace/StatusBar.tsx`
- UI role: tooltip
- Surrounding user flow: Tooltip for the RAM metric in the bottom status bar.
- Tone: concise descriptive tooltip.
- Placeholder details: none.
- Domain notes: Describes local host physical memory use.

### workspace.network

- English value: "Network"
- Namespace: `workspace`
- File/component: `src/workspace/StatusBar.tsx`
- UI role: metric label
- Surrounding user flow: Short label beside network throughput in the bottom status bar.
- Tone: compact Task Manager-style metric label.
- Placeholder details: none.
- Domain notes: Refers to aggregate local network interface traffic.

### workspace.networkUsage

- English value: "Network throughput"
- Namespace: `workspace`
- File/component: `src/workspace/StatusBar.tsx`
- UI role: tooltip
- Surrounding user flow: Tooltip for the network metric in the bottom status bar.
- Tone: concise descriptive tooltip.
- Placeholder details: none.
- Domain notes: The displayed value is aggregate local network throughput formatted as decimal MB/s, not a percentage.
