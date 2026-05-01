# ADR 0002: Technology Stack

## Status

Accepted

## Context

AdminDeck prioritizes high performance, fast startup, low idle memory, GPU-capable terminal rendering, and cross-platform desktop support. Electron would simplify embedded browser behavior, but it conflicts with the performance and package-size goals. A fully native UI per platform would slow delivery.

## Decision

Use:

- Tauri v2 for the desktop shell.
- Rust for core/backend functionality.
- React, TypeScript, and Vite for the frontend.
- Tailwind with strict CSS variable design tokens for styling.
- Radix UI or Ariakit for accessible UI primitives.
- lucide-react for icons.
- Zustand or TanStack Store for frontend state.
- Typed Tauri command wrappers for frontend/backend calls.
- SQLite for local non-secret data.
- OS keychain for secrets.

Terminal subsystem direction:

- Evaluate `alacritty_terminal` for terminal parsing/state.
- Evaluate `portable-pty` and lower-level platform options for PTY/session handling.
- Use a staged renderer plan: reliable terminal view for Milestone A, WGPU renderer path for Milestone B.
- Keep rendering behind an internal interface from the start.

SSH/SFTP direction:

- Use in-process Rust SSH/SFTP as the primary implementation.
- Evaluate `russh` first.
- Evaluate `ssh2` if needed.
- Keep system `ssh` as optional fallback/debug only.

## Consequences

The stack supports small native-feeling binaries, a Rust core, fast desktop iteration, and a future WGPU terminal renderer. The main risk is terminal rendering integration complexity inside Tauri. That risk is managed by isolating terminal state and rendering behind stable internal interfaces.
