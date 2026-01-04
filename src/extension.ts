// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Browser, Target, TargetType } from 'puppeteer-core';
import * as vscode from 'vscode';
import * as debugCore from 'vscode-chrome-debug-core';
import TelemetryReporter from '@vscode/extension-telemetry';
import { ScreencastPanel } from './screencastPanel';
import {
    buttonCode,
    createTelemetryReporter,
    fixRemoteWebSocket,
    getBrowserPath,
    getListOfTargets,
    getRemoteEndpointSettings,
    getRuntimeConfig,
    IRemoteTargetJson,
    IUserConfig,
    launchBrowser,
    openNewTab,
    SETTINGS_DEFAULT_ATTACH_INTERVAL,
    SETTINGS_DEFAULT_URL,
    SETTINGS_STORE_NAME,
    SETTINGS_VIEW_NAME,
    getActiveDebugSessionId,
    getJsDebugCDPProxyWebsocketUrl,
    reportFileExtensionTypes,
    reportChangedExtensionSetting,
    reportExtensionSettings,
    reportUrlType,
    getCSSMirrorContentEnabled,
    setCSSMirrorContentEnabled,
} from './utils';
import { ErrorReporter } from './errorReporter';
import { ErrorCodes } from './common/errorCodes';

let telemetryReporter: Readonly<TelemetryReporter>;
let browserInstance: Browser;

export function activate(context: vscode.ExtensionContext): void {
    if (!telemetryReporter) {
        telemetryReporter = createTelemetryReporter(context);
    }

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.attach`, (): void => {
        void attach(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.launch`, (opts: {launchUrl: string} = {launchUrl: ''}): void => {
        void launch(context, opts.launchUrl);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_STORE_NAME}.attachToCurrentDebugTarget`, (debugSessionId: string | undefined, config: Partial<IUserConfig>): void => {
        void attachToCurrentDebugTarget(context, debugSessionId, config);
    }));

    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand(
        `${SETTINGS_VIEW_NAME}.launch`,
        async (fromEmptyTargetView?: boolean) => {
            if (fromEmptyTargetView) {
                telemetryReporter.sendTelemetryEvent('user/buttonPress', { 'VSCode.buttonCode': buttonCode.emptyTargetListLaunchBrowserInstance });
            } else {
                telemetryReporter.sendTelemetryEvent('user/buttonPress', { 'VSCode.buttonCode': buttonCode.launchBrowserInstance });
            }
            await launch(context);
        }));
    // Note: attach command moved to main attach() function below which shows quick pick

    // Note: toggleScreencast command removed - use attach command instead

    context.subscriptions.push(vscode.commands.registerCommand(
        `${SETTINGS_VIEW_NAME}.toggleInspect`,
        (enabled: boolean) => {
            if (ScreencastPanel.instance) {
                ScreencastPanel.instance.toggleInspect(enabled);
            }
        }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_VIEW_NAME}.openSettings`, () => {
        telemetryReporter.sendTelemetryEvent('user/buttonPress', { 'VSCode.buttonCode': buttonCode.openSettings });
        void vscode.commands.executeCommand('workbench.action.openSettings', `${SETTINGS_STORE_NAME}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_VIEW_NAME}.viewChangelog`, () => {
        telemetryReporter.sendTelemetryEvent('user/buttonPress', { 'VSCode.buttonCode': buttonCode.viewChangelog });
        void vscode.env.openExternal(vscode.Uri.parse('https://github.com/microsoft/vscode-edge-devtools/blob/main/CHANGELOG.md'));
    }));
    // Note: close-instance and copyItem commands removed with tree view
    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_VIEW_NAME}.viewDocumentation`, () => {
            telemetryReporter.sendTelemetryEvent('user/buttonPress', { 'VSCode.buttonCode': buttonCode.viewDocumentation });
            void vscode.env.openExternal(vscode.Uri.parse('https://learn.microsoft.com/microsoft-edge/visual-studio-code/microsoft-edge-devtools-extension'));
        }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_VIEW_NAME}.cssMirrorContent`, () => {
        const cssMirrorContent = getCSSMirrorContentEnabled(context);
        void setCSSMirrorContentEnabled(context, !cssMirrorContent);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_VIEW_NAME}.launchHtml`, async (fileUri: vscode.Uri): Promise<void> => {
        telemetryReporter.sendTelemetryEvent('contextMenu/launchHtml');
        await launchHtml(context, fileUri);
    }));


    context.subscriptions.push(vscode.commands.registerCommand(`${SETTINGS_VIEW_NAME}.launchScreencast`, async (fileUri: vscode.Uri): Promise<void> => {
        telemetryReporter.sendTelemetryEvent('contextMenu/launchScreencast');
        await launchScreencast(context, fileUri);
    }));

    void vscode.commands.executeCommand('setContext', 'titleCommandsRegistered', true);
    void reportFileExtensionTypes(telemetryReporter);
    reportExtensionSettings(telemetryReporter);
    vscode.workspace.onDidChangeConfiguration(event => reportChangedExtensionSetting(event, telemetryReporter));
}

export async function launchHtml(context: vscode.ExtensionContext, fileUri: vscode.Uri): Promise<void> {
    const url = !vscode.env.remoteName
        ? `file://${fileUri.fsPath}`
        : `file://${vscode.env.remoteName}.localhost/${fileUri.authority.split('+')[1]}/${fileUri.fsPath.replace(/\\/g, '/')}`;

    const { port, userDataDir } = getRemoteEndpointSettings();
    const browserPath = await getBrowserPath();
    const browser = await launchBrowser(browserPath, port, url, userDataDir, /** headless */ false);

    // Get the websocket URL from the launched browser
    if (browser) {
        const pages = await browser.pages();
        if (pages && pages.length > 0) {
            const page = pages[0];
            const target = page.target();
            const session = await target.createCDPSession();
            const targetInfo = await session.send('Target.getTargetInfo');
            if (targetInfo && targetInfo.targetInfo) {
                await attach(context, url, undefined, false, false);
            }
        }
    }
}

