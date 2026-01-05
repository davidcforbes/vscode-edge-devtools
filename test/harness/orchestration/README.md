# Orchestration Harness

This directory provides helpers for multi-process integration tests that span:
- VS Code (extension host)
- The extension under test
- Microsoft Edge (CDP endpoint)

## Environment variables

- `VSCODE_BIN`: Path to the `code` binary. If unset, `code` is used from PATH.

## Typical flow

1. Create an `OrchestrationHarness` with a dedicated log directory.
2. Launch VS Code with `extensionDevelopmentPath` and a workspace.
3. Launch Edge with a temporary user data directory.
4. Run attach/screencast validations.
5. Shut everything down and collect logs.

## Notes

- Use `readyPattern` to wait for VS Code readiness from logs.
- Logs are written to `<logDir>/<name>.log` for each process.
