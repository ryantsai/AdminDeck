# Claude Instructions

Follow `AGENTS.md` for repository workflow and `CONTEXT.md` for product language.

## Critical Domain Boundaries

- **Connection** is durable SQLite data for something the user can open, including local terminal, SSH terminal, URL, RDP, and VNC kinds.
- **Quick Connect** is an unsaved draft that starts a live session.
- **Session** is live runtime state for a local process, SSH channel, or SFTP browser.
- **Tab** is frontend workspace UI, not a backend domain object.

When discussing or changing the app, keep these concepts separate. If new terminology appears to conflict with `CONTEXT.md`, pause and resolve the term before implementing.
