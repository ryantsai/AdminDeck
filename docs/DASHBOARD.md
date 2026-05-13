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

**Dashboard View** — a tab in the Dashboard topbar. A user may have many views; the first one is named "Default" and is created on first run. Each view carries its own `grid_density` (`compact` / `default` / `roomy`), edited from the topbar's edit-mode controls.

**Dashboard Widget Instance** — one placed widget on a view. Carries display state (preset, accent, icon, custom title), layout state (`x`, `y`, `w`, `h` on the 12-column grid), a `kind` of `builtIn` / `content` / `script`, and a `source_id` that resolves either to a built-in registry entry or a `DashboardCustomWidget` row.

**Dashboard Custom Widget** — a durable definition for `content` and `script` widgets authored by the AI Assistant. Stored once; multiple instances can reference the same definition. Deleting a custom widget cascades to its instances (enforced in Rust because SQLite cannot express conditional foreign keys).

**Widget Kind** — three values, layered by capability:

| Kind | Body source | Execution model |
|---|---|---|
| `builtIn` | TypeScript component in `src/dashboard/widgets/` registered in `builtInRegistry.ts` | Normal React render. App Launcher is the only current built-in. |
| `content` | Validated JSON in `dashboard_custom_widgets.body_json` | Declarative renderer in `ContentWidgetRenderer.tsx` — switches over `shape: 'markdown' \| 'kvList' \| 'checklist' \| 'stat'`. No code execution. |
| `script` | JavaScript source string in `dashboard_custom_widgets.body_json` | Hosted inside an isolated `iframe srcdoc` via `ScriptWidgetHost.tsx`. Has `document`, `fetch`, `setInterval`, and a minimal `KK` postMessage bridge. Permissions (`network`, `pollSeconds`) declared per widget. Fault-isolation boundary — a bad script breaks one widget, not the dashboard. |

**Visual Preset** — one of six framing styles applied per widget instance: `panel`, `ambient`, `tile`, `hero`, `mono`, `action`. Implemented in `presetRegistry.tsx` as thin CSS-driven chrome wrappers. Each preset reads `--w-accent` and `--w-accent-soft` for the widget's accent color; presets do not encode their own palette. Ambient supports an optional frosted-glass background toggle; Action supports a layout direction toggle (vertical/horizontal).

**Accent** — a palette name (not a hex), persisted on each instance. Resolved to color values from a shared palette table at render time so future palette tweaks affect all dashboards uniformly.

**Icon** — a lucide icon name from a curated whitelist of ~50 entries in `palette.ts`. The whitelist bounds the visual language and keeps the bundle predictable.

## AI Visual Selection Rules

The AI Assistant must choose `preset`, `accent_name`, `icon_name`, and grid size as part of widget design, not as arbitrary required fields. Generated widgets should feel like built-in KKTerm surfaces: quiet, dense, desktop-oriented, and consistent with the app's typography and control spacing.

Preset guidance:

- `panel` — default for ordinary tools, forms, checklists, and mixed content.
- `tile` — compact status, short summaries, and small metrics.
- `mono` — terminal, code, logs, system information, or diagnostic readouts.
- `action` — launchers, one-command actions, and command-like workflows.
- `ambient` — soft informational summaries where low visual weight matters.
- `hero` — rare high-priority summary widgets; avoid for normal utilities.

Accent guidance:

- `blue`, `teal`, `slate`, `emerald`, and `sky` are the normal utility palette.
- `amber` is for warnings, pending state, and attention-needed widgets.
- `red` and `rose` are reserved for destructive, failed, or error-oriented widgets.
- `purple`, `pink`, and `orange` should be used sparingly when the user asks for expressive styling or the widget domain clearly fits.

Script widget UI should use the provided root and compact app-style controls. Do not generate a full HTML document, global reset CSS, external fonts, large decorative headers, marketing copy, gradients, or random color systems. Prefer short labels, stable sizing, aligned inputs/buttons, and the same system font feel as the host app.

If a script widget displays remote images, the assistant must set `permissions.network: true`; otherwise KKTerm's CSP blocks those image requests. Plain `<img src="https://...">` loads do not normally require CORS unless widget code tries to read the image data through canvas/fetch or the remote site blocks hotlinking. Fetching images with `fetch()` is subject to normal browser CORS and may fail even when CSP allows network access.

## Persistence

SQLite holds three Dashboard tables, defined in `src-tauri/src/storage.rs` under `CURRENT_SCHEMA`. The schema version is bumped when these tables change; no in-place migrations are run because there are no v1 users.

| Table | Purpose |
|---|---|
| `dashboard_views` | One row per view. Holds `title`, `sort_order`, and `grid_density`. |
| `dashboard_widget_instances` | One row per placed widget. Holds `kind`, `source_id`, presentation fields (`preset`, `accent_name`, `icon_name`, `custom_title`), and layout (`grid_x`, `grid_y`, `grid_w`, `grid_h`). |
| `dashboard_custom_widgets` | One row per AI-authored `content` or `script` widget definition. Holds `body_json`, validated against the kind. |

