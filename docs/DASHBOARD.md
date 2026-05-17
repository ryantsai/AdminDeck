# Dashboard Module Architecture

The Dashboard is a built-in activity-rail module that presents a dynamic widget grid. Users select from prebuilt widgets, customize them visually, and arrange them on a 12-column drag-and-drop canvas. The AI Assistant can read the current dashboard and create, customize, or remove widgets through atomic Tauri commands.

This document describes the durable architecture. The design decision record for the redesign that introduced this architecture is at `docs/superpowers/specs/2026-05-11-dashboard-redesign-design.md`. When this doc conflicts with `docs/ARCHITECTURE.md`, this doc wins for Dashboard-internal concerns.

## Module Boundaries

The Dashboard module owns:

- The widget grid, drag/resize, and edit mode.
- The widget registry for built-in widget types.
- The persistence of views, widget instances, and AI-authored custom widget definitions.
- The widget customization surface (preset, accent, icon, title, kind-specific Advanced section).
- The Tauri commands the AI Assistant uses to manipulate the dashboard.
- The page-context payload supplied to the shared AI Assistant panel.

It does not own:

- App-wide color schemes (handled by `src/App.css` + `AppearanceSettings`).
- Settings export/import shape (handled by `src-tauri/src/storage.rs` general settings flow).
- The App Launcher's entry management (kept inside `src/app-launcher/`; Dashboard renders App Launcher as a widget but does not own its data model).

## Domain Concepts

**Dashboard View** — a tab in the Dashboard topbar. A user may have many views; the first one is named "Default" and is created on first run. Each view carries its own `grid_density` (`compact` / `default` / `roomy`) and optional `tab_color` gradient preset id, edited from the topbar's edit-mode controls.

**Dashboard Widget Instance** — one placed widget on a view. Carries display state (preset, accent, icon, custom title), layout state (`x`, `y`, `w`, `h` on the 12-column grid), per-instance custom settings values, a `kind` of `builtIn` / `content` / `script`, and a `source_id` that resolves either to a built-in registry entry or a `DashboardCustomWidget` row.

**Dashboard Custom Widget** — a durable definition for `content` and `script` widgets authored by the AI Assistant. Stored once; multiple instances can reference the same definition. A custom widget may define a small app-rendered settings schema; each placed instance stores its own values. Secret settings are the exception: the instance stores only a reference and the actual password/API key/token lives in the OS keychain. Deleting a custom widget cascades to its instances (enforced in Rust because SQLite cannot express conditional foreign keys).

**Widget Kind** — three values, layered by capability:

| Kind | Body source | Execution model |
| --- | --- | --- |
| `builtIn` | TypeScript component in `src/dashboard/widgets/` registered in `builtInRegistry.ts` | Normal React render. App Launcher is the only current built-in. |
| `content` | Validated JSON in `dashboard_custom_widgets.body_json` | Declarative renderer in `ContentWidgetRenderer.tsx` — switches over `shape: 'markdown' \| 'kvList' \| 'checklist' \| 'stat'`. Markdown-shaped content sets `data.mode: 'markdown' \| 'html'`; markdown mode parses Markdown and html mode sanitizes and renders an HTML fragment. No code execution. |
| `script` | JavaScript source string in `dashboard_custom_widgets.body_json` | Hosted inside an isolated `iframe srcdoc` via `ScriptWidgetHost.tsx`. Has `document`, `fetch`, `setInterval`, and a minimal `KK` postMessage bridge. Permissions (`network`, `pollSeconds`) declared per widget. Fault-isolation boundary — a bad script breaks one widget, not the dashboard. |

**Visual Preset** — one of three framing styles applied per widget instance: `panel`, `ambient`, `hero`. Implemented in `presetRegistry.tsx` as thin CSS-driven chrome wrappers. Each preset reads `--w-accent` and `--w-accent-soft` for the widget's accent color; presets do not encode their own palette. Ambient supports optional frosted-glass background and hides its title bar by default.

