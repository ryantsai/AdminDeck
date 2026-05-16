# settings.dashboardMaxActiveScriptWidgetsHint

- **English value**: `Maximum script widgets that render their iframe at once on a Dashboard. Excess widgets show a click-to-activate placeholder. Allowed range {{min}}–{{max}}.`
- **Namespace**: `settings`
- **File/component**: `src/settings/DashboardSettings.tsx`
- **UI role**: `tooltip`-style field hint (rendered via `<small className="field-hint">`)
- **User flow**: Sits directly below the active-widget-cap number input in Settings → Dashboard → Performance. Explains what the field controls, what happens when the cap is exceeded, and what values are allowed.
- **Tone**: explanatory, two sentences plus the numeric range. Match the wordiness of other hint strings under settings (e.g. terminal scrollback hint).
- **Placeholders**: `{{min}}` and `{{max}}` — integer bounds (currently 1 and 100). The values come from `MAX_ACTIVE_SCRIPT_WIDGETS_MIN` / `MAX_ACTIVE_SCRIPT_WIDGETS_LIMIT` in `src/app-defaults.ts` and stay in lockstep with the Rust validator (`MAX_ACTIVE_SCRIPT_WIDGETS_LIMIT` in `src-tauri/src/storage.rs`).
- **Domain notes**: "Iframe" is technical but accepted across translations because it is a standard web term. "Click-to-activate placeholder" describes the muted clickable rectangle that replaces a capped widget's iframe — see `dashboard.scriptWidgetCapped` for the placeholder copy. If your language has a single short word for "exceeds the cap", prefer that to a two-sentence structure.
