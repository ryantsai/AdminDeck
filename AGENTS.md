# Agent Instructions

## Project Shape

KKTerm is a Windows-first, local-first Tauri v2 desktop app — Rust backend, React/TypeScript frontend. Product direction: `docs/PRD.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/ADR/`. Before changing behavior or terminology, read `CONTEXT.md` and preserve its domain boundaries.

## Operation Manual

End-user operation docs live in `docs/manual/` and ship with the app. `docs/manual/INDEX.md` is the entry point; one chapter per user-facing module (Workspace, Connections, Terminal, SSH/tmux, SFTP, URL, RDP/VNC, Dashboard, App Launcher, Wiki, AI Assistant, Screenshots, Settings, Localization, Data/Backup). The manual references i18n keys (e.g. `connections.quickConnect`), not English labels, so locale changes do not invalidate it.

**Update rule:** any PR that changes UI behavior in a chapter's scope must update that chapter in the same PR. When a key is renamed or removed, run `git grep "<old.key>" docs/manual` and fix every reference. New UI surfaces require either a new chapter or a new section in the closest existing chapter — choose by activity-rail module, matching `INDEX.md`. Do not document English label text directly; reference the i18n key. The in-app AI Assistant grep-searches `docs/manual/` to answer "how do I…" questions, so keep each chapter's `## AI grep hints` block accurate (keys, file paths, common synonyms).

## Constitution

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Rule 1 — Think Before Coding

State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

## Rule 2 — Simplicity First

Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

## Rule 3 — Surgical Changes

Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.
`cargo fmt` is optional in this repo. If formatting is useful, run it only on the
smallest practical Rust scope you intentionally touched, such as a single file
or package/module. Do not run broad `cargo fmt` over the whole workspace unless
the user explicitly asks for global formatting; it can rewrite unrelated Rust
sources and create noisy file-format churn.

## Rule 4 — Goal-Driven Execution

Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.


## Domain Language

- **Connection**: durable, stored in SQLite. Kinds: local terminal, SSH terminal, URL (embedded WebView2), RDP, VNC. SFTP opens from an SSH Connection.
- **Quick Connect**: unsaved one-off connection draft that starts a session.
- **Session**: live process/channel/SFTP/webview state, not the saved profile.
- **Tab**: frontend workspace container, not a backend domain object.

Use **Connection** (not "profile") for stored openable resources.

## Engineering Defaults

