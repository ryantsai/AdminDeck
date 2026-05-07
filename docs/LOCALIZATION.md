# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

### settings.defaultKeyPlaceholder
- **English value:** C:\Users\ryan\.ssh\id_ed25519
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** placeholder
- **Flow/context:** Settings → SSH → Default key input; shows an example Windows SSH private key path.
- **Tone:** Example path, not prose.
- **Placeholders:** None.
- **Domain notes:** Keep the path format Windows-style; `id_ed25519` is a standard SSH key filename.

### settings.defaultKeyHint
- **English value:** Used for new SSH Connections that authenticate with a key file.
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** field hint
- **Flow/context:** Explains that the default key path pre-fills future SSH Connection forms only.
- **Tone:** Concise explanatory settings text.
- **Placeholders:** None.
- **Domain notes:** Use Connection terminology; SSH and key file stay English.

### settings.defaultSshUserHint
- **English value:** Pre-fills new SSH and Telnet Connections.
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** field hint
- **Flow/context:** Shown under the default user field in Settings → SSH.
- **Tone:** Short and practical.
- **Placeholders:** None.
- **Domain notes:** Use Connection terminology; SSH and Telnet stay English.

### settings.defaultSshPortHint
- **English value:** Used when an SSH Connection does not specify a port.
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** field hint
- **Flow/context:** Shown under the default SSH port field; clarifies fallback behavior for new/opened SSH Connections.
- **Tone:** Short explanatory settings text.
- **Placeholders:** None.
- **Domain notes:** Use Connection terminology; SSH stays English.

### settings.defaultSshUserRequired
- **English value:** Default SSH user is required.
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** validation error
- **Flow/context:** Shown when saving Settings → SSH with a blank default user.
- **Tone:** Direct validation message.
- **Placeholders:** None.
- **Domain notes:** SSH stays English.

### settings.defaultSshPortRange
- **English value:** Default SSH port must be between 1 and 65535.
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** validation error
- **Flow/context:** Shown when saving Settings → SSH with an invalid port value.
- **Tone:** Direct validation message.
- **Placeholders:** None.
- **Domain notes:** Port range is the TCP/UDP numeric port range; keep numbers unchanged.

### settings.sshDefaultsSaved
- **English value:** SSH defaults saved.
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** success status
- **Flow/context:** Shown after saving Settings → SSH defaults, including SFTP overwrite behavior if changed.
- **Tone:** Brief confirmation.
- **Placeholders:** None.
- **Domain notes:** SSH stays English.

### settings.proxyJumpPlaceholder
- **English value:** bastion.example.com
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** placeholder
- **Flow/context:** Settings → SSH → ProxyJump field; shows an example bastion host.
- **Tone:** Example host, not prose.
- **Placeholders:** None.
- **Domain notes:** ProxyJump is the OpenSSH option name and should stay English.

### settings.proxyJumpHint
- **English value:** Optional default ProxyJump host for new SSH Connections.
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** field hint
- **Flow/context:** Explains that ProxyJump is optional and pre-fills future SSH Connection forms.
- **Tone:** Concise explanatory settings text.
- **Placeholders:** None.
- **Domain notes:** Use Connection terminology; ProxyJump and SSH stay English.

### settings.sftpOverwriteHint
- **English value:** Default behavior when an SFTP upload targets an existing remote file.
- **Namespace:** `settings`
- **File/component:** `src/settings/SshSettings.tsx`
- **UI role:** field hint
- **Flow/context:** Shown under the SFTP overwrite dropdown in Settings → SSH.
- **Tone:** Concise explanatory settings text.
- **Placeholders:** None.
- **Domain notes:** SFTP stays English.

### settings.customFonts
- **English value:** Custom fonts
- **Namespace:** `settings`
- **File/component:** `src/settings/AppearanceSettings.tsx`
- **UI role:** select optgroup label
- **Flow/context:** Settings → Appearance → App UI font family dropdown; groups fonts discovered in the `fonts` folder beside the app executable.
- **Tone:** Short, neutral settings label.
- **Placeholders:** None.
- **Domain notes:** Refers to user-provided app UI font files, not terminal font settings.

### settings.openCustomFontsFolder
- **English value:** Open fonts folder
- **Namespace:** `settings`
- **File/component:** `src/settings/AppearanceSettings.tsx`
- **UI role:** button text, aria-label, and title
- **Flow/context:** Button beside the App UI font family dropdown; opens or creates the `fonts` folder next to the AdminDeck executable.
- **Tone:** Direct action label.
- **Placeholders:** None.
- **Domain notes:** The folder name is literally `fonts` on disk and should stay lowercase/English if referenced explicitly.

### settings.customFontsHint
- **English value:** Custom fonts are loaded from the fonts folder beside the app executable. Supported files: .ttf, .otf, .woff, and .woff2.
- **Namespace:** `settings`
- **File/component:** `src/settings/AppearanceSettings.tsx`
- **UI role:** field hint
- **Flow/context:** Shown under the App UI font family control when at least one custom font was discovered.
- **Tone:** Informational, concise.
- **Placeholders:** None.
- **Domain notes:** Keep file extensions verbatim and mention the literal `fonts` folder.

