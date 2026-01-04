# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Visual Studio Code extension that integrates Microsoft Edge Developer Tools directly into VS Code. It allows developers to inspect, debug, and modify web applications without leaving the editor.

**Key capabilities:**
- Browser preview with device emulation
- Live CSS editing with source map support
- Network inspection and console access
- WebSocket-based communication between VS Code and Edge DevTools
- Integration with VS Code's debugging infrastructure

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
npm test                 # Run all tests (linting + jest)
npm run lint             # Run ESLint only
```

To debug tests: Use the "Launch Tests" configuration in VS Code debugger (F5).

### Development Workflow
```bash
npm run build-debug      # Initial build
```

Then press F5 in VS Code and select "Launch Extension" to open an Extension Development Host window with the extension loaded.

For iterative development with a local Edge DevTools build:
```bash
npm run build-edge-watch # Watches for changes and points to localhost:3000
```

### Packaging
```bash
npm run package          # Creates vscode-edge-devtools.vsix
```

## Architecture

### Communication Flow

The extension uses a multi-layer architecture for communication between VS Code, the extension host, and the browser:

1. **Extension Host** (`src/extension.ts`)
   - Entry point that registers commands and providers
   - Manages browser lifecycle via puppeteer-core
   - Creates and manages DevToolsPanel and ScreencastPanel instances

2. **Panel Layer**
   - `DevToolsPanel`: Main DevTools webview panel with full tools (Elements, Console, Network, etc.)
   - `ScreencastPanel`: Browser preview panel with device emulation toolbar
   - Both use webviews to host the actual DevTools UI

3. **Socket Layer** (`src/panelSocket.ts`, `src/JsDebugProxyPanelSocket.ts`)
   - `PanelSocket`: WebSocket proxy between webview and Chrome DevTools Protocol (CDP)
   - `JsDebugProxyPanelSocket`: Alternative socket for integration with VS Code's js-debug extension
   - Handles message forwarding and event translation

4. **Webview Content**
   - `src/host/mainHost.ts`: Script running inside DevTools webview, routes messages
   - `src/screencast/`: Browser preview UI components (device toolbar, viewport)
   - Uses `MessageRouter` to coordinate communication between webview scripts and extension

### Key Components

**CDPTargetsProvider** (`src/cdpTargetsProvider.ts`)
- Tree view provider for the "Targets" sidebar
- Lists available browser tabs/targets from CDP
- Manages target connection lifecycle

**LaunchConfigManager** (`src/launchConfigManager.ts`)
- Handles launch.json configurations
- Provides debug configuration snippets
- Validates and processes user debug configs

**SettingsProvider** (`src/common/settingsProvider.ts`)
- Centralized access to extension settings
- Manages user preferences (hostname, port, userDataDir, etc.)

**Utils** (`src/utils.ts`)
- Browser launching and path resolution
- Source map path mapping
- Telemetry helpers
- CDP target discovery

### Build System

Webpack configuration (`webpack.config.js`) creates three separate bundles:
- **extension**: Main extension code (Node.js environment)
- **host**: DevTools webview script (browser environment)
- **screencast**: Browser preview webview script (browser environment)

Output goes to `out/` directory. Static assets (HTML, CSS) are copied during build.

### Testing

Tests use Jest with jsdom environment. Structure mirrors `src/` directory:
- Unit tests for each major component
- Mocks for VS Code API and WebSocket connections
- Test helpers in `test/helpers/`

## Important Patterns

### WebSocket Message Protocol
Communication between webviews and extension uses a custom protocol defined in `src/common/webviewEvents.ts`:
- Messages are encoded/decoded using `encodeMessageForChannel`/`parseMessageFromChannel`
- Event types: `ready`, `websocket`, `open`, `close`, `error`, `telemetry`, etc.
- Always handle both directions: webview → extension and extension → webview

### CSS Mirror Editing
The extension supports live CSS editing that syncs back to source files:
- CSS changes in DevTools trigger `cssMirrorContent` events
- Source maps resolve DevTools paths to workspace files
- Changes are applied via VS Code's TextEditor API
- Feature can be toggled via `getCSSMirrorContentEnabled()`/`setCSSMirrorContentEnabled()`

### Telemetry
All telemetry goes through `TelemetryReporter` from `@vscode/extension-telemetry`:
- Created in extension activation via `createTelemetryReporter()`
- Use `sendTelemetryEvent()` for events, `sendTelemetryErrorEvent()` for errors
- Properties and measures follow naming conventions (see `utils.ts`)

### Error Handling
Use `ErrorReporter` for consistent error reporting:
```typescript
ErrorReporter.showErrorDialog(ErrorCodes.BROWSER_LAUNCH_FAILED, error);
```

Error codes are defined in `src/common/errorCodes.ts`.

## CDP Integration

The extension connects to Microsoft Edge via the Chrome DevTools Protocol (CDP):
- Default connection: `localhost:9222` (configurable)
- Uses puppeteer-core to launch/connect to browser
- WebSocket connection to CDP target endpoints
- Supports both regular and js-debug proxied connections

When integrating with VS Code's debugger (`vscode-edge-devtools.debug` type), the extension can:
- Launch Edge with debugging enabled
- Attach to existing Edge instances
- Coordinate with js-debug extension for breakpoint support

## Source Map Handling

Path mapping is critical for source map support:
- `webRoot`: Maps URLs to workspace folders
- `pathMapping`: Custom URL → disk path mappings
- `sourceMapPathOverrides`: Webpack/bundler-specific overrides

Default mappings support webpack, meteor, and standard bundlers (see `package.json` configuration section).

## Extension Settings

Key settings (all prefixed with `vscode-edge-devtools.`):
- `hostname`/`port`/`useHttps`: CDP connection settings
- `defaultUrl`: URL to open when launching without target
- `browserFlavor`: Edge version (Default/Stable/Beta/Dev/Canary)
- `headless`: Launch in headless mode
- `webhint`: Enable/disable webhint integration
- `sourceMaps`: Enable/disable source map support

Settings are accessed via `SettingsProvider.instance` or directly via `vscode.workspace.getConfiguration()`.
