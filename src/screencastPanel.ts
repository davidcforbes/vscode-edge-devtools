// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    encodeMessageForChannel,
    WebSocketEvent,
    ITelemetryProps,
    ITelemetryMeasures,
    TelemetryData,
} from './common/webviewEvents';
import { PanelSocket } from './panelSocket';
import { ScreencastView } from './screencast/view';
import {
    SETTINGS_STORE_NAME,
} from './utils';
import TelemetryReporter from '@vscode/extension-telemetry';

export class ScreencastPanel {
    private readonly context: vscode.ExtensionContext;
    private readonly extensionPath: string;
    private readonly panel: vscode.WebviewPanel;
    private readonly telemetryReporter: TelemetryReporter;
    private readonly panelId: string;
    private readonly instanceNumber: number;
    private targetUrl: string;
    private currentPageUrl: string;
    private panelSocket: PanelSocket;
    private screencastStartTime;
    private isDisposed = false;
    private lastParseErrorTime = 0;
    private parseErrorNotificationShown = false;
    private static readonly PARSE_ERROR_THROTTLE_MS = 60000; // 1 minute
    private static instances = new Map<string, ScreencastPanel>();
    private static instanceCounter = 0;
    private static onInstanceCountChanged: (() => void) | undefined;
    private static onLastPanelClosed: (() => void) | undefined;

    private constructor(
        panelId: string,
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        telemetryReporter: TelemetryReporter,
        targetUrl: string) {
        this.panelId = panelId;
        this.panel = panel;
        this.context = context;
        this.targetUrl = targetUrl;
        this.currentPageUrl = '';
        this.extensionPath = this.context.extensionPath;
        this.telemetryReporter = telemetryReporter;
        this.screencastStartTime = Date.now();
        this.instanceNumber = ++ScreencastPanel.instanceCounter;

        this.panelSocket = new PanelSocket(this.targetUrl, (e, msg) => this.postToWebview(e, msg));
        this.panelSocket.on('close', () => this.onSocketClose());
        this.panelSocket.on('telemetry', (message: string) => this.onSocketTelemetry(message));
        this.panelSocket.on('writeToClipboard', (message: string) => this.onSaveToClipboard(message));
        this.panelSocket.on('readClipboard', () => this.onGetClipboardText());
        this.panelSocket.on('navigation', (message: string) => this.onNavigation(message));
        this.panelSocket.on('parseError', (errorData: unknown) => this.onParseError(errorData));

        // Handle closing
        this.panel.onDidDispose(() => {
            // Close the Edge tab before disposing
            this.closeEdgeTab();

            // Record telemetry before dispose
            this.recordEnumeratedHistogram('DevTools.ScreencastToggle', 0);
            const sessionDuration = Date.now() - this.screencastStartTime;
            this.recordPerformanceHistogram('DevTools.ScreencastDuration', sessionDuration);

            // Clean up (dispose will handle the rest)
            this.dispose();
        }, this);

        // Handle view change
        this.panel.onDidChangeViewState(_e => {
            if (this.panel.visible) {
                // Activate the Edge tab when this panel becomes visible
                this.activateEdgeTab();
            }
        }, this);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(message => {
            if (typeof message === 'string') {
                this.panelSocket.onMessageFromWebview(message);
            } else if ('type' in message && (message as {type:string}).type === 'open-devtools') {
                this.toggleDevTools();
            }
        }, this);

        this.recordEnumeratedHistogram('DevTools.ScreencastToggle', 1);

        // Initialize the webview HTML content
        this.update();
    }

    private recordEnumeratedHistogram(actionName: string, actionCode: number) {
        const properties: ITelemetryProps = {};
        properties[`${actionName}.actionCode`] = actionCode.toString();
        this.telemetryReporter.sendTelemetryEvent(
            `devtools/${actionName}`,
            properties);
    }

    private recordPerformanceHistogram(actionName: string, duration: number) {
        const measures: ITelemetryMeasures = {};
        measures[`${actionName}.duration`] = duration;
        this.telemetryReporter.sendTelemetryEvent(
            `devtools/${actionName}`,
            undefined,
            measures);
    }

    dispose(): void {
        // Make dispose idempotent to prevent double-dispose errors
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;

        // Remove from instances map
        ScreencastPanel.instances.delete(this.panelId);

        // Dispose socket (NOT panel - it's already being disposed by VS Code)
        this.panelSocket.dispose();

        // Notify of instance count change
        if (ScreencastPanel.onInstanceCountChanged) {
            ScreencastPanel.onInstanceCountChanged();
        }

        // If this was the last panel, notify extension to clean up browser
        if (ScreencastPanel.instances.size === 0 && ScreencastPanel.onLastPanelClosed) {
            console.warn('[ScreencastPanel] Last panel closed, notifying extension to close browser');
            ScreencastPanel.onLastPanelClosed();
        }
    }