Indexes: `(view_id, sort_order)` on instances for fast per-view loads.

Cascade rules:

- View delete → instance delete (FK CASCADE).
- Custom widget delete → must remove referencing instances first, enforced in Rust. The remove command takes a `forceDeleteInstances` flag; without it, returns a structured error listing affected instances so the user (or AI) can confirm.

## Tauri Command Surface

Each command is a thin handler over the storage layer with up-front validation:

| Command | Notes |
|---|---|
| `dashboard_load_state` | One batched read on mount; returns `{ views, instances, customWidgets }`. |
| `dashboard_create_view` | Returns the new view. |
| `dashboard_update_view` | Patch over `title`, `gridDensity`, `sortOrder`. |
| `dashboard_remove_view` | Cascade to instances. |
| `dashboard_reorder_views` | Single `Vec<String>` of ids. |
| `dashboard_add_instance` | Validates preset/accent/icon/grid bounds. |
| `dashboard_update_instance` | Patch over presentation + layout fields. |
| `dashboard_remove_instance` | Hard delete. |
| `dashboard_apply_layout` | Batched layout commit used by the debounced drag/resize pipeline. |
| `dashboard_create_widget` | AI-facing atomic helper: validates a structured `body`, creates the custom widget, and places an instance on the supplied selected view. Use this when the user expects a visible widget. |
| `dashboard_create_custom_widget` | Definition-only command; validates `bodyJson` per kind but does not place an instance. |
| `dashboard_update_custom_widget` | Validates patched `bodyJson` per kind. |
| `dashboard_remove_custom_widget` | Requires `forceDeleteInstances` if instances reference the widget. |

Rust validation invariants:

- `preset` is one of the six known names.
- `accent_name` is in the palette whitelist.
- `icon_name` is in the lucide icon whitelist.
- Grid bounds: `w ≥ 1`, `h ≥ 1`, `x ≥ 0`, `y ≥ 0`, `x + w ≤ 12`.
- Content shape byte caps and shape-specific schema: non-empty markdown source, non-empty key/value rows with labels, non-empty checklist items with labels, or a non-empty stat value.
- Script source is required and ≤ 64 KB; `pollSeconds ≥ 1`; only declared `permissions` values are accepted.
- Frontend renderers use the matching TypeScript validator in `src/dashboard/schema.ts` before rendering content or script widgets, so malformed stored JSON falls back to the existing invalid-body state instead of partially rendering.

Validation failures return structured error text to the AI Assistant so it can self-correct. The Assistant page context tells the model to call `dashboard_create_widget` with the active view id for creation requests; after any dashboard mutating tool completes, the frontend reloads Dashboard state and the newly mounted widget frame runs the canvas fade-in animation.

Dashboard mutating tools run from the Rust Assistant tool loop, outside the frontend Dashboard store. To keep the live Dashboard view in sync, every successful mutating dashboard tool emits a `dashboard-changed` event. `src/dashboard/state/invalidation.ts` listens once at the app shell and reloads `useDashboardStore`. The streaming `toolCallEnd` refresh remains a useful fallback, but the backend event is the authoritative invalidation path for out-of-band mutations.

The `dashboard_create_widget` assistant tool schema is strict-compatible where possible. It uses a closed root object, bounded enums, required fields, and closed nested object shapes so capable providers produce structured widget arguments instead of free-form prose or partial JSON. Rust validation remains the final authority before anything is persisted.

## Frontend Module Map (Dashboard)

