# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a lightweight Visual Studio Code extension that provides browser preview functionality using Microsoft Edge. It allows developers to view and interact with web applications directly inside VS Code without switching to external browser windows.

**Key capabilities:**
- Browser preview with device emulation toolbar
- Multiple independent browser instances
- WebSocket-based communication via Chrome DevTools Protocol (CDP)
- Integrated browser management commands
- Minimal footprint (~700 lines of core code)

**What this extension is NOT:**
- Not a full DevTools integration (no Elements, Console, Network panels)
- Not a debugging tool (no breakpoints, no debugger protocol)
- Not a CSS live-editing tool (no source map sync)
- Not a webhint integration

The extension has been deliberately simplified from a full DevTools integration to focus solely on browser preview and multi-instance management.

## Development Commands

### Building
```bash
npm install              # Install dependencies
npm run build            # Production build
npm run build-debug      # Development build with source maps
npm run build-watch      # Development build with auto-rebuild on changes
```

### Testing
```bash
npm test                       # Run Jest unit tests with linting
npm run lint                   # Run ESLint only

# CLI Test Harness (custom test runner)
npm run test:harness           # Run all test suites
npm run test:harness:unit      # Run unit tests only
npm run test:harness:integration  # Run integration tests only
npm run test:harness:e2e       # Run E2E tests only
```

Jest tests (unit tests for components):
- `test/screencastPanel.test.ts` - ScreencastPanel unit tests
- `test/panelSocket.test.ts` - PanelSocket unit tests
- `test/extension.test.ts` - Extension activation tests
- `test/utils.test.ts` - Utility function tests

CLI Harness tests (integration and E2E):
- `test/harness/suites/unit/` - Unit tests in harness format
- `test/harness/suites/integration/` - Integration tests (command registration, panel creation)
- `test/harness/suites/e2e/` - End-to-end tests (browser mock workflows)

To debug tests: Use the "Launch Tests" configuration in VS Code debugger (F5).

### Development Workflow
```bash
npm run build-debug      # Initial build
```

Then press F5 in VS Code and select "Launch Extension" to open an Extension Development Host window with the extension loaded.

### Packaging
```bash
npm run package          # Creates vscode-edge-devtools.vsix
```

## Architecture

### Simplified Design

The extension follows a minimal architecture focused on browser preview:

```
┌─────────────────────────────────────────────────────────────┐
│                     VS Code Extension Host                   │
│                                                               │
│  ┌────────────────┐         ┌──────────────────────────┐    │
│  │  extension.ts  │────────>│  ScreencastPanel[]       │    │
│  │                │         │  (multi-instance)        │    │
│  │  - Commands    │         └──────────┬───────────────┘    │
│  │  - Browser     │                    │                     │
│  │    Management  │                    │                     │
│  └────────────────┘                    │                     │
│                                        │                     │
│                           ┌────────────▼──────────────┐      │
│                           │    PanelSocket            │      │
│                           │    (WebSocket proxy)      │      │
│                           └────────────┬──────────────┘      │
└────────────────────────────────────────┼───────────────────┘
                                         │
                                         │ WebSocket
                                         ▼
                              ┌──────────────────────┐
                              │  Microsoft Edge      │
                              │  (via CDP)           │
                              │  localhost:9222      │
                              └──────────────────────┘
```

### Core Components

**Extension Host** (`src/extension.ts`)
- Entry point that registers commands
- Manages browser lifecycle via puppeteer-core
- Tracks multiple ScreencastPanel instances
- Provides commands for multi-instance management:
  - `vscode-edge-devtools.launch` - Launch new browser with URL
  - `vscode-edge-devtools.attach` - Attach to running browser
  - `vscode-edge-devtools.newBrowserWindow` - Create new browser instance
  - `vscode-edge-devtools.listOpenBrowsers` - Show all open browsers
  - `vscode-edge-devtools.switchToBrowser` - Switch to specific browser
  - `vscode-edge-devtools.closeCurrentBrowser` - Close active browser

**ScreencastPanel** (`src/screencastPanel.ts`)
- Webview panel that displays browser preview
- Multi-instance support (no longer a singleton)
- Manages device emulation toolbar
- Handles panel lifecycle (create, reveal, dispose)
- Each panel tracks its own target URL and browser connection

**PanelSocket** (`src/panelSocket.ts`)
- WebSocket proxy between webview and CDP
- Forwards messages bidirectionally
- Handles connection lifecycle
- No debugging protocol integration (simplified from original)

**Utils** (`src/utils.ts`)
- Browser launching via puppeteer-core
- CDP target discovery
- Telemetry helpers
- Browser flavor detection (Stable/Beta/Dev/Canary)

**SettingsProvider** (`src/common/settingsProvider.ts`)
- Centralized access to extension settings
- Settings: hostname, port, defaultUrl, browserFlavor, headless, userDataDir
- No longer manages debug/webhint/sourcemap settings

