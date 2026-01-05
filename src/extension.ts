// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import TelemetryReporter from '@vscode/extension-telemetry';

const localize = nls.loadMessageBundle();
import { ScreencastPanel } from './screencastPanel';
import { BrowserSessionManager } from './services/browserSessionManager';
import { validateUrlScheme } from './common/urlValidation';
import {
    type Browser,
    type Target,
    TargetType,
    createTelemetryReporter,
    fixRemoteWebSocket,
    getBrowserPath,
    getListOfTargets,
    getMatchingTargets,
    getRemoteEndpointSettings,
    IRemoteTargetJson,
    IUserConfig,
    launchBrowserWithTimeout,
    retryAsync,
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

// Service for managing shared browser session lifecycle
const browserSessionManager = new BrowserSessionManager();

async function newBrowserWindow(context: vscode.ExtensionContext): Promise<void> {
    const url = await vscode.window.showInputBox({
        prompt: localize('newBrowserWindow.prompt', 'Enter URL to open'),
        value: 'about:blank',
        placeHolder: localize('newBrowserWindow.placeholder', 'https://example.com')
    });

    if (url) {
        await launch(context, url);
    }
}

async function listOpenBrowsers(_context: vscode.ExtensionContext): Promise<void> {
    const instances = ScreencastPanel.getAllInstances();

    if (instances.size === 0) {
        vscode.window.showInformationMessage(localize('noBrowserInstances', 'No browser instances are currently open.'))
            .then(undefined, err => console.error('[listOpenBrowsers] Failed to show message:', err));
        return;
    }

    const items = Array.from(instances.entries()).map(([id, panel]) => ({
        label: panel.getTitle(),
        description: id,
        detail: `Panel ID: ${id}`,
        panelId: id
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: localize('listOpenBrowsers.placeholder', 'Select a browser instance to view details')
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
        vscode.window.showInformationMessage(localize('noBrowserInstances', 'No browser instances are currently open.'))
            .then(undefined, err => console.error('[switchToBrowser] Failed to show message:', err));
        return;
    }

    const items = Array.from(instances.entries()).map(([id, panel]) => ({
        label: panel.getTitle(),
        description: id,
        panelId: id
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: localize('switchToBrowser.placeholder', 'Switch to browser instance')
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
        vscode.window.showInformationMessage(localize('noBrowserInstances', 'No browser instances are currently open.'))
            .then(undefined, err => console.error('[navigateBrowser] Failed to show message:', err));
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
            placeHolder: localize('navigateBrowser.placeholder', 'Select browser instance to navigate')
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
        prompt: localize('navigateBrowser.prompt', 'Enter URL to navigate to'),
        placeHolder: localize('newBrowserWindow.placeholder', 'https://example.com'),
        validateInput: (value: string) => {
            // Use shared URL validation to block dangerous schemes
            return validateUrlScheme(value);
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
        vscode.window.showInformationMessage(localize('noBrowserInstances', 'No browser instances are currently open.'))
            .then(undefined, err => console.error('[closeCurrentBrowser] Failed to show message:', err));
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
        placeHolder: localize('closeCurrentBrowser.placeholder', 'Select browser instance to close')
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
        const session = browserSessionManager.getSharedSession();
        if (session) {
            // Clean up any browserInstances map entries pointing to the shared browser
            // Do this before closing to avoid race with disconnected event
            // Collect URLs first to avoid modifying Map while iterating
            const urlsToDelete: string[] = [];
            for (const [url, browser] of browserInstances.entries()) {
                if (browser === session.browser) {
                    urlsToDelete.push(url);
                }
            }
            // Delete after iteration to avoid race condition
            for (const url of urlsToDelete) {
                browserInstances.delete(url);
                console.warn(`[Extension] Removed shared browser map entry for ${url}`);
            }
        }

        browserSessionManager.closeSharedBrowser().catch(err => {
            console.error('[Extension] Failed to close shared browser:', err);
            void vscode.window.showErrorMessage(`Failed to close browser: ${err instanceof Error ? err.message : String(err)}`);
        });
    });

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.attach`, (): void => {
        attach(context).catch(err => {
            console.error('[Command] attach failed:', err);
            void vscode.window.showErrorMessage(`Failed to attach to browser: ${err instanceof Error ? err.message : String(err)}`);
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.launch`, (opts: {launchUrl: string} = {launchUrl: ''}): void => {
        launch(context, opts.launchUrl).catch(err => {
            console.error('[Command] launch failed:', err);
            void vscode.window.showErrorMessage(`Failed to launch browser: ${err instanceof Error ? err.message : String(err)}`);
        });
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
        newBrowserWindow(context).catch(err => {
            console.error('[Command] newBrowserWindow failed:', err);
            void vscode.window.showErrorMessage(`Failed to open new browser window: ${err instanceof Error ? err.message : String(err)}`);
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.listOpenBrowsers`, (): void => {
        listOpenBrowsers(context).catch(err => {
            console.error('[Command] listOpenBrowsers failed:', err);
            void vscode.window.showErrorMessage(`Failed to list browser windows: ${err instanceof Error ? err.message : String(err)}`);
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.switchToBrowser`, (): void => {
        switchToBrowser(context).catch(err => {
            console.error('[Command] switchToBrowser failed:', err);
            void vscode.window.showErrorMessage(`Failed to switch browser window: ${err instanceof Error ? err.message : String(err)}`);
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.closeCurrentBrowser`, (): void => {
        closeCurrentBrowser().catch(err => {
            console.error('[Command] closeCurrentBrowser failed:', err);
            void vscode.window.showErrorMessage(`Failed to close browser window: ${err instanceof Error ? err.message : String(err)}`);
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.navigateBrowser`, (): void => {
        navigateBrowser(context).catch(err => {
            console.error('[Command] navigateBrowser failed:', err);
            void vscode.window.showErrorMessage(`Failed to navigate browser: ${err instanceof Error ? err.message : String(err)}`);
        });
    }));

    // Defer heavy telemetry operations to avoid blocking activation
    // This prevents "extension failed to activate" on large workspaces
    setTimeout(() => {
        reportFileExtensionTypes(telemetryReporter).catch(err => {
            console.error('[Telemetry] reportFileExtensionTypes failed:', err);
        });
    }, 1000);

    reportExtensionSettings(telemetryReporter);
    vscode.workspace.onDidChangeConfiguration(event => reportChangedExtensionSetting(event, telemetryReporter));
}

export async function launchHtml(context: vscode.ExtensionContext, fileUri: vscode.Uri): Promise<void> {
    // Validate that fileUri is provided
    if (!fileUri) {
        void vscode.window.showErrorMessage(
            localize('launchHtml.error', 'Please use this command from the context menu by right-clicking on an HTML file in the Explorer, or use "Microsoft Edge Tools: Launch Edge and then attach to a target" to open a browser with a URL.')
        );
        return;
    }

    const url = !vscode.env.remoteName
        ? `file://${fileUri.fsPath}`
        : `file://${vscode.env.remoteName}.localhost/${fileUri.authority.split('+')[1]}/${fileUri.fsPath.replace(/\\/g, '/')}`;

    const { userDataDir } = await getRemoteEndpointSettings();
    const browserPath = await getBrowserPath();
    // Use port 0 to let the OS assign a random available port for each browser instance
    const browser = await launchBrowserWithTimeout(browserPath, 0, url, userDataDir, /** headless */ false);
    const wsEndpoint = browser.wsEndpoint();
    browserInstances.set(wsEndpoint, browser);

    // Clean up map entry when browser disconnects
    browser.on('disconnected', () => {
        // Defensive check to ensure idempotent cleanup
        if (browserInstances.has(wsEndpoint)) {
            browserInstances.delete(wsEndpoint);
            console.warn(`[New Browser Window] Browser for ${url} disconnected, removed from map`);
        }
    });

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
            try {
                await attach(context, url, {port: actualPort, useHttps: false}, false);
            } catch (error) {
                // If attach fails, clean up the browser to prevent resource leak
                console.error('[New Browser Window] Attach failed, closing browser:', error);
                browserInstances.delete(wsEndpoint);
                await browser.close();
                throw error; // Re-throw to surface error to user
            }
        }
    }
}

export async function launchScreencast(context: vscode.ExtensionContext, fileUri: vscode.Uri): Promise<void> {
    // Validate that fileUri is provided
    if (!fileUri) {
        void vscode.window.showErrorMessage(
            localize('launchHtml.error', 'Please use this command from the context menu by right-clicking on an HTML file in the Explorer, or use "Microsoft Edge Tools: Launch Edge and then attach to a target" to open a browser with a URL.')
        );
        return;
    }

    const url = !vscode.env.remoteName
        ? `file://${fileUri.fsPath}`
        : `file://${vscode.env.remoteName}.localhost/${fileUri.authority.split('+')[1]}/${fileUri.fsPath.replace(/\\/g, '/')}`;

    const { userDataDir } = await getRemoteEndpointSettings();
    const browserPath = await getBrowserPath();
    // Use port 0 to let the OS assign a random available port for each browser instance
    const browser = await launchBrowserWithTimeout(browserPath, 0, url, userDataDir, /** headless */ true);
    const wsEndpoint = browser.wsEndpoint();
    browserInstances.set(wsEndpoint, browser);

    // Clean up map entry when browser disconnects
    browser.on('disconnected', () => {
        // Defensive check to ensure idempotent cleanup
        if (browserInstances.has(wsEndpoint)) {
            browserInstances.delete(wsEndpoint);
            console.warn(`[New Headless Window] Browser for ${url} disconnected, removed from map`);
        }
    });

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
            try {
                await attach(context, url, {port: actualPort, useHttps: false}, true);
            } catch (error) {
                // If attach fails, clean up the browser to prevent resource leak
                console.error('[New Headless Window] Attach failed, closing browser:', error);
                browserInstances.delete(wsEndpoint);
                await browser.close();
                throw error; // Re-throw to surface error to user
            }
        }
    }
}

export function deactivate(): void {
    console.warn('[Extension] Deactivating extension, cleaning up browser instances...');

    // Clear callbacks to prevent memory leaks on extension reload
    ScreencastPanel.setInstanceCountChangedCallback(undefined);
    ScreencastPanel.setLastPanelClosedCallback(undefined);
    console.warn('[Extension] Cleared ScreencastPanel callbacks');

    // Close all browser instances tracked in the map
    const browsers = Array.from(browserInstances.values());
    for (const browser of browsers) {
        try {
            browser.close().catch(err => {
                console.error('[Extension] Error closing browser during deactivate:', err);
            });
        } catch (err) {
            console.error('[Extension] Error closing browser during deactivate:', err);
        }
    }
    browserInstances.clear();
    console.warn(`[Extension] Closed ${browsers.length} browser instance(s) from browserInstances map`);

    // Close shared browser instance if it exists
    browserSessionManager.closeSharedBrowser().catch(err => {
        console.error('[Extension] Failed to close shared browser during deactivation:', err);
    });

    // Dispose all ScreencastPanel instances to clean up WebSocket connections
    const panels = Array.from(ScreencastPanel.getAllInstances().values());
    for (const panel of panels) {
        try {
            panel.dispose();
        } catch (err) {
            console.error('[Extension] Error disposing panel during deactivate:', err);
        }
    }
    console.warn(`[Extension] Disposed ${panels.length} panel instance(s)`);

    console.warn('[Extension] Extension deactivation cleanup complete');
}

export async function attach(
    context: vscode.ExtensionContext, attachUrl?: string, config?: Partial<IUserConfig>, useRetry?: boolean): Promise<void> {
    if (!telemetryReporter) {
        telemetryReporter = createTelemetryReporter(context);
    }

    const telemetryProps = { viaConfig: `${!!config}`, withTargetUrl: `${!!attachUrl}` };
    const { hostname, port, useHttps, timeout } = await getRemoteEndpointSettings(config);

    console.warn(`[Edge Attach] Starting attach - hostname: ${hostname}, port: ${port}, useHttps: ${useHttps}, attachUrl: ${attachUrl}, timeout: ${timeout}ms`);

    // Warn if connecting to remote hostname without HTTPS
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const isRemoteSession = !!vscode.env.remoteName;
    const remoteName = vscode.env.remoteName || 'unknown';
    const isTunneledSession = remoteName === 'tunnel' || remoteName === 'codespaces';

    if (!isLocalhost && !useHttps) {
        let warningMessage = `Connecting to remote CDP endpoint ${hostname}:${port} without encryption. `;

        if (isRemoteSession) {
            warningMessage += `You are in a ${remoteName} session. `;
            if (isTunneledSession) {
                warningMessage += `For tunneled/remote sessions, HTTPS is strongly recommended for security. `;
            }
        }

        warningMessage += `Set "vscode-edge-devtools.useHttps: true" to use secure transport (wss/https).`;

        void vscode.window.showWarningMessage(
            warningMessage,
            'Open Settings',
            'Learn More'
        ).then(selection => {
            if (selection === 'Open Settings') {
                void vscode.commands.executeCommand('workbench.action.openSettings', 'vscode-edge-devtools.useHttps');
            } else if (selection === 'Learn More') {
                void vscode.env.openExternal(vscode.Uri.parse(
                    'https://github.com/microsoft/vscode-edge-devtools#remote-debugging'
                ));
            }
        });
    }

    // Log remote session information for debugging
    if (isRemoteSession) {
        console.warn(`[Edge Attach] Remote session detected: ${remoteName}, hostname: ${hostname}, useHttps: ${useHttps}`);
    }

    // Get the attach target and keep trying until reaching timeout
    const startTime = Date.now();
    let responseArray: IRemoteTargetJson[] = [];
    let exceptionStack: unknown;
    do {
        try {
            // Keep trying to attach to the list endpoint until timeout
            console.warn(`[Edge Attach] Calling getListOfTargets for ${hostname}:${port}...`);
            responseArray = await retryAsync(
                () => getListOfTargets(hostname, port, useHttps),
                timeout,
                /* intervalDelay=*/ SETTINGS_DEFAULT_ATTACH_INTERVAL);
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
                let matchedTargets: IRemoteTargetJson[] | undefined;
                try {
                    matchedTargets = getMatchingTargets(responseArray, attachUrl);
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
                    const actualTarget = fixRemoteWebSocket(hostname, port, matchedTargets[0] as unknown as IRemoteTargetJson, useHttps);
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
                        i = fixRemoteWebSocket(hostname, port, i, useHttps);
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

    const { hostname, defaultUrl, userDataDir } = await getRemoteEndpointSettings(config);
    const url = launchUrl || defaultUrl;

    // Try to reuse existing browser instance by creating a new tab
    // IMPORTANT: CDP endpoint always uses HTTP, never HTTPS
    const target = await browserSessionManager.openNewTabInSharedBrowser(hostname, url, false);
    if (target && target.webSocketDebuggerUrl) {
        telemetryReporter.sendTelemetryEvent('command/launch/reused_browser', telemetryProps);
        ScreencastPanel.createOrShow(context, telemetryReporter, target.webSocketDebuggerUrl);
        return;
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
        const browser = await launchBrowserWithTimeout(browserPath, 0, url, userDataDir);
        const browserWsEndpoint = browser.wsEndpoint();
        browserInstances.set(browserWsEndpoint, browser);

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
        console.warn(`[Edge Launch] Browser WebSocket endpoint: ${browserWsEndpoint}`);

        // Extract port from ws://localhost:PORT/devtools/browser/...
        const portMatch = browserWsEndpoint.match(/:(\d+)\//);
        if (portMatch) {
            const actualPort = parseInt(portMatch[1], 10);
            console.warn(`[Edge Launch] Extracted port: ${actualPort}, will attach to target: ${url}`);

            // Save as shared browser instance for reuse
            if (!browserSessionManager.hasSharedSession()) {
                browserSessionManager.setSharedSession(browser, actualPort);
                console.warn(`[Edge Launch] Saved as shared browser instance on port ${actualPort}`);

                // Clean up map entry when browser disconnects (session manager handles its own cleanup)
                browser.on('disconnected', () => {
                    // Defensive check to ensure idempotent cleanup
                    if (browserInstances.has(browserWsEndpoint)) {
                        browserInstances.delete(browserWsEndpoint);
                        console.warn(`[Edge Launch] Shared browser disconnected, removed from map`);
                    }
                });
            } else {
                // This browser is not the shared instance, clean up map entry only
                browser.on('disconnected', () => {
                    // Defensive check to ensure idempotent cleanup
                    if (browserInstances.has(browserWsEndpoint)) {
                        browserInstances.delete(browserWsEndpoint);
                        console.warn(`[Launch Browser] Browser for ${url} disconnected, removed from map`);
                    }
                });
            }

            // Wait a moment for the browser's CDP endpoint to fully initialize
            // Even though puppeteer says the browser is ready, the /json/list endpoint
            // needs a moment to register page targets
            console.warn(`[Edge Launch] Waiting 200ms for CDP endpoint to initialize...`);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Now use the actual port to get the target
            // IMPORTANT: CDP endpoint always uses HTTP, never HTTPS, even if the target URL is HTTPS
            const attachConfig = {...config, port: actualPort, useHttps: false};
            console.warn(`[Edge Launch] Calling attach with port ${actualPort}, config:`, attachConfig);
            try {
                await attach(context, url, attachConfig, true);
            } catch (error) {
                // If attach fails, clean up the browser to prevent resource leak
                console.error('[Edge Launch] Attach failed, closing browser:', error);
                browserInstances.delete(browserWsEndpoint);
                await browser.close();
                throw error; // Re-throw to surface error to user
            }
        } else {
            console.error(`[Edge Launch] Failed to extract port from WebSocket endpoint: ${browserWsEndpoint}`);
            void vscode.window.showErrorMessage(
                `Failed to extract debugging port from browser. WebSocket endpoint: ${browserWsEndpoint}`
            );
            telemetryReporter.sendTelemetryEvent('command/launch/error/port_extraction_failed', telemetryProps);
        }
    }
}
