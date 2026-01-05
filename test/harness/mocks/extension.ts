// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as vscode from 'vscode';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TelemetryEvent {
    name: string;
    properties?: Record<string, string>;
    measures?: Record<string, number>;
}

export class WebviewPanelMock extends EventEmitter {
    public visible = true;
    public active = true;
    public messages: unknown[] = [];
    private _disposed = false;

    constructor(
        public viewType: string,
        public title: string,
        public options: vscode.WebviewPanelOptions & vscode.WebviewOptions
    ) {
        super();
    }

    get webview(): vscode.Webview {
        return {
            options: this.options,
            html: '',
            postMessage: (message: unknown) => {
                this.messages.push(message);
                this.emit('message', message);
                return Promise.resolve(true);
            },
            onDidReceiveMessage: (handler: (message: unknown) => void) => {
                this.on('receive', handler);
                return { dispose: () => this.off('receive', handler) };
            },
            asWebviewUri: (uri: vscode.Uri) => uri,
            cspSource: 'https://example.com',
        } as unknown as vscode.Webview;
    }

    get onDidDispose(): vscode.Event<void> {
        return (listener) => {
            this.on('dispose', listener);
            return { dispose: () => this.off('dispose', listener) };
        };
    }

    get onDidChangeViewState(): vscode.Event<vscode.WebviewPanelOnDidChangeViewStateEvent> {
        return (listener) => {
            this.on('viewStateChange', listener);
            return { dispose: () => this.off('viewStateChange', listener) };
        };
    }

    reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void {
        this.visible = true;
        this.active = !preserveFocus;
        this.emit('viewStateChange', {
            webviewPanel: this,
        });
    }

    dispose(): void {
        if (!this._disposed) {
            this._disposed = true;
            this.emit('dispose');
        }
    }

    get iconPath(): vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | undefined {
        return undefined;
    }

    set iconPath(_value: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | undefined) {
        // No-op
    }
}

export class ExtensionMock extends EventEmitter {
    public commands: Map<string, (...args: unknown[]) => unknown> = new Map();
    public panels: WebviewPanelMock[] = [];
    public telemetryEvents: TelemetryEvent[] = [];
    public disposables: vscode.Disposable[] = [];

    async activate(): Promise<void> {
        // Mock activation - sets up global vscode mock
        const vscodeMock = this.createVSCodeMock();
        (global as any).vscode = vscodeMock;

        // Make vscode available to CommonJS require (for webpack bundles)
        const Module = require('module');
        const originalRequire = Module.prototype.require;
        Module.prototype.require = function (id: string) {
            if (id === 'vscode') {
                return vscodeMock;
            }
            return originalRequire.apply(this, arguments as any);
        };

        // Activate actual extension
        try {
            // From out/test/harness/mocks/extension.js to out/extension.js
            // @ts-ignore - Dynamic import of compiled extension
            const extensionModule = await import('../../../extension.js');

            // Webpack CommonJS2 exports are accessible via 'default' or 'module.exports' when imported as ES module
            const ext = extensionModule.default || extensionModule['module.exports'] || extensionModule;

            const context = this.createExtensionContext();
            if (ext.activate) {
                await ext.activate(context);
            }
        } catch (error) {
            console.error('Failed to activate extension:', error);
            throw error;
        }
    }

    async deactivate(): Promise<void> {
        // Dispose all registered resources
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.commands.clear();
        this.panels = [];
    }

    async executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
        // Handle built-in VS Code commands
        if (id === 'setContext') {
            // setContext is a built-in command that sets context variables
            return Promise.resolve();
        }

