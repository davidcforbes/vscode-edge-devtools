// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as debugCore from 'vscode-chrome-debug-core';
import TelemetryReporter from '@vscode/extension-telemetry';
import { ScreencastPanel } from './screencastPanel';
import {
    type Browser,
    type Target,
    TargetType,
    createTelemetryReporter,
    fixRemoteWebSocket,
    getBrowserPath,
    getListOfTargets,
    getRemoteEndpointSettings,
    IRemoteTargetJson,
    IUserConfig,
    launchBrowser,
    openNewTab,
    SETTINGS_DEFAULT_ATTACH_INTERVAL,
    SETTINGS_DEFAULT_URL,
    SETTINGS_STORE_NAME,
    SETTINGS_VIEW_NAME,
    reportFileExtensionTypes,
    reportChangedExtensionSetting,
    reportExtensionSettings,
    reportUrlType,
} from './utils';
import { ErrorReporter } from './errorReporter';
import { ErrorCodes } from './common/errorCodes';

let telemetryReporter: Readonly<TelemetryReporter>;
const browserInstances = new Map<string, Browser>();
let browserStatusBarItem: vscode.StatusBarItem;

// Shared browser instance for creating multiple tabs
let sharedBrowserInstance: Browser | null = null;
let sharedBrowserPort: number | null = null;

async function newBrowserWindow(context: vscode.ExtensionContext): Promise<void> {
    const url = await vscode.window.showInputBox({
        prompt: 'Enter URL to open',
        value: 'about:blank',
        placeHolder: 'https://example.com'
    });

    if (url) {
        await launch(context, url);
    }
}

async function listOpenBrowsers(_context: vscode.ExtensionContext): Promise<void> {
    const instances = ScreencastPanel.getAllInstances();

    if (instances.size === 0) {
        void vscode.window.showInformationMessage('No browser instances are currently open.');
        return;
    }

    const items = Array.from(instances.entries()).map(([id, panel]) => ({
        label: panel.getTitle(),
        description: id,
        detail: `Panel ID: ${id}`,
        panelId: id
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a browser instance to view details'
    });

    if (selection) {
        const panel = instances.get(selection.panelId);
        if (panel) {
            panel.reveal();
        }
    }
}

async function switchToBrowser(_context: vscode.ExtensionContext): Promise<void> {
    const instances = ScreencastPanel.getAllInstances();

    if (instances.size === 0) {
        void vscode.window.showInformationMessage('No browser instances are currently open.');
        return;
    }

    const items = Array.from(instances.entries()).map(([id, panel]) => ({
        label: panel.getTitle(),
        description: id,
        panelId: id
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Switch to browser instance'
    });

    if (selection) {
        const panel = instances.get(selection.panelId);
        if (panel) {
            panel.reveal();
        }
    }
}

async function navigateBrowser(_context: vscode.ExtensionContext): Promise<void> {
    const instances = ScreencastPanel.getAllInstances();

    if (instances.size === 0) {
        void vscode.window.showInformationMessage('No browser instances are currently open.');
        return;
    }

    // If there's only one instance, use it directly
    let targetPanel: ScreencastPanel | undefined;

    if (instances.size === 1) {
        targetPanel = Array.from(instances.values())[0];
    } else {
        // Multiple instances - let user select which to navigate
        const items = Array.from(instances.entries()).map(([id, panel]) => ({
            label: panel.getTitle(),
            description: id,
            panelId: id
        }));

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select browser instance to navigate'
        });

        if (selection) {
            targetPanel = instances.get(selection.panelId);
        }
    }

    if (!targetPanel) {
        return;
    }

    // Prompt for URL
    const url = await vscode.window.showInputBox({
        prompt: 'Enter URL to navigate to',
        placeHolder: 'https://example.com',
        validateInput: (value: string) => {
            if (!value) {
                return 'URL cannot be empty';
            }
            // Basic URL validation
            if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('file://')) {
                return 'URL must start with http://, https://, or file://';
            }
            return null;
        }
    });

    if (url) {
        targetPanel.navigateToUrl(url);
        targetPanel.reveal();
    }
}