**Accent** — a palette name (not a hex), persisted on each instance. Resolved to color values from a shared palette table at render time so future palette tweaks affect all dashboards uniformly.

**Icon** — a lucide icon name from a curated whitelist of ~50 entries in `palette.ts`. The whitelist bounds the visual language and keeps the bundle predictable.

## AI Visual Selection Rules

The AI Assistant must choose `preset`, `accent_name`, `icon_name`, and grid size as part of widget design, not as arbitrary required fields. Generated widgets should feel like built-in KKTerm surfaces: quiet, dense, desktop-oriented, and consistent with the app's typography and control spacing.

Preset guidance:

- `panel` — default for ordinary tools, forms, checklists, and mixed content.
- `ambient` — soft informational summaries where low visual weight matters.
- `hero` — rare high-priority summary widgets; avoid for normal utilities.

Accent guidance:

- `blue`, `teal`, `slate`, `emerald`, and `sky` are the normal utility palette.
- `amber` is for warnings, pending state, and attention-needed widgets.
- `red` and `rose` are reserved for destructive, failed, or error-oriented widgets.
- `purple`, `pink`, and `orange` should be used sparingly when the user asks for expressive styling or the widget domain clearly fits.

Script widget UI should use the provided root and compact app-style controls. Do not generate a full HTML document, global reset CSS, external fonts, large decorative headers, marketing copy, gradients, or random color systems. Prefer short labels, stable sizing, aligned inputs/buttons, and the same system font feel as the host app.

Generated widgets must be boundary-aware. The assistant should choose `grid_w` and `grid_h` from the expected content, not from a fixed default: simple timers and counters normally start at 4x3; forms, remote image widgets, and multi-row lists usually need 5x4 or larger. A successful generated widget should not show an inner vertical scrollbar for its intended initial state.

Generated widgets must also treat the widget root as the full allocated surface. Script widgets should make their outermost wrapper fill `100%` width and height, normally through `kk-shell`, `kk-stage`, `kk-panel`, or `kk-fill`, then align, center, or scale any naturally smaller object inside that full-size wrapper. Do not duplicate the host widget frame with a smaller centered app card. Script widgets should avoid `max-width`, fixed-height, or shrink-to-content outer wrappers unless the user explicitly asks for an inset miniature object.

Generated widgets must preserve readable contrast. Script widgets should prefer host CSS variables (`--kk-text`, `--kk-muted`, `--kk-surface`, `--kk-accent`) and only override backgrounds when text and control colors remain explicit and legible.

If a script widget displays remote images, the assistant must set `permissions.network: true`; otherwise KKTerm's CSP blocks those image requests. Plain `<img src="https://...">` loads do not normally require CORS unless widget code tries to read the image data through canvas/fetch or the remote site blocks hotlinking. Fetching images with `fetch()` is subject to normal browser CORS and may fail even when CSP allows network access.

## Persistence

SQLite holds three Dashboard tables, defined in `src-tauri/src/storage.rs` under `CURRENT_SCHEMA`. Dashboard schema additions that are safe defaults use `ensure_column` during startup so existing local databases keep their saved views/widgets.

| Table | Purpose |
| --- | --- |
| `dashboard_views` | One row per view. Holds `title`, `sort_order`, `grid_density`, and optional `tab_color` gradient preset id. |
| `dashboard_widget_instances` | One row per placed widget. Holds `kind`, `source_id`, presentation fields (`preset`, `accent_name`, `icon_name`, `custom_title`), per-instance `settings_values_json`, and layout (`grid_x`, `grid_y`, `grid_w`, `grid_h`). Secret fields store only `secretRef` metadata here. |
| `dashboard_custom_widgets` | One row per AI-authored `content` or `script` widget definition. Holds `body_json`, validated against the kind, plus optional app-rendered `settings_schema_json`. |

Indexes: `(view_id, sort_order)` on instances for fast per-view loads.

Cascade rules:

- View delete → instance delete (FK CASCADE).
- Custom widget delete → must remove referencing instances first, enforced in Rust. The remove command takes a `forceDeleteInstances` flag; without it, returns a structured error listing affected instances so the user (or AI) can confirm.

