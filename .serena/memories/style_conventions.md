# Coding Style & Conventions

- **TypeScript**: Use strict typing. Avoid `any`. Use interfaces for data structures.
- **Naming**: Descriptive names. Follow camelCase for variables/functions, PascalCase for classes/interfaces.
- **Error Handling**: Use `ErrorReporter.showErrorDialog` for user-facing errors. Define error codes in `src/common/errorCodes.ts`.
- **Settings**: Access settings through `SettingsProvider.instance`.
- **Telemetry**: Use `@vscode/extension-telemetry` via `telemetry.ts` helpers.
- **Comments**: Focus on *why*, not *what*. Only for complex logic.
- **UI**: Webview UI uses `lit-html`. Keep styles in `view.css`.
- **Modularity**: Commands in `extension.ts` should call into core services/classes.
