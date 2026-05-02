# Terminal Compatibility Manual Checklist

Use this checklist before marking the roadmap item complete:

> Run manual compatibility checklist: vim, tmux, htop/btop, git, npm, cargo, and pane scrollback search.

Run the checklist in a local terminal Session. If you have a trusted native SSH Connection available, repeat the same checks there as well. Do not include terminal output in diagnostics or release notes unless the user explicitly selected and shared it.

## Test Run Metadata

Record these values with the completed checklist:

| Field | Value |
| --- | --- |
| Date | |
| AdminDeck build or commit | |
| Windows version | |
| Shell | PowerShell / cmd / Git Bash / WSL / other |
| Session type | Local / native SSH |
| SSH transport, if used | Native non-ProxyJump / system ssh fallback |
| Terminal font and size | |
| Scrollback setting | |

## Pass Criteria

The checklist passes when:

- Full-screen terminal apps use the alternate screen cleanly and restore the prompt after exit.
- Keyboard input, paste, Ctrl+C, Escape, arrows, function keys, and common modifier shortcuts are delivered correctly.
- Mouse interactions work in apps that enable mouse support.
- Terminal resizes propagate to running apps without corrupted layout.
- Long command output remains responsive and searchable in the correct Pane.
- Scrollback search decorations, navigation, and close behavior do not interfere with terminal input.

## Setup Checks

| Check | Steps | Expected Result | Result |
| --- | --- | --- | --- |
| Open baseline local terminal | Open a new local terminal tab. Run `echo $PSVersionTable.PSVersion` in PowerShell or `echo %COMSPEC%` in cmd. | Prompt accepts input and output appears without layout shifts. | |
| Open optional SSH terminal | Open a trusted native SSH Connection if available. | Session reaches a prompt and resize/status behavior remains normal. | |
| Switch tabs without disconnecting | Open two terminal tabs. Run a long-lived safe command or leave a prompt active in the first tab, switch to the second tab, then switch back. Repeat with native SSH when available. | The first Session remains connected and usable after tab switches. No disconnect occurs unless the tab-strip close `X` is explicitly pressed or the process/remote host ends the Session. | |
| Split terminal panes | Split the terminal tab into at least two Panes. Run a different command in each Pane. | Focus, typing, and output stay isolated to the active Pane. | |
| Resize app window | Resize the AdminDeck window while a prompt is visible. | Prompt redraws cleanly, with no duplicated prompt fragments or stale rows. | |

## vim or nvim

Use `vim` or `nvim`; if neither is installed, record `Not installed` and skip the app-specific checks.

| Check | Steps | Expected Result | Result |
| --- | --- | --- | --- |
| Alternate screen entry and exit | Run `vim` or `nvim`, then `:q`. | Editor opens full-screen and exits back to the original shell view cleanly. | |
| Edit and save | Open a temporary file, enter insert mode, type several lines, save with `:w`, then exit. | Insert mode, status line, command line, and saved file behavior are normal. | |
| Arrow and Escape keys | Move around with arrows, enter insert mode, press Escape, then navigate again. | Mode changes and cursor movement are correct. | |
| Resize while open | Resize the AdminDeck window while the editor is open. | Editor redraws to the new dimensions without visual corruption. | |
| Paste behavior | Paste multiple lines into insert mode. | Paste is inserted as text, not executed by the shell, and indentation is not unexpectedly mangled by terminal handling. | |

## tmux

If `tmux` is unavailable on the local shell, run this section in SSH or record `Not installed`.

| Check | Steps | Expected Result | Result |
| --- | --- | --- | --- |
| Start and exit | Run `tmux`, then exit with `exit` or detach/kill the test session. | tmux starts full-screen and returns to the shell cleanly. | |
| Split panes | In tmux, create horizontal and vertical splits. | tmux panes render with correct borders and no stale text. | |
| Switch panes | Move focus between tmux panes using the configured tmux prefix shortcuts. | Input goes to the selected tmux pane only. | |
| Resize propagation | Resize the AdminDeck window while tmux is open. | tmux recalculates layout correctly. | |
| Mouse mode, if enabled | Enable tmux mouse mode or use an existing config, then click panes or scroll. | Mouse focus/scroll behavior matches tmux expectations. | |

## htop or btop

Use whichever is installed. If both are installed, prefer running both.

