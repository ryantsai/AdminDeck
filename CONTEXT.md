# AdminDeck Context

AdminDeck is a local-first desktop administration workspace for terminal, SSH, SFTP, and approval-based command assistance workflows. This context captures the product language used to keep storage, runtime session handling, and UI workspace concepts distinct.

## Language

**i18n / Localization**:
AdminDeck supports 13 UI languages through i18next. The English locale (`src/i18n/locales/en.json`) is the source-of-truth key structure. All user-visible strings must be routed through `t()` or `useTranslation()`; bare English text in JSX is a bug.

**Locale**:
A language-region bundle stored as a JSON file under `src/i18n/locales/`. English is bundled with the app; 12 additional locales load on demand via dynamic `import()`. The active locale is persisted in `localStorage` (`admindeck.language`) and survives app restarts.

**Translation key**:
A dot-notation path into the locale JSON (e.g. `settings.general.language`, `ai.waitingPhrases`). Keys are organized by namespace matching the frontend module map. New UI strings require a new key in all 13 locale files.

**Namespace**:
A top-level section of the locale JSON mapping to a frontend module: `app`, `settings`, `connections`, `terminal`, `sftp`, `webview`, `remoteDesktop`, `ai`, `workspace`, `common`, `languages`. Keep new keys in the namespace closest to the owning component.


**Connection**:
A durable openable resource stored in SQLite. The supported kinds are local terminal, SSH terminal, Telnet terminal, Serial terminal, URL (an embedded WebView2 browser surface targeting a single http(s) origin), RDP, and VNC. SFTP is opened from an SSH Connection and is not stored as a standalone Connection.
_Avoid_: Profile, saved session, host entry

SSH Connections may persist non-secret tmux launch preferences, including whether AdminDeck should start terminal Panes inside named tmux sessions. The remote tmux process itself remains live Session/runtime state and is not the durable Connection.

**URL Connection**:
A Connection of kind `url`. It stores an http(s) URL plus an optional `dataPartition` label. The address bar accepts hosts without a scheme; the backend assumes `https://` when no scheme is present. The `dataPartition` field is persisted but currently a no-op: WebView2 enforces one user-data folder per process, so all URL Connections share the host app's WebView2 cookie/storage in Phase 1. Real per-Connection isolation is deferred until Phase 2 explores out-of-process WebView2 environments.
_Avoid_: Web tab, browser bookmark, URL profile

**RDP/VNC Connection**:
A Connection of kind `rdp` or `vnc`. It stores host, optional port, and non-secret account metadata in SQLite; passwords stay in the OS keychain. RDP Connections start Windows-native remote desktop Sessions through the Microsoft RDP ActiveX control in `mstscax.dll`. VNC Connections start RFB/VNC Sessions through the Rust `vnc-rs` client and render the remote framebuffer in the workspace canvas.
_Avoid_: Remote desktop session, screen profile, saved desktop

**Quick Connect**:
An unsaved one-off connection draft used to start a session without creating a durable connection.
_Avoid_: Temporary profile, ad hoc host

**Session**:
A live runtime instance for a process, SSH channel, or SFTP browser state.
_Avoid_: Connection, profile, tab

**Tab**:
A frontend workspace container that presents one session or a set of related panes.
_Avoid_: Session, connection, backend tab

**Pane**:
A subdivision of a tab that presents one terminal surface or workspace view.
_Avoid_: Session, split

Terminal Panes for tmux-enabled SSH Connections may carry a generated friendly tmux session id, such as `admindeck-cockpit001`, used to resume that Pane's remote tmux session when the Pane is recreated. Current Pane tmux ids use the `admindeck-<sci-fi-name><number>` shape and are remembered in frontend workspace storage. That id belongs to the frontend workspace/Pane layer, not the backend Connection model.

## Relationships

- A **Connection** may start zero or more **Sessions** over time.
- An SSH **Connection** may start terminal **Sessions** and related SFTP browser **Sessions**.
- A **URL Connection** starts a webview **Session** that owns one child WebView2 surface positioned over its **Tab**.
- An **RDP Connection** starts a Windows-native remote-desktop **Session** hosted as a native child control over its **Tab**.
- A **VNC Connection** starts a Rust-managed remote framebuffer **Session** rendered into its **Tab**.
- A **Quick Connect** starts exactly one **Session** unless the user saves it as a **Connection**.
- A **Session** may be presented by one **Tab**.
- A terminal **Tab** may contain one or more **Panes**.
- A tmux-enabled SSH terminal **Pane** may start or attach to a named remote tmux session. If `tmux` is unavailable on the remote host, the Pane falls back to the normal remote shell.
- A **Tab** is UI state only and is not the durable backend model.
- Switching the active **Tab** does not end, disconnect, or recreate its **Session**.
- A native SSH **Session** must not use an app-side idle timeout. Quiet, unfocused SSH Sessions are expected to remain connected unless the remote server, network, or an explicit user close ends them.
- A tmux-enabled native SSH **Session** may silently attempt a small bounded reattach to the same Pane tmux id if the SSH channel unexpectedly closes.
- A **Session** is intentionally ended only by an explicit close action on the presenting **Tab** or by the remote/process ending itself.

## Example Dialogue

> **Dev:** "When the user opens the Bastion East **Connection**, should we mutate that row to mark it active?"
> **Domain expert:** "No — opening the **Connection** creates a **Session**. The **Connection** stays durable resource data; live state belongs to the **Session** and its **Tab**."

## Flagged Ambiguities

- "Profile" and "saved connection" were both used for durable openable resources. Resolved: use **Connection** as the canonical term.
- "Session" was previously easy to confuse with a saved connection or visible tab. Resolved: a **Session** is live runtime state, while a **Tab** is only the frontend container.