- Prefer existing repo patterns over new abstractions.
- KKTerm is a desktop-only app. Optimize layouts for desktop windows and Tauri/WebView2 runtime behavior; do not spend implementation or QA time on mobile viewport layouts unless the user explicitly requests mobile support.
- When designing UI, prefer concise, accurate short terms over expressive terminology and explanatory text.
- SQLite stores non-secret durable data; OS keychain stores secrets; terminal contents are not logged by default.
- Do not put live session state into the durable connection model. Keep UI state (tabs, selected panes) in the frontend workspace layer unless persistence is required.
- Keep Tauri command calls behind typed wrappers in `src/lib/tauri.ts`.
- Do not add frontend close hooks or close-confirmation flows. `onCloseRequested`, `tauri://close-requested`, JS-side close listeners, and any close-confirmation dialog have repeatedly broken the native Windows title-bar close button in Tauri v2 — never reintroduce them. Persist window/layout state during normal resize/move/settings flows instead of doing work during close.
- The one allowed close-path exception is the minimize-to-tray diversion: a native, synchronous Rust-side `WindowEvent::CloseRequested` arm in `lib.rs`'s existing `on_window_event` handler that calls `app_tray::hide_window_on_close_if_enabled`. It must stay conditional — `api.prevent_close()` is called only when minimize-to-tray is enabled, otherwise the close request is left untouched and quits natively. Do no async work in this arm. The tray "Exit" item (`app.exit(0)`) bypasses `CloseRequested`, preserving a guaranteed quit path.
- Automatic database backups must not run from app-window close. The supported shape is startup/manual backup ZIP creation using the same importable KKTerm settings export format.
- For debugging builds, prefer local debug logs, console output, or existing diagnostics plumbing over adding visible in-app indicators/status text. Add user-visible debug indicators only when explicitly requested or when they are part of a real product feature.
- Activity rail icon labels must use the shared app-owned `RailTooltip` in `src/app/RailTooltip.tsx`, not native `title` tooltips. Keep rail popups unified with delayed hover/focus behavior and the light native-style bordered popup treatment so browser-native tooltips do not appear beside app tooltips. Dashboard, App Launcher, File Explorer, Settings, and other non-workspace pages must stay inset from the 48px rail and below the rail stacking layer so rail hover/focus tooltips still work while those pages are active.
- User-facing transient status messages belong in the bottom workspace status bar. Use the shared `showWorkspaceStatus` store action, keep success confirmations at the default 5 second duration unless the product flow explicitly needs otherwise, and let `src/workspace/StatusBar.tsx` own fade-in/fade-out behavior. Do not add one-off toast/status implementations for Connection lifecycle events.
- Do not use browser-native JavaScript popups (`window.alert`, `window.confirm`, `window.prompt`) for user input or confirmations. They show confusing localhost/runtime labels in Tauri and look out of place; build app-owned dialogs/popovers with translated strings instead.
- `src/App.tsx`: app shell routing, Settings routing, bootstrap hook composition, and workspace chrome composition only — it does not own form/control code, feature surfaces, Activity Rail internals, or panel resize mechanics. Place feature code in:
  - `src/app/` — Activity Rail, shared RailTooltip, Workspace chrome layout, and app-shell effects
  - `src/connections/` — connection tree
  - `src/workspace/` — workspace dispatch, status, screenshots
  - `src/terminal/TerminalWorkspace.tsx`, `src/sftp/SftpWorkspace.tsx`, `src/webview/WebViewWorkspace.tsx`, `src/remote-desktop/RemoteDesktopWorkspace.tsx` — feature workspaces
  - `src/ai/AssistantPanel.tsx` — assistant UI
  - `src/settings/SettingsPage.tsx` — Settings UI sections, draft state, save/reset, settings-specific helper controls
  - `src/lib/settings.ts` — persisted-settings bootstrap (`useBootstrapSettings`) and `AI_PROVIDER_SECRET_OWNER_ID` keychain owner constant. Add new persisted settings here rather than cloning a `useEffect` in `App.tsx`.