    static getAllInstances(): Map<string, ScreencastPanel> {
        return ScreencastPanel.instances;
    }

    static setInstanceCountChangedCallback(callback: () => void): void {
        ScreencastPanel.onInstanceCountChanged = callback;
    }

    static setLastPanelClosedCallback(callback: () => void): void {
        ScreencastPanel.onLastPanelClosed = callback;
    }

    reveal(): void {
        this.panel.reveal(vscode.ViewColumn.Beside);
    }

    navigateToUrl(url: string): void {
        if (!url) {
            return;
        }

        // Send CDP command to navigate to the new URL
        this.panelSocket.sendCDPCommand('Page.navigate', { url });
        // Update current URL (will be updated again when navigation event fires)
        this.currentPageUrl = url;
        this.updatePanelTitle();
    }

    getTitle(): string {
        return this.panel.title;
    }

    private toggleDevTools() {
        // DevTools functionality has been removed - this is now a no-op
    }

    private onSocketClose() {
        this.dispose();
    }

    update(): void {
        this.panel.webview.html = this.getHtmlForWebview();
    }

    private postToWebview(e: WebSocketEvent, message?: string) {
        encodeMessageForChannel(msg => this.panel.webview.postMessage(msg) as unknown as void, 'websocket', { event: e, message });
    }