| Check | Steps | Expected Result | Result |
| --- | --- | --- | --- |
| Full-screen redraw | Run `htop` or `btop`. | Screen updates continuously without flicker severe enough to impair use. | |
| Keyboard navigation | Use arrows/PageUp/PageDown or app-specific navigation. | Selection and scrolling respond normally. | |
| Mouse interaction | Click rows or controls if the app supports mouse input. | Clicks are delivered accurately. | |
| Resize while active | Resize the AdminDeck window. | Layout redraws without broken columns or stale regions. | |
| Exit restore | Quit the app. | Original shell prompt is restored cleanly. | |

## git and Pager Behavior

Run these checks inside a Git repository.

| Check | Steps | Expected Result | Result |
| --- | --- | --- | --- |
| Status output | Run `git status --short`. | Output renders normally and prompt returns. | |
| Log pager | Run `git log --oneline --decorate --graph -n 30`. Navigate with arrows/PageUp/PageDown and quit with `q`. | Pager navigation and quit behavior match a normal terminal. | |
| Diff colors | Run `git diff --stat` and, if available, `git diff`. | Color and wrapping are readable; pager does not corrupt the prompt after quit. | |
| Search in pager | In `git log`, search for text with `/`, step through matches, then quit. | Search highlighting and navigation work inside the pager. | |
| Ctrl+C handling | Run a safe long command such as `git status --ignored` in a large repo if available, then press Ctrl+C. | Command interrupts and terminal remains usable. | |

## npm

Run these checks in a Node project.

| Check | Steps | Expected Result | Result |
| --- | --- | --- | --- |
| Noisy command output | Run `npm run check` or another project check script. | Streaming output remains responsive and readable. | |
| Long output scrollback | Run a command that prints enough lines to fill scrollback, such as a verbose test or build. | Scrollback remains available after the command completes. | |
| Interactive interrupt | Start a long-running script such as a dev server, then press Ctrl+C. | Process receives interrupt and returns to the prompt. | |
| Resize during output | Resize the window while npm output is streaming. | New output uses the new terminal width without corrupting existing visible rows. | |
| Multiline paste confirmation | Paste a multi-line command while confirmation is enabled. | AdminDeck prompts before sending the paste to the Session. | |

## cargo

Run these checks in a Rust project.

| Check | Steps | Expected Result | Result |
| --- | --- | --- | --- |
| Build/check output | Run `cargo check`. | Progress and compiler output render correctly. | |
| Test output | Run `cargo test`. | Test status lines render correctly and prompt returns. | |
| Colored diagnostics | Trigger or inspect colored compiler/test output if available. | ANSI color and formatting are readable and do not leak escape text. | |
| Long command interrupt | Run a safe long command, then press Ctrl+C. | Process interrupts and the Session remains usable. | |
| Resize during cargo output | Resize the AdminDeck window while cargo is running. | Output continues without prompt or line corruption. | |

## Pane Scrollback Search

Run these checks after generating substantial output in at least two Panes.

| Check | Steps | Expected Result | Result |
| --- | --- | --- | --- |
| Open search in active Pane | Focus a Pane and open terminal scrollback search. Search for text known to exist in that Pane. | Matches are highlighted only in the focused Pane. | |
| Next and previous match | Use next and previous controls across multiple matches. | Navigation moves through matches in order and remains visually aligned. | |
| Wrap behavior | Navigate past the last and first match. | Search wraps through scrollback without losing the query. | |
| No-match state | Search for text that does not exist. | UI communicates no match without changing terminal contents. | |
| Close search | Close the search control. | Search highlights/decorations clear and keyboard focus returns to terminal input. | |
| Search after command output | Run another command after closing search, then search for new output. | New output is searchable and old decorations do not reappear. | |
| Pane isolation | Search in one Pane, then focus another Pane and search for different text. | Search state and highlights do not bleed across Panes. | |

## Notes for Failures

For each failure, record:

- Session type: local terminal, native SSH terminal, or system ssh fallback.
- Shell and app under test.
- Whether the issue appears tied to input, rendering, scrollback, resize, alternate screen, bracketed paste, mouse, or transport.
- Exact high-level reproduction steps, without copying private terminal output unless explicitly approved.
- Whether the issue reproduces after opening a fresh Tab or Pane.
