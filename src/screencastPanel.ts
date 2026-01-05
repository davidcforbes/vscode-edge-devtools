// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as path from 'path';
import * as vscode from 'vscode';
import {
    encodeMessageForChannel,
    WebSocketEvent,
} from './common/webviewEvents';
import { PanelSocket } from './panelSocket';
import { ScreencastView } from './screencast/view';
import {
    SETTINGS_STORE_NAME,
} from './utils';
import TelemetryReporter from '@vscode/extension-telemetry';
import { ScreencastTelemetryService } from './services/screencastTelemetryService';
import { ClipboardService } from './services/clipboardService';
import { NavigationService } from './services/navigationService';
import { EdgeTabService } from './services/edgeTabService';

export class ScreencastPanel {
    private readonly context: vscode.ExtensionContext;
    private readonly extensionPath: string;
    private readonly panel: vscode.WebviewPanel;
    private readonly screencastTelemetryService: ScreencastTelemetryService;
    private readonly panelId: string;
    private readonly instanceNumber: number;
    private targetUrl: string;
    private currentPageUrl: string;
    private panelSocket: PanelSocket;
    private screencastStartTime;
    private isDisposed = false;
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
        this.screencastTelemetryService = new ScreencastTelemetryService(telemetryReporter);
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
        this.screencastTelemetryService.recordEnumeratedHistogram(actionName, actionCode);
    }

    private recordPerformanceHistogram(actionName: string, duration: number) {
        this.screencastTelemetryService.recordPerformanceHistogram(actionName, duration);
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
        this.screencastTelemetryService.handleSocketTelemetry(message);
    }

    private onSaveToClipboard(message: string): void {
        void ClipboardService.writeToClipboard(message);
    }

    private onGetClipboardText(): void {
        void ClipboardService.readFromClipboard(msg => this.panel.webview.postMessage(msg) as unknown as void);
    }

    private onNavigation(message: string): void {
        const url = NavigationService.parseNavigationMessage(message);
        if (url && url !== this.currentPageUrl) {
            this.currentPageUrl = url;
            this.updatePanelTitle();
        }
    }

    private onParseError(errorData: unknown): void {
        this.screencastTelemetryService.handleParseError(errorData);
    }

    private updatePanelTitle(): void {
        this.panel.title = NavigationService.generatePanelTitle(this.currentPageUrl, this.instanceNumber);
    }

    private activateEdgeTab(): void {
        EdgeTabService.activateTab(this.targetUrl);
    }

    private closeEdgeTab(): void {
        EdgeTabService.closeTab(this.targetUrl);
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