async function closeCurrentBrowser(): Promise<void> {
    // Get the active webview panel
    const instances = ScreencastPanel.getAllInstances();

    if (instances.size === 0) {
        void vscode.window.showInformationMessage('No browser instances are currently open.');
        return;
    }

    if (instances.size === 1) {
        // Only one instance, close it
        const panel = Array.from(instances.values())[0];
        panel.dispose();
        return;
    }

    // Multiple instances - let user select which to close
    const items = Array.from(instances.entries()).map(([id, panel]) => ({
        label: panel.getTitle(),
        description: id,
        panelId: id
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select browser instance to close'
    });

    if (selection) {
        const panel = instances.get(selection.panelId);
        if (panel) {
            panel.dispose();
        }
    }
}

function updateBrowserStatusBar(): void {
    const instanceCount = ScreencastPanel.getAllInstances().size;

    if (instanceCount === 0) {
        browserStatusBarItem.hide();
    } else {
        browserStatusBarItem.text = `$(browser) ${instanceCount} Browser${instanceCount === 1 ? '' : 's'}`;
        browserStatusBarItem.tooltip = `${instanceCount} active browser instance${instanceCount === 1 ? '' : 's'}`;
        browserStatusBarItem.show();
    }
}

export function activate(context: vscode.ExtensionContext): void {
    if (!telemetryReporter) {
        telemetryReporter = createTelemetryReporter(context);
    }

    // Create status bar item for browser instance count
    browserStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    browserStatusBarItem.command = `${SETTINGS_STORE_NAME}.listOpenBrowsers`;
    context.subscriptions.push(browserStatusBarItem);
    updateBrowserStatusBar();

    // Register callback to update status bar when instance count changes
    ScreencastPanel.setInstanceCountChangedCallback(() => updateBrowserStatusBar());

    // Register callback to close browser when last panel closes
    ScreencastPanel.setLastPanelClosedCallback(() => {
        console.warn('[Extension] Last panel closed, closing shared browser instance');
        if (sharedBrowserInstance) {
            sharedBrowserInstance.close().catch(err => {
                console.error('[Extension] Error closing shared browser:', err);
            });
            sharedBrowserInstance = null;
            sharedBrowserPort = null;
        }
    });

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.attach`, (): void => {
        void attach(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.launch`, (opts: {launchUrl: string} = {launchUrl: ''}): void => {
        void launch(context, opts.launchUrl);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_VIEW_NAME}.launchHtml`, async (fileUri: vscode.Uri): Promise<void> => {
        telemetryReporter.sendTelemetryEvent('contextMenu/launchHtml');
        await launchHtml(context, fileUri);
    }));


    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_VIEW_NAME}.launchScreencast`, async (fileUri: vscode.Uri): Promise<void> => {
        telemetryReporter.sendTelemetryEvent('contextMenu/launchScreencast');
        await launchScreencast(context, fileUri);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.newBrowserWindow`, (): void => {
        void newBrowserWindow(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.listOpenBrowsers`, (): void => {
        void listOpenBrowsers(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.switchToBrowser`, (): void => {
        void switchToBrowser(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.closeCurrentBrowser`, (): void => {
        void closeCurrentBrowser();
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.navigateBrowser`, (): void => {
        void navigateBrowser(context);
    }));

    // Defer heavy telemetry operations to avoid blocking activation
    // This prevents "extension failed to activate" on large workspaces
    setTimeout(() => {
        void reportFileExtensionTypes(telemetryReporter);
    }, 1000);

    reportExtensionSettings(telemetryReporter);
    vscode.workspace.onDidChangeConfiguration(event => reportChangedExtensionSetting(event, telemetryReporter));
}

export async function launchHtml(context: vscode.ExtensionContext, fileUri: vscode.Uri): Promise<void> {
    // Validate that fileUri is provided
    if (!fileUri) {
        void vscode.window.showErrorMessage(
            'Please use this command from the context menu by right-clicking on an HTML file in the Explorer, or use "Microsoft Edge Tools: Launch Edge and then attach to a target" to open a browser with a URL.'
        );
        return;
    }

    const url = !vscode.env.remoteName
        ? `file://${fileUri.fsPath}`
        : `file://${vscode.env.remoteName}.localhost/${fileUri.authority.split('+')[1]}/${fileUri.fsPath.replace(/\\/g, '/')}`;

    const { userDataDir } = getRemoteEndpointSettings();
    const browserPath = await getBrowserPath();
    // Use port 0 to let the OS assign a random available port for each browser instance
    const browser = await launchBrowser(browserPath, 0, url, userDataDir, /** headless */ false);
    browserInstances.set(url, browser);

    // Get the websocket URL directly from the launched browser
    if (browser) {
        // Get the browser's WebSocket endpoint to extract the port
        const browserWsEndpoint = browser.wsEndpoint();
        // Extract port from ws://localhost:PORT/devtools/browser/...
        const portMatch = browserWsEndpoint.match(/:(\d+)\//);
        if (portMatch) {
            const actualPort = parseInt(portMatch[1], 10);
            // Now use the actual port to get the target
            // IMPORTANT: CDP endpoint always uses HTTP, never HTTPS
            await attach(context, url, {port: actualPort, useHttps: false}, false);
        }
    }
}

export async function launchScreencast(context: vscode.ExtensionContext, fileUri: vscode.Uri): Promise<void> {
    // Validate that fileUri is provided
    if (!fileUri) {
        void vscode.window.showErrorMessage(
            'Please use this command from the context menu by right-clicking on an HTML file in the Explorer, or use "Microsoft Edge Tools: Launch Edge and then attach to a target" to open a browser with a URL.'
        );
        return;
    }

    const url = !vscode.env.remoteName
        ? `file://${fileUri.fsPath}`
        : `file://${vscode.env.remoteName}.localhost/${fileUri.authority.split('+')[1]}/${fileUri.fsPath.replace(/\\/g, '/')}`;

    const { userDataDir } = getRemoteEndpointSettings();
    const browserPath = await getBrowserPath();
    // Use port 0 to let the OS assign a random available port for each browser instance
    const browser = await launchBrowser(browserPath, 0, url, userDataDir, /** headless */ true);
    browserInstances.set(url, browser);

    // Get the websocket URL directly from the launched browser
    if (browser) {
        // Get the browser's WebSocket endpoint to extract the port
        const browserWsEndpoint = browser.wsEndpoint();
        // Extract port from ws://localhost:PORT/devtools/browser/...
        const portMatch = browserWsEndpoint.match(/:(\d+)\//);
        if (portMatch) {
            const actualPort = parseInt(portMatch[1], 10);
            // Now use the actual port to get the target
            // IMPORTANT: CDP endpoint always uses HTTP, never HTTPS
            await attach(context, url, {port: actualPort, useHttps: false}, true);
        }
    }
}

export function deactivate(): void {
    // Extension cleanup if needed
}

export async function attach(
    context: vscode.ExtensionContext, attachUrl?: string, config?: Partial<IUserConfig>, useRetry?: boolean): Promise<void> {
    if (!telemetryReporter) {
        telemetryReporter = createTelemetryReporter(context);
    }

    const telemetryProps = { viaConfig: `${!!config}`, withTargetUrl: `${!!attachUrl}` };
    const { hostname, port, useHttps, timeout } = getRemoteEndpointSettings(config);

    console.warn(`[Edge Attach] Starting attach - hostname: ${hostname}, port: ${port}, useHttps: ${useHttps}, attachUrl: ${attachUrl}, timeout: ${timeout}ms`);

    // Get the attach target and keep trying until reaching timeout
    const startTime = Date.now();
    let responseArray: IRemoteTargetJson[] = [];
    let exceptionStack: unknown;
    do {
        try {
            // Keep trying to attach to the list endpoint until timeout
            console.warn(`[Edge Attach] Calling getListOfTargets for ${hostname}:${port}...`);
            responseArray = await debugCore.utils.retryAsync(
                () => getListOfTargets(hostname, port, useHttps),
                timeout,
                /* intervalDelay=*/ SETTINGS_DEFAULT_ATTACH_INTERVAL) as IRemoteTargetJson[];
            console.warn(`[Edge Attach] Got ${responseArray.length} targets`);
        } catch (e) {
            console.error(`[Edge Attach] Exception while getting targets:`, e);
            exceptionStack = e;
        }

        if (responseArray.length > 0) {
            // Try to match the given target with the list of targets we received from the endpoint
            console.warn(`[Edge Attach] Found ${responseArray.length} targets. Available URLs:`,
                responseArray.map(t => ({ title: t.title, url: t.url, type: t.type })));

            let targetWebsocketUrl = '';
            if (attachUrl) {
                console.warn(`[Edge Attach] Trying to match target with URL: ${attachUrl}`);
                // Match the targets using the edge debug adapter logic
                let matchedTargets: debugCore.chromeConnection.ITarget[] | undefined;
                try {
                    matchedTargets = debugCore.chromeUtils.getMatchingTargets(responseArray as unknown as debugCore.chromeConnection.ITarget[], attachUrl);
                    console.warn(`[Edge Attach] getMatchingTargets returned ${matchedTargets?.length || 0} matches`);
                } catch (e) {
                    console.error(`[Edge Attach] Error in getMatchingTargets:`, e);
                    void ErrorReporter.showErrorDialog({
                        errorCode: ErrorCodes.Error,
                        title: 'Error while getting a debug connection to the target',
                        message: e instanceof Error && e.message ? e.message : `Unexpected error ${e}`,
                    });

                    matchedTargets = undefined;
                }

                if (matchedTargets && matchedTargets.length > 0 && matchedTargets[0].webSocketDebuggerUrl) {
                    const actualTarget = fixRemoteWebSocket(hostname, port, matchedTargets[0] as unknown as IRemoteTargetJson);
                    targetWebsocketUrl = actualTarget.webSocketDebuggerUrl;
                    console.warn(`[Edge Attach] Matched target, WebSocket URL: ${targetWebsocketUrl}`);
                } else if (!useRetry) {
                    console.warn(`[Edge Attach] No matching targets found for ${attachUrl}, useRetry=${useRetry}`);
                    void vscode.window.showErrorMessage(`Couldn't attach to ${attachUrl}.`);
                } else {
                    console.warn(`[Edge Attach] No matching targets found for ${attachUrl}, will retry (useRetry=${useRetry})`);
                }
            }

                if (targetWebsocketUrl) {
                    // Auto connect to found target
                    useRetry = false;
                    ScreencastPanel.createOrShow(context, telemetryReporter, targetWebsocketUrl);
                } else if (useRetry) {
                    // Wait for a little bit until we retry
                    await new Promise<void>(resolve => {
                        setTimeout(() => {
                            resolve();
                        }, SETTINGS_DEFAULT_ATTACH_INTERVAL);
                    });
                } else {
                    // Create the list of items to show with fixed websocket addresses
                    console.warn(`[Edge Attach] Showing quick pick with ${responseArray.length} targets`);
                    const items = responseArray.map((i: IRemoteTargetJson) => {
                        i = fixRemoteWebSocket(hostname, port, i);
                        return {
                            description: i.url,
                            detail: i.webSocketDebuggerUrl,
                            label: i.title,
                        } as vscode.QuickPickItem;
                    });

                    // Show the target list and allow the user to select one
                    const selection = await vscode.window.showQuickPick(items);
                    console.warn(`[Edge Attach] User selection: ${selection ? selection.label : 'DISMISSED'}`);
                    if (selection && selection.detail) {
                        console.warn(`[Edge Attach] Creating screencast panel with WebSocket: ${selection.detail}`);
                        ScreencastPanel.createOrShow(context, telemetryReporter, selection.detail);
                    }
                }
        }
    } while (useRetry && Date.now() - startTime < timeout);

    // If there is no response after the timeout then throw an exception (unless for legacy Edge targets which we warned about separately)
    if (responseArray.length === 0) {
        void ErrorReporter.showErrorDialog({
            errorCode: ErrorCodes.Error,
            title: 'Error while fetching list of available targets',
            message: exceptionStack as string || 'No available targets to attach.',
        });

        telemetryReporter.sendTelemetryEvent('command/attach/error/no_json_array', telemetryProps);
    }
}

export async function launch(context: vscode.ExtensionContext, launchUrl?: string, config?: Partial<IUserConfig>): Promise<void> {
    if (!telemetryReporter) {
        telemetryReporter = createTelemetryReporter(context);
    }

    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const browserType: string = settings.get('browserFlavor') || 'Default';
    const isHeadless: string = settings.get('headless') || 'false';

    const telemetryProps = { viaConfig: `${!!config}`, browserType, isHeadless};
    telemetryReporter.sendTelemetryEvent('command/launch', telemetryProps);

    const { hostname, defaultUrl, userDataDir } = getRemoteEndpointSettings(config);
    const url = launchUrl || defaultUrl;

    // Try to reuse existing browser instance by creating a new tab
    if (sharedBrowserInstance && sharedBrowserPort) {
        console.warn(`[Edge Launch] Reusing existing browser on port ${sharedBrowserPort}, creating new tab for: ${url}`);
        const target = await openNewTab(hostname, sharedBrowserPort, url);
        if (target && target.webSocketDebuggerUrl) {
            telemetryReporter.sendTelemetryEvent('command/launch/reused_browser', telemetryProps);
            ScreencastPanel.createOrShow(context, telemetryReporter, target.webSocketDebuggerUrl);
            return;
        }
        console.warn(`[Edge Launch] Failed to create new tab in existing browser, will launch new browser`);
    }

    // No existing browser or failed to create tab, launch a new browser instance
    {
        // Launch a new instance
        const browserPath = await getBrowserPath(config);
        if (!browserPath) {
            telemetryReporter.sendTelemetryEvent('command/launch/error/browser_not_found', telemetryProps);
            void vscode.window.showErrorMessage(
                'Microsoft Edge could not be found. ' +
                'Ensure you have installed Microsoft Edge ' +
                "and that you have selected 'default' or the appropriate version of Microsoft Edge " +
                'in the extension settings panel.');
            return;
        }
            // Here we grab the last part of the path (using either forward or back slashes to account for mac/win),
            // Then we search that part for either chrome or edge to best guess identify the browser that is launching.
            // If it is one of those names we use that, otherwise we default it to "other".
            // Then we upload just one of those 3 names to telemetry.
            const exeName = browserPath.split(/\\|\//).pop();
            if (!exeName) { return; }
            const match = exeName.match(/(chrome|edge)/gi) || [];
            const knownBrowser = match.length > 0 ? match[0] : 'other';
            const browserProps = { exe: `${knownBrowser?.toLowerCase()}` };
            telemetryReporter.sendTelemetryEvent('command/launch/browser', browserProps);

        // Use port 0 to let the OS assign a random available port
        const browser = await launchBrowser(browserPath, 0, url, userDataDir);
        browserInstances.set(url, browser);
        if (url !== SETTINGS_DEFAULT_URL) {
            reportUrlType(url, telemetryReporter);
        }
        browser.on('targetchanged',  (target: Target) => {
            if (target.type() === TargetType.PAGE) {
                reportUrlType(target.url(), telemetryReporter);
            }
        });

        // Get the websocket URL directly from the launched browser
        // Get the browser's WebSocket endpoint to extract the port
        const browserWsEndpoint = browser.wsEndpoint();
        console.warn(`[Edge Launch] Browser WebSocket endpoint: ${browserWsEndpoint}`);

        // Extract port from ws://localhost:PORT/devtools/browser/...
        const portMatch = browserWsEndpoint.match(/:(\d+)\//);
        if (portMatch) {
            const actualPort = parseInt(portMatch[1], 10);
            console.warn(`[Edge Launch] Extracted port: ${actualPort}, will attach to target: ${url}`);

            // Save as shared browser instance for reuse
            if (!sharedBrowserInstance) {
                sharedBrowserInstance = browser;
                sharedBrowserPort = actualPort;
                console.warn(`[Edge Launch] Saved as shared browser instance on port ${actualPort}`);

                // Clean up when browser closes
                browser.on('disconnected', () => {
                    console.warn(`[Edge Launch] Shared browser disconnected, clearing shared instance`);
                    sharedBrowserInstance = null;
                    sharedBrowserPort = null;
                });
            }

            // Wait a moment for the browser's CDP endpoint to fully initialize
            // Even though puppeteer says the browser is ready, the /json/list endpoint
            // needs a moment to register page targets
            console.warn(`[Edge Launch] Waiting 1 second for CDP endpoint to initialize...`);
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Now use the actual port to get the target
            // IMPORTANT: CDP endpoint always uses HTTP, never HTTPS, even if the target URL is HTTPS
            const attachConfig = {...config, port: actualPort, useHttps: false};
            console.warn(`[Edge Launch] Calling attach with port ${actualPort}, config:`, attachConfig);
            await attach(context, url, attachConfig, true);
        } else {
            console.error(`[Edge Launch] Failed to extract port from WebSocket endpoint: ${browserWsEndpoint}`);
            void vscode.window.showErrorMessage(
                `Failed to extract debugging port from browser. WebSocket endpoint: ${browserWsEndpoint}`
            );
            telemetryReporter.sendTelemetryEvent('command/launch/error/port_extraction_failed', telemetryProps);
        }
    }
}