## Tauri Command Surface

Each command is a thin handler over the storage layer with up-front validation:

| Command | Notes |
| --- | --- |
| `dashboard_load_state` | One batched read on mount; returns `{ views, instances, customWidgets }`. |
| `dashboard_create_view` | Returns the new view. |
| `dashboard_update_view` | Patch over `title`, `gridDensity`, `sortOrder`, `background`, and `tabColor`. |
| `dashboard_remove_view` | Cascade to instances. |
| `dashboard_reorder_views` | Single `Vec<String>` of ids. |
| `dashboard_add_instance` | Validates preset/accent/icon/grid bounds. |
| `dashboard_update_instance` | Patch over presentation, per-instance settings values, and layout fields. Secret fields are validated against the custom widget schema so plaintext secrets cannot be persisted in SQLite. |
| `dashboard_read_widget_secret` | Script-widget bridge command. Validates that the requested key is a `secret` field on that exact widget instance and that the instance stores the expected `secretRef`, then reads the OS-keychain `widgetSecret` value. |
| `dashboard_remove_instance` | Hard delete. |
| `dashboard_apply_layout` | Batched layout commit used by the debounced drag/resize pipeline. |
| `dashboard_create_widget` | AI-facing atomic helper: validates a structured `body` and optional `settingsSchema`, creates the custom widget, and places an instance on the supplied selected view. Use this when the user expects a visible widget. |
| `dashboard_create_custom_widget` | Definition-only command; validates `bodyJson` per kind and optional `settingsSchemaJson` but does not place an instance. |
| `dashboard_update_custom_widget` | Validates patched `bodyJson` per kind and patched `settingsSchemaJson`. |
| `dashboard_remove_custom_widget` | Requires `forceDeleteInstances` if instances reference the widget. |

Rust validation invariants:

- `preset` is one of the five known names.
- `accent_name` is in the palette whitelist.
- `icon_name` is in the lucide icon whitelist.
- Grid bounds: `w ≥ 1`, `h ≥ 1`, `x ≥ 0`, `y ≥ 0`, `x + w ≤ 12`.
- Content shape byte caps and shape-specific schema: non-empty markdown source with optional persisted `mode` (`markdown` default for legacy widgets, or `html`), non-empty key/value rows with labels, non-empty checklist items with labels, or a non-empty stat value.
- Script source is required and ≤ 64 KB; `pollSeconds ≥ 1`; only declared `permissions` values are accepted.
- Settings schemas are bounded JSON objects with up to 20 fields. Supported field types are `text`, `number`, `boolean`, `select`, and `secret`; keys must be stable ASCII identifiers and select fields must declare bounded label/value options.
- Settings schemas use `secret` fields for passwords, API keys, tokens, and similar values. A secret field never has a default value.
- Settings values are per-instance JSON objects capped at 32 KB. For `secret` fields, Rust rejects plaintext values; the only valid stored shape is a `secretRef` whose owner id matches `dashboard-widget-secret:<instanceId>:<fieldKey>`.
- Frontend renderers use the matching TypeScript validator in `src/dashboard/schema.ts` before rendering content or script widgets, so malformed stored JSON falls back to the existing invalid-body state instead of partially rendering.

Validation failures return structured error text to the AI Assistant so it can self-correct. The Assistant page context tells the model to call `dashboard_create_widget` with the active view id for creation requests; after any dashboard mutating tool completes, the frontend reloads Dashboard state and the newly mounted widget frame runs the canvas fade-in animation.

Dashboard mutating tools run from the Rust Assistant tool loop, outside the frontend Dashboard store. To keep the live Dashboard view in sync, every successful mutating dashboard tool emits a `dashboard-changed` event. `src/dashboard/state/invalidation.ts` listens once at the app shell and reloads `useDashboardStore`. The streaming `toolCallEnd` refresh remains a useful fallback, but the backend event is the authoritative invalidation path for out-of-band mutations.

