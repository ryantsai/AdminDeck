# AdminDeck Performance and Terminal Compatibility Checks

AdminDeck performance checks are local-only. They use the app chrome status bar, manual observation, and local process memory data; they do not upload telemetry and they should not capture terminal contents.

## Budgets

| Metric | Budget | Source |
| --- | ---: | --- |
| Cold launch to usable UI | <= 1,000 ms acceptable, <= 500 ms target | Status bar `UI ready` value after launch |
| New local terminal tab ready | <= 100 ms | Status bar `Local ready` value after opening a local terminal |
| SSH terminal ready after auth | <= 150 ms, excluding network/auth wait | Status bar `SSH ready` value after opening a native non-`ProxyJump` SSH Connection |
| Idle memory | <= 150 MiB target | Status bar `Memory` value after the app is idle |

## Measurement Run

Use a release-like Tauri build when possible. Development builds are still useful for regressions, but record that they are development measurements.

1. Start AdminDeck and wait until the first workspace is usable.
2. Record the `UI ready` value from the status bar.
3. Let the app sit idle for at least 30 seconds with no active transfers.
4. Record the `Memory` value and its tooltip source.
5. Open a new local terminal tab.
6. Record the `Local ready` value.
7. Open a native non-`ProxyJump` SSH Connection that has already completed host-key trust.
8. Record the `SSH ready` value after authentication completes. The value is measured in the Rust SSH path after verified connect/auth returns and covers terminal channel, PTY, shell, and initial directory setup.

Record the machine, OS, build type, date, and values in release notes or the validating issue before marking a milestone measurement item complete.

## Latest Measurement

Measured on 2026-05-02 11:50:35 +08:00 using the release executable built at `src-tauri/target/release/admin-deck.exe`. The Tauri bundler did not complete because the WiX download timed out, so this run uses the built release executable directly rather than an installed MSI.

### System Specs

| Component | Value |
| --- | --- |
| OS | Microsoft Windows 11 Pro 10.0.26200, 64-bit |
| Machine | Micro-Star International Co., Ltd. MS-7E47, x64-based PC |
| BIOS | American Megatrends International, LLC. 1.A77, 2025-09-10 |
| CPU | AMD Ryzen 9 9950X3D 16-Core Processor, 16 cores / 32 logical processors, 4.3 GHz max clock |
| Memory | 64 GiB installed, 2 x 32 GiB Micron CT32G56C46U5.C16B2 DDR5 at 5600 MT/s |
| GPU | NVIDIA GeForce RTX 5080, driver 32.0.15.9636; AMD Radeon(TM) Graphics, driver 32.0.21043.5001; SudoMaker Virtual Display Adapter, driver 1.10.9.289 |
| Storage | AMD-RAID Array 2 SCSI Disk Device, 2.05 TB; AMD-RAID Array 1 SCSI Disk Device, 2.00 TB |
| Toolchain | Node v22.16.0, npm 10.9.2, rustc 1.93.1, cargo 1.93.1 |

### Results

| Metric | Measurement | Budget | Status | Notes |
| --- | ---: | ---: | --- | --- |
| Cold launch to usable UI | 71 ms | <= 1,000 ms acceptable, <= 500 ms target | Pass | Read from the app chrome `UI ready` status value. External WebView2 CDP page availability was 247 ms. |
| Idle memory | 27.9 MiB | <= 150 MiB target | Pass | Read from the app chrome `Memory` status value after 30 seconds idle. Process working set was 27.9 MiB and private bytes were 5.0 MiB. |
| Idle CPU | 0.000% | No formal budget | Informational | CPU delta over the 30 second idle window, normalized across 32 logical processors. |
| New local terminal tab ready | 16 ms | <= 100 ms | Pass | Triggered the `New local terminal` button in the release app and read the app chrome `Local ready` value. |
| Working set after one local terminal | 29.4 MiB | No separate budget | Informational | Process private bytes were 6.5 MiB. Shell child-process memory is not included in this app-process value. |
| Release executable size | 16.9 MiB | Not Electron-scale | Pass | Size of `src-tauri/target/release/admin-deck.exe`. |
| SSH terminal ready after auth | Not measured | <= 150 ms excluding network/auth | Pending | The app now records native SSH post-auth terminal readiness only. This run still requires a non-`ProxyJump` SSH Connection with host key already trusted and valid auth available in the measurement environment. |

This run meets every measured performance budget. SSH readiness remains the only documented performance budget not validated by this run.

## Terminal Compatibility Checklist

Run this checklist in a local terminal and, where practical, in a native SSH terminal. Keep terminal output private unless a user explicitly chooses to include selected text in diagnostics.

| Scenario | Expected Result |
| --- | --- |
| `vim` or `nvim` opens, edits, saves, and exits | Alternate screen restores the shell prompt cleanly |
| `tmux` starts, splits panes, switches panes, and exits | Mouse and resize behavior remain usable |
| `htop` or `btop` runs | Full-screen redraws are stable and input remains responsive |
| `git status`, `git log`, and pager navigation | Scroll, search, and quit behavior match normal terminal expectations |
| Search terminal scrollback from a pane | Matches are highlighted, next/previous navigation wraps through scrollback, and closing search clears decorations |
| `npm run check` or similar noisy command | Scrollback remains available and terminal stays responsive |
| `cargo test` or similar long command | Output does not corrupt after resize |
| Paste a multi-line command while confirmation is enabled | User confirmation appears before input is sent |
| Paste into an app that enables bracketed paste, such as a shell/readline or editor | Pasted text is bracket-delimited by the terminal app when supported |

If a scenario fails, note whether it is renderer behavior, shell/application behavior, SSH transport behavior, or an app layout/resize problem before changing the renderer abstraction.