        const handler = this.commands.get(id);
        if (!handler) {
            throw new Error(`Command not found: ${id}`);
        }
        return await handler(...args);
    }

    private createVSCodeMock(): typeof vscode {
        const mock = {
            commands: {
                registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
                    this.commands.set(id, handler);
                    const disposable = { dispose: () => this.commands.delete(id) };
                    this.disposables.push(disposable);
                    return disposable;
                },
                executeCommand: async (id: string, ...args: unknown[]) => {
                    return await this.executeCommand(id, ...args);
                },
            },
            window: {
                createWebviewPanel: (
                    viewType: string,
                    title: string,
                    showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean },
                    options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
                ) => {
                    const panel = new WebviewPanelMock(viewType, title, options || {});
                    this.panels.push(panel);
                    panel.on('dispose', () => {
                        const index = this.panels.indexOf(panel);
                        if (index > -1) {
                            this.panels.splice(index, 1);
                        }
                    });
                    return panel;
                },
                createStatusBarItem: (alignment?: vscode.StatusBarAlignment, priority?: number) => {
                    return {
                        text: '',
                        tooltip: '',
                        command: undefined,
                        show: () => {},
                        hide: () => {},
                        dispose: () => {},
                    } as vscode.StatusBarItem;
                },
                showQuickPick: async <T extends vscode.QuickPickItem>(
                    items: readonly T[] | Thenable<readonly T[]>
                ): Promise<T | undefined> => {
                    const resolvedItems = await Promise.resolve(items);
                    return resolvedItems[0];
                },
                showInputBox: async (options?: vscode.InputBoxOptions): Promise<string | undefined> => {
                    return options?.value || '';
                },
                showErrorMessage: (message: string) => {
                    if (this.listenerCount('error') > 0) {
                        this.emit('error', message);
                    } else {
                        console.warn(`[ExtensionMock] showErrorMessage: ${message}`);
                    }
                    return Promise.resolve(undefined);
                },
                showInformationMessage: (message: string) => {
                    this.emit('info', message);
                    return Promise.resolve(undefined);
                },
            },
            workspace: {
                getConfiguration: (section?: string) => ({
                    get: <T>(key: string, defaultValue?: T): T | undefined => defaultValue,
                    has: (_key: string) => false,
                    inspect: (_key: string) => undefined,
                    update: () => Promise.resolve(),
                }),
                onDidChangeConfiguration: (handler: (e: vscode.ConfigurationChangeEvent) => unknown) => {
                    this.on('configChange', handler);
                    const disposable = { dispose: () => this.off('configChange', handler) };
                    this.disposables.push(disposable);
                    return disposable;
                },
                findFiles: async (_include: vscode.GlobPattern, _exclude?: vscode.GlobPattern | null, _maxResults?: number) => {
                    return [];
                },
            },
            ViewColumn: {
                Active: -1,
                Beside: -2,
                One: 1,
                Two: 2,
                Three: 3,
                Four: 4,
                Five: 5,
                Six: 6,
                Seven: 7,
                Eight: 8,
                Nine: 9,
            },
            StatusBarAlignment: {
                Left: 1,
                Right: 2,
            },
            ExtensionMode: {
                Production: 1,
                Development: 2,
                Test: 3,
            },
            EventEmitter: class {
                event: any;
                fire(_data?: any): void {}
                dispose(): void {}
            },
            Uri: {
                file: (path: string) => ({ scheme: 'file', path, fsPath: path } as vscode.Uri),
                parse: (value: string) => ({ scheme: 'https', path: value } as vscode.Uri),
                joinPath: (uri: vscode.Uri, ...paths: string[]) => ({
                    ...uri,
                    path: [uri.path, ...paths].join('/'),
                } as vscode.Uri),
            },
            env: {
                clipboard: {
                    writeText: (text: string) => {
                        this.emit('clipboardWrite', text);
                        return Promise.resolve();
                    },
                    readText: () => Promise.resolve(''),
                },
                createTelemetryLogger: (_sender: any, _options?: any) => {
                    return {
                        logUsage: () => {},
                        logError: () => {},
                        dispose: () => {},
                        onDidChangeEnableStates: () => ({ dispose: () => {} }),
                    };
                },
            },
        };

        return mock as unknown as typeof vscode;
    }

    createExtensionContext(): vscode.ExtensionContext {
        return {
            subscriptions: this.disposables,
            extensionPath: __dirname,
            extensionUri: { scheme: 'file', path: __dirname } as vscode.Uri,
            globalState: {
                get: <T>(_key: string, defaultValue?: T) => defaultValue,
                update: () => Promise.resolve(),
                setKeysForSync: () => {},
                keys: () => [],
            },
            workspaceState: {
                get: <T>(_key: string, defaultValue?: T) => defaultValue,
                update: () => Promise.resolve(),
                keys: () => [],
            },
            asAbsolutePath: (relativePath: string) => relativePath,
            storagePath: undefined,
            globalStoragePath: __dirname,
            logPath: __dirname,
            extensionMode: 3, // ExtensionMode.Production
            environmentVariableCollection: {} as any,
            extension: {} as any,
            secrets: {} as any,
            storageUri: undefined,
            globalStorageUri: { scheme: 'file', path: __dirname } as vscode.Uri,
            logUri: { scheme: 'file', path: __dirname } as vscode.Uri,
            languageModelAccessInformation: {} as any,
        } as vscode.ExtensionContext;
    }
}