**ErrorReporter** (`src/errorReporter.ts`)
- Consistent error reporting to users
- Error codes defined in `src/common/errorCodes.ts`

### Webview Content (`src/screencast/`)

The screencast directory contains the browser preview UI:
- `main.ts` - Entry point for webview script
- `screencast.ts` - Main screencast controller
- `view.ts` - Viewport rendering
- `input.ts` - Mouse/keyboard input handling
- `emulatedDevices.ts` - Device profiles (iPhone, iPad, etc.)
- `dimensionComponent.ts` - Device size selection UI
- `flyoutMenuComponent.ts` - Toolbar menu component
- `infobar.ts` - Status/info bar
- `cdp.ts` - CDP message handling

### Build System

Webpack configuration (`webpack.config.js`) creates two bundles:
- **extension**: Main extension code (Node.js environment)
- **screencast**: Browser preview webview script (browser environment)

Output goes to `out/` directory. Static assets (HTML, CSS, images) are copied during build.

### Testing Infrastructure

**Jest Unit Tests** (`test/*.test.ts`)
- Fast, isolated tests for individual components
- Mocks for VS Code API and WebSocket connections
- Use jsdom for DOM operations
- Run with `npm test`

**CLI Test Harness** (`test/harness/`)
- Custom ES module-based test runner
- Comprehensive mocking infrastructure:
  - `ExtensionMock` - Mocks VS Code API and activates real extension
  - `BrowserMock` - Simulates CDP endpoint with WebSocket server
  - `TestContext` - Manages test environment setup/teardown
- Three test levels:
  - **Unit**: Component-level tests in harness format
  - **Integration**: Command registration, panel creation, extension activation
  - **E2E**: Browser mock workflows, multi-instance scenarios
- Run with `npm run test:harness:*` commands

See `test/harness/DESIGN.md` for detailed test harness architecture.

## Multi-Instance Pattern

The extension supports multiple simultaneous browser instances. Key implementation details:

**Instance Tracking** (`src/extension.ts`)
```typescript
const panels: Map<string, ScreencastPanel> = new Map();
```
- Each panel is keyed by target URL
- Commands can create, switch, list, and close panels
- Only one panel is active (visible) at a time

**Panel Creation**
```typescript
const panel = await ScreencastPanel.createOrShow(
  context,
  telemetryReporter,
  websocketUrl
);
panels.set(targetUrl, panel);
```

**Cleanup**
- Panels auto-remove from map on disposal
- Browser processes managed independently by puppeteer-core
- No shared state between instances

## CDP Integration

The extension connects to Microsoft Edge via the Chrome DevTools Protocol (CDP):
- Default connection: `localhost:9222` (configurable via settings)
- Uses puppeteer-core to launch browser instances
- Each ScreencastPanel connects to a specific CDP target
- WebSocket connection for bidirectional communication

**No debugging integration**: The extension does NOT integrate with VS Code's debugger or js-debug extension. It only uses CDP for browser preview and navigation.

## Extension Settings

Key settings (all prefixed with `vscode-edge-devtools.`):
- `hostname`: CDP endpoint hostname (default: `localhost`)
- `port`: CDP endpoint port (default: `9222`)
- `useHttps`: Use HTTPS for CDP connection (default: `false`)
- `defaultUrl`: URL to open when launching without target (default: `about:blank`)
- `browserFlavor`: Edge version - `Default`, `Stable`, `Beta`, `Dev`, or `Canary`
- `headless`: Launch in headless mode (default: `false`)
- `userDataDir`: Custom user data directory path (default: temporary directory)

**Removed settings** (from previous DevTools version):
- ~~`webhint`~~ - Feature removed
- ~~`sourceMaps`~~ - Feature removed
- ~~Debug configurations~~ - No longer supported

Settings are accessed via `SettingsProvider.instance` singleton.

## Telemetry

Telemetry uses `@vscode/extension-telemetry`:
- Created in extension activation via `createTelemetryReporter()`
- Use `sendTelemetryEvent()` for events
- Use `sendTelemetryErrorEvent()` for errors
- All telemetry respects user's VS Code telemetry settings

Common events:
- `command/launch` - Browser launch
- `command/attach` - Attach to browser
- `user/settingsChangedAtLaunch` - Settings snapshot at launch
- `workspace/metadata` - Workspace file counts

## Error Handling

Use `ErrorReporter` for user-facing errors:
```typescript
import { ErrorReporter } from './errorReporter';
import { ErrorCodes } from './common/errorCodes';

ErrorReporter.showErrorDialog({
  errorCode: ErrorCodes.BROWSER_LAUNCH_FAILED,
  title: 'Failed to launch browser',
  message: error.message
});
```

Error codes are defined in `src/common/errorCodes.ts`.

## WebSocket Message Protocol

Communication between webview and extension uses protocol defined in `src/common/webviewEvents.ts`:

