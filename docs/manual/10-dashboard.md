# 10 — Dashboard

## AI grep hints

- Keys: `dashboard.*` (full namespace)
- Topics: Dashboard Views, Widget Instances, presets (panel / ambient / tile / hero / action), accents, icons, backgrounds, density, edit layout, catalog, custom widgets (content + script), AI-authored widgets, agent widget JSON
- Synonyms: "homepage", "tiles", "cards", "widgets", "report", "background image", "wallpaper", "translucent widget", "see-through widget", "canvas opacity"

> **Terms:** see `CONTEXT.md`. **Dashboard View** is a durable SQLite-backed tab; **Widget Instance** is a placed widget on a View with its own preset/accent/title/layout. **Dashboard Custom Widget** is an AI-authored widget definition (kinds `content` or `script`). Architecture details live in `docs/DASHBOARD.md`.

## Module entry

Activity Rail icon → label `dashboard.moduleLabel`. Page header uses `dashboard.title`, optional `dashboard.subtitle`, status `dashboard.statusReady`.

## Views

A View is a Dashboard tab. The first View is named `dashboard.defaultView` and seeded on first run with one App Launcher Widget Instance.

- Switcher label: `dashboard.viewsLabel`.
- Add: `dashboard.addView`. New-View dialog `dashboard.newViewPrompt`, field `dashboard.newViewName`.
- Rename: `dashboard.renameView`.
- Remove: `dashboard.removeView`. Confirmation body `dashboard.deleteViewBody`.
- Tab gradient styling: `dashboard.viewTabGradient`, clear `dashboard.clearViewTabGradient`.

Each View has its own `grid_density` (`dashboard.density.compact`, `dashboard.density.default`, `dashboard.density.roomy`) and its own background.

## Edit layout mode

`dashboard.editLayout` toggles drag/drop + resize on the 12-column grid. Done editing: `dashboard.editDone`. Empty Views show `dashboard.emptyTitle` and `dashboard.emptyHint`.

While editing:

- Drag a Widget Instance to move it.
- Drag the bottom-right corner to resize. Widgets snap to grid cells.
- `dashboard.addWidget` / `dashboard.addWidgetLabel` opens the **Widget Catalog**.

## Widget Catalog

A picker over built-in widgets and AI-authored Custom Widgets.

- Title: `dashboard.catalogTitle`, summary `dashboard.catalog`, `dashboard.widgetCount`.
- Search: `dashboard.catalogSearch`. Empty: `dashboard.catalogNoMatches`.
- Group labels: `dashboard.catalogGroupBuiltIn`, `dashboard.catalogGroupCustom`.
- Category filter: `dashboard.categoriesLabel`, all-category `dashboard.categoryAll`, plus `dashboard.categories.hash`, `dashboard.categories.network`, `dashboard.categories.quick`, `dashboard.categories.report`.
- Already-placed indicator: `dashboard.widgetAlreadySelected`.
- Playground area: `dashboard.playground`, hint `dashboard.playgroundHint`.

## Customize popover (per Widget Instance)

Opened from a Widget Instance's right-click or properties affordance (`dashboard.properties` / `dashboard.customize`). Implemented as an app-owned popover with a dismiss layer.

Sections:

- `dashboard.customizeSectionCommon` — preset, accent, icon, title.
- `dashboard.customizeSectionWidget` — `dashboard.widgetSettings`. Empty: `dashboard.widgetSettingsEmpty`. Invalid: `dashboard.widgetSettingsInvalid`.

Fields:

- **Preset**: `dashboard.presetLabel`. Options: `dashboard.preset.panel`, `dashboard.preset.ambient`, `dashboard.preset.tile`, `dashboard.preset.hero`, `dashboard.preset.action`. Ambient hides the title bar by default; `dashboard.hideTitle` is also offered for other presets. Action preset adds an `dashboard.actionDirection` axis with `dashboard.actionDirectionOptions.vertical` / `dashboard.actionDirectionOptions.horizontal`.
- **Glass background**: `dashboard.glassBackground`.
- **Canvas opacity**: `dashboard.canvasOpacity` — slider (0-100) that fades the Widget Instance body area only, leaving the title bar fully opaque. Default 70% for the built-in App Launcher and Connection widgets, 100% otherwise; visual effect is applied on the panel preset's `.dw-body`.
- **Accent**: `dashboard.accent`, default `dashboard.accentDefault`.
- **Icon**: `dashboard.icon`.
- **Title**: `dashboard.titleLabel`, placeholder `dashboard.titlePlaceholder`. Untitled widgets show `dashboard.untitledWidget`.
- **Advanced**: `dashboard.advanced`.

