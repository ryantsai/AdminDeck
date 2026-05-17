# manual.loadError

- **English value**: `Could not load manual: {{message}}`
- **Namespace**: `manual`
- **File/component**: `src/manual/ManualPage.tsx`
- **UI role**: `error`
- **User flow**: Shown when the Tauri backend fails to read a manual chapter file (resource missing, IO error, etc.).
- **Tone**: concise/neutral, direct error reporting
- **Placeholders**: `{{message}}` — the raw error message from the backend
- **Domain notes**: Preserve the `{{message}}` placeholder verbatim. "manual" here refers to the in-app Operation Manual; keep terminology consistent with `manual.title`.
