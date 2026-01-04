// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Browser, Target, TargetType } from 'puppeteer-core';
import * as vscode from 'vscode';
import * as debugCore from 'vscode-chrome-debug-core';
import TelemetryReporter from '@vscode/extension-telemetry';
import { ScreencastPanel } from './screencastPanel';
import { BrowserViewProvider } from './browserViewProvider';
import {
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

    // Register browser view provider
    const browserViewProvider = new BrowserViewProvider();
    vscode.window.registerTreeDataProvider('edgeBrowserActions', browserViewProvider);

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

    void vscode.commands.executeCommand('setContext', 'titleCommandsRegistered', true);
    void reportFileExtensionTypes(telemetryReporter);
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

    const { port, userDataDir } = getRemoteEndpointSettings();
    const browserPath = await getBrowserPath();
    const browser = await launchBrowser(browserPath, port, url, userDataDir, /** headless */ false);
    browserInstances.set(url, browser);

    // Get the websocket URL from the launched browser
    if (browser) {
        const pages = await browser.pages();
        if (pages && pages.length > 0) {
            const page = pages[0];
            const target = page.target();
            const session = await target.createCDPSession();
            const targetInfo = await session.send('Target.getTargetInfo');
            if (targetInfo && targetInfo.targetInfo) {
                await attach(context, url, undefined, false);
            }
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

    const { port, userDataDir } = getRemoteEndpointSettings();
    const browserPath = await getBrowserPath();
    const browser = await launchBrowser(browserPath, port, url, userDataDir, /** headless */ true);
    browserInstances.set(url, browser);
    await attach(context, url, undefined, true);
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

    // Get the attach target and keep trying until reaching timeout
    const startTime = Date.now();
    let responseArray: IRemoteTargetJson[] = [];
    let exceptionStack: unknown;
    do {
        try {
            // Keep trying to attach to the list endpoint until timeout
            responseArray = await debugCore.utils.retryAsync(
                () => getListOfTargets(hostname, port, useHttps),
                timeout,
                /* intervalDelay=*/ SETTINGS_DEFAULT_ATTACH_INTERVAL) as IRemoteTargetJson[];
        } catch (e) {
            exceptionStack = e;
        }

        if (responseArray.length > 0) {
            // Try to match the given target with the list of targets we received from the endpoint
            let targetWebsocketUrl = '';
            if (attachUrl) {
                // Match the targets using the edge debug adapter logic
                let matchedTargets: debugCore.chromeConnection.ITarget[] | undefined;
                try {
                    matchedTargets = debugCore.chromeUtils.getMatchingTargets(responseArray as unknown as debugCore.chromeConnection.ITarget[], attachUrl);
                } catch (e) {
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
                } else if (!useRetry) {
                    void vscode.window.showErrorMessage(`Couldn't attach to ${attachUrl}.`);
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
                if (selection && selection.detail) {
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

    const { hostname, port, defaultUrl, userDataDir } = getRemoteEndpointSettings(config);
    const url = launchUrl || defaultUrl;
    const target = await openNewTab(hostname, port, url);
    if (target && target.webSocketDebuggerUrl) {
        // Show the devtools
        telemetryReporter.sendTelemetryEvent('command/launch/devtools', telemetryProps);
        ScreencastPanel.createOrShow(context, telemetryReporter, target.webSocketDebuggerUrl);
    } else {
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

        const browser = await launchBrowser(browserPath, port, url, userDataDir);
        browserInstances.set(url, browser);
        if (url !== SETTINGS_DEFAULT_URL) {
            reportUrlType(url, telemetryReporter);
        }
        browser.on('targetchanged',  (target: Target) => {
            if (target.type() === TargetType.PAGE) {
                reportUrlType(target.url(), telemetryReporter);
            }
        });
        await attach(context, url, config);
    }
}
