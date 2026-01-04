# CLI Test Harness Design

## Overview

A command-line test harness that enables automated testing of the VS Code Edge DevTools extension without requiring manual interaction with the VS Code UI. This enables CI/CD integration and faster development cycles.

## Goals

1. **Headless Testing:** Run all tests from command line
2. **CI/CD Integration:** Compatible with GitHub Actions, Azure Pipelines, etc.
3. **Fast Execution:** Parallel test execution where possible
4. **Comprehensive Coverage:** Unit, integration, and E2E tests
5. **Easy Debugging:** Clear error messages and test isolation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Test Runner                          │
│                  (test/harness/runner.ts)                    │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┬──────────────────┬──────────┐
        │                       │                  │          │
        ▼                       ▼                  ▼          ▼
┌───────────────┐   ┌──────────────────┐   ┌──────────┐  ┌──────────┐
│  Test Context │   │  Extension Mock  │   │  Browser │  │ Reporter │
│   Manager     │   │                  │   │  Mock    │  │          │
└───────────────┘   └──────────────────┘   └──────────┘  └──────────┘
        │                       │                  │          │
        │                       │                  │          │
        ▼                       ▼                  ▼          ▼
┌───────────────────────────────────────────────────────────────┐
│              Test Fixtures & Mocks                            │
│  - Mock VS Code API                                           │
│  - Mock CDP Responses                                         │
│  - Sample HTML Pages                                          │
│  - Mock Browser Instances                                     │
└───────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. CLI Test Runner (`test/harness/runner.ts`)

**Purpose:** Main entry point for running tests via CLI

**Responsibilities:**
- Parse command-line arguments
- Load test suites
- Execute tests in sequence or parallel
- Aggregate results
- Generate reports
- Exit with appropriate status code

**CLI Interface:**
```bash
# Run all tests
npm run test:harness

# Run specific test suite
npm run test:harness -- --suite=screencast

# Run with verbose output
npm run test:harness -- --verbose

# Run in watch mode
npm run test:harness -- --watch

# Generate coverage report
npm run test:harness -- --coverage

# Run E2E tests only
npm run test:harness -- --e2e

# Run with specific browser flavor
npm run test:harness -- --browser=canary

# Parallel execution
npm run test:harness -- --parallel=4
```

**Implementation:**
```typescript
// test/harness/runner.ts

import { TestContext } from './context';
import { TestReporter } from './reporter';
import { loadTestSuites } from './loader';

export interface RunnerOptions {
    suite?: string;
    verbose?: boolean;
    watch?: boolean;
    coverage?: boolean;
    e2e?: boolean;
    browser?: 'stable' | 'beta' | 'dev' | 'canary';
    parallel?: number;
}

export class TestRunner {
    private context: TestContext;
    private reporter: TestReporter;

    constructor(options: RunnerOptions) {
        this.context = new TestContext(options);
        this.reporter = new TestReporter(options);
    }

    async run(): Promise<void> {
        const suites = await loadTestSuites(this.context.options);

        try {
            await this.context.setup();

            for (const suite of suites) {
                await this.runSuite(suite);
            }

            this.reporter.printSummary();
            process.exit(this.reporter.hasFailures() ? 1 : 0);
        } catch (error) {
            this.reporter.printError(error);
            process.exit(1);
        } finally {
            await this.context.teardown();
        }
    }

    private async runSuite(suite: TestSuite): Promise<void> {
        this.reporter.startSuite(suite.name);

        for (const test of suite.tests) {
            await this.runTest(test);
        }

        this.reporter.endSuite(suite.name);
    }
}

// CLI entry point
if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    const runner = new TestRunner(options);
    runner.run();
}
```

---

### 2. Test Context Manager (`test/harness/context.ts`)

**Purpose:** Manages test environment setup and teardown

**Responsibilities:**
- Initialize test environment
- Create VS Code extension host mock
- Set up file system for tests
- Provide test utilities
- Clean up after tests

**Implementation:**
```typescript
// test/harness/context.ts

import * as vscode from 'vscode';
import { ExtensionMock } from './mocks/extension';
import { BrowserMock } from './mocks/browser';

export class TestContext {
    public extensionMock: ExtensionMock;
    public browserMock: BrowserMock;
    public workspaceFolder: string;

    constructor(public options: RunnerOptions) {
        this.workspaceFolder = path.join(__dirname, '../fixtures/workspace');
    }

    async setup(): Promise<void> {
        // Create temporary workspace
        await this.createWorkspace();

        // Initialize extension mock
        this.extensionMock = new ExtensionMock();
        await this.extensionMock.activate();

        // Initialize browser mock
        this.browserMock = new BrowserMock(this.options.browser);
        await this.browserMock.launch();
    }

    async teardown(): Promise<void> {
        await this.browserMock?.close();
        await this.extensionMock?.deactivate();
        await this.cleanWorkspace();
    }

    private async createWorkspace(): Promise<void> {
        // Create temp directory with test files
    }

    private async cleanWorkspace(): Promise<void> {
        // Clean up temp files
    }
}
```

