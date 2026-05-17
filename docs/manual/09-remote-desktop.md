# 09 — Remote Desktop (RDP and VNC)

## AI grep hints

- Keys: `remoteDesktop.*` (full namespace), `connections.windowsRdp`, `connections.screenControl`
- Topics: RDP via mstscax ActiveX, VNC via vnc-rs, Ctrl+Alt+Del, reconnect, framebuffer waiting
- Synonyms: "remote desktop", "screen sharing", "mstsc", "VNC viewer", "send three-finger salute"

## Connection kinds

- **RDP** (`connections.windowsRdp`) — Windows-native remote desktop Session via the Microsoft RDP ActiveX control in `mstscax.dll`. Renders to a native child HWND positioned over its Tab.
- **VNC** (`connections.screenControl`) — RFB / VNC Session via the Rust `vnc-rs` client. Renders the remote framebuffer into the workspace canvas.

Both store host, optional port, and non-secret account metadata in SQLite; passwords are in the Windows Credential Manager.

Type label: `remoteDesktop.typeLabel`. Generic Session label: `remoteDesktop.session`. Display accessible label: `remoteDesktop.displayAria`.

## Connection lifecycle

- `remoteDesktop.connecting` → `remoteDesktop.preparingDisplay` → `remoteDesktop.connected`.
- For VNC: while the first framebuffer is awaited, `remoteDesktop.waitingFramebuffer`.
- `remoteDesktop.disconnected` after the session ends.
- `remoteDesktop.reconnect` / `remoteDesktop.reconnecting` reissue the connect with the same Connection settings.

Runtime checks:

- `remoteDesktop.rdpDesktopRequired` — RDP cannot start outside the Tauri desktop runtime.
- `remoteDesktop.vncDesktopRequired` — same for VNC.
- `remoteDesktop.transportUnavailable` — the relevant transport (mstscax / vnc-rs) is missing.

Transport labels for status messages: `remoteDesktop.rdpActiveX`, `remoteDesktop.vncFramebuffer`.

## Toolbar actions

- `remoteDesktop.sendCtrlAltDel` — sends Ctrl+Alt+Del to the remote (RDP). Required for the Windows lock screen; the local OS intercepts the real key combo.
- `remoteDesktop.reconnect` — explicit reconnect button.

## RDP overlay parking (implementation note)

The native HWND backing an RDP Session does not obey DOM z-index. When an app-owned DOM overlay intersects the RDP host rectangle, KKTerm:

1. Captures the visible RDP host via a typed screenshot Tauri command.
2. Shows that bitmap underneath the DOM overlay.
3. Hides ("parks") the ActiveX HWND until the overlay closes.

This behaviour is **RDP-only**. WebView2, VNC, terminal, and SFTP surfaces never use overlay parking. Geometry-scoped detection lives in `src/workspace/nativeOverlay.ts`. Do not extend this workaround to other surfaces.

## RDP / VNC settings

Per-kind defaults (resolution, colour depth, etc.) live in Settings → RDP (`settings.sectionRdp`) and Settings → VNC (`settings.sectionVnc`). See [15-settings.md](15-settings.md).
