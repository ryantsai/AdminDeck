# Agent Instructions

## Project Shape

KKTerm is a Windows-first, local-first Tauri v2 desktop app — Rust backend, React/TypeScript frontend. Product direction: `docs/PRD.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/ADR/`. Before changing behavior or terminology, read `CONTEXT.md` and preserve its domain boundaries.

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

## Rule 4 — Goal-Driven Execution

Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

## Rule 5 — Use the model only for judgment calls

Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

## Rule 6 — Token budgets are not advisory

Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

## Rule 7 — Surface conflicts, don't average them

If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

## Rule 8 — Read before you write

Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

## Rule 9 — Tests verify intent, not just behavior

Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

## Rule 10 — Checkpoint after every significant step

Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

## Rule 11 — Match the codebase's conventions, even if you disagree

Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

## Rule 12 — Fail loud

"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

## Domain Language

- **Connection**: durable, stored in SQLite. Kinds: local terminal, SSH terminal, URL (embedded WebView2), RDP, VNC. SFTP opens from an SSH Connection.
- **Quick Connect**: unsaved one-off connection draft that starts a session.
- **Session**: live process/channel/SFTP/webview state, not the saved profile.
- **Tab**: frontend workspace container, not a backend domain object.

Use **Connection** (not "profile") for stored openable resources.

## Engineering Defaults

- Prefer existing repo patterns over new abstractions.
- KKTerm is a desktop-only app. Optimize layouts for desktop windows and Tauri/WebView2 runtime behavior; do not spend implementation or QA time on mobile viewport layouts unless the user explicitly requests mobile support.
- SQLite stores non-secret durable data; OS keychain stores secrets; terminal contents are not logged by default.
- Do not put live session state into the durable connection model. Keep UI state (tabs, selected panes) in the frontend workspace layer unless persistence is required.
- Keep Tauri command calls behind typed wrappers in `src/lib/tauri.ts`.
- Do not add Tauri app-window close listeners/hooks. In this app, `CloseRequested`, `onCloseRequested`, `tauri://close-requested`, `prevent_close`, and close-confirmation hooks have repeatedly broken the native Windows title-bar close button in Tauri v2. Keep the main window close path native and unhooked. Persist window/layout state during normal resize/move/settings flows instead of doing work during close.
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
- Settings page styling must stay consistent across sections. Group related controls with the shared `settings-subsection settings-fieldset` fieldset/legend treatment so the group title sits in the border, matching the AI Assistant tools group. Do not add ad hoc cards or heading-only group boxes for Settings groups. Editable Settings inputs/selects should look editable in the default color scheme; disabled or readonly controls should remain visually muted. Destructive Settings-wide actions belong in General → Settings data with an app-owned confirmation dialog, not inside feature-specific settings pages.
- AI provider model choices are owned by `src/ai/providerRegistry/` and rendered in `src/settings/AiSettings.tsx`. Keep the known model picker as a real provider-specific `<select>` so all options are visible; keep exact/custom model IDs in the separate custom model input. Do not use an `<input list>`/`datalist` for provider model selection because Chromium filters it to the current value and hides the rest of the provider list.
- See `docs/ARCHITECTURE.md` "Frontend Module Map" before placing new UI or helper logic.
- Native HWND-backed surfaces cannot be trusted to obey DOM z-index. RDP ActiveX and WebView2 must be parked/hidden whenever app-owned DOM overlays, dialogs, menus, or region-selection surfaces need to appear above them. For RDP, preserve the screenshot/parking behavior in `src/remote-desktop/RemoteDesktopWorkspace.tsx`: capture the visible RDP host via the typed screenshot command, show that bitmap underneath the DOM overlay, then hide/park the ActiveX HWND until the overlay closes. Keep overlay detection centralized in `src/workspace/nativeOverlay.ts` and update that helper when adding new app-level overlays.
- Terminal surfaces can use xterm/WebGL canvas layers that visually win when a sidebar flyout spills into the workspace. Keep Quick Connect and other sidebar flyout menus geometrically inside the sidebar when possible; if a flyout must cross into the workspace, verify it over an active terminal/RDP/WebView2 session and update overlay parking/stacking behavior as needed.
- Do not validate Command Prompt, PowerShell, or WSL local-terminal focus/input bugs with localhost, Vite, or browser preview. Those previews do not host a real Tauri local PTY/Windows ConPTY path. Use the real Tauri desktop runtime or a Tauri-capable harness, and compare against native SSH only as a transport contrast: SSH uses KKTerm's `NativeSsh` transport, while local Windows shells use `portable_pty`/ConPTY through the generic `Pty` transport. Be especially careful around xterm focus/blur changes, since xterm input is backed by a hidden textarea and WebView2 focus can be host-runtime sensitive.
- For dynamic ARIA in TSX, use the typed helpers in `src/lib/aria.ts` and spread their results onto elements. Match ARIA roles to real children: `role="menu"` for menu items only; mixed popovers with forms use a dialog-style surface.
- Avoid JSX `style=` when classes, data attributes, CSS variables, or ref-applied geometry can carry the state. Add vendor fallbacks; avoid `color-mix()` in shared app CSS unless target support is intentional.