---

### 3. Extension Mock (`test/harness/mocks/extension.ts`)

**Purpose:** Mock VS Code extension context for testing

**Responsibilities:**
- Provide mock VS Code API
- Simulate command execution
- Capture telemetry events
- Mock webview creation
- Track extension state

**Implementation:**
```typescript
// test/harness/mocks/extension.ts

import { EventEmitter } from 'events';

export class ExtensionMock extends EventEmitter {
    public commands: Map<string, Function> = new Map();
    public panels: WebviewPanelMock[] = [];
    public telemetryEvents: TelemetryEvent[] = [];

    async activate(): Promise<void> {
        // Mock activation
        global.vscode = this.createVSCodeMock();

        // Activate actual extension
        const extension = await import('../../out/extension');
        await extension.activate(this.createExtensionContext());
    }

    async deactivate(): Promise<void> {
        // Call extension deactivate
    }

    private createVSCodeMock() {
        return {
            commands: {
                registerCommand: (id: string, handler: Function) => {
                    this.commands.set(id, handler);
                    return { dispose: () => this.commands.delete(id) };
                },
                executeCommand: async (id: string, ...args: any[]) => {
                    const handler = this.commands.get(id);
                    if (!handler) throw new Error(`Command not found: ${id}`);
                    return await handler(...args);
                }
            },
            window: {
                createWebviewPanel: (viewType, title, showOptions, options) => {
                    const panel = new WebviewPanelMock(viewType, title, options);
                    this.panels.push(panel);
                    return panel;
                },
                showQuickPick: async (items) => items[0],
                showErrorMessage: (message) => this.emit('error', message),
                showInformationMessage: (message) => this.emit('info', message)
            },
            workspace: {
                getConfiguration: (section) => ({
                    get: (key, defaultValue) => defaultValue,
                    update: () => Promise.resolve()
                })
            }
        };
    }
}

class WebviewPanelMock extends EventEmitter {
    public visible = true;
    public active = true;
    public messages: any[] = [];

    constructor(
        public viewType: string,
        public title: string,
        public options: any
    ) {
        super();
    }

    get webview() {
        return {
            postMessage: (message: any) => {
                this.messages.push(message);
                this.emit('message', message);
            },
            onDidReceiveMessage: (handler: Function) => {
                this.on('receive', handler);
                return { dispose: () => this.off('receive', handler) };
            }
        };
    }

    reveal() { this.visible = true; }
    dispose() { this.emit('dispose'); }
}
```

---

### 4. Browser Mock (`test/harness/mocks/browser.ts`)

**Purpose:** Mock Edge browser instance for testing

**Responsibilities:**
- Simulate CDP connection
- Provide mock CDP responses
- Simulate page navigation
- Generate mock screenshots
- Track CDP protocol messages

**Implementation:**
```typescript
// test/harness/mocks/browser.ts

import { EventEmitter } from 'events';
import { Server as WebSocketServer } from 'ws';

export class BrowserMock extends EventEmitter {
    private wsServer: WebSocketServer;
    private cdpTargets: Map<string, CDPTargetMock> = new Map();
    public port = 9222;

    async launch(): Promise<void> {
        // Start WebSocket server to simulate CDP endpoint
        this.wsServer = new WebSocketServer({ port: this.port });

        this.wsServer.on('connection', (ws, req) => {
            const targetId = this.extractTargetId(req.url);
            const target = this.cdpTargets.get(targetId);

            if (target) {
                target.attachSocket(ws);
            }
        });

        // Create default target
        await this.createTarget('http://localhost:8080');
    }

    async createTarget(url: string): Promise<string> {
        const targetId = `target-${Date.now()}`;
        const target = new CDPTargetMock(targetId, url);
        this.cdpTargets.set(targetId, target);
        return targetId;
    }

    async close(): Promise<void> {
        for (const target of this.cdpTargets.values()) {
            await target.close();
        }
        this.wsServer?.close();
    }

    getTargetList(): any[] {
        return Array.from(this.cdpTargets.values()).map(t => ({
            id: t.id,
            type: 'page',
            title: t.title,
            url: t.url,
            webSocketDebuggerUrl: `ws://localhost:${this.port}/devtools/page/${t.id}`
        }));
    }
}

