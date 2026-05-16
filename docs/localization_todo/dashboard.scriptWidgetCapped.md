# dashboard.scriptWidgetCapped

- **English value**: `Click to activate (max {{max}} active widgets)`
- **Namespace**: `dashboard` (mapped under the `app`/dashboard surface in en.json)
- **File/component**: `src/dashboard/script/ScriptWidgetHost.tsx`
- **UI role**: `button` (clickable placeholder that swaps a capped widget into the active set)
- **User flow**: KKTerm caps the number of simultaneously active script widgets on a Dashboard view (default 8, user-configurable in Settings) to prevent runaway requestAnimationFrame / animation loops from saturating WebView2's render thread. When a script widget is loaded but the cap is already filled, its iframe is replaced by a muted, clickable placeholder showing this message. Clicking it evicts the oldest active widget and swaps the clicked one into the active set in its place.
- **Tone**: short, direct, helpful — the user needs to understand both the action (click) and the constraint (a maximum).
- **Placeholders**: `{{max}}` — integer count of the current active script widget cap.
- **Domain notes**: "Active widget" is the live-iframe state of a Dashboard script widget. The placeholder is intentionally minimal — no icon, low contrast — because it lives inside the widget body and should not compete with the surrounding dashboard chrome. Keep the wording short enough to fit a 4×3 grid cell at the smallest supported density.
