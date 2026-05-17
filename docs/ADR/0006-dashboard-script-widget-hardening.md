# ADR 0006: Dashboard Script Widget Hardening

## Status

Accepted

## Context

KKTerm's Dashboard lets the AI Assistant create user-visible script widgets
that run as sandboxed iframes inside WebView2. Each widget hosts arbitrary
JavaScript that the AI authored and that the user has not reviewed.

A real-world incident exposed how brittle this surface is. The AI created four
script widgets on a single Dashboard view in one turn — a Tetris game, a
Fidget Spinner, a population chart, and a Git diagram — while the Matrix
dynamic background was also running. Together that produced five concurrent
`requestAnimationFrame` / animation loops driving the same WebView2 render
thread, and the app froze hard enough that the user had to force-quit.

Post-mortem analysis identified five independent failure modes:

1. The Tetris collision function had no floor boundary check, so pieces fell
   off the bottom forever while the rAF loop kept ticking at 60fps.
2. The widget declared bundled `matter` and `animejs` libraries that the
   source never referenced. Each costs ~80 KB of memory and adds GC pressure.
3. KKTerm had no mechanism to throttle off-screen widgets or cap the number
   of simultaneously active widgets.
4. A panic inside any storage operation poisoned the shared SQLite mutex, and
   the next caller's `.expect("dashboard storage mutex poisoned")` would
   cascade into an app-wide crash.
5. The AI prompt for `dashboard_create_widget` contained no guidance about
   game-boundary checks or `requestAnimationFrame` exit paths.

The freeze was not a single bug. It was the absence of layered defenses.

## Decision

Add five layers of defense, applied at the layer closest to where each class
of mistake originates.

### 1. Validate script source before SQLite write

`dashboard_validation::validate_script_source_inner` runs on every
script-widget write and rejects:

- null bytes,
- raw `while(true)`, `while(1)`, `for(;;)` infinite loops *in code* (not in
  strings or comments),
- unbalanced `()` `{}` `[]` delimiters *outside* string and comment regions.

The check operates on a "code-only" view of the source produced by a single
pass through `strip_strings_and_comments`. The pass:

- Treats single-quoted, double-quoted, and template literal strings as opaque
  (so `'while(true) is forbidden'` does not trigger the infinite-loop check).
- Counts consecutive backslashes inside strings so `'\\'` closes the string
  but `'\\''` does not (regression-tested explicitly).
- Treats line and block comments as opaque.
- Does *not* track regex literals or `${expr}` interpolation inside template
  literals. These are accepted heuristic limitations: regex literals are rare
  in widget scripts, and the cap + visibility throttle bound the blast radius
  of anything that slips through.

### 2. Cross-check declared libraries against the code

For each entry in `body.libraries` that maps to a known global in
`KNOWN_LIBRARY_GLOBALS`, the validator requires the global to appear as a
whole-word token in the code-only view. Substring matching is not enough —
short globals like `L` (Leaflet) would otherwise pass through any identifier
containing the letter `L`. References that exist only in comments or strings
do not count.

This list must stay in lockstep with `src/dashboard/script/widgetLibraries.ts`.
A new bundled library that is not added to `KNOWN_LIBRARY_GLOBALS` silently
skips this check — soft degradation, but reviewers must remember to update
both files in the same change.

### 3. Active-widget cap with eviction notification

`ScriptWidgetHost` tracks active script widgets in a module-level
`Map<id, setCapped>`. When a new widget tries to mount past the cap it is
shown a muted "Click to activate" placeholder instead of an iframe.
Clicking the placeholder evicts the oldest active widget *and notifies it
via the stored setter* so its component flips to `capped: true` and its
iframe is removed from the DOM.

The notify step is load-bearing. An earlier draft of this fix kept the
evicted widget tracked-but-still-rendered, so the cap silently exceeded
itself the first time a user clicked the placeholder. The
`evictOldestActiveScriptWidget` helper is the canonical eviction path.

The cap is a user setting: **Settings → Dashboard → Performance → Active
script widgets cap**, persisted on `DashboardSettings.maxActiveScriptWidgets`
(Rust struct field + TypeScript interface), default **8**, hard-clamped
`1..=100` at the storage boundary. The default rose from the original
post-mortem value of 3 because dashboards with several lightweight script
widgets need more headroom; the 100 ceiling is still well below the
regression threshold on the original incident hardware.

`ScriptWidgetHost` reads the cap from `useWorkspaceStore` and passes it
into `tryActivateScriptWidget`. The mount effect depends on the cap, so:

- **Raising the cap** gives capped hosts room to activate on their next cap
  effect pass, up to the new ceiling.
- **Lowering the cap** enforces the new ceiling as hosts re-run their cap
  effect. This may replace older running iframes with placeholders, but it
  preserves the hard resource boundary the setting promises.

The constants live in two places that must stay in sync:

- `default_max_active_script_widgets()` and
  `MAX_ACTIVE_SCRIPT_WIDGETS_LIMIT` in `src-tauri/src/storage.rs`.
- `MAX_ACTIVE_SCRIPT_WIDGETS_DEFAULT`, `_LIMIT`, `_MIN` in
  `src/app-defaults.ts`.