- Settings page styling must stay consistent across sections. Group related controls with the shared `settings-subsection settings-fieldset` fieldset/legend treatment so the group title sits in the border, matching the AI Assistant tools group. Do not add ad hoc cards or heading-only group boxes for Settings groups. Editable Settings inputs/selects should look editable in the default color scheme; disabled or readonly controls should remain visually muted. Delete buttons inside Settings pages use an icon-only red trash can with a translated accessible label, centered in the row; do not add visible "Delete" text. Destructive Settings-wide actions belong in General → Settings data with an app-owned confirmation dialog, not inside feature-specific settings pages.
- AI provider model choices are owned by `src/ai/providerRegistry/` and rendered in `src/settings/AiSettings.tsx`. Keep the known model picker as a real provider-specific `<select>` so all options are visible; keep exact/custom model IDs in the separate custom model input. Do not use an `<input list>`/`datalist` for provider model selection because Chromium filters it to the current value and hides the rest of the provider list.
- See `docs/ARCHITECTURE.md` "Frontend Module Map" before placing new UI or helper logic.
- Native HWND-backed RDP ActiveX cannot be trusted to obey DOM z-index, so only RDP uses overlay parking. Preserve the RDP screenshot/parking behavior in `src/remote-desktop/RemoteDesktopWorkspace.tsx`: when an app-owned DOM overlay intersects the RDP host rectangle, capture the visible RDP host via the typed screenshot command, show that bitmap underneath the DOM overlay, then hide/park the ActiveX HWND until the overlay closes. Do not apply overlay parking or the RDP screenshot workaround to WebView2, terminal, SFTP, or VNC workspaces. WebView2 is moved/hidden only for URL Session lifecycle needs such as inactive Tabs, not for app menus. Keep RDP overlay detection centralized and geometry-scoped in `src/workspace/nativeOverlay.ts`.
- Simple command menus in the Workspace module use Tauri native context menus through `src/lib/nativeContextMenu.ts`: Quick Connect, Add Connection, Connection Tree right-click menus, Activity Rail Connection right-click menus, Tab right-click menus, and screenshot toolbar menus. Do not build DOM replacements for these unless the menu needs forms or custom interactive content; browser-preview fallback DOM surfaces may exist, but they must not be used to justify WebView2 suppression or broad RDP parking.
- Native context menu icons go through `src/lib/nativeContextMenu.ts`, which rasterizes icons to 16px PNG bytes, creates Tauri `Image`s through `Image.fromBytes`, and creates explicit `IconMenuItem`s before opening the menu. Use `iconSrc` for existing app PNG/data URL assets such as Connection icons and URL favicons; use app-owned SVG strings from `src/lib/nativeMenuIcons.ts` as `iconSvg` for command-only actions. Keep Tauri's `image-png` feature enabled in `src-tauri/Cargo.toml`; without it, Windows native menu icons can silently render as text-only. Do not pass raw SVG paths directly to Tauri menu APIs and do not add one-off PNG icon files for simple menu commands.
- Terminal and WebView2 surfaces can use normal app stacking for popovers and non-native overlays. If a new DOM overlay must cross into an active RDP workspace, verify it over active terminal/RDP/WebView2 sessions and update `src/workspace/nativeOverlay.ts` only for the RDP ActiveX case.
- Do not validate Command Prompt, PowerShell, or WSL local-terminal focus/input bugs with localhost, Vite, or browser preview. Those previews do not host a real Tauri local PTY/Windows ConPTY path. Use the real Tauri desktop runtime or a Tauri-capable harness, and compare against native SSH only as a transport contrast: SSH uses KKTerm's `NativeSsh` transport, while local Windows shells use `portable_pty`/ConPTY through the generic `Pty` transport. Be especially careful around xterm focus/blur changes, since xterm input is backed by a hidden textarea and WebView2 focus can be host-runtime sensitive.
- `withLiveConnectionStatuses` in `src/connections/treeUtils.ts` spreads every connection (`{...connection, status}`) and therefore returns a fresh `Connection` reference on every `activeSessionCounts` change. Use it only on display surfaces (status dots, connection-tree badges, the dashboard Connection widget tab strip). Do not hand a live-status `Connection` to `TerminalWorkspace`, `WebViewWorkspace`, `RemoteDesktopWorkspace`, or `SftpWorkspace` — those workspaces own session lifecycle effects (most notably the PTY-managing `useEffect` in `src/terminal/TerminalWorkspace.tsx` which lists `pane.connection` in its dependency array) and a reference change tears down and restarts the session, which itself bumps `activeSessionCounts` and produces an unbounded mount/unmount flicker loop. When embedding a workspace component (Connection widget, future dashboard/popover embeds), look the active `Connection` up by `id` from the raw `tree` (or any non-augmented source) so the reference stays stable across status changes; see `src/dashboard/widgets/ConnectionWidgetBody.tsx` for the pattern (`sessionConnectionsById`).
- For dynamic ARIA in TSX, use the typed helpers in `src/lib/aria.ts` and spread their results onto elements. Match ARIA roles to real children: `role="menu"` for menu items only; mixed popovers with forms use a dialog-style surface.
- Avoid JSX `style=` when classes, data attributes, CSS variables, or ref-applied geometry can carry the state. Add vendor fallbacks; avoid `color-mix()` in shared app CSS unless target support is intentional.

