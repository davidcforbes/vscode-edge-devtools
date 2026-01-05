# Testing Strategy

This document defines the multi-layer testing strategy for vscode-edge-devtools.
It aims to validate behavior across three components:
1) VS Code (extension host)
2) The extension itself
3) Microsoft Edge (CDP endpoint)

## Goals

- Catch regressions in core workflows (launch, attach, screencast, input).
- Validate cross-process behavior with real browsers and real WebSocket traffic.
- Provide deterministic logs and artifacts for triage.
- Keep fast feedback for unit-level changes.
- Track test plans, runs, and failures in Beads with a consistent, auditable schema.

## Test Levels

### 1) Static checks

- Lint: `npm run lint`
- Type checks: handled by build and tests

### 2) Jest unit tests (fast)

Scope: isolated unit tests for core logic.

Run:
```bash
npm test
```

### 3) Harness unit tests

Scope: unit tests using the harness runner framework.

Run:
```bash
npm run test:harness:unit
```

### 4) Harness integration tests

Scope: extension + mocks (no real VS Code UI, no real Edge).

Run:
```bash
npm run test:harness:integration
```

### 5) Real-browser integration tests

Scope: tests using real Edge with CDP (no VS Code orchestration).

Run:
```bash
npm run test:harness -- --suite=integration
```

Notes:
- Requires Microsoft Edge installed and discoverable.
- Tests are skipped if Edge is not found.

### 6) Orchestration E2E tests (VS Code + extension + Edge)

Scope: validates end-to-end behavior across VS Code, extension host, and Edge.

Prerequisites:
- Set `VSCODE_BIN` to a valid `code` binary path.
- Edge must be installed.

Run:
```bash
VSCODE_BIN=/path/to/code npm run test:harness -- --suite=e2e
```

## Beads-Based Test Management

Beads is used to track test plans, scripts, execution, and defects using issue conventions.
This repository treats tests as first-class work items with explicit dependencies.

### Beads Mapping Summary

Use these Beads types to represent test management artifacts:

| Test artifact | Beads type | Example title | Notes |
| --- | --- | --- | --- |
| Test plan | epic | `Test Plan: 3.0.1 Release` | Describes scope, environments, and exit criteria |
| Test script | story/task | `Test Script: PanelSocket reconnect` | Stable test definition with steps + expected results |
| Test step | task | `Test Step: Reconnect after disconnect` | Optional, only for complex/high-risk scripts |
| Test run/result | task | `Test Run: Webview/PanelSocket 2026-01-10` | Execution record with logs, env, build |
| Test failure | bug | `Bug: PanelSocket reconnect timeout` | Linked to run via `discovered-from` |

### Issue Types and Conventions

1) **Test plan (epic)**  
Use an epic to describe the overall test plan for a feature or release.
- Title: `Test Plan: <area or milestone>`  
- Type: `epic`  
- Description: scope, target branches/builds, environments, and exit criteria  
- Dependencies: parent of suites and runs

2) **Test suite (story or task)**  
Use a suite issue to group related test scripts.
- Title: `Test Suite: <area>`  
- Type: `task`  
- Labels: `test-suite`, `unit|integration|e2e`, `risk:p0|p1|p2`  
- Dependencies: depends on relevant test scripts

3) **Test script (story or task)**  
Each script is a stable, reusable test definition.
- Title: `Test Script: <short name>`  
- Type: `task`  
- Labels: `test-script`, `unit|integration|e2e`, `area:<name>`  
- Description format:
  - Preconditions
  - Steps (numbered)
  - Expected results
  - Data/setup references

4) **Test step (issue)**  
Use only when a script is complex or high-risk.
- Title: `Test Step: <short action>`  
- Type: `task`  
- Parent: the test script
- Description: single step + expected outcome

5) **Test run (task)**  
Each execution (e.g., nightly, release candidate) is a run issue.
- Title: `Test Run: <suite> <date/build>`  
- Type: `task`  
- Labels: `test-run`, `env:<name>`, `build:<sha>`  
- Dependencies: blocked by suite or by individual scripts  
- Notes: progress updates, artifact paths, summary

6) **Defect (bug)**  
Failures found during runs create bug issues.
- Title: `Bug: <failure summary>`  
- Type: `bug`  
- Labels: `regression` when applicable  
- Dependencies: use `discovered-from` to link to the test run or script  
- Description: observed vs expected, logs, repro steps

### Dependency Graph

Recommended chain:
```
Test Plan (epic)
  └─ Test Suite (task)
      └─ Test Script(s) (task)
          └─ Test Step(s) (task, optional)
              └─ Test Run (task)
                  └─ Bug(s) (bug, discovered-from)
```

### Status Workflow

- `open`: defined but not executed
- `in_progress`: actively executing a run or script
- `closed`: completed (script executed or run completed)

### Naming and Labels

Suggested labels:
- `test-plan`, `test-suite`, `test-script`, `test-run`
- `unit`, `integration`, `e2e`
- `area:<subsystem>` (e.g., `area:webview`)
- `risk:p0|p1|p2`
- `env:<env>` (e.g., `env:ci`, `env:local`)

### Beads CLI Examples

```bash
# Create a plan
bd create --title "Test Plan: 3.0.1 Release" --type epic --priority 2 --labels test-plan

# Create a suite and attach to the plan
bd create --title "Test Suite: Webview/PanelSocket" --type task --priority 2 --labels test-suite,integration
bd update <suite-id> --parent <plan-id>

# Create a script
bd create --title "Test Script: PanelSocket reconnect" --type task --priority 2 --labels test-script,integration

# Create a run (blocked by suite)
bd create --title "Test Run: Webview/PanelSocket 2026-01-10" --type task --priority 2 --labels test-run,env:ci,build:abc123
bd update <run-id> --deps blocks:<suite-id>

# Create a bug discovered during the run
bd create --title "Bug: PanelSocket reconnect timeout" --type bug --priority 1 --labels regression
bd update <bug-id> --deps discovered-from:<run-id>
```

### Capturing Results and Artifacts

- Store results in the run issue notes:
  - Summary (passed/failed)
  - Artifact paths (e.g., `test-logs/test-results.json`)
  - Key failures with links to bug IDs
- Keep scripts stable; failures should create bugs, not edit scripts.

### Automation Guidance

- CI can create or update test run issues and attach artifact links.
- Avoid creating a Beads issue per assertion; keep scope at script/run level.
- Use `bd ready` to surface the next runnable scripts or suites based on dependencies.

## Orchestration Harness

Orchestration helpers live at:
- `test/harness/orchestration/processManager.ts`
- `test/harness/orchestration/orchestrator.ts`

These helpers:
- Spawn VS Code and Edge processes.
- Capture per-process logs.
- Provide timeouts and controlled shutdown.

## Logging and Artifacts

- Harness logs are written per process under the orchestration log directory.
- Harness test results can be written as JSON with `--log-dir`.
- CI should collect logs and any captured screencast frames when tests fail.
- When `--log-dir` is set, harness runs also emit `cdp-trace.jsonl` for BrowserMock traffic.
- When screencast tests run, mock frames are written to `screencast-frames/` under the log directory.

## Recommended CI Gates

1) Lint + Jest unit tests
2) Harness unit + integration tests (run with `--log-dir=test-logs` for artifacts)
3) Real-browser integration tests (when Edge is available)
4) Orchestration E2E smoke test (Windows CI runs this by installing VS Code)

## Local Troubleshooting

- If Edge is not detected, confirm the correct Edge flavor is installed.
- If VS Code orchestration tests fail to launch, check `VSCODE_BIN`.
- Increase timeouts in orchestration tests if startup is slow on CI.