export async function launchScreencast(context: vscode.ExtensionContext, fileUri: vscode.Uri): Promise<void> {
    const url = !vscode.env.remoteName
        ? `file://${fileUri.fsPath}`
        : `file://${vscode.env.remoteName}.localhost/${fileUri.authority.split('+')[1]}/${fileUri.fsPath.replace(/\\/g, '/')}`;

    const { port, userDataDir } = getRemoteEndpointSettings();
    const browserPath = await getBrowserPath();
    await launchBrowser(browserPath, port, url, userDataDir, /** headless */ true);
    await attach(context, url, undefined, true, true);
}

export function deactivate(): void {
    // Extension cleanup if needed
}

export async function attach(
    context: vscode.ExtensionContext, attachUrl?: string, config?: Partial<IUserConfig>, useRetry?: boolean, screencastOnly?: boolean): Promise<void> {
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
                const runtimeConfig = getRuntimeConfig(config);
                if (screencastOnly) {
                    ScreencastPanel.createOrShow(context, telemetryReporter, targetWebsocketUrl, false);
                } else {
                    ScreencastPanel.createOrShow(context, telemetryReporter, targetWebsocketUrl, runtimeConfig.isJsDebugProxiedCDPConnection);
                }
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
                    const runtimeConfig = getRuntimeConfig(config);
                    if (screencastOnly) {
                        ScreencastPanel.createOrShow(context, telemetryReporter, selection.detail, false);
                    } else {
                        ScreencastPanel.createOrShow(context, telemetryReporter, selection.detail, runtimeConfig.isJsDebugProxiedCDPConnection);
                    }
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

export async function attachToCurrentDebugTarget(context: vscode.ExtensionContext, debugSessionId?: string, config?: Partial<IUserConfig>): Promise<void> {
    if (!telemetryReporter) {
        telemetryReporter = createTelemetryReporter(context);
    }

    telemetryReporter.sendTelemetryEvent('command/attachToCurrentDebugTarget');
    const sessionId = debugSessionId || getActiveDebugSessionId();

    if (!sessionId) {
        const errorMessage = 'No active debug session';
        telemetryReporter.sendTelemetryErrorEvent('command/attachToCurrentDebugTarget/devtools', {message: errorMessage});
        void vscode.window.showErrorMessage(errorMessage);
        return;
    }

    const targetWebsocketUrl = await getJsDebugCDPProxyWebsocketUrl(sessionId);

    if (targetWebsocketUrl instanceof Error) {
        telemetryReporter.sendTelemetryErrorEvent('command/attachToCurrentDebugTarget/devtools', {message: targetWebsocketUrl.message});
        void vscode.window.showErrorMessage(targetWebsocketUrl.message);
    } else if (targetWebsocketUrl) {
        // Auto connect to found target
        telemetryReporter.sendTelemetryEvent('command/attachToCurrentDebugTarget/devtools');
        const runtimeConfig = getRuntimeConfig(config);
        runtimeConfig.isJsDebugProxiedCDPConnection = true;
        ScreencastPanel.createOrShow(context, telemetryReporter, targetWebsocketUrl, runtimeConfig.isJsDebugProxiedCDPConnection);
    } else {
        const errorMessage = 'Unable to attach DevTools to current debug session.';
        telemetryReporter.sendTelemetryErrorEvent('command/attachToCurrentDebugTarget/devtools', {message: errorMessage});
        void vscode.window.showErrorMessage(errorMessage);
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
        const runtimeConfig = getRuntimeConfig(config);
        ScreencastPanel.createOrShow(context, telemetryReporter, target.webSocketDebuggerUrl, runtimeConfig.isJsDebugProxiedCDPConnection);
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

        browserInstance = await launchBrowser(browserPath, port, url, userDataDir);
        if (url !== SETTINGS_DEFAULT_URL) {
            reportUrlType(url, telemetryReporter);
        }
        browserInstance.on('targetchanged',  (target: Target) => {
            if (target.type() === TargetType.PAGE) {
                reportUrlType(target.url(), telemetryReporter);
            }
        });
        await attach(context, url, config);
    }
}
