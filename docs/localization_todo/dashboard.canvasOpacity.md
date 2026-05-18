# dashboard.canvasOpacity

- **English value**: `Canvas opacity`
- **Namespace**: `dashboard`
- **File/component**: `src/dashboard/edit/CustomizePopover.tsx`
- **UI role**: `label`
- **User flow**: Shown in the Dashboard widget "Customize" popover, Common tab, above a 0-100 slider that controls how opaque the widget body (canvas area, excluding the title bar) is rendered. Defaults to 70% for the built-in App Launcher and Connection widgets, 100% otherwise; the user can adjust to taste so the dashboard background shows through.
- **Tone**: concise/neutral label, paired with a percentage suffix in parentheses, matches the surrounding Common-tab labels (`Frosted glass background`, `Hide title bar`).
- **Placeholders**: none (the displayed percentage like "(70%)" is appended in JSX, not in the translation)
- **Domain notes**: "Canvas" here means the widget body area, not a `<canvas>` element. Keep wording short to fit alongside the slider. The KKTerm domain terms (Dashboard, Widget) typically stay English.
