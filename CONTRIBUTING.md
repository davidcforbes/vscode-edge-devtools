# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

Contributions are always welcome! We only ask that you open an issue first so we can discuss the problem and solution. We don't want you to waste any time headed in the wrong direction.

## About This Extension

This extension is a **lightweight browser viewer** for VS Code that lets you view and interact with web applications inside your editor using Microsoft Edge. The extension has been streamlined (v3.0+) to focus on browser viewing with multi-instance support, moving away from the previous full DevTools integration.

**Architecture Overview:**
- **Browser Viewing**: Screencast-based browser preview with device emulation
- **Multi-Instance**: Support for multiple independent browser windows
- **CDP Integration**: WebSocket-based Chrome DevTools Protocol communication
- **Simple Codebase**: ~700 lines of core code for easy contribution

For detailed architecture information, see [CLAUDE.md](CLAUDE.md).

## Development Setup

### Prerequisites
- Node.js (v18 or later recommended)
- Microsoft Edge installed on your system
- Visual Studio Code

### Quick Start

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/Microsoft/vscode-edge-devtools.git
   cd vscode-edge-devtools
   npm install
   ```

2. **Build the extension**
   ```bash
   npm run build          # One-time build
   npm run watch          # Watch mode for development
   ```

3. **Launch in VS Code**
   - Open the directory in VS Code
   - Select `Launch Extension` debug configuration (F5)
   - A new VS Code window will open with the extension loaded
   - Use Command Palette (`Ctrl+Shift+P`) → "Microsoft Edge Tools: Launch Browser"

### Build Commands

- `npm run build` - Production build with webpack
- `npm run build-debug` - Development build with source maps
- `npm run watch` - Watch mode for iterative development
- `npm run lint` - Run ESLint on TypeScript files
- `npm run build-and-lint` - Build and then lint

### Recommended VS Code Extensions

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) - JavaScript/TypeScript linting
- [Code Spell Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker) - Spelling checker

## Testing

The extension uses two testing approaches:

### 1. Jest Unit Tests

Legacy jest tests for basic functionality:

```bash
npm run test           # Run all jest tests
npm run lint          # Check code against ESLint rules
```

### 2. CLI Test Harness (Recommended)

The CLI test harness provides a more comprehensive testing environment with:
- Extension activation simulation
- WebView panel mocking
- Real extension command execution
- Unit and integration test suites

**Available Commands:**

```bash
npm run test:harness              # Run all test suites
npm run test:harness:unit         # Run unit tests only
npm run test:harness:integration  # Run integration tests only
npm run test:harness:watch        # Watch mode for development
npm run test:harness:coverage     # Generate coverage reports
```

**Test Structure:**

Tests are located in `test/harness/suites/`:
- `unit/` - Unit tests for individual components
- `integration/` - Integration tests for workflows

**Writing Tests:**

See `test/harness/suites/unit/screencast-panel.test.ts` for examples:

```typescript
export const suite: TestSuite = {
    name: 'My Test Suite',
    tests: [
        {
            name: 'should do something',
            async run(context) {
                // Test implementation
                const result = await context.extensionMock.executeCommand('...');
                if (!result) {
                    throw new Error('Test failed');
                }
            }
        }
    ]
};
```

### Debugging Tests

**Jest Tests:**
- Open VS Code debugger
- Select `Launch Tests` configuration
- Press `F5` to attach debugger

**CLI Harness Tests:**
- Tests run in Node.js environment
- Use standard debugging tools or console.log
- Check test output for detailed error messages

## Code Structure

```
src/
├── extension.ts           # Extension entry point, command registration
├── screencastPanel.ts     # WebView panel management, multi-instance tracking
├── panelSocket.ts         # WebSocket proxy for CDP communication
├── common/
│   ├── telemetry.ts       # Telemetry reporter
│   └── webviewEvents.ts   # Message encoding/decoding
└── screencast/
    ├── main.ts            # Screencast webview entry
    ├── screencast.ts      # CDP connection, UI event handling
    ├── view.ts            # HTML template with URL bar and toolbar
    └── view.css           # Webview styling
```

## Making Contributions

### Before You Start

1. **Open an issue** to discuss the problem and proposed solution
2. **Check existing issues** to avoid duplicate work
3. **Read the architecture** in CLAUDE.md to understand the codebase

### Development Workflow

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run tests: `npm run test:harness`
4. Run linter: `npm run lint`
5. Build: `npm run build`
6. Test manually in VS Code extension host (F5)
7. Commit with clear messages
8. Push and create a pull request

### Code Guidelines

- **TypeScript**: Use strict typing, avoid `any` when possible
- **ESLint**: Follow existing ESLint configuration
- **Naming**: Use descriptive names, follow existing conventions
- **Comments**: Add comments for complex logic, avoid obvious comments
- **Testing**: Add tests for new features, update tests for changes

### What We're Looking For

**Great Contributions:**
- Bug fixes with test cases
- Browser viewing improvements (performance, UX)
- Multi-instance enhancements
- Device emulation features
- Documentation improvements
- Test coverage improvements

**Not Looking For:**
- Full DevTools integration (removed in v3.0)
- CSS mirroring features (removed in v3.0)
- Debugging features (use VS Code's debugger instead)

See [MIGRATION.md](MIGRATION.md) for context on v3.0 changes.

## Issue tags
* "Bug": Something that should work is broken
* "Enhancement": AKA feature request - adds new functionality
* "Task": Something that needs to be done that doesn't really fix anything or add major functionality. Tests, engineering, documentation, etc.
