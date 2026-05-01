# ADR 0003: Security and Privacy

## Status

Accepted

## Context

AdminDeck handles sensitive hostnames, usernames, SSH keys, passwords, passphrases, terminal commands, terminal output, and AI API keys. User trust is central to the product. The app is personal/local for v0.1, with no team vault or cloud sync.

## Decision

AdminDeck v0.1 will be local-first and privacy-first.

Storage decisions:

- Store non-secret data in SQLite.
- Store passwords, SSH passphrases, and AI API keys in the OS keychain.
- Reference SSH key files by path.
- Do not store private keys directly in AdminDeck v0.1.
- Do not store plaintext secrets in config or SQLite.

AI decisions:

- AI command assist is approval-based.
- Commands proposed by AI require explicit user approval before execution.
- Destructive or credential-touching commands should receive extra confirmation where detectable.
- OpenAI-compatible API keys are bring-your-own and stored in keychain.
- Claude Code CLI and Codex CLI integrations should be constrained to suggest-only/ask-before-execute where possible.

Telemetry decisions:

- No telemetry by default.
- No automatic crash upload in v0.1.
- Local structured logs only.
- Terminal contents are not logged by default.
- Provide a diagnostics bundle command with redaction rules.

Licensing decisions:

- AdminDeck app/core uses Apache-2.0.
- Prefer dependencies compatible with Apache-2.0/MIT/BSD/MPL-style use.
- Avoid GPL dependencies in the core runtime unless explicitly revisited.

## Consequences

The app avoids early cloud/data liability and gives users a clear local trust model. Some convenience features, such as sync, team vaults, and managed AI, are deferred until their security model can be designed deliberately.