## Internationalization (i18n)

Stack: **i18next + react-i18next**, in `src/i18n/`. English (`locales/en.json`, ~500 keys, 11 namespaces) is the source of truth and the only bundled locale; 12 others (fr, it, de, es, es-MX, pt-BR, zh-TW, zh-CN, ja, ko, th, id) load on demand via dynamic `import()`. Selection persists in `localStorage` (`kkterm.language`) and is hot-swapped via `switchLanguage()` in `src/i18n/config.ts`; `ensureI18nReady()` handles startup. Selector lives at Settings → General → Language. The typed `useT()` hook in `src/i18n/useT.ts` autocompletes keys from the English JSON shape.

### Rules

1. **Every user-visible string MUST go through `t()`** — labels, aria-labels, titles, placeholders, status, errors. In React, `const { t } = useTranslation()`. In pure helpers that can't use hooks, import `i18next` from `src/i18n/config` and call `i18next.t(key)`.
2. **Implement English first.** Add or change keys in `src/i18n/locales/en.json` under the appropriate namespace (dot-notation, e.g. `settings.general.language`). Do not block UI work translating every locale in the same change.
3. **Track pending translations in `docs/LOCALIZATION.md`** for every new or changed English key not translated immediately. Each entry needs the key, English value, namespace, file/component, UI role (label/button/status/tooltip/error/fragment), surrounding user flow, tone, placeholder details, and domain notes. No context-free TODOs — standalone words are often ambiguous without nearby controls and state.
4. **Only update non-English locale files when intentionally translating.** When you do, keep all 13 files structurally aligned and remove the matching pending entry from `docs/LOCALIZATION.md`. Technical terms (SSH, SFTP, RDP, VNC, tmux, ProxyJump, PowerShell, WSL, API, URL) typically stay English across languages.
5. **When renaming or removing a key**, update `en.json`, revise/remove the matching `docs/LOCALIZATION.md` entry, and clean up any translated locale files that touched the key.

### Namespaces

`app` (shell, ActivityRail, resize handles), `settings`, `connections` (sidebar, tree, dialogs, Quick Connect, context menus), `terminal` (workspace, toolbar, SSH host key dialogs), `sftp` (browser, transfers, conflicts, properties), `webview` (URL toolbar, credential fill), `remoteDesktop` (RDP/VNC status, toolbar), `ai` (assistant panel, markdown toolbar, chat history, waiting phrases), `workspace` (tab strip, canvas, status bar, screenshot menu), `common` (Save, Cancel, Close, Delete, Copy…), `languages` (native names).

## Codex Desktop UI Review

For frontend-only UI inspection in Codex Desktop, run `npm run codex:ui` and open `http://localhost:1420` in the built-in browser. Use this for screenshots, DOM inspection, and UI-fix comments. Validate native-only behavior in the real Tauri runtime with `npm run tauri dev`, especially local PTY/ConPTY focus, WebView2, RDP/VNC, title-bar close behavior, keychain, dialogs, and OS integration.

## Checks

Run before handing work back:

```bash
npm run check
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

If a check cannot be run, explain why in the final response.