## Internationalization (i18n)

Stack: **i18next + react-i18next**, in `src/i18n/`. English (`locales/en.json`, ~500 keys, 11 namespaces) is the source of truth and the only bundled locale; 12 others (fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id) load on demand via dynamic `import()`. Selection persists in `localStorage` (`kkterm.language`) and is hot-swapped via `switchLanguage()` in `src/i18n/config.ts`; `ensureI18nReady()` handles startup. Selector lives at Settings → General → Language. The typed `useT()` hook in `src/i18n/useT.ts` autocompletes keys from the English JSON shape.

### Rules

1. **Every user-visible string MUST go through `t()`** — labels, aria-labels, titles, placeholders, status, errors. In React, `const { t } = useTranslation()`. In pure helpers that can't use hooks, import `i18next` from `src/i18n/config` and call `i18next.t(key)`.
2. **Implement English first.** Add or change keys in `src/i18n/locales/en.json` under the appropriate namespace (dot-notation, e.g. `settings.general.language`). Do not block UI work translating every locale in the same change.
3. **Track pending translations as one file per key under `docs/localization_todo/`** for every new or changed English key not translated immediately. Copy `docs/localization_todo/_TEMPLATE.md` to `<namespace>.<keyPath>.md` (e.g. `ai.dashboardToolsDisabledTitle.md`) and fill in every field: key, English value, namespace, file/component, UI role (label/button/status/tooltip/error/fragment), surrounding user flow, tone, placeholder details, and domain notes. One key per file — never bundle multiple keys into one file. No context-free TODOs; standalone words are often ambiguous without nearby controls and state. The per-file layout exists so feature branches do not merge-conflict on a shared backlog.
4. **Only update non-English locale files when intentionally translating.** When you do, keep all 13 locale JSON files under `src/i18n/locales/` structurally aligned, run `npm run i18n:check` to compare every locale against `en.json`, and **delete** the matching `docs/localization_todo/<namespace>.<keyPath>.md` file. Technical terms (SSH, SFTP, RDP, VNC, tmux, ProxyJump, PowerShell, WSL, API, URL) typically stay English across languages.
5. **When renaming or removing a key**, update `en.json`, update or remove the matching `docs/localization_todo/<namespace>.<keyPath>.md` file (rename the file to match the new key path), and clean up any translated locale files that touched the key.

### Namespaces

`app` (shell, ActivityRail, resize handles), `settings`, `connections` (sidebar, tree, dialogs, Quick Connect, context menus), `terminal` (workspace, toolbar, SSH host key dialogs), `sftp` (browser, transfers, conflicts, properties), `webview` (URL toolbar, credential fill), `remoteDesktop` (RDP/VNC status, toolbar), `ai` (assistant panel, markdown toolbar, chat history, waiting phrases), `workspace` (tab strip, canvas, status bar, screenshot menu), `common` (Save, Cancel, Close, Delete, Copy…), `languages` (native names).

## Native Debug Verification

Use the real Tauri desktop runtime for testing and verification, including UI work. Do not use a standalone Vite/browser preview as the validation path. Run `npm run tauri dev` for manual smoke testing, or use VS Code's `Run KKTerm exe` launch configuration to debug `src-tauri/target/debug/kkterm.exe` with Rust breakpoints and `RUST_BACKTRACE=1`. Use the paired `Attach KKTerm WebView2` launch configuration when frontend DevTools/debugging is needed inside the real WebView2 host. Native behavior that must be validated this way includes local PTY/ConPTY focus, WebView2, RDP/VNC, title-bar close behavior, keychain, dialogs, native context menus, and OS integration.

## Checks

Run before handing work back:

```bash
npm run check
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

If a check cannot be run, explain why in the final response.