    private getHtmlForWebview() {
        const inspectorPath = vscode.Uri.file(path.join(this.extensionPath, 'out/screencast', 'screencast.bundle.js'));
        const inspectorUri = this.panel.webview.asWebviewUri(inspectorPath);
		const codiconsUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        const cssPath = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'out/screencast', 'view.css'));
        const view = new ScreencastView(this.panel.webview.cspSource, cssPath, codiconsUri, inspectorUri, false);
        return view.render();
    }

    private onSocketTelemetry(message: string) {
        try {
            const telemetry: TelemetryData = JSON.parse(message) as TelemetryData;
            if (telemetry.event !== 'screencast') {
                return;
            }

            this.telemetryReporter.sendTelemetryEvent(
                `devtools/${telemetry.name}/${telemetry.data.event}`, {
                    'value': telemetry.data.value as string,
                });
        } catch (error) {
            console.error('[ScreencastPanel] Failed to parse telemetry message:', error);
            // Ignore malformed telemetry - don't crash extension
        }
    }

    private onSaveToClipboard(message: string): void {
        try {
            const clipboardMessage = JSON.parse(message) as {data: {message: string}};
            void vscode.env.clipboard.writeText(clipboardMessage.data.message);
        } catch (error) {
            console.error('[ScreencastPanel] Failed to parse clipboard message:', error);
            // Ignore malformed message - don't crash extension
        }
    }

    private onGetClipboardText(): void {
        void vscode.env.clipboard.readText().then(clipboardText => {
            encodeMessageForChannel(msg => this.panel.webview.postMessage(msg) as unknown as void, 'readClipboard', { clipboardText });
        });
    }

    private onNavigation(message: string): void {
        try {
            const navData = JSON.parse(message) as { url: string };
            if (navData.url && navData.url !== this.currentPageUrl) {
                this.currentPageUrl = navData.url;
                this.updatePanelTitle();
            }
        } catch {
            // Ignore parse errors
        }
    }

    private onParseError(errorData: unknown): void {
        // Rate limit parse error reporting to avoid spam
        const now = Date.now();
        if (now - this.lastParseErrorTime < ScreencastPanel.PARSE_ERROR_THROTTLE_MS) {
            return; // Skip this error - too soon after last report
        }
        this.lastParseErrorTime = now;

        try {
            const error = errorData as { context: string; error: string; rawMessage: string };

            // Report to telemetry
            this.telemetryReporter.sendTelemetryErrorEvent('devtools/parseError', {
                'context': error.context || 'unknown',
                'error': error.error || 'unknown',
                'messagePreview': error.rawMessage ? error.rawMessage.substring(0, 100) : 'unavailable'
            });

            // Show user notification (only first occurrence per session to avoid annoyance)
            if (!this.parseErrorNotificationShown) {
                this.parseErrorNotificationShown = true;
                void vscode.window.showWarningMessage(
                    `Browser preview encountered a message parsing error. Check the output panel for details.`,
                    'Show Output'
                ).then(selection => {
                    if (selection === 'Show Output') {
                        void vscode.commands.executeCommand('workbench.action.output.toggleOutput');
                    }
                });
            }
        } catch (reportError) {
            console.error('[ScreencastPanel] Failed to report parse error:', reportError);
        }
    }

    private extractFriendlyName(url: string): string {
        try {
            const urlObj = new URL(url);
            // For localhost, include port
            if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
                return `${urlObj.hostname}:${urlObj.port || '80'}`;
            }
            // For other URLs, just return hostname
            return urlObj.hostname;
        } catch {
            // If URL parsing fails, return the URL as-is
            return url;
        }
    }

    private updatePanelTitle(): void {
        const friendlyName = this.currentPageUrl
            ? this.extractFriendlyName(this.currentPageUrl)
            : 'Browser';
        this.panel.title = `Browser ${this.instanceNumber}: ${friendlyName}`;
    }

    private extractTargetId(): string | null {
        try {
            // Extract target ID from WebSocket URL
            // Format: ws://localhost:9222/devtools/page/{targetId}
            const url = new URL(this.targetUrl);
            const pathParts = url.pathname.split('/');
            // Target ID is the last part of the path
            const targetId = pathParts[pathParts.length - 1];
            return targetId || null;
        } catch {
            return null;
        }
    }

    private activateEdgeTab(): void {
        const targetId = this.extractTargetId();
        if (!targetId) {
            return;
        }

        try {
            // Extract hostname and port from WebSocket URL
            const url = new URL(this.targetUrl);
            const hostname = url.hostname;
            const port = url.port;
            // Use https if WebSocket URL uses wss
            const protocol = url.protocol === 'wss:' ? 'https' : 'http';

            // Use HTTP endpoint to activate the target (browser-level command)
            // GET /json/activate/{targetId}
            const httpModule = url.protocol === 'wss:' ? https : http;
            const req = httpModule.get(`${protocol}://${hostname}:${port}/json/activate/${targetId}`, res => {
                if (res.statusCode !== 200) {
                    console.warn(`[ScreencastPanel] Failed to activate tab ${targetId}: HTTP ${res.statusCode}`);
                }
            });

            req.on('error', err => {
                console.error(`[ScreencastPanel] Error activating tab ${targetId}:`, err);
            });
        } catch (error) {
            console.error('[ScreencastPanel] Error in activateEdgeTab:', error);
        }
    }

    private closeEdgeTab(): void {
        const targetId = this.extractTargetId();
        if (!targetId) {
            return;
        }

        try {
            // Extract hostname and port from WebSocket URL
            const url = new URL(this.targetUrl);
            const hostname = url.hostname;
            const port = url.port;
            // Use https if WebSocket URL uses wss
            const protocol = url.protocol === 'wss:' ? 'https' : 'http';

            // Use HTTP endpoint to close the target (browser-level command)
            // GET /json/close/{targetId}
            const httpModule = url.protocol === 'wss:' ? https : http;
            const req = httpModule.get(`${protocol}://${hostname}:${port}/json/close/${targetId}`, res => {
                if (res.statusCode !== 200) {
                    console.warn(`[ScreencastPanel] Failed to close tab ${targetId}: HTTP ${res.statusCode}`);
                }
            });

            req.on('error', err => {
                console.error(`[ScreencastPanel] Error closing tab ${targetId}:`, err);
            });
        } catch (error) {
            console.error('[ScreencastPanel] Error in closeEdgeTab:', error);
        }
    }

    static createOrShow(context: vscode.ExtensionContext,
        telemetryReporter: TelemetryReporter, targetUrl: string): void {
        const column = vscode.ViewColumn.Beside;

        // Use targetUrl as the unique panel ID
        const panelId = targetUrl;

        // Check if a panel for this target already exists
        const existingPanel = ScreencastPanel.instances.get(panelId);
        if (existingPanel) {
            // Reveal the existing panel
            existingPanel.panel.reveal(column);
            return;
        }

        // Create a new panel with temporary title
        const panel = vscode.window.createWebviewPanel(
            SETTINGS_STORE_NAME,
            'Browser', // Temporary title, will be updated when navigation occurs
            column,
            {
                enableCommandUris: true,
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );
        panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');

        // Create and store the new instance
        const instance = new ScreencastPanel(panelId, panel, context, telemetryReporter, targetUrl);
        ScreencastPanel.instances.set(panelId, instance);

        // Update title with instance number
        instance.updatePanelTitle();

        // Notify of instance count change
        if (ScreencastPanel.onInstanceCountChanged) {
            ScreencastPanel.onInstanceCountChanged();
        }
    }
}
