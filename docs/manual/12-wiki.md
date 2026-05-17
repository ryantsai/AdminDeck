# 12 — Wiki

## AI grep hints

- Keys: `wiki.*` (full namespace), `app.wiki`
- Topics: wiki pages, subpages, search, tags, backlinks, attachments, page-Connection links, export, editor / preview / split, graph
- Synonyms: "notes", "knowledge base", "doc tree", "page links"

## Module entry

Activity Rail label `app.wiki`. Module page title `wiki.title`. Empty workspace shows `wiki.rootEmpty` and `wiki.createFirstPage`.

## Layout

Three columns inside the module page:

1. **Explorer** (left) — page tree. Collapse `wiki.collapseExplorer` / expand `wiki.expandExplorer`. Generic collapse/expand labels `wiki.collapse` / `wiki.expand`.
2. **Editor / Viewer** (centre) — view modes:
   - `wiki.editorMode`, `wiki.splitMode`, `wiki.viewMode` (selector label `wiki.viewModeLabel`).
   - Editor accessible label `wiki.editorAria`. Editor panel label `wiki.editor`. Preview `wiki.preview`.
3. **Inspector** (right) — `wiki.inspector`. Collapse/expand `wiki.collapseInspector` / `wiki.expandInspector`. Tabs include attachments, backlinks, tags, Connections, graph.

Empty centre state: `wiki.noSelection`.

## Pages

Create:

- `wiki.newPage` (root level)
- `wiki.newSubpage` (under the selected page)

Per-page actions:

- Rename: `wiki.rename`
- Delete: `wiki.delete`, dialog `wiki.deletePageTitle`, confirmation body `wiki.deleteConfirm`. Failure `wiki.deleteFailed`.
- Move: `wiki.movePage`.

Unsaved indicator: `wiki.unsaved`. Saved indicator: `wiki.saved`. Save action `wiki.savePage`. Default title `wiki.untitled`. Field placeholders `wiki.pageTitlePlaceholder`, `wiki.bodyPlaceholder`.

Failures: `wiki.createFailed`, `wiki.saveFailed`, `wiki.loadFailed`, `wiki.pageNotFound`.

## Search

Placeholder `wiki.searchPlaceholder`. Results header `wiki.searchResults`. Empty `wiki.searchEmpty`. Failure `wiki.searchFailed`.

## Tags

Inspector tab. Labels `wiki.tags`, empty `wiki.noTags`. Filter the explorer by tag with `wiki.filterByTag`.

## Backlinks

Inspector tab. Header `wiki.backlinks`. Empty `wiki.noBacklinks`. Count `wiki.backlinkCount`.

## Attachments

Inspector tab. Header `wiki.attachments`. Add `wiki.attach`, remove `wiki.attachmentRemove`. Empty `wiki.noAttachments`. Failure `wiki.attachFailed`.

## Connections linked to a page

A page can reference one or more Connections (e.g. host runbooks). Inspector group `wiki.connectionsLabel`. Empty `wiki.connectionsEmpty`. Add `wiki.addConnection`. No Connections in the app yet: `wiki.noConnections`. Connection-side view: `wiki.wikiPagesForConnection`, empty `wiki.noPagesForConnection`. Embed hint inside a page: `wiki.connectionEmbedHint`. Failure `wiki.connectionNotFound`. Open a referenced page from anywhere: `wiki.openPageInWiki`.

## Export

`wiki.export` exports the current page (markdown + attachments). Success `wiki.exportSuccess`. Failure `wiki.exportFailed`.

## Word / character count

Status counts: `wiki.wordCount`, `wiki.characterCount`.

## Graph

Inspector tab `wiki.graph`. Empty `wiki.graphEmpty`.
