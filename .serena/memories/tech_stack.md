# Tech Stack & Structure

## Tech Stack
- **Language**: TypeScript (strict typing preferred)
- **Runtime**: Node.js (v18+)
- **APIs**: VS Code Extension API
- **Browser Automation**: `puppeteer-core`
- **Webview UI**: `lit-html`
- **Bundling**: Webpack
- **Communication**: WebSockets (`ws`), Chrome DevTools Protocol (CDP)
- **Testing**: Jest, Custom CLI Test Harness
- **Linting**: ESLint

## Codebase Structure
- `src/extension.ts`: Entry point, command registration, browser instance management.
- `src/screencastPanel.ts`: Webview panel management (multi-instance).
- `src/panelSocket.ts`: WebSocket proxy for CDP communication.
- `src/utils.ts`: Browser launching, CDP discovery, telemetry.
- `src/screencast/`: Webview UI components (main script, view templates, input handling).
- `src/common/`: Shared constants, settings provider, validation logic.
- `test/`: Jest unit tests and custom harness suites (unit, integration, e2e).
- `docs/`: Security audits and testing strategy documentation.
