# Suggested Commands

## Setup & Build
- `npm install`: Install dependencies.
- `npm run build`: Production build.
- `npm run build-debug`: Development build with source maps.
- `npm run watch`: Watch mode for iterative development.

## Quality & Testing
- `npm run lint`: Run ESLint.
- `npm run test`: Run Jest unit tests.
- `npm run test:harness`: Run all harness test suites.
- `npm run test:harness:unit`: Run harness unit tests.
- `npm run test:harness:integration`: Run harness integration tests.
- `npm run test:harness:e2e`: Run harness E2E tests (requires `VSCODE_BIN`).
- `npm run test:all`: Run both Jest and harness tests.

## Packaging
- `npm run package`: Create `.vsix` package.

## Issue Tracking (Beads)
- `bd list`: List all issues.
- `bd ready`: Show unblocked issues ready for work.
- `bd show <id>`: Show issue details.
- `bd update <id> --status in_progress`: Claim an issue.
- `bd close <id>`: Close an issue.
- `bd sync`: Synchronize beads state with git.