Presets are CSS wrappers that read the Instance's `--w-accent` / `--w-accent-soft` variables — presets do not encode their own palette.

## View background

`dashboard.changeBackground` opens the background picker. Modes:

- `dashboard.backgroundModeDefault` (`dashboard.backgroundDefaultHint`)
- `dashboard.backgroundModePreset` — colour/gradient presets `dashboard.backgroundPresets.*` (mist, sand, sage, sky, blush, lavender, slate, graphite, plus gradients gDawn / gFog / gMeadow / gDusk / gLinen / gHorizon / gPetal / gTwilight).
- `dashboard.backgroundModeImage` — choose image via `dashboard.backgroundChooseImage`. Remove with `dashboard.backgroundRemoveImage`. File filter `dashboard.backgroundImageFilter`. Hint `dashboard.backgroundImageHint`. Fit options under `dashboard.backgroundFitLabel`: `fill`, `fit`, `stretch`, `tile`, `center`. Dim slider: `dashboard.backgroundDimLabel`.
- `dashboard.backgroundModeMedia` — video / animated source. Filter `dashboard.backgroundMediaFilter`. Hint `dashboard.backgroundMediaHint`. Source attribution `dashboard.backgroundMediaSourcePrefix` + link `dashboard.backgroundMediaSourceLink`.
- `dashboard.backgroundModeDynamic` (`dashboard.backgroundDynamicHint`) — script-rendered animated backgrounds: `aurora`, `raindrops`, `starfield`, `nebula`, `embers`, `lava`, `matrix`, `synthwave`, `confetti` (keys under `dashboard.dynamicBackgrounds.*`).

## Built-in widgets

Each built-in widget lives in `src/dashboard/widgets/`. Common ones:

- **Notes** — sticky-note style. Title `dashboard.notesTitle`, summary `dashboard.notesSummary`, placeholder `dashboard.notesPlaceholder`. Toolbar label `dashboard.notesToolbarLabel`. Background colour `dashboard.notesBackgroundColor` (`yellow`, `pink`, `blue`, `green`, `orange`, `purple`, `white`). Font picker `dashboard.notesFont` (`handwriting`, `marker`, `system`, `serif`, `mono`).
- **URL Viewer** — `dashboard.urlViewerTitle` / `dashboard.urlViewerSummary`. Settings: `dashboard.urlWidgetUrl`, `dashboard.urlWidgetReloadSeconds`. Empty state: `dashboard.urlWidgetEmptyTitle` / `dashboard.urlWidgetEmptyHint`.
- **Connection** — `dashboard.connectionPaneTitle` / `dashboard.connectionPaneSummary`. Picks a single Connection (`dashboard.connectionWidgetSelect`, placeholder `…SelectPlaceholder`). Errors: `…LoadError`, no Connections `…NoConnectionsTitle/Hint`, no match `…NoResults`. Active Pane indicator `…ActivePane`. Open in Workspace: `dashboard.connectionWidgetOpenWorkspace`. Remove `dashboard.connectionWidgetRemove`. The widget looks up the live Connection by id from the raw tree, never from `withLiveConnectionStatuses`, to avoid Session mount/unmount loops.
- **Hash** — `dashboard.hashTitle`, sample `dashboard.hashSample`, input `dashboard.hashInput`. Outputs `dashboard.characters`, `dashboard.bytes`, `dashboard.sha1`, `dashboard.sha256`. Runtime-missing state: `dashboard.hashUnavailable`.
- **Subnet (CIDR) calculator** — `dashboard.subnetTitle`, sample `dashboard.subnetSample`, input `dashboard.subnetInput` (a `cidrInput`-style box `dashboard.cidrInput`). Outputs: `dashboard.networkAddress`, `dashboard.broadcastAddress`, `dashboard.firstUsable`, `dashboard.lastUsable`, `dashboard.subnetMask`, `dashboard.wildcardMask`, `dashboard.totalAddresses`, `dashboard.usableHosts`. Errors: `dashboard.subnetError.invalidFormat`, `…invalidAddress`, `…invalidPrefix`, or generic `dashboard.subnetInvalid`. Compact labels `dashboard.network`, `dashboard.broadcast`, `dashboard.mask`, `dashboard.usable`.
- **Quick tools** — `dashboard.quickToolsTitle`, summary `dashboard.quickToolsSummary`. Sample `dashboard.quickSample`. Input/output: `dashboard.quickInput` / `dashboard.quickOutput`. Tool picker label `dashboard.quickTool`. Options under `dashboard.quickToolOptions.*`: `urlEncode`, `urlDecode`, `base64Encode`, `base64Decode`, `unixToIso`. Errors `dashboard.quickToolErrors.invalidInput`, `…invalidNumber`.
- **Report** — multi-step report widget. Title `dashboard.reportTitle`, summary `dashboard.reportSummary`, body `dashboard.reportBody`. Step labels `dashboard.reportStep1`..`reportStep4`. Tool/IO labels `dashboard.tool`, `dashboard.input`, `dashboard.output`.