### settings.noCustomFonts
- **English value:** No custom fonts found. Add .ttf, .otf, .woff, or .woff2 files to the fonts folder beside the app executable.
- **Namespace:** `settings`
- **File/component:** `src/settings/AppearanceSettings.tsx`
- **UI role:** empty-state field hint
- **Flow/context:** Shown under the App UI font family control when the `fonts` folder contains no supported font files.
- **Tone:** Helpful empty state.
- **Placeholders:** None.
- **Domain notes:** Keep file extensions verbatim and mention the literal `fonts` folder.

### connections.import.setUsernameButton
- **English value:** Set username
- **Namespace:** `connections`
- **File/component:** `src/connections/ImportDialog.tsx` Bulk credential toolbar
- **UI role:** Button
- **Flow/context:** Connection import preview: opens a popover to enter a username and apply it to selected rows.
- **Tone:** Concise, imperative.
- **Placeholders:** None.
- **Domain notes:** Replaces a denser inline form. Pairs with `setPasswordButton`.

### connections.import.setPasswordButton
- **English value:** Set password
- **Namespace:** `connections`
- **File/component:** `src/connections/ImportDialog.tsx` Bulk credential toolbar
- **UI role:** Button
- **Flow/context:** Mirrors the username flow; applies a password to selected rows.
- **Tone:** Concise, imperative.
- **Placeholders:** None.
- **Domain notes:** Pairs with `setUsernameButton`.

### connections.import.bulkScopeAll
- **English value:** Apply to all selected
- **Namespace:** `connections`
- **File/component:** `src/connections/ImportDialog.tsx` Bulk credential popover
- **UI role:** Radio label
- **Flow/context:** Choice within the Set username / Set password popover that overwrites every selected row.
- **Tone:** Plain.
- **Placeholders:** None.
- **Domain notes:** Mutually exclusive with `bulkScopeUnfilled`.

### connections.import.bulkScopeUnfilled
- **English value:** Only fill unfilled entries
- **Namespace:** `connections`
- **File/component:** `src/connections/ImportDialog.tsx` Bulk credential popover
- **UI role:** Radio label
- **Flow/context:** Sibling of `bulkScopeAll`; only writes to selected rows whose value is empty.
- **Tone:** Plain.
- **Placeholders:** None.
- **Domain notes:** "Entry" here means a selected import row.

### connections.import.bulkApply
- **English value:** Apply
- **Namespace:** `connections`
- **File/component:** `src/connections/ImportDialog.tsx` Bulk credential popover
- **UI role:** Button
- **Flow/context:** Confirms the bulk username/password assignment.
- **Tone:** Concise, imperative.
- **Placeholders:** None.
- **Domain notes:** Differs from generic Save/OK; specific to the popover.

### connections.import.bulkCancel
- **English value:** Cancel
- **Namespace:** `connections`
- **File/component:** `src/connections/ImportDialog.tsx` Bulk credential popover
- **UI role:** Button
- **Flow/context:** Dismisses the popover without applying.
- **Tone:** Concise, imperative.
- **Placeholders:** None.
- **Domain notes:** Maps to the standard cancel verb.

### connections.import.bulkPasswordRequired
- **English value:** Enter a password to apply.
- **Namespace:** `connections`
- **File/component:** `src/connections/ImportDialog.tsx` Bulk credential popover
- **UI role:** Inline error
- **Flow/context:** Shown when the user clicks Apply without entering a password.
- **Tone:** Plain, instructive.
- **Placeholders:** None.
- **Domain notes:** Mirrors `bulkUserRequired`.

## Wiki feature (added 2026-05-07)

The wiki workspace adds a new `wiki` namespace plus one `app` key. All entries below
are English-only and pending translation across the 12 non-English locales.

### app.wiki
- **English value:** Wiki
- **Namespace:** `app`
- **File/component:** `src/App.tsx` ActivityRail
- **UI role:** Aria label / tooltip on the activity rail wiki button
- **Flow/context:** Sibling of `app.connections` and `app.settings`. Switches the workspace to the wiki view.
- **Tone:** Single noun.
- **Placeholders:** None.

### wiki.* (entire namespace)
- **English values:** see `src/i18n/locales/en.json` `wiki` block.
- **Namespace:** `wiki`
- **File/component:** `src/wiki/WikiWorkspace.tsx`, `src/wiki/WikiTree.tsx`, `src/wiki/WikiEditor.tsx`, `src/wiki/WikiPreview.tsx`, plus the connection-toolbar wiki dropdown surfaced from `src/workspace/`.
- **UI role:** Mix of labels, buttons, placeholders, error toasts, and empty states for the wiki workspace and editor.
- **Flow/context:** Personal-wiki workspace with a page tree, CodeMirror markdown editor, search, attachments, and zip export. `[[id]]` wiki links and `{{connection:id}}` embeds are markdown extensions; their tokens are NOT translated, only the surrounding UI strings.
- **Tone:** Direct, terse — admin/sysop audience.
- **Placeholders:** `{{path}}` (export success), `{{error}}` (failure messages).
- **Domain notes:** "Wiki" stays as a loanword in most locales; "page", "subpage" follow the locale's existing tree/document terminology. "Markdown" stays in English. "Attachment" maps to the locale's standard term for file attachment. The phrase "Linked connections" should match the locale's translation of `connections.title`.