The `dashboard_create_widget` assistant tool schema is strict-compatible where possible. It uses a closed root object, bounded enums, required fields, and closed nested object shapes so capable providers produce structured widget arguments instead of free-form prose or partial JSON. Rust validation remains the final authority before anything is persisted.

The AI-facing widget contract requires the first created widget to be complete for the user's requested outcome. If a request implies live/realtime data, MCP-backed data, web-fetched data, local file/session data, or another changing input, the assistant should use the needed discovery/read/fetch tool rounds before creation and create a script widget wired to the actual data source with loading, error, empty, and refresh states. Static content widgets are for explicitly static requests or blocked live-data cases; missing credentials should become `settingsSchema` secret/config fields plus a secret-entry request, not a placeholder scaffold.

## Frontend Module Map (Dashboard)

```text
src/dashboard/
  DashboardPage.tsx              ── shell, topbar, view pills, edit-mode toggle
  motion.tsx                     ── existing centralized motion wrappers
  schema.ts                     ── TypeScript validator for custom widget bodies and settings schemas
  state/
    dashboardStore.ts            ── Zustand store: views, instances, customWidgets, activeViewId, editMode
    persistence.ts               ── typed Tauri command wrappers
  registry/
    builtInRegistry.ts           ── one row per built-in widget; the only place to add new built-ins
    presetRegistry.tsx            ── five preset chrome components
    palette.ts                   ── accent palette + ~50-icon whitelist
  view/
    DashboardCanvas.tsx          ── react-grid-layout host
    WidgetFrame.tsx              ── preset chrome + edit-mode controls
    WidgetBody.tsx               ── dispatch by kind (builtIn / content / script)
  widgets/                       ── built-in body components, one file each
    AppLauncherBody.tsx          ── delegates to src/app-launcher
  content/
    ContentWidgetRenderer.tsx
  script/
    ScriptWidgetHost.tsx
    permissions.ts
  edit/
    CatalogOverlay.tsx
    CustomizePopover.tsx
```

Adding a new built-in widget = drop a `Body` file in `widgets/` and add one entry to `builtInRegistry.ts`. There are no switch statements outside the registries. The registry shape (`BuiltInWidgetEntry`) carries default preset/accent/icon/size + the body component.

State management is Zustand to match the rest of the app (`useWorkspaceStore`). The store exposes a compact read-projection for the AI Assistant's page-context payload.

## Grid and Edit Mode

The canvas uses `react-grid-layout` with `WidthProvider`:

