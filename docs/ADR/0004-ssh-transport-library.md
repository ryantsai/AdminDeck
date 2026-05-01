# ADR 0004: SSH Transport Library

## Status

Accepted

## Context

Milestone B needs an in-process SSH implementation for terminal channels,
authentication, host-key verification, resize events, and later SFTP reuse.
The existing Milestone A terminal path may launch the system `ssh` binary as a
debug/fallback path, but the product direction requires AdminDeck to own the
SSH lifecycle in Rust so host-key prompts, credentials, settings, and SFTP can
share one local trust model.

The library choice must fit AdminDeck's Apache-2.0 project, avoid GPL runtime
dependencies, work on Windows first, and leave room for macOS and Linux.

## Decision

Use `russh` as the primary SSH transport library for Milestone B.

Use `russh-sftp` as the first SFTP candidate when Milestone C needs SFTP over
the same Rust SSH direction.

Keep `ssh2` as a fallback candidate only if `russh` blocks a v0.1 requirement.
Keep system `ssh` as an explicit fallback/debug path, not the default SSH
implementation.

Current evaluated candidates:

- `russh` 0.60.2: Apache-2.0, Rust SSH client/server library.
- `russh-sftp` 2.1.2: Apache-2.0, SFTP client/server support for Russh.
- `ssh2` 0.9.5: MIT/Apache-2.0 bindings to libssh2.

## Consequences

AdminDeck can build SSH behavior around one in-process Rust transport instead
of shelling out for the main product path. Host-key verification, password
auth, key-file auth, terminal channel allocation, resize propagation, and SFTP
reuse can be implemented behind an AdminDeck transport boundary.

The primary risk is that `russh` may expose lower-level async APIs than the app
needs for early UX. If that blocks v0.1, revisit `ssh2` for a narrower client
implementation while preserving the same AdminDeck transport boundary.

The system `ssh` path remains useful for diagnostics and parity checks, but it
must not silently bypass AdminDeck's host-key or credential model in the primary
workflow.