Bumping the upper bound requires changing both files, the
`validate_dashboard_settings` clamp, and the localization_todo hint copy
in `docs/localization_todo/settings.dashboardMaxActiveScriptWidgetsHint.md`.

### 4. Visibility-aware throttling via IntersectionObserver

The host posts `{ kk: true, type: "setVisible", visible: bool }` to each
iframe whenever the iframe scrolls off-screen or back on-screen. The iframe
sandbox installs a `KK.isVisible()` helper that returns the latest value.
Widgets that opt in can short-circuit expensive work — typically by checking
`if (!KK.isVisible()) return; requestAnimationFrame(loop);` at the top of
their rAF callback.

This is cooperative throttling, not enforcement: a widget that ignores
`KK.isVisible()` keeps burning frames. The AI prompt change in §6 nudges
toward the cooperative path.

### 5. Mutex poison recovery with defensive rollback

`storage::Storage::with_connection_infallible` recovers from poisoned mutexes
by calling `poison.into_inner()` and issuing a best-effort `ROLLBACK` on the
recovered connection. The previous `.expect("dashboard storage mutex
poisoned")` would turn any panic inside a storage operation into an app-wide
crash on the next caller.

The defensive `ROLLBACK` is there because the panicking holder may have left
a transaction open. If no transaction is active, SQLite returns
`cannot rollback - no transaction`; we ignore that error on purpose.

This is a tradeoff. Poison recovery prefers "potentially-inconsistent
database" over "guaranteed crash". For KKTerm's local-first storage, the
trade favors keeping the app responsive. The dashboard tables are
recoverable from settings export; the connections table is the only critical
data, and panicking dashboard commands cannot reach it.

### 6. AI prompt guardrails

The `dashboard_create_widget` tool description now contains explicit
guidance:

- Always check boundary collisions against arena edges (top, bottom, left,
  right). Collision functions that only check filled cells but not the floor
  cause silent resource drains.
- Every `requestAnimationFrame` callback must check a stop/pause/game-over
  state at the top so the loop can terminate.
- Declared libraries must actually be referenced in source.

Prompt guidance is the least reliable layer — models do not always obey — so
it is positioned as the *first* line of defense. The validator catches what
the prompt missed.

## Consequences

**Positive**

- Validation runs at the layer where the AI's mistake is cheapest to reject
  (before SQLite write). Bad widgets never reach the renderer.
- The cap bounds the worst case: at most the configured number of script
  widget iframes can run at once, regardless of how many widgets exist on
  the Dashboard.
- A poisoned mutex no longer cascades into an app-wide crash.
- Dynamic backgrounds (e.g., Matrix) still run alongside the capped script
  widgets, but they are app-owned and well-bounded.

**Negative**

- The validator is a heuristic. Regex literals containing unbalanced
  delimiters trigger false rejections. Template-literal interpolation can
  hide a `while(true)` from the check. Both are accepted limitations.
- `KNOWN_LIBRARY_GLOBALS` must be kept in sync with the TypeScript catalog.
- The active-widget cap is module-global, so it is shared across all
  Dashboards in one process. This is intentional for now (one WebView2
  renderer to protect), but multi-Dashboard users will eventually notice.
- Cooperative visibility throttling does nothing for widgets that don't call
  `KK.isVisible()`. The cap is the hard backstop.

**Neutral**

- `KK.isVisible()` is a new contract on the widget sandbox surface. Future
  hardening (e.g., automatic frame-rate cap when off-screen) can build on
  the same `setVisible` message channel.
- The validator and the cap are independent — adjusting either does not
  require touching the other.
- Network permission covers remote data and images, not remote script
  execution. Runtime CDN script injection stays blocked by CSP; new shared
  code should be added through the curated local library registry.

## Operational notes

- Adding a new bundled library: update `KNOWN_LIBRARY_GLOBALS` in
  `src-tauri/src/dashboard_validation.rs` alongside
  `src/dashboard/script/widgetLibraries.ts`. Without the Rust-side entry the
  unused-library check is silently skipped for that key.
- Matter.js is the blessed bundled 2D physics library for script widgets.
  Its catalog key is `matter`, its global is `Matter`, and the AI contract
  requires generated physics widgets to declare `body.libraries: ["matter"]`
  instead of hand-rolling collision, gravity, or rigid-body integration.
  The same unused-library validation still applies: declaring `matter`
  without referencing `Matter` is rejected before persistence.
- Tightening the validator: add cases to the `validate_script_source_inner`
  / `strip_strings_and_comments` test groups in `dashboard_validation.rs`.
  Each new rejection rule must come with both a positive and a negative test.
- Adjusting the active-widget cap: the user-facing knob is Settings →
  Dashboard → Performance → Active script widgets cap. Changing the
  default value or hard ceiling requires editing both
  `default_max_active_script_widgets()` /
  `MAX_ACTIVE_SCRIPT_WIDGETS_LIMIT` in `src-tauri/src/storage.rs` and the
  matching `MAX_ACTIVE_SCRIPT_WIDGETS_DEFAULT` / `_LIMIT` / `_MIN`
  constants in `src/app-defaults.ts`. Both halves must move together —
  the Rust validator is the source of truth at write time, the TS
  constants drive the input's `min`/`max` clamp at edit time. Raising the
  ceiling without testing on a low-end Windows machine risks
  reintroducing the freeze.
