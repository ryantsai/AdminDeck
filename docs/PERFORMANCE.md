# AdminDeck Performance and Terminal Compatibility Checks

AdminDeck performance checks are local-only. They use the app chrome status bar, manual observation, and local process memory data; they do not upload telemetry and they should not capture terminal contents.

## Budgets

| Metric | Budget | Source |
| --- | ---: | --- |
| Cold launch to usable UI | <= 1,000 ms acceptable, <= 500 ms target | Status bar `UI ready` value after launch |
| New local terminal tab ready | <= 100 ms | Status bar `Local ready` value after opening a local terminal |
| SSH terminal ready after auth | <= 150 ms, excluding network/auth wait | Status bar `SSH ready` value after opening an SSH Connection |
| Idle memory | <= 150 MiB target | Status bar `Memory` value after the app is idle |

## Measurement Run

Use a release-like Tauri build when possible. Development builds are still useful for regressions, but record that they are development measurements.

1. Start AdminDeck and wait until the first workspace is usable.
2. Record the `UI ready` value from the status bar.
3. Let the app sit idle for at least 30 seconds with no active transfers.
4. Record the `Memory` value and its tooltip source.
5. Open a new local terminal tab.
6. Record the `Local ready` value.
7. Open a non-`ProxyJump` SSH Connection that has already completed host-key trust.
8. Record the `SSH ready` value after authentication completes.

Record the machine, OS, build type, date, and values in release notes or the validating issue before marking a milestone measurement item complete.

## Terminal Compatibility Checklist

Run this checklist in a local terminal and, where practical, in a native SSH terminal. Keep terminal output private unless a user explicitly chooses to include selected text in diagnostics.

| Scenario | Expected Result |
| --- | --- |
| `vim` or `nvim` opens, edits, saves, and exits | Alternate screen restores the shell prompt cleanly |
| `tmux` starts, splits panes, switches panes, and exits | Mouse and resize behavior remain usable |
| `htop` or `btop` runs | Full-screen redraws are stable and input remains responsive |
| `git status`, `git log`, and pager navigation | Scroll, search, and quit behavior match normal terminal expectations |
| `npm run check` or similar noisy command | Scrollback remains available and terminal stays responsive |
| `cargo test` or similar long command | Output does not corrupt after resize |
| Paste a multi-line command while confirmation is enabled | User confirmation appears before input is sent |
| Paste into an app that enables bracketed paste, such as a shell/readline or editor | Pasted text is bracket-delimited by the terminal app when supported |

If a scenario fails, note whether it is renderer behavior, shell/application behavior, SSH transport behavior, or an app layout/resize problem before changing the renderer abstraction.
