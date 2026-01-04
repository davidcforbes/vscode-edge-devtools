// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
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
    SETTINGS_SCREENCAST_WEBVIEW_NAME,
} from './utils';
import TelemetryReporter from '@vscode/extension-telemetry';

export class ScreencastPanel {
    private readonly context: vscode.ExtensionContext;
    private readonly extensionPath: string;
    private readonly panel: vscode.WebviewPanel;
    private readonly telemetryReporter: TelemetryReporter;
    private readonly panelId: string;
    private targetUrl: string;
    private panelSocket: PanelSocket;
    private screencastStartTime;
    private static instances = new Map<string, ScreencastPanel>();

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
        this.extensionPath = this.context.extensionPath;
        this.telemetryReporter = telemetryReporter;
        this.screencastStartTime = Date.now();

        this.panelSocket = new PanelSocket(this.targetUrl, (e, msg) => this.postToWebview(e, msg));
        this.panelSocket.on('close', () => this.onSocketClose());
        this.panelSocket.on('telemetry', (message: string) => this.onSocketTelemetry(message));
        this.panelSocket.on('writeToClipboard', (message: string) => this.onSaveToClipboard(message));
        this.panelSocket.on('readClipboard', () => this.onGetClipboardText());

        // Handle closing
        this.panel.onDidDispose(() => {
            this.dispose();
            this.panelSocket.dispose();
            this.recordEnumeratedHistogram('DevTools.ScreencastToggle', 0);
            const sessionDuration = Date.now() - this.screencastStartTime;
            this.recordPerformanceHistogram('DevTools.ScreencastDuration', sessionDuration);
        }, this);

        // Handle view change
        this.panel.onDidChangeViewState(_e => {
            if (this.panel.visible) {
                this.update();
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
        ScreencastPanel.instances.delete(this.panelId);

        this.panel.dispose();
        this.panelSocket.dispose();
    }

    static getAllInstances(): Map<string, ScreencastPanel> {
        return ScreencastPanel.instances;
    }

    reveal(): void {
        this.panel.reveal(vscode.ViewColumn.Beside);
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
        const telemetry: TelemetryData = JSON.parse(message) as TelemetryData;
        if (telemetry.event !== 'screencast') {
            return;
        }

        this.telemetryReporter.sendTelemetryEvent(
            `devtools/${telemetry.name}/${telemetry.data.event}`, {
                'value': telemetry.data.value as string,
            });
    }

    private onSaveToClipboard(message: string): void {
        const clipboardMessage = JSON.parse(message) as {data: {message: string}};
        void vscode.env.clipboard.writeText(clipboardMessage.data.message);
    }

    private onGetClipboardText(): void {
        void vscode.env.clipboard.readText().then(clipboardText => {
            encodeMessageForChannel(msg => this.panel.webview.postMessage(msg) as unknown as void, 'readClipboard', { clipboardText });
        });
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
        
        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            SETTINGS_STORE_NAME, 
            SETTINGS_SCREENCAST_WEBVIEW_NAME, 
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
    }
}