**Message Types:**
- `ready` - Webview initialization complete
- `websocket` - CDP message forwarding
- `open` - WebSocket connection opened
- `close` - WebSocket connection closed
- `error` - Error occurred
- `telemetry` - Telemetry event from webview

**Encoding/Decoding:**
- `encodeMessageForChannel()` - Prepare message for webview
- `parseMessageFromChannel()` - Parse message from webview

Always handle messages in both directions (webview ↔ extension).

## Code Organization

```
src/
├── extension.ts              # Extension entry point, commands, instance management
├── screencastPanel.ts        # Browser preview panel (multi-instance)
├── panelSocket.ts            # WebSocket proxy for CDP
├── utils.ts                  # Browser launching, CDP discovery, telemetry
├── errorReporter.ts          # User-facing error reporting
├── debugTelemetryReporter.ts # Telemetry wrapper
├── common/
│   ├── errorCodes.ts         # Error code constants
│   ├── settingsProvider.ts   # Extension settings management
│   └── webviewEvents.ts      # WebSocket message protocol
└── screencast/               # Webview UI components
    ├── main.ts               # Webview entry point
    ├── screencast.ts         # Main controller
    ├── view.ts               # Viewport rendering
    ├── input.ts              # Input handling
    ├── cdp.ts                # CDP message handling
    ├── emulatedDevices.ts    # Device profiles
    ├── emulatedDeviceHelpers.ts
    ├── dimensionComponent.ts # Device selector
    ├── flyoutMenuComponent.ts # Toolbar menu
    └── infobar.ts            # Info bar

test/
├── *.test.ts                 # Jest unit tests
├── helpers/                  # Test utilities
└── harness/                  # CLI test harness
    ├── runner.ts             # Test runner
    ├── loader.ts             # Test suite loader
    ├── reporter.ts           # Test reporter
    ├── context.ts            # Test environment
    ├── types.ts              # Test types
    ├── mocks/
    │   ├── extension.ts      # VS Code API mock
    │   └── browser.ts        # CDP browser mock
    └── suites/
        ├── unit/
        ├── integration/
        └── e2e/
```

## Common Tasks

### Adding a new command

1. Register in `package.json` under `contributes.commands`
2. Implement handler in `src/extension.ts`
3. Register with `vscode.commands.registerCommand()` in `activate()`
4. Add integration test in `test/harness/suites/integration/`

### Adding a new setting

1. Add to `package.json` under `contributes.configuration.properties`
2. Add getter to `SettingsProvider` in `src/common/settingsProvider.ts`
3. Use via `SettingsProvider.instance.getYourSetting()`

### Modifying browser preview UI

1. Edit files in `src/screencast/`
2. Changes require rebuild: `npm run build-watch`
3. Reload extension in development host (Ctrl+R)

### Adding tests

**Jest unit test:**
1. Create `test/yourComponent.test.ts`
2. Mock VS Code API as needed (see existing tests)
3. Run with `npm test`

**CLI harness test:**
1. Create test suite in `test/harness/suites/[unit|integration|e2e]/`
2. Export `TestSuite` object with `name` and `tests` array
3. Each test has `name` and async `run(context)` function
4. Run with `npm run test:harness` or specific suite command

## Migration Notes

This extension was significantly simplified from a full DevTools integration. If you're looking for removed features:

**Removed Features:**
- Full DevTools panels (Elements, Console, Network, Sources, etc.)
- Debugging integration (breakpoints, debugger protocol)
- CSS mirror editing (live sync to source files)
- Webhint integration
- Source map support beyond basic display
- CDPTargetsProvider tree view
- Launch.json debug configurations
- VS Code debugger integration

**Why simplified?**
The goal was to create a lightweight browser preview tool focused on viewing and device emulation, reducing complexity from ~4750 lines to ~700 lines of core code (85% reduction).

**For full DevTools:** Use the official "Elements for Microsoft Edge" extension or Edge's built-in DevTools.

## Troubleshooting

**Extension doesn't activate:**
- Check Output panel → "Extension Host" for errors
- Verify all dependencies installed: `npm install`
- Rebuild: `npm run build`

**Browser doesn't launch:**
- Verify Microsoft Edge is installed
- Check browser flavor setting matches installed version
- Ensure port 9222 is not in use
- Check firewall/antivirus settings

**Tests fail:**
- Ensure all dependencies installed: `npm install`
- Rebuild test files: `npm run build`
- For CLI harness tests: `npx tsc` to compile test TypeScript files

**Multiple instances not working:**
- Use "New Browser Window" command, not "Launch Browser" repeatedly
- Check panels map in extension.ts for instance tracking
- Verify no errors in Output panel

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and pull request process.

## Resources

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Puppeteer Core Documentation](https://pptr.dev/)
- [Official Extension Documentation](https://learn.microsoft.com/microsoft-edge/visual-studio-code/microsoft-edge-devtools-extension)
