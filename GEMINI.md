# GEMINI.md

This file provides guidance to Gemini (or other AI agents) when working with code in this repository.

## Project Overview

This is a lightweight Visual Studio Code extension for browser preview functionality using Microsoft Edge.

## Tech Stack
- **TypeScript**: Strict typing (avoid `any`).
- **Puppeteer Core**: Browser management.
- **Websockets**: CDP communication.
- **Lit-html**: Webview rendering.
- **Webpack**: Bundling.
- **Jest & Custom Harness**: Testing.

## Key Development Commands
- `npm run build`: Production build.
- `npm run build-debug`: Development build (source maps).
- `npm run watch`: Auto-rebuild on changes.
- `npm run lint`: ESLint check.
- `npm test`: Jest unit tests.
- `npm run test:harness`: CLI test harness (unit/integration/E2E).
- `npm run test:all`: Run all tests.

## Issue Tracking (Beads)
This project uses **bd** (beads) for issue tracking.
- `bd ready`: Find actionable work.
- `bd list`: List all issues.
- `bd show <id>`: Issue details.
- `bd update <id> --status in_progress`: Start working.
- `bd close <id>`: Finish work.
- `bd sync`: Sync beads with git.

## Session Completion Protocol (MANDATORY)
You MUST complete these steps before ending a session:
1. **Verify**: `npm run build` && `npm run lint` && `npm run test:harness:unit`.
2. **Issue State**: Update Beads status (`bd update` / `bd close`).
3. **Commit**: `git add .` && `git commit -m "..."`.
4. **Beads Sync**: `bd sync`.
5. **Push**: `git push`. **NEVER** leave work unpushed.

## Architecture & Code Style
Refer to `CLAUDE.md` for detailed component architecture and `style_conventions.md` (memory) for coding standards.
- Use `ErrorReporter` for user errors.
- Use `SettingsProvider` for settings access.
- Avoid `any` types.

## Operational Notes
- **Shell Tools**: If `run_shell_command` stalls, prefer `execute_shell_command`.
- **Keybindings**: The `Ctrl+F` shortcut for terminal focus is currently hardcoded in the Gemini CLI and cannot be changed via `settings.json`. Workaround: Remap VS Code Find widget or use `sendSequence` keybinding.
