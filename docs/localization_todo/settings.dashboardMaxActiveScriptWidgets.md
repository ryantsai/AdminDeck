# settings.dashboardMaxActiveScriptWidgets

- **English value**: `Active script widgets cap`
- **Namespace**: `settings`
- **File/component**: `src/settings/DashboardSettings.tsx`
- **UI role**: `label` (input field label)
- **User flow**: Settings → Dashboard → Performance fieldset. Labels the number input that sets `dashboardSettings.maxActiveScriptWidgets`. The hint immediately below the input is `settings.dashboardMaxActiveScriptWidgetsHint`.
- **Tone**: short, technical-but-plain. Sits beside numeric inputs like terminal scrollback size.
- **Placeholders**: none.
- **Domain notes**: "Script widget" is the user-facing term for an AI-authored or custom JavaScript widget on the Dashboard (distinct from content widgets and built-in widgets). "Cap" here means "maximum simultaneously active count" — translate so it reads as the *limit*, not as a target value.
