// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { createFakeExtensionContext, createFakeTelemetryReporter, createFakeVSCode } from './helpers/helpers';
import { ScreencastPanel } from '../src/screencastPanel';
import { PanelSocket } from '../src/panelSocket';

jest.mock('vscode', () => createFakeVSCode(), { virtual: true });
jest.mock('../src/panelSocket');

describe('ScreencastPanel', () => {
    let mockContext: ReturnType<typeof createFakeExtensionContext>;
    let mockTelemetry: ReturnType<typeof createFakeTelemetryReporter>;
    let mockVscode: any;

    beforeEach(() => {
        // Clear instances before each test
        (ScreencastPanel as any).instances.clear();

        // Get mocked vscode
        mockVscode = jest.requireMock('vscode');

        // Reset all mocks
        jest.clearAllMocks();

        // Add ViewColumn.Beside to the mock
        mockVscode.ViewColumn.Beside = -2;

        // Create fresh mocks for each test
        mockContext = createFakeExtensionContext();
        (mockContext as any).extensionUri = mockVscode.Uri.file('/test/path');
        (mockContext as any).extensionPath = '/test/path';
        mockTelemetry = createFakeTelemetryReporter();

        // Mock PanelSocket
        (PanelSocket as unknown as jest.Mock).mockImplementation(() => ({
            on: jest.fn(),
            dispose: jest.fn(),
            onMessageFromWebview: jest.fn(),
        }));

        // Setup webview panel mock - create it from the createWebviewPanel call
        mockVscode.window.createWebviewPanel.mockImplementation((viewType: string, title: string, showOptions: any, options: any) => {
            const mockWebview = {
                html: '',
                postMessage: jest.fn(),
                onDidReceiveMessage: jest.fn(),
                asWebviewUri: jest.fn((uri) => uri),
                cspSource: 'https://example.com',
                options,
            };

            const mockPanel = {
                webview: mockWebview,
                viewType,
                title,
                reveal: jest.fn(),
                dispose: jest.fn(),
                onDidDispose: jest.fn((callback) => {
                    (mockPanel as any)._onDidDisposeCallback = callback;
                    return { dispose: jest.fn() };
                }),
                onDidChangeViewState: jest.fn(() => ({ dispose: jest.fn() })),
                visible: true,
                iconPath: undefined,
            };

            return mockPanel;
        });

        mockVscode.Uri.file.mockImplementation((path: string) => ({ fsPath: path }));
        mockVscode.Uri.joinPath.mockImplementation((uri: any, ...paths: string[]) => ({
            fsPath: paths.join('/'),
        }));
        mockVscode.env.clipboard.writeText.mockResolvedValue(undefined);
        mockVscode.env.clipboard.readText = jest.fn().mockResolvedValue('');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Panel Creation', () => {
        it('should create a new panel with correct parameters', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'vscode-edge-devtools',
                'Edge DevTools: Browser',
                expect.any(Number), // ViewColumn.Beside
                {
                    enableCommandUris: true,
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );
        });

        it('should set panel icon path', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;
            expect(panel.iconPath).toBeDefined();
        });

        it('should create PanelSocket with target URL', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            expect(PanelSocket).toHaveBeenCalledWith(
                targetUrl,
                expect.any(Function)
            );
        });

        it('should send telemetry event on creation', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            expect(mockTelemetry.sendTelemetryEvent).toHaveBeenCalledWith(
                'devtools/DevTools.ScreencastToggle',
                expect.objectContaining({
                    'DevTools.ScreencastToggle.actionCode': '1',
                })
            );
        });

        it('should update HTML when panel is updated', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);
            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;

            // HTML should not be set initially
            expect(panel.webview.html).toBe('');

            // Call update to set HTML
            instance?.update();

            // HTML should now be set
            expect(panel.webview.html).not.toBe('');
        });
    });

    describe('Multi-instance Tracking', () => {
        it('should store instance in static instances Map', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            expect(instances.size).toBe(1);
            expect(instances.has(targetUrl)).toBe(true);
        });

        it('should reuse existing panel for same target URL', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);
            const firstCallCount = mockVscode.window.createWebviewPanel.mock.calls.length;

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);
            const secondCallCount = mockVscode.window.createWebviewPanel.mock.calls.length;

            expect(secondCallCount).toBe(firstCallCount);
            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;
            expect(panel.reveal).toHaveBeenCalled();
        });

        it('should create separate panels for different target URLs', () => {
            const url1 = 'http://localhost:8080';
            const url2 = 'http://localhost:9000';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, url1);

            // Create new mock panel for second call
            const mockPanel2 = { ...mockVscode.window.createWebviewPanel.mock.results[0].value };
            mockVscode.window.createWebviewPanel.mockReturnValueOnce(mockPanel2);

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, url2);

            const instances = ScreencastPanel.getAllInstances();
            expect(instances.size).toBe(2);
            expect(instances.has(url1)).toBe(true);
            expect(instances.has(url2)).toBe(true);
        });

        it('should return all instances via getAllInstances', () => {
            const url1 = 'http://localhost:8080';
            const url2 = 'http://localhost:9000';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, url1);

            const mockPanel2 = { ...mockVscode.window.createWebviewPanel.mock.results[0].value };
            mockVscode.window.createWebviewPanel.mockReturnValueOnce(mockPanel2);
            ScreencastPanel.createOrShow(mockContext, mockTelemetry, url2);

            const instances = ScreencastPanel.getAllInstances();
            expect(instances).toBeInstanceOf(Map);
            expect(instances.size).toBe(2);
        });
    });

    describe('Panel Disposal', () => {
        it('should remove instance from Map on dispose', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);

            instance?.dispose();

            expect(instances.has(targetUrl)).toBe(false);
            expect(instances.size).toBe(0);
        });

        it('should dispose panel and socket on dispose', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);
            const panelSocketMock = (instance as any).panelSocket;
            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;

            instance?.dispose();

            expect(panel.dispose).toHaveBeenCalled();
            expect(panelSocketMock.dispose).toHaveBeenCalled();
        });

        it('should send telemetry events on panel dispose event', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;
            // Trigger the onDidDispose callback
            const disposeCallback = (panel as any)._onDidDisposeCallback;
            if (disposeCallback) {
                disposeCallback();
            }

            // Should send two telemetry events: toggle (0) and duration
            expect(mockTelemetry.sendTelemetryEvent).toHaveBeenCalledWith(
                'devtools/DevTools.ScreencastToggle',
                expect.objectContaining({
                    'DevTools.ScreencastToggle.actionCode': '0',
                })
            );

            expect(mockTelemetry.sendTelemetryEvent).toHaveBeenCalledWith(
                'devtools/DevTools.ScreencastDuration',
                undefined,
                expect.objectContaining({
                    'DevTools.ScreencastDuration.duration': expect.any(Number),
                })
            );
        });

        it('should dispose socket when socket closes', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);
            const panelSocketMock = (instance as any).panelSocket;

            // Find the 'close' event handler and trigger it
            const onMock = panelSocketMock.on as jest.Mock;
            const closeHandler = onMock.mock.calls.find(call => call[0] === 'close')?.[1];

            if (closeHandler) {
                closeHandler();
            }

            expect(instances.has(targetUrl)).toBe(false);
        });
    });

    describe('Panel Reveal and Navigation', () => {
        it('should reveal panel with ViewColumn.Beside', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);
            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;

            instance?.reveal();

            // Should be called with ViewColumn.Beside (which is a number)
            expect(panel.reveal).toHaveBeenCalledWith(expect.any(Number));
        });

        it('should return panel title via getTitle', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);

            const title = instance?.getTitle();

            expect(title).toBe('Edge DevTools: Browser');
        });

        it('should update HTML when panel becomes visible', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);
            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;

            instance?.update();

            // HTML should be set
            expect(panel.webview.html).toBeTruthy();
        });
    });

    describe('Event Handlers', () => {
        it('should register onDidDispose handler', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;
            expect(panel.onDidDispose).toHaveBeenCalled();
        });

        it('should register onDidChangeViewState handler', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;
            expect(panel.onDidChangeViewState).toHaveBeenCalled();
        });

        it('should register onDidReceiveMessage handler', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;
            expect(panel.webview.onDidReceiveMessage).toHaveBeenCalled();
        });

        it('should forward string messages to PanelSocket', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);
            const panelSocketMock = (instance as any).panelSocket;
            const panel = mockVscode.window.createWebviewPanel.mock.results[0].value;

            // Get the message handler
            const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0];

            messageHandler('test message');

            expect(panelSocketMock.onMessageFromWebview).toHaveBeenCalledWith('test message');
        });

        it('should handle telemetry messages from socket', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);
            const panelSocketMock = (instance as any).panelSocket;

            // Find the telemetry event handler
            const onMock = panelSocketMock.on as jest.Mock;
            const telemetryHandler = onMock.mock.calls.find(call => call[0] === 'telemetry')?.[1];

            const telemetryMessage = JSON.stringify({
                event: 'screencast',
                name: 'TestEvent',
                data: { event: 'click', value: 'button' }
            });

            if (telemetryHandler) {
                telemetryHandler(telemetryMessage);
            }

            expect(mockTelemetry.sendTelemetryEvent).toHaveBeenCalledWith(
                'devtools/TestEvent/click',
                { value: 'button' }
            );
        });
    });

    describe('Clipboard Operations', () => {
        it('should write to clipboard on writeToClipboard event', () => {
            const targetUrl = 'http://localhost:8080';

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);
            const panelSocketMock = (instance as any).panelSocket;

            // Find the writeToClipboard event handler
            const onMock = panelSocketMock.on as jest.Mock;
            const clipboardHandler = onMock.mock.calls.find(call => call[0] === 'writeToClipboard')?.[1];

            const clipboardMessage = JSON.stringify({
                data: { message: 'test clipboard content' }
            });

            if (clipboardHandler) {
                clipboardHandler(clipboardMessage);
            }

            expect(mockVscode.env.clipboard.writeText).toHaveBeenCalledWith('test clipboard content');
        });

        it('should read from clipboard on readClipboard event', async () => {
            const targetUrl = 'http://localhost:8080';
            mockVscode.env.clipboard.readText.mockResolvedValue('clipboard content');

            ScreencastPanel.createOrShow(mockContext, mockTelemetry, targetUrl);

            const instances = ScreencastPanel.getAllInstances();
            const instance = instances.get(targetUrl);
            const panelSocketMock = (instance as any).panelSocket;

            // Find the readClipboard event handler
            const onMock = panelSocketMock.on as jest.Mock;
            const readClipboardHandler = onMock.mock.calls.find(call => call[0] === 'readClipboard')?.[1];

            if (readClipboardHandler) {
                readClipboardHandler();
            }

            // Wait for async clipboard read
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockVscode.env.clipboard.readText).toHaveBeenCalled();
        });
    });
});