```
src/dashboard/
  DashboardPage.tsx              ── shell, topbar, view pills, edit-mode toggle
  motion.tsx                     ── existing centralized motion wrappers
  schema.ts                     ── TypeScript validator for content/script custom widget bodies
  state/
    dashboardStore.ts            ── Zustand store: views, instances, customWidgets, activeViewId, editMode
    persistence.ts               ── typed Tauri command wrappers
  registry/
    builtInRegistry.ts           ── one row per built-in widget; the only place to add new built-ins
    presetRegistry.tsx            ── six preset chrome components
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

The customize popover is anchored to a widget's settings (⚙) button and contains four shared sections plus a collapsible Advanced section:

1. **Preset** — nine chips, click to apply.
2. **Accent** — palette swatches.
3. **Icon** — scrollable grid of the curated lucide set.
4. **Title** — text input; empty clears the override.
5. **Advanced** — kind-specific:
   - `script`: network permission, poll seconds, view source (read-only), reload.
   - `content`: view body JSON (read-only).
   - `builtIn`: nothing.

The four shared sections render identically regardless of widget kind.

The catalog overlay is a separate modal with search + two source-group tabs: Built-in and Custom. Widget definitions still carry a `category` field for future category UI, but current browsing is grouped only by shipped built-ins versus AI-authored custom widgets. There is no user-facing "+ Create custom widget" entry in v1 — custom widget authorship is AI-only.

## Script Widget Host

`ScriptWidgetHost.tsx` renders an `<iframe srcdoc="...">` per script instance, with:

- A `<style>` block carrying compact KKTerm-like text, form-control, button, stack, row, and result defaults so simple generated DOM starts from the app's desktop UI grammar.
- An optional `htmlShim` body markup (default: a single `<div id="root">`).
- A small host `<script>` that loads the stored source as data. The generated source is never pasted directly into the host script text, because generated snippets commonly contain HTML/script literals such as `</script>` that would prematurely close the host script and render broken JavaScript as widget body text.

The iframe is a **fault-isolation** boundary, not a security boundary. KKTerm is MIT and single-user; the iframe exists so a typo in one script widget cannot crash the dashboard, and so future Tauri-command exposure (a postMessage bridge) is a deliberate per-handler decision rather than an accidental global.

Declared permissions:

- `permissions.network: false` → CSP blocks `connect-src`; `fetch`, XHR, and WebSocket all fail.
- `permissions.network: false` → external images are blocked; only `data:` and `blob:` images may load.
- `permissions.network: true` → `connect-src *` is permitted and `http:` / `https:` images may load.
- `permissions.pollSeconds` → informational; the script self-schedules. The host may enforce a minimum floor in a follow-up.

External website links must leave the widget iframe. The host script intercepts absolute `http:` / `https:` anchor clicks and sends an `openExternalUrl` bridge message to the parent, where `ScriptWidgetHost.tsx` validates the URL and calls Tauri's opener plugin. Script widgets may also call `KK.openExternal(url)` directly. This avoids navigating third-party sites inside a sandboxed `srcdoc` iframe with an opaque origin, which can produce site errors such as unknown/null origin headers.

The bridge exposes `KK.openExternal(url)`, `KK.requestPermission(name)`, and `KK.postMessage(payload)` at the iframe globals. Future Tauri command access is added by extending this bridge with explicit handlers — not by widening the iframe surface.

### Finding: Broken Script HTML

The original script host pasted AI-generated `source` directly inside the host `<script>` block. That made generated snippets fragile: a common string such as `` `<script>...</script>` `` or a full HTML document could close the host script early, leaving the rest of the JavaScript visible as broken widget body text. The fix is to encode source as a JavaScript string literal, escape `<`, and load it through a blob-backed script element. Runtime and unhandled promise errors render into a small `<pre>` inside the iframe instead of replacing the Dashboard surface with raw host code.

## AI Widget Reliability Direction

Arbitrary AI-authored HTML is not a reliable default for dashboard creation. The reliable path is schema-first:

- The assistant should choose `content` widgets whenever the request fits the existing declarative shapes (`markdown`, `kvList`, `checklist`, `stat`).
- Interactive widgets should move toward predefined building blocks such as form fields, buttons, expressions, fetch blocks, and layout containers rendered by KKTerm-owned React components.
- The assistant should produce only schema for those blocks. KKTerm validates and renders the schema; the model does not author random HTML.
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

## Settings → Dashboard

A `dashboard-settings` section under Settings holds cross-widget app preferences:

- Confirm before removing a widget (default on; persisted under `dashboard.confirmRemove`).
- Default landing view (default `lastActive`; persisted under `dashboard.defaultLandingView`).

Grid density is **not** in Settings — it is a per-view setting edited from the edit-mode topbar.

Destructive "Reset Dashboard" lives in General → Settings data (per AGENTS.md: destructive Settings-wide actions belong there). It wipes all views/instances/custom widgets and reseeds the Default view with one App Launcher widget.

## i18n

All new strings route through `t()` in the `dashboard.*` namespace. English (`src/i18n/locales/en.json`) is the source of truth and the only locale updated alongside Dashboard changes; other locales are tracked per key under `docs/localization_todo/<namespace>.<keyPath>.md` per the i18n rules in AGENTS.md. Built-in widget titles use `titleKey`; AI-authored custom widget titles are not translated and are persisted in the language the AI used.

## Relationships to Other Modules

- **App Launcher** (`src/app-launcher/`) — rendered as a `builtIn` widget. Its data model and management UI stay inside `src/app-launcher/`; the Dashboard widget is a thin host.
- **AI Assistant** (`src/ai/`) — consumes the Dashboard page-context payload and issues Tauri commands via registered tools.
- **Settings** (`src/settings/`) — adds a Dashboard section; "Reset Dashboard" lives in General → Settings data.
- **Activity Rail** (`src/app/ActivityRail.tsx`) — Dashboard is a peer top-level entry alongside Workspace and File Explorer. App Launcher is intentionally not a rail entry.
- **Status Bar** (`src/workspace/StatusBar.tsx`) — receives transient dashboard status messages via `showWorkspaceStatus` for layout-save failures and similar feedback.
