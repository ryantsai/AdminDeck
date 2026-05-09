# ADR 0005: Extension Platform Architecture

## Status

Accepted

## Context

Milestone G wants KKTerm to support user-installed extensions and to let the
AI Assistant help draft extensions. That cannot become a real creation or
installation flow until KKTerm defines the extension trust model first.

KKTerm is local-first and handles terminal commands, host metadata,
credentials, screenshots, SFTP paths, URL surfaces, and remote desktop surfaces.
Generated or user-installed code must not get broad access to those boundaries
by default.

## Decision

KKTerm extensions will start as signed-or-local user-installed packages with
a manifest, explicit permissions, isolated storage, and user-mediated lifecycle
actions.

An extension package contains:

- `kkterm.extension.json` manifest.
- extension source or bundled assets.
- optional UI contribution metadata.
- optional command contribution metadata.
- optional activation events.

The manifest declares:

- stable extension id.
- name, version, publisher, and description.
- requested KKTerm API version.
- activation events.
- UI contributions.
- command contributions.
- requested permissions.
- storage namespace.
- update source, if any.

Initial permission families:

- `connections:read`: read non-secret Connection metadata.
- `connections:write`: create or edit durable Connections.
- `workspace:read`: inspect active Tab and Pane metadata.
- `workspace:write`: open Tabs, focus Tabs, or arrange workspace surfaces.
- `terminal:propose-input`: stage terminal input for user approval.
- `sftp:read`: list SFTP paths from an active SFTP Session.
- `sftp:write`: stage upload, download, rename, delete, mkdir, chmod, or chown
  actions for user approval.
- `screenshot:request`: request explicit screenshot capture through the existing
  screenshot consent flow.
- `secrets:reference`: request secret presence by owner id, never raw secret
  values.
- `network:fetch`: perform outbound HTTP requests to declared origins.
- `storage:extension`: read and write the extension's own namespace.

Extensions cannot directly read terminal contents, raw screenshots, credentials,
AI API keys, SSH private keys, or arbitrary SQLite tables. Extensions cannot run
local commands, terminal input, SFTP write actions, install/update operations,
or other state-changing host actions without an KKTerm approval surface.

Install lifecycle:

- User chooses an extension package.
- KKTerm validates the manifest and package shape.
- KKTerm shows permissions, activation events, update source, and trust
  warnings.
- User explicitly approves install.
- KKTerm stores package metadata in SQLite and package files under an app
  data extension directory.
- Extension is disabled by default if manifest validation fails, permissions are
  unknown, or the package requests an unsupported API version.

Update lifecycle:

- Updates are user-mediated.
- An update can only request the same or narrower permissions silently in the
  review screen.
- New or broader permissions require explicit approval.
- Auto-install updates are deferred.

Execution model:

- Phase 1 extension execution is disabled until the runtime boundary is
  implemented.
- Phase 1 AI-generated extension output is draft-only: design, manifest,
  permissions, and source files for review.
- A future runtime should prefer an isolated process or webview worker boundary
  over in-process arbitrary code.
- Host APIs must be message-based and typed. Frontend calls still go through
  typed wrappers, and backend commands enforce permissions server-side.

Storage model:

- SQLite stores extension metadata, enabled/disabled state, granted permissions,
  install timestamps, update metadata, and non-secret extension settings.
- Each extension gets an isolated storage namespace.
- Secrets stay in the OS keychain and are referenced through existing owner ids
  or future extension-specific secret owners.
- Extension package files live under app data, outside the Connection and
  diagnostics data models.

AI Assistant integration:

- The Assistant may draft an extension manifest, permission request, source
  files, test plan, and review checklist.
- The Assistant must not claim generated code has been installed, enabled,
  loaded, executed, written to disk, or verified unless a future explicit
  approval flow performs that action.
- Any generated extension package must go through the same install review as a
  user-provided package.

## Consequences

The extension platform can grow without breaking KKTerm's local-first trust
model. The first user-visible AI work can help produce reviewable extension
drafts, while actual installable extension support remains gated by manifest
validation, permission review, isolated storage, and a runtime boundary.

This defers convenient one-click generated extension installation, but avoids
creating a privileged code execution path before permissions and lifecycle are
clear.
