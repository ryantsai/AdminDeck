# manual.tauriRequired

- **English value**: `The manual is available only in the desktop runtime.`
- **Namespace**: `manual`
- **File/component**: `src/manual/ManualPage.tsx`
- **UI role**: `status` (runtime requirement notice)
- **User flow**: Shown when the user reaches the Manual page from a non-Tauri runtime such as a plain Vite browser preview, where bundled resources are not available.
- **Tone**: concise/neutral, one sentence
- **Placeholders**: none
- **Domain notes**: "Desktop runtime" refers to KKTerm running under Tauri/WebView2 (the installed app), as opposed to a browser preview. Mirror the wording of similar runtime-required notices (`terminal.desktopRuntimeRequired`, `workspace.screenshotsRequireRuntime`).