class CDPTargetMock extends EventEmitter {
    private socket?: WebSocket;
    private commandId = 0;

    constructor(
        public id: string,
        public url: string,
        public title = 'Test Page'
    ) {
        super();
    }

    attachSocket(socket: WebSocket): void {
        this.socket = socket;

        socket.on('message', (data) => {
            const message = JSON.parse(data.toString());
            this.handleCommand(message);
        });
    }

    private handleCommand(message: any): void {
        const { id, method, params } = message;

        // Simulate CDP responses
        switch (method) {
            case 'Page.navigate':
                this.url = params.url;
                this.sendResponse(id, { frameId: 'main-frame' });
                break;

            case 'Page.getLayoutMetrics':
                this.sendResponse(id, {
                    layoutViewport: { clientWidth: 1280, clientHeight: 720 }
                });
                break;

            case 'Page.captureScreenshot':
                this.sendResponse(id, {
                    data: Buffer.from('fake-screenshot').toString('base64')
                });
                break;

            case 'Runtime.evaluate':
                this.sendResponse(id, {
                    result: { type: 'string', value: 'mock result' }
                });
                break;

            default:
                this.sendResponse(id, {});
        }
    }

    private sendResponse(id: number, result: any): void {
        this.socket?.send(JSON.stringify({ id, result }));
    }

    close(): void {
        this.socket?.close();
    }
}
```

---

### 5. Test Reporter (`test/harness/reporter.ts`)

**Purpose:** Collect and display test results

**Responsibilities:**
- Track test execution
- Format output
- Generate reports (TAP, JUnit, JSON)
- Calculate coverage
- Print summary

**Implementation:**
```typescript
// test/harness/reporter.ts

export class TestReporter {
    private results: TestResult[] = [];
    private startTime: number;

    constructor(private options: RunnerOptions) {}

    startSuite(name: string): void {
        this.startTime = Date.now();
        if (this.options.verbose) {
            console.log(`\n📦 ${name}`);
        }
    }

    endSuite(name: string): void {
        const duration = Date.now() - this.startTime;
        if (this.options.verbose) {
            console.log(`✅ Completed in ${duration}ms\n`);
        }
    }

    recordTest(result: TestResult): void {
        this.results.push(result);

        const icon = result.passed ? '✅' : '❌';
        const message = result.passed
            ? `${icon} ${result.name}`
            : `${icon} ${result.name}\n   ${result.error}`;

        console.log(message);
    }

    printSummary(): void {
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;
        const failed = total - passed;

        console.log('\n' + '='.repeat(60));
        console.log(`\n📊 Test Summary:`);
        console.log(`   Total:  ${total}`);
        console.log(`   Passed: ${passed} ✅`);
        console.log(`   Failed: ${failed} ❌`);
        console.log('\n' + '='.repeat(60) + '\n');

        if (this.options.coverage) {
            this.printCoverage();
        }
    }

    hasFailures(): boolean {
        return this.results.some(r => !r.passed);
    }
}
```

---

## Test Suites

### Unit Tests

**Location:** `test/harness/suites/unit/`

**Coverage:**
- `screencast-panel.test.ts` - ScreencastPanel creation, disposal, navigation
- `panel-socket.test.ts` - WebSocket communication, reconnection
- `browser-launcher.test.ts` - Browser detection, launching, flavors
- `settings-provider.test.ts` - Settings access, validation

**Example:**
```typescript
// test/harness/suites/unit/screencast-panel.test.ts

import { TestSuite } from '../../types';

export const screencastPanelTests: TestSuite = {
    name: 'ScreencastPanel Unit Tests',
    tests: [
        {
            name: 'should create panel with correct title',
            async run(context) {
                await context.extensionMock.executeCommand('vscode-edge-devtools.launch');

                const panels = context.extensionMock.panels.filter(
                    p => p.viewType === 'vscode-edge-devtools.screencastPanel'
                );

                assert.equal(panels.length, 1);
                assert.equal(panels[0].title, 'Browser');
            }
        },
        {
            name: 'should dispose panel on close',
            async run(context) {
                await context.extensionMock.executeCommand('vscode-edge-devtools.launch');
                const panel = context.extensionMock.panels[0];

                let disposed = false;
                panel.on('dispose', () => disposed = true);

                panel.dispose();
                assert.equal(disposed, true);
            }
        }
    ]
};
```

---

### Integration Tests

**Location:** `test/harness/suites/integration/`

**Coverage:**
- `browser-launch-attach.test.ts` - Full launch → attach → navigate flow
- `multi-instance.test.ts` - Multiple browser management
- `command-execution.test.ts` - All commands with real CDP

**Example:**
```typescript
// test/harness/suites/integration/browser-launch-attach.test.ts

