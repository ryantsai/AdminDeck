# Localization Backlog

This file tracks English source strings that still need translation. Product implementation is English first: add or update `src/i18n/locales/en.json` during feature work, then document any untranslated keys here with enough context for later localization.

When a key is translated into every supported locale, remove its entry from this file.

## Pending Strings

### settings.schemeGreenKuaiKuai

- English value: "Green Kuai Kuai"
- Namespace: `settings`
- File/component: `src/settings/AppearanceSettings.tsx`
- UI role: color scheme select option
- Surrounding user flow: Settings -> Appearance -> Color Scheme lets the user choose this visual theme for the app shell and workspace chrome.
- Tone: short theme name.
- Placeholder details: none.
- Domain notes: "Kuai Kuai" is the branded snack/color-theme reference; keep the doubled words recognizable if transliterating.

### settings.schemeBlueSee

- English value: "Blue See"
- Namespace: `settings`
- File/component: `src/settings/AppearanceSettings.tsx`
- UI role: color scheme select option
- Surrounding user flow: Settings -> Appearance -> Color Scheme lets the user choose this visual theme for the app shell and workspace chrome.
- Tone: short theme name with a playful pun.
- Placeholder details: none.
- Domain notes: This is a theme name, not an instruction to look at something blue.

### settings.schemeConfetti

- English value: "Confetti"
- Namespace: `settings`
- File/component: `src/settings/AppearanceSettings.tsx`
- UI role: color scheme select option
- Surrounding user flow: Settings -> Appearance -> Color Scheme lets the user choose this visual theme for the app shell and workspace chrome.
- Tone: short theme name.
- Placeholder details: none.
- Domain notes: Refers to a colorful celebratory visual palette.

### settings.schemeWood

- English value: "Wood"
- Namespace: `settings`
- File/component: `src/settings/AppearanceSettings.tsx`
- UI role: color scheme select option
- Surrounding user flow: Settings -> Appearance -> Color Scheme lets the user choose this visual theme for the app shell and workspace chrome.
- Tone: short theme name.
- Placeholder details: none.
- Domain notes: Refers to a wood-toned visual palette, not a material setting.

### wiki.backlinkCount

- English value: "{{count}} backlinks"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx` / inspector metadata
- UI role: count label
- Surrounding user flow: Shown in the wiki inspector or graph context when summarizing how many other Wiki Pages link to the selected page.
- Tone: compact metadata label.
- Placeholder details: `{{count}}` is the number of backlinking Wiki Pages.
- Domain notes: Backlinks are derived wiki page references from `[[Page Name]]` links; they are not browser links or Connection relationships.

### wiki.bodyPlaceholder

- English value: "Write in Markdown. Use [[Page Name]] to link pages, [[[Connection Name]]] to link Connections, and #tags to organize notes."
- Namespace: `wiki`
- File/component: `src/wiki/WikiEditor.tsx` / markdown editor
- UI role: editor placeholder/help text
- Surrounding user flow: Shown in the Wiki editor when the active page body is empty.
- Tone: concise instructional text.
- Placeholder details: `[[Page Name]]`, `[[[Connection Name]]]`, and `#tags` are literal syntax examples and should remain recognizable.
- Domain notes: Connection is the durable AdminDeck resource; `#tags` are wiki note tags, not Connection tags.

### wiki.noAttachments

- English value: "No attachments yet."
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx` / inspector
- UI role: empty-state text
- Surrounding user flow: Shown in the Attachments section when the current Wiki Page has no attached files.
- Tone: brief and neutral.
- Placeholder details: none.
- Domain notes: Attachments belong to Wiki Pages, not live Sessions or Connections.

### wiki.collapseExplorer

- English value: "Collapse file explorer"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx`
- UI role: button aria-label/tooltip
- Surrounding user flow: The user collapses the left Wiki page tree/explorer to give the editor more room.
- Tone: direct action label.
- Placeholder details: none.
- Domain notes: Explorer refers to the Wiki page tree, not the Windows file explorer.

### wiki.expandExplorer

- English value: "Expand file explorer"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx`
- UI role: button aria-label/tooltip
- Surrounding user flow: The user expands the left Wiki page tree/explorer after it has been collapsed.
- Tone: direct action label.
- Placeholder details: none.
- Domain notes: Explorer refers to the Wiki page tree, not the Windows file explorer.

### wiki.collapseInspector

- English value: "Collapse note inspector"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx`
- UI role: button aria-label/tooltip
- Surrounding user flow: The user hides the right Wiki inspector panel that shows metadata such as backlinks, tags, graph, and attachments.
- Tone: direct action label.
- Placeholder details: none.
- Domain notes: Note inspector is a Wiki Page metadata panel.

### wiki.expandInspector

- English value: "Expand note inspector"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx`
- UI role: button aria-label/tooltip
- Surrounding user flow: The user restores the right Wiki inspector panel after it has been collapsed.
- Tone: direct action label.
- Placeholder details: none.
- Domain notes: Note inspector is a Wiki Page metadata panel.

### wiki.splitMode

- English value: "Split"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx` / editor mode control
- UI role: segmented-control option
- Surrounding user flow: The user switches the Wiki editor to show Markdown editing and rendered preview side by side.
- Tone: compact mode label.
- Placeholder details: none.
- Domain notes: Split is a view mode inside one Wiki Page, not a workspace Pane split.

### wiki.viewModeLabel

- English value: "Editor view mode"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx` / editor mode control
- UI role: aria-label
- Surrounding user flow: Labels the control that changes the Wiki editor between edit, split, and view modes.
- Tone: accessibility label.
- Placeholder details: none.
- Domain notes: View mode means Wiki editor presentation, not the app workspace view.

### wiki.inspector

- English value: "Inspector"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx`
- UI role: panel heading/tab label
- Surrounding user flow: Labels the right-side Wiki metadata panel that shows page details.
- Tone: compact panel label.
- Placeholder details: none.
- Domain notes: Inspector is page metadata, not a debugger.

### wiki.graph

- English value: "Graph"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx`
- UI role: inspector section heading/tab label
- Surrounding user flow: Labels the Wiki relationship graph area for links between pages.
- Tone: compact panel label.
- Placeholder details: none.
- Domain notes: Graph shows Wiki Page link relationships.

### wiki.graphEmpty

- English value: "Links you create will appear here."
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx`
- UI role: empty-state text
- Surrounding user flow: Shown in the graph section before the current Wiki Page has links that can be visualized.
- Tone: friendly neutral guidance.
- Placeholder details: none.
- Domain notes: Links are Wiki Markdown links, including page links and related Wiki graph references.

### wiki.wordCount

- English value: "{{count}} words"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx` / inspector metadata
- UI role: count label
- Surrounding user flow: Shows the word count for the active Wiki Page body.
- Tone: compact metadata label.
- Placeholder details: `{{count}}` is the number of words in the current page.
- Domain notes: Count is computed from Wiki Page Markdown content.

### wiki.characterCount

- English value: "{{count}} characters"
- Namespace: `wiki`
- File/component: `src/wiki/WikiWorkspace.tsx` / inspector metadata
- UI role: count label
- Surrounding user flow: Shows the character count for the active Wiki Page body.
- Tone: compact metadata label.
- Placeholder details: `{{count}}` is the number of characters in the current page.
- Domain notes: Count is computed from Wiki Page Markdown content.