Copy any output value with `dashboard.copyValue`.

## Removing widgets

`dashboard.removeWidget` removes a Widget Instance from the current View. Confirmation hint `dashboard.removeConfirmHint`, body `dashboard.deleteWidgetBody`. Status `dashboard.widgetDeleted`. Deleting the underlying Custom Widget definition uses `dashboard.deleteCustomWidget` (title `…Title`, body `…Body`, confirm `…Confirm`).

## Custom Widgets (AI-authored)

Custom Widgets are authored by the AI Assistant (`ai.createWidget`), not by users directly in v1. Two kinds:

- **`content`** — declarative JSON (markdown / kvList / checklist / stat).
- **`script`** — JavaScript hosted inside an isolated `iframe srcdoc` host with declared `dashboard.scriptNetwork` permissions and `dashboard.scriptPollSeconds`. Source viewable via `dashboard.scriptViewSource`. iframe accessible title: `dashboard.scriptWidgetFrameTitle`.

Validation errors surface as:

- `dashboard.scriptInvalidBody`, `dashboard.invalidScriptWidgetBody`, `dashboard.invalidContentWidgetBody`.
- Library load failure: `dashboard.widgetLibraryLoadFailed`.
- Missing references: `dashboard.missingBuiltInWidget`, `dashboard.missingCustomWidget`.
- Resource cap: `dashboard.scriptWidgetCapped`.

Hardening details: `docs/ADR/0006-dashboard-script-widget-hardening.md`. Script widgets are isolated in iframes, capped by the active-script-widget limit, run animation/timer guardrails inside the iframe, and have parent bridge throttles for expensive host requests.

### Agent widget dialog

Used when a tool call creates a widget. Title `dashboard.agentWidgetDialogTitle`, hint `dashboard.agentWidgetDialogHint`. Body field `dashboard.agentWidgetJson` with example `dashboard.agentWidgetExample`. Save button `dashboard.saveWidget` → status `dashboard.agentWidgetSaved`. Built-in id reference `dashboard.agentWidgetBuiltInId`. Validation errors under `dashboard.agentWidgetErrors.*` (`invalidJson`, `invalidTitle`, `invalidCategory`, `invalidSummary`, `invalidBody`).

The "Add agent widget" entry point on a View is `dashboard.addAgentWidget`.

## Widget Secrets

Widget Instances may declare a secret. KKTerm prompts via:

- `dashboard.secretStored` / `dashboard.secretPlaceholder` / `dashboard.secretClear`.

Secret values are stored in the OS keychain under the AI-provider secret owner namespace.

## Assistant context echo

When a tool call describes its output, the Widget Instance can show a small "assistant context" block:

- `dashboard.assistantContextLabel`, `dashboard.assistantContextSource`, `dashboard.assistantContextIntro`, `dashboard.assistantSummary`.