export const browserLaunchTests: TestSuite = {
    name: 'Browser Launch Integration Tests',
    tests: [
        {
            name: 'should launch browser and attach',
            async run(context) {
                // Execute launch command
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:8080' }
                );

                // Wait for panel creation
                await context.waitForPanel('screencastPanel');

                // Verify CDP connection
                const socket = context.extensionMock.getActiveSocket();
                assert.equal(socket.isConnected, true);

                // Verify target URL
                assert.equal(socket.targetUrl, 'http://localhost:8080');
            }
        }
    ]
};
```

---

### E2E Tests

**Location:** `test/harness/suites/e2e/`

**Coverage:**
- `user-workflow.test.ts` - Complete user scenarios
- `multi-browser-workflow.test.ts` - Multi-instance workflows
- `navigation.test.ts` - Back/forward/reload scenarios

**Example:**
```typescript
// test/harness/suites/e2e/multi-browser-workflow.test.ts

export const multiBrowserTests: TestSuite = {
    name: 'Multi-Browser E2E Tests',
    tests: [
        {
            name: 'should manage 5 browser instances independently',
            async run(context) {
                const urls = [
                    'http://example.com',
                    'http://google.com',
                    'http://github.com',
                    'http://stackoverflow.com',
                    'http://npmjs.com'
                ];

                // Launch 5 instances
                for (const url of urls) {
                    await context.extensionMock.executeCommand(
                        'vscode-edge-devtools.launch',
                        { launchUrl: url }
                    );
                }

                // Verify 5 panels created
                const panels = context.extensionMock.panels;
                assert.equal(panels.length, 5);

                // Verify each has correct URL
                for (let i = 0; i < 5; i++) {
                    const socket = context.extensionMock.getSockets()[i];
                    assert.equal(socket.targetUrl, urls[i]);
                }

                // Close individual instance
                panels[2].dispose();

                // Verify 4 remain
                await context.wait(100);
                assert.equal(context.extensionMock.panels.length, 4);

                // Close all remaining instances
                for (const panel of context.extensionMock.panels) {
                    panel.dispose();
                }

                await context.wait(100);
                assert.equal(context.extensionMock.panels.length, 0);
            }
        }
    ]
};
```

---

## Test Fixtures

### Mock HTML Pages

**Location:** `test/fixtures/pages/`

```html
<!-- test/fixtures/pages/simple.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Test Page</title>
</head>
<body>
    <h1>Test Page</h1>
    <p id="content">Content</p>
    <script>
        console.log('Test page loaded');
    </script>
</body>
</html>
```

### Mock CDP Responses

**Location:** `test/fixtures/cdp/`

```json
// test/fixtures/cdp/page-navigate.json
{
    "id": 1,
    "result": {
        "frameId": "main-frame",
        "loaderId": "test-loader"
    }
}
```

---

## package.json Scripts

```json
{
    "scripts": {
        "test:harness": "node out/test/harness/runner.js",
        "test:harness:unit": "npm run test:harness -- --suite=unit",
        "test:harness:integration": "npm run test:harness -- --suite=integration",
        "test:harness:e2e": "npm run test:harness -- --e2e",
        "test:harness:watch": "npm run test:harness -- --watch",
        "test:harness:coverage": "npm run test:harness -- --coverage",
        "test:all": "npm run test && npm run test:harness"
    }
}
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20]

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}

      - run: npm ci
      - run: npm run build
      - run: npm run test:harness

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## Implementation Checklist

- [ ] Create test/harness directory structure
- [ ] Implement TestRunner with CLI argument parsing
- [ ] Implement TestContext with setup/teardown
- [ ] Implement ExtensionMock with VS Code API mocks
- [ ] Implement BrowserMock with CDP simulation
- [ ] Implement TestReporter with multiple formats
- [ ] Create unit test suites
- [ ] Create integration test suites
- [ ] Create E2E test suites
- [ ] Create test fixtures (HTML, CDP responses)
- [ ] Add npm scripts
- [ ] Configure CI/CD pipeline
- [ ] Document usage in README

---

## Benefits

1. **Fast Feedback:** Run tests in seconds without UI
2. **CI/CD Ready:** Automated testing in pipelines
3. **Debugging:** Isolate issues with verbose mode
4. **Coverage:** Track test coverage metrics
5. **Reproducible:** Consistent results across environments
6. **Parallel:** Run tests concurrently for speed

---

## Future Enhancements

- **Visual Regression Testing:** Screenshot comparison
- **Performance Benchmarking:** Track metrics over time
- **Mutation Testing:** Test the tests
- **Fuzz Testing:** Random input generation
- **Load Testing:** Stress test with many instances
