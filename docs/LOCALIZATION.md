# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

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
