# AdminDeck Context

AdminDeck is a local-first desktop administration workspace for terminal, SSH, SFTP, and approval-based command assistance workflows. This context captures the product language used to keep storage, runtime session handling, and UI workspace concepts distinct.

## Language

**Connection**:
A durable openable resource stored in SQLite. The supported kinds are local terminal, SSH terminal, and URL (an embedded WebView2 browser surface targeting a single http(s) origin). SFTP is opened from an SSH Connection and is not stored as a standalone Connection.
_Avoid_: Profile, saved session, host entry

SSH Connections may persist non-secret tmux launch preferences, including whether AdminDeck should start terminal Panes inside named tmux sessions. The remote tmux process itself remains live Session/runtime state and is not the durable Connection.

**URL Connection**:
A Connection of kind `url`. It stores an http(s) URL plus an optional `dataPartition` label. The address bar accepts hosts without a scheme; the backend assumes `https://` when no scheme is present. The `dataPartition` field is persisted but currently a no-op: WebView2 enforces one user-data folder per process, so all URL Connections share the host app's WebView2 cookie/storage in Phase 1. Real per-Connection isolation is deferred until Phase 2 explores out-of-process WebView2 environments.
_Avoid_: Web tab, browser bookmark, URL profile

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