- 12 columns, `rowHeight` and `margin` derived from the active view's `grid_density`.
- `compactType: 'vertical'` (widgets fall up to fill gaps).
- `preventCollision: false` (RGL's normal push behavior).
- Drag handle restricted to a `.drag-handle` class on the preset header, so interactive body content remains clickable in edit mode.
- No responsive breakpoint switching — KKTerm is desktop-only.

Edit mode is a single `editMode` boolean on the store. It is toggled by the topbar's "Edit layout" button. In edit mode, the topbar shows a `Compact / Default / Roomy` segmented control bound to the active view's `grid_density`. `Esc` exits edit mode.

Drag and resize commit via a debounced pipeline: local state updates immediately for responsiveness; a single batched `dashboard_apply_layout` Tauri write fires ~300 ms later. Write failures roll back local state and surface in the workspace status bar with a manual retry button.

## Customization Surface

The customize popover is anchored to a widget's settings (⚙) button and contains shared display sections plus a collapsible Advanced section:

1. **Preset** — nine chips, click to apply.
2. **Accent** — palette swatches.
3. **Icon** — scrollable grid of the curated lucide set.
4. **Title** — text input; empty clears the override.
5. **Widget settings** — for custom widgets with `settings_schema_json`, KKTerm renders text, number, boolean, select, and secret fields. Non-secret values are stored on the instance. Secret values are written to the OS keychain under the `widgetSecret` kind and the instance stores only a reference.
6. **Advanced** — kind-specific:
   - `script`: network permission, poll seconds, view source (read-only), reload.
   - `content`: view body JSON (read-only).
   - `builtIn`: nothing.

The shared display sections render identically regardless of widget kind.

The catalog overlay is a separate modal with search + two source-group tabs: Built-in and Custom. Widget definitions still carry a `category` field for future category UI, but current browsing is grouped only by shipped built-ins versus AI-authored custom widgets. There is no user-facing "+ Create custom widget" entry in v1 — custom widget authorship is AI-only.

## Script Widget Host

`ScriptWidgetHost.tsx` renders an `<iframe srcdoc="...">` per script instance, with:

- A `<style>` block carrying compact KKTerm-like text, form-control, button, stack, row, and result defaults so simple generated DOM starts from the app's desktop UI grammar.
- An optional `htmlShim` body markup (default: a single `<div id="root">`).
- A small host `<script>` that loads the stored source as data. The generated source is never pasted directly into the host script text, because generated snippets commonly contain HTML/script literals such as `</script>` that would prematurely close the host script and render broken JavaScript as widget body text.
- A per-instance settings snapshot loaded through `KK.getSettings()`. Scripts can persist small non-secret user options with `KK.setSetting(key, value)` or replace the object with `KK.setSettings(nextSettings)`.
- A viewport helper for canvas/WebGL widgets: `KK.getViewport()` returns `{ width, height, dpr }` measured from the script root, and `KK.onViewportResize(callback)` calls back with the same shape when the widget body changes size.
- A small app-owned CSS primitive set for generated UI: `kk-shell`, `kk-toolbar`, `kk-cluster`, `kk-title`, `kk-subtitle`, `kk-muted`, `kk-panel`, `kk-card`, `kk-grid`, `kk-stat`, `kk-stat-value`, `kk-stat-label`, `kk-pill`, `kk-badge`, `kk-stage`, and `kk-fill`. These are the default building blocks for polished script widgets; they avoid pulling a third-party UI framework into every iframe.
- A secret bridge exposed as `await KK.getSecret(fieldKey)`. The parent frame validates the field against the custom widget schema and instance `secretRef` before asking Rust to read the OS keychain.

The iframe is a **fault-isolation** boundary, not a security boundary. KKTerm is MIT and single-user; the iframe exists so a typo in one script widget cannot crash the dashboard, and so future Tauri-command exposure (a postMessage bridge) is a deliberate per-handler decision rather than an accidental global.

Declared permissions:

- `permissions.network: false` → CSP blocks `connect-src`; `fetch`, XHR, and WebSocket all fail.
- `permissions.network: false` → external images are blocked; only `data:` and `blob:` images may load.
- `permissions.network: true` → `connect-src *` is permitted and `http:` / `https:` images may load.
- `permissions.network: true` does **not** permit external scripts. Script widgets may run their own source plus KKTerm's curated bundled libraries only; runtime CDN script injection stays blocked by CSP so generated widgets cannot bypass the local library catalog.
- `permissions.pollSeconds` → informational; the script self-schedules. The host may enforce a minimum floor in a follow-up.

External website links must leave the widget iframe. The host script intercepts absolute `http:` / `https:` anchor clicks and sends an `openExternalUrl` bridge message to the parent, where `ScriptWidgetHost.tsx` validates the URL and calls Tauri's opener plugin. Script widgets may also call `KK.openExternal(url)` directly. This avoids navigating third-party sites inside a sandboxed `srcdoc` iframe with an opaque origin, which can produce site errors such as unknown/null origin headers.

The bridge exposes `KK.openExternal(url)`, `KK.getSettings()`, `KK.setSetting(key, value)`, `KK.setSettings(nextSettings)`, `KK.getViewport()`, `KK.onViewportResize(callback)`, `KK.getSecret(key)`, `KK.requestPermission(name)`, and `KK.postMessage(payload)` at the iframe globals. Future Tauri command access is added by extending this bridge with explicit handlers — not by widening the iframe surface.

### Script Widget Libraries

Curated local libraries are registered in `src/dashboard/script/widgetLibraries.ts` and requested by AI-authored scripts through `body.libraries`. The script host loads every requested library before running widget source, so generated code must declare libraries it uses instead of assuming globals already exist.

When adding or renaming a script-widget library:

- Add the npm package dependency if the library is not already present.
- Add the registry entry in `src/dashboard/script/widgetLibraries.ts` with a stable key, global name, description, and loader.
- Add the same key to `dashboard_widget_library_keys()` in `src-tauri/src/ai.rs` so `dashboard_create_widget` and `dashboard_update_custom_widget` expose the key to the AI Assistant tool schema.
- If old generated widgets may already reference the global without `body.libraries`, add a narrow legacy inference pattern in `resolveWidgetLibraryKeys`.
- Run `node --test tests/dashboard-script-srcdoc.test.mjs`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml dashboard_widget_tool_schema_exposes_script_libraries`. `npm run build` is the check that proves the registered loader and package dependency can actually bundle.

### Finding: Broken Script HTML

The original script host pasted AI-generated `source` directly inside the host `<script>` block. That made generated snippets fragile: a common string such as `` `<script>...</script>` `` or a full HTML document could close the host script early, leaving the rest of the JavaScript visible as broken widget body text. The fix is to encode source as a JavaScript string literal, escape `<`, and load it through a blob-backed script element. Runtime and unhandled promise errors render into a small `<pre>` inside the iframe instead of replacing the Dashboard surface with raw host code.

## AI Widget Reliability Direction

Arbitrary AI-authored HTML is not a reliable default for dashboard creation. The reliable path is schema-first:

- The assistant should choose `content` widgets whenever the request fits the existing declarative shapes (`markdown`, `kvList`, `checklist`, `stat`). For `shape: "markdown"`, assistant-authored widget bodies must specify `data.mode` as either `markdown` or `html`; use `markdown` for Markdown text and `html` for an HTML fragment that KKTerm will sanitize before rendering.
- Interactive widgets should move toward predefined building blocks such as form fields, buttons, expressions, fetch blocks, and layout containers rendered by KKTerm-owned React components.
- The assistant should produce only schema for those blocks. KKTerm validates and renders the schema; the model does not author random HTML.
- Per-instance custom options should use `settingsSchema.fields` rather than model-authored settings UI. KKTerm owns the settings form and stores values in `dashboard_widget_instances.settings_values_json`.
- Sensitive per-instance options must use `settingsSchema.fields[].type = "secret"`. The model must not place passwords, API keys, tokens, or similar values in `defaultValue`, script source, content body, or `settings_values_json`.
- `script` widgets remain an advanced escape hatch for genuinely custom live behavior, isolated in an iframe and validated for storage size/permissions, but they are not the product-default authoring surface for common widgets.
- Assistant-facing widget creation schemas should stay strict-compatible where possible: root object, required fields, `additionalProperties: false`, bounded enums, and Rust validation as the final authority.

## AI Assistant Integration

Each `dashboard_*` Tauri command is registered as an assistant tool with a JSON schema in the assistant tool registry. Approval gating uses the existing assistant approval flow.

When the Dashboard page is active, `onAssistantContextChange` includes a compact snapshot:

```ts
{
  page: "dashboard",
  activeView: { id, title, gridDensity },
  instances: [{ id, kind, sourceId, customTitle, preset, x, y, w, h }],
  customWidgets: [{ id, kind, title }],
}
```

The AI sees the current dashboard without an extra tool call. Validation errors from Rust come back as structured `{ ok: false, reason, details }` shapes so the AI can self-correct on retry.

AI Assistant UX polish around widget authorship (prompt tuning, suggestion affordances, preview-before-commit, conversational diffs) is a follow-up and not part of this architecture.

## Theming

Dashboard chrome reads existing app CSS variables only (`var(--app-bg)`, `var(--surface)`, `var(--text)`, `var(--border)`, etc.) — no hardcoded colors. The topbar's bottom-fade tint comes from a `--scheme-tint-soft` style variable derived from the active scheme; widgets accent independently via inline `--w-accent` / `--w-accent-soft` set on the widget root.

A purple widget stays purple regardless of the active color scheme. A change of color scheme only repaints chrome, not widget bodies.

Secret widget settings are also visible from Settings → Credentials. That unified credentials page lists widget secret references alongside Connection passwords, website credentials, and AI provider keys. Deleting a widget secret there removes the OS-keychain value and clears the widget instance `secretRef`.

### Per-View Backgrounds

Each Dashboard View carries an optional background, stored as a nullable `background_json` column on `dashboard_views` (`NULL` = theme default). Right-clicking empty canvas space opens a native context menu with "Change Background…", which opens the app-owned `BackgroundPopover`. Four modes:

- **Theme Default** — `NULL`; the canvas uses the active color scheme's `--app-bg`.
- **Color & Gradient** — `{ kind: "preset", preset }` referencing one of the 16 fixed entries in `src/dashboard/registry/backgroundPresets.ts` (whitelisted in Rust as `BACKGROUND_PRESET_IDS`).
- **Image** — `{ kind: "image", file, fit, dim }`. The image file is copied into a `backgrounds/` folder next to the executable (mirroring custom fonts) and referenced by filename. `fit` is one of fill/fit/stretch/tile/center; `dim` is a signed −100..100 value (negative darkens, positive lightens). Unreferenced image files are swept after view-mutating commands by `prune_unreferenced_backgrounds`.
- **Dynamic** — `{ kind: "dynamic", dynamic }` referencing one of the local HTML5 animation backgrounds in `src/dashboard/registry/dynamicBackgrounds.tsx` (whitelisted in Rust as `DYNAMIC_BACKGROUND_IDS`). Dynamic backgrounds are app-owned React/canvas/CSS animations, not script widgets and not persisted code.

The background renders on a dedicated layer behind the widget grid and does not affect the topbar or widget chrome. A missing image file, unknown dynamic id, or unparseable `background_json` falls back to theme default rather than erroring.

Background image files are **not** included in the settings export ZIP — an imported database may reference a missing image, which is handled by the theme-default fallback.

## Settings → Dashboard

A `dashboard-settings` section under Settings holds cross-widget app preferences:

- Confirm before removing a widget (default on; persisted under `dashboard.confirmRemove`).
- Default landing view (default `lastActive`; persisted under `dashboard.defaultLandingView`).

Grid density and View tab gradient are **not** in Settings — they are per-view settings edited from the edit-mode topbar.

Destructive "Reset Dashboard" lives in General → Settings data (per AGENTS.md: destructive Settings-wide actions belong there). It wipes all views/instances/custom widgets and reseeds the Default view with one App Launcher widget.

## i18n

All new strings route through `t()` in the `dashboard.*` namespace. English (`src/i18n/locales/en.json`) is the source of truth and the only locale updated alongside Dashboard changes; other locales are tracked per key under `docs/localization_todo/<namespace>.<keyPath>.md` per the i18n rules in AGENTS.md. Built-in widget titles use `titleKey`; AI-authored custom widget titles are not translated and are persisted in the language the AI used.

## Relationships to Other Modules

- **App Launcher** (`src/app-launcher/`) — rendered as a `builtIn` widget. Its data model and management UI stay inside `src/app-launcher/`; the Dashboard widget is a thin host.
- **AI Assistant** (`src/ai/`) — consumes the Dashboard page-context payload and issues Tauri commands via registered tools.
- **Settings** (`src/settings/`) — adds a Dashboard section; "Reset Dashboard" lives in General → Settings data.
- **Activity Rail** (`src/app/ActivityRail.tsx`) — Dashboard is a peer top-level entry alongside Workspace and File Explorer. App Launcher is intentionally not a rail entry.
- **Status Bar** (`src/workspace/StatusBar.tsx`) — receives transient dashboard status messages via `showWorkspaceStatus` for layout-save failures and similar feedback.
