
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fse from 'fs-extra';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as url from 'url';
import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import packageJson from '../package.json';
import { DebugTelemetryReporter } from './debugTelemetryReporter';

import puppeteer, {Browser, Target, TargetType} from 'puppeteer-core';

// Re-export puppeteer types for lazy loading in extension.ts
// This prevents eager loading of puppeteer-core at extension activation time
// Note: TargetType is exported as value (enum), others as types only
export type { Browser, Target };
export { TargetType };
import { ErrorReporter } from './errorReporter';
import { ErrorCodes } from './common/errorCodes';

export type BrowserFlavor = 'Default' | 'Stable' | 'Beta' | 'Dev' | 'Canary';

interface IBrowserPath {
    debianLinux: string;
    windows: {
        primary: string;
        secondary: string;
    };
    osx: string;
}

export interface IDevToolsSettings {
    hostname: string;
    port: number;
    useHttps: boolean;
    defaultUrl: string;
    userDataDir: string;
    timeout: number;
}

export interface IUserConfig {
    url: string;
    urlFilter: string;
    browserFlavor: BrowserFlavor;
    hostname: string;
    port: number;
    useHttps: boolean;
    userDataDir: string | boolean;
    webRoot: string;
    pathMapping: IStringDictionary<string>;
    sourceMapPathOverrides: IStringDictionary<string>;
    sourceMaps: boolean;
    timeout: number;
    type: string;
    defaultEntrypoint: string;
}

export interface IRuntimeConfig {
    pathMapping: IStringDictionary<string>;
    sourceMapPathOverrides: IStringDictionary<string>;
    sourceMaps: boolean;
    webRoot: string;
    useLocalEdgeWatch: boolean;
    devtoolsBaseUri?: string;
    defaultEntrypoint?: string;
    browserFlavor: BrowserFlavor;
}
export interface IStringDictionary<T> {
    [name: string]: T;
}

export interface IRequestCDPProxyResult {
    host: string;
    port: number;
    path: string;
}

export type Platform = 'Windows' | 'OSX' | 'Linux';

export const SETTINGS_STORE_NAME = 'vscode-edge-devtools';
export const SETTINGS_DEFAULT_USE_HTTPS = false;
export const SETTINGS_DEFAULT_HOSTNAME = 'localhost';
export const SETTINGS_DEFAULT_PORT = 9222;
export const SETTINGS_DEFAULT_URL = path.resolve(path.join(__dirname, 'startpage', 'index.html'));
export const SETTINGS_WEBVIEW_NAME = 'Edge DevTools';
export const SETTINGS_SCREENCAST_WEBVIEW_NAME = 'Edge DevTools: Browser';
export const SETTINGS_PREF_NAME = 'devtools-preferences';
export const SETTINGS_PREF_DEFAULTS = {
    screencastEnabled: false,
    uiTheme: '"dark"',
};
export const SETTINGS_VIEW_NAME = 'vscode-edge-devtools-view';
export const SETTINGS_DEFAULT_PATH_MAPPING: IStringDictionary<string> = {
    '/': '${workspaceFolder}',
};
export const SETTINGS_DEFAULT_PATH_OVERRIDES: IStringDictionary<string> = {
    'meteor://💻app/*': '${webRoot}/*',
    'webpack:///*': '*',
    'webpack:///./*': '${webRoot}/*',
    'webpack:///./~/*': '${webRoot}/node_modules/*',
    'webpack:///src/*': '${webRoot}/*',
    'webpack://*': '${webRoot}/*',
};
export const SETTINGS_DEFAULT_WEB_ROOT = '${workspaceFolder}';
export const SETTINGS_DEFAULT_SOURCE_MAPS = true;
export const SETTINGS_DEFAULT_ATTACH_TIMEOUT = 10000;
export const SETTINGS_DEFAULT_ATTACH_INTERVAL = 200;
export const SETTINGS_DEFAULT_ENTRY_POINT = 'index.html';

const WIN_APP_DATA = process.env.LOCALAPPDATA || '/';
const msEdgeBrowserMapping: Map<BrowserFlavor, IBrowserPath> = new Map<BrowserFlavor, IBrowserPath>();

/** Build-specified flags. */
declare const DEBUG: boolean;
declare const DEVTOOLS_BASE_URI: string | undefined;

export interface IRemoteTargetJson {
    [index: string]: string;
    description: string;
    devtoolsFrontendUrl: string;
    faviconUrl: string;
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
}

/** enum {string} */
export const buttonCode: Record<string, string> = {
    launchBrowserInstance: '0',
    launchProject: '1',
    viewDocumentation: '2',
    configureLaunchJson: '3',
    generateLaunchJson: '4',
    refreshTargetList: '5',
    attachToTarget: '6',
    openSettings: '7',
    viewChangelog: '8',
    closeTarget: '9',
    emptyTargetListLaunchBrowserInstance: '10',
    toggleScreencast: '10',
};

/**
 * Fetch the response for the given uri.
 *
 * @param uri The uri to request
 * @param options The options that should be used for the request
 */
export function fetchUri(uri: string, options: https.RequestOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(uri);
        const get = (parsedUrl.protocol === 'https:' ? https.get : http.get);

        // Only disable TLS verification for localhost connections
        // Remote connections should use proper certificate validation
        const isLocalhost = parsedUrl.hostname === 'localhost' ||
                           parsedUrl.hostname === '127.0.0.1' ||
                           parsedUrl.hostname === '::1';

        options = {
            // Disable certificate validation only for localhost (self-signed certs common in dev)
            // For remote connections, always verify certificates to prevent MITM attacks
            rejectUnauthorized: !isLocalhost,
            ...parsedUrl,
            ...options,
            method: options.method || 'GET', // Default to GET for fetching data
        } as http.RequestOptions;

        get(options, response => {
            let responseData = '';
            response.on('data', chunk => {
                responseData += chunk;
            });
            response.on('end', () => {
                // Sometimes the 'error' event is not fired. Double check here.
                if (response.statusCode === 200) {
                    resolve(responseData);
                } else {
                    reject(new Error(responseData.trim()));
                }
            });
        }).on('error', e => {
            reject(e);
        });
    });
}

/**
 * Replace the json target payload's websocket address with the ones used to attach.
 * This makes sure that even on a remote machine with custom port forwarding, we will always connect to the address
 * specified in the options rather than what the remote Edge is actually using on the other machine.
 * If a websocket address is not found, the target will be returned unchanged.
 *
 * @param remoteAddress The address of the remote instance of Edge
 * @param remotePort The port used by the remote instance of Edge
 * @param target The target object from the json/list payload
 * @param useHttps Whether to use secure websocket protocol (wss://)
 */
export function fixRemoteWebSocket(
    remoteAddress: string,
    remotePort: number,
    target: IRemoteTargetJson,
    useHttps: boolean = false): IRemoteTargetJson {
    if (target.webSocketDebuggerUrl) {
        const re = /wss?:\/\/([^/]+)\/?/;
        const addressMatch = re.exec(target.webSocketDebuggerUrl);
        if (addressMatch) {
            const replaceAddress = `${remoteAddress}:${remotePort}`;
            const protocol = useHttps ? 'wss' : 'ws';
            target.webSocketDebuggerUrl = target.webSocketDebuggerUrl.replace(/^wss?:/, `${protocol}:`);
            target.webSocketDebuggerUrl = target.webSocketDebuggerUrl.replace(addressMatch[1], replaceAddress);
        }
    }
    return target;
}

/**
 * Retry an async function with interval delays until success or timeout.
 * Replacement for deprecated vscode-chrome-debug-core.utils.retryAsync.
 */
export async function retryAsync<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    intervalDelayMs: number
): Promise<T> {
    const startTime = Date.now();
    let lastError: unknown;

    while (Date.now() - startTime < timeoutMs) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, intervalDelayMs));
        }
    }

    // Timeout exceeded, throw last error
    throw lastError || new Error('retryAsync timed out');
}

/**
 * Match CDP targets based on URL pattern.
 * Replacement for deprecated vscode-chrome-debug-core.chromeUtils.getMatchingTargets.
 */
export function getMatchingTargets(
    targets: IRemoteTargetJson[],
    targetUrl: string
): IRemoteTargetJson[] {
    // Simple URL matching - find targets whose URL contains the target string
    // or whose title matches
    const lowerTargetUrl = targetUrl.toLowerCase();

    return targets.filter(target => {
        const url = (target.url || '').toLowerCase();
        const title = (target.title || '').toLowerCase();

        // Match if URL contains the target string
        if (url.includes(lowerTargetUrl)) {
            return true;
        }

        // Match if title contains the target string
        if (title.includes(lowerTargetUrl)) {
            return true;
        }

        return false;
    });
}

/**
 * Query the list endpoint and return the parsed Json result which is the list of targets
 *
 * @param hostname The remote hostname
 * @param port The remote port
 */
export async function getListOfTargets(hostname: string, port: number, useHttps: boolean): Promise<IRemoteTargetJson[]> {
    const checkDiscoveryEndpoint = (uri: string) => {
        return fetchUri(uri, { headers: { Host: 'localhost' } });
    };

    const protocol = (useHttps ? 'https' : 'http');

    let jsonResponse = null;
    let lastError: unknown = null;
    for (const endpoint of ['/json/list', '/json']) {
        try {
            const uri = `${protocol}://${hostname}:${port}${endpoint}`;
            console.warn(`[getListOfTargets] Trying ${uri}...`);
            jsonResponse = await checkDiscoveryEndpoint(uri);
            if (jsonResponse) {
                console.warn(`[getListOfTargets] Got response from ${uri} (${jsonResponse.length} bytes)`);
                break;
            }
            console.warn(`[getListOfTargets] No response from ${uri}`);
        } catch (e) {
            console.warn(`[getListOfTargets] Error fetching ${protocol}://${hostname}:${port}${endpoint}:`, e);
            lastError = e;
            // localhost might not be ready as the user might not have a server running
            // user may also have changed settings making the endpoint invalid
        }
    }

    let result: IRemoteTargetJson[] = [];
    try {
        result = jsonResponse ? JSON.parse(jsonResponse) as IRemoteTargetJson[] : [];
        console.warn(`[getListOfTargets] Parsed ${result.length} targets`);
    } catch (e) {
        console.error(`[getListOfTargets] Error parsing JSON response:`, e);
        void ErrorReporter.showErrorDialog({
            errorCode: ErrorCodes.Error,
            title: 'Error while parsing the list of targets.',
            message: e instanceof Error && e.message ? e.message : `Unexpected error ${e}`,
        });
    }

    if (result.length === 0 && lastError) {
        console.warn(`[getListOfTargets] Returning empty array, last error was:`, lastError);
    }

    return result;
}

/**
 * Get the remote endpoint settings from the vscode configuration
 *
 * @param config The settings specified by a launch config, if any
 */
export async function getRemoteEndpointSettings(config: Partial<IUserConfig> = {}): Promise<IDevToolsSettings> {
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    console.warn(`[getRemoteEndpointSettings] Input config:`, config);
    console.warn(`[getRemoteEndpointSettings] config.useHttps = ${config.useHttps}, settings.get('useHttps') = ${settings.get('useHttps')}, SETTINGS_DEFAULT_USE_HTTPS = ${SETTINGS_DEFAULT_USE_HTTPS}`);
    const hostname: string = config.hostname || settings.get('hostname') || SETTINGS_DEFAULT_HOSTNAME;
    const port: number = config.port ?? settings.get('port') ?? SETTINGS_DEFAULT_PORT;
    const useHttps: boolean = config.useHttps ?? settings.get('useHttps') ?? SETTINGS_DEFAULT_USE_HTTPS;
    console.warn(`[getRemoteEndpointSettings] Result: hostname=${hostname}, port=${port}, useHttps=${useHttps}`);
    const defaultUrl: string = config.url || settings.get('defaultUrl') || SETTINGS_DEFAULT_URL;
    const timeout: number = config.timeout || settings.get('timeout') || SETTINGS_DEFAULT_ATTACH_TIMEOUT;

    // Check to see if we need to use a user data directory, which will force Edge to launch with a new manager process.
    // We generate a temp directory if the user opted in explicitly with 'true' (which is the default),
    // Or if it is not defined and they are not using a custom browser path (such as electron).
    // This matches the behavior of the chrome and edge debug extensions.
    const browserPathSet = config.browserFlavor || 'Default';
    let userDataDir: string | boolean | undefined;
    if (typeof config.userDataDir !== 'undefined') {
        userDataDir = config.userDataDir;
    } else {
        const settingsUserDataDir: string | boolean | undefined = settings.get('userDataDir');
        if (typeof settingsUserDataDir !== 'undefined') {
            userDataDir = settingsUserDataDir;
        }
    }

    if (userDataDir === true || (typeof userDataDir === 'undefined' && browserPathSet === 'Default')) {
        // Generate a unique temp directory for each browser instance
        userDataDir = path.join(os.tmpdir(), `vscode-edge-devtools-userdatadir_${port}_${Date.now()}`);
        if (!(await fse.pathExists(userDataDir))) {
            await fse.mkdir(userDataDir);
        }
    } else if (!userDataDir) {
        // Explicit opt-out
        userDataDir = '';
    }

    return { hostname, port, useHttps, defaultUrl, userDataDir, timeout };
}

/**
 * Get the session id for the currently active VSCode debugging session
 */
export function getActiveDebugSessionId(): string|undefined {
    // Attempt to attach to active CDP target
    const session = vscode.debug.activeDebugSession;
    return session ? session.id : undefined;
}

/**
 * Create the target websocket url for attaching to the shared CDP instance exposed by
 * the JavaScript Debugging Extension for VSCode.
 * https://github.com/microsoft/vscode-js-debug/blob/main/CDP_SHARE.md
 *
 * @param debugSessionId The session id of the active VSCode debugging session
 */
export async function getJsDebugCDPProxyWebsocketUrl(debugSessionId: string): Promise<string|Error|undefined> {
    try {
        // TODO: update to query location when workspace support added
        // https://github.com/microsoft/vscode-edge-devtools/issues/383
        const forwardToUi = true;
        const addr: IRequestCDPProxyResult|undefined = await vscode.commands.executeCommand(
        'extension.js-debug.requestCDPProxy',
        debugSessionId,
        forwardToUi,
        );
        if (addr) {
            return `ws://${addr.host}:${addr.port}${addr.path || ''}`;
        }
    } catch (e) {
        if (e instanceof Error) {
            return e;
        }

        // Throw remaining unhandled exceptions
        void ErrorReporter.showErrorDialog({
            errorCode: ErrorCodes.Error,
            title: 'Error while creating the debug socket for CDP target.',
            message: `Unexpected error ${e}`,
        });
    }
}

/**
 * Create a telemetry reporter that can be used for this extension
 *
 * @param context The vscode context
 */
export function createTelemetryReporter(_context: vscode.ExtensionContext): Readonly<TelemetryReporter> {
    if (packageJson && (_context.extensionMode === vscode.ExtensionMode.Production)) {
        // Use the real telemetry reporter
        return new TelemetryReporter(packageJson.oneDSKey);
    }
        // Fallback to a fake telemetry reporter
        return new DebugTelemetryReporter();

}

/**
 * Get the current machine platform
 */
export function getPlatform(): Platform {
    const platform = os.platform();
    return platform === 'darwin' ? 'OSX' :
        platform === 'win32' ? 'Windows' :
            'Linux';
}

/**
 * Gets the browser path for the specified browser flavor.
 *
 * @param config The settings specified by a launch config, if any
 */
export async function getBrowserPath(config: Partial<IUserConfig> = {}): Promise<string> {
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const flavor: BrowserFlavor | undefined = config.browserFlavor || settings.get('browserFlavor');

    console.warn(`[Edge Detection] getBrowserPath called - Config flavor: ${config.browserFlavor}, Settings flavor: ${settings.get('browserFlavor')}, Final flavor: ${flavor}`);

    switch (getPlatform()) {
        case 'Windows': {
           return await verifyFlavorPath(flavor, 'Windows');
        }
        case 'OSX': {
            return await verifyFlavorPath(flavor, 'OSX');
        }
        case 'Linux': {
            return await verifyFlavorPath(flavor, 'Linux');
        }
    }
}

/**
 * Launch the specified browser with remote debugging enabled
 *
 * @param browserPath The path of the browser to launch
 * @param port The port on which to enable remote debugging
 * @param targetUrl The url of the page to open
 * @param userDataDir The user data directory for the launched instance
 * @param forceHeadless This force overrides the --headless arg for browser launch
 */
export async function launchBrowser(browserPath: string, port: number, targetUrl: string, userDataDir?: string, forceHeadless?: boolean): Promise<Browser> {
    const args = [
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${port}`,
        '--disable-features=ProcessPerSiteUpToMainFrameThreshold', // Prevent process sharing between instances
        // REMOVED: --no-sandbox (SECURITY: This flag disables Chromium's security sandbox)
        // Sandbox is now enabled for better security. If you experience issues on Linux,
        // this may indicate missing kernel configurations (namespaces, seccomp).
        targetUrl,
    ];

    const headless: boolean = forceHeadless ?? isHeadlessEnabled();

    let browserArgs: string[] = getBrowserArgs();
    browserArgs = browserArgs.filter(arg => !arg.startsWith('--remote-debugging-port') && arg !== targetUrl);

    if (userDataDir) {
        args.unshift(`--user-data-dir=${userDataDir}`);
        browserArgs = browserArgs.filter(arg => !arg.startsWith('--user-data-dir'));
    }

    if (browserArgs.length) {
        args.unshift(...browserArgs);
    }

    const browserInstance = await puppeteer.launch({executablePath: browserPath, args, headless});
    return browserInstance;
}

/**
 * Open a new tab in the browser specified via endpoint
 *
 * @param hostname The hostname of the browser
 * @param port The port of the browser
 * @param tabUrl The url to open, if any
 * @param useHttps Whether to use HTTPS for the CDP endpoint
 */
export async function openNewTab(hostname: string, port: number, tabUrl?: string, useHttps: boolean = false): Promise<IRemoteTargetJson | undefined> {
    try {
        // Properly encode the URL to handle special characters like &, =, ?, #, spaces
        const encodedUrl = tabUrl ? encodeURIComponent(tabUrl) : '';
        const protocol = useHttps ? 'https' : 'http';
        const json = await fetchUri(`${protocol}://${hostname}:${port}/json/new?${encodedUrl}`);
        const target: IRemoteTargetJson | undefined = JSON.parse(json) as IRemoteTargetJson | undefined;
        return target;
    } catch {
        return undefined;
    }
}

/**
 * Get the configuration settings that should be used at runtime.
 * The order of precedence is launch.json > extension settings > default values.
 *
 * @param config A user specified config from launch.json
 */
export function getRuntimeConfig(config: Partial<IUserConfig> = {}): IRuntimeConfig {
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const browserFlavor = config.browserFlavor || settings.get('browserFlavor') || 'Default';

    return {
        pathMapping: SETTINGS_DEFAULT_PATH_MAPPING,
        sourceMapPathOverrides: SETTINGS_DEFAULT_PATH_OVERRIDES,
        browserFlavor,
        sourceMaps: SETTINGS_DEFAULT_SOURCE_MAPS,
        webRoot: SETTINGS_DEFAULT_WEB_ROOT,
        useLocalEdgeWatch: DEBUG,
        devtoolsBaseUri: DEVTOOLS_BASE_URI,
        defaultEntrypoint: SETTINGS_DEFAULT_ENTRY_POINT,
    };
}

/**
 * Walk through the list of mappings and find one that matches the sourcePath.
 * Once a match is found, replace the pattern in the value side of the mapping with
 * the rest of the path.
 *
 * @param sourcePath The source path to convert
 * @param pathMapping The list of mappings from source map to authored file path
 */
/**
 * Verifies if the headless checkbox in extension settings is enabled.
 */
export function isHeadlessEnabled(): boolean {
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const headless: boolean = settings.get('headless') || false;
    return headless;
}

/**
 * Safe browser flags that are allowed in browserArgs setting.
 * These flags do not pose security risks.
 */
const SAFE_BROWSER_FLAGS = new Set([
    // Window/display flags
    '--window-size',
    '--window-position',
    '--start-maximized',
    '--start-fullscreen',
    '--window-name',

    // Performance flags (non-security)
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
    '--enable-native-gpu-memory-buffers',

    // Debugging flags (limited)
    '--enable-logging',
    '--v',
    '--vmodule',
    '--log-level',

    // Locale/language
    '--lang',
    '--accept-lang',

    // Accessibility
    '--force-color-profile',
    '--high-dpi-support',

    // User agent
    '--user-agent',
]);

/**
 * Dangerous browser flags that should never be allowed.
 * These flags disable critical security features.
 */
const DANGEROUS_FLAGS = new Set([
    '--no-sandbox',
    '--disable-web-security',
    '--disable-site-isolation-trials',
    '--allow-file-access-from-files',
    '--disable-features',
    '--load-extension',
    '--disable-gpu-sandbox',
    '--disable-setuid-sandbox',
    '--allow-running-insecure-content',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-background-networking',
    '--disable-sync',
    '--allow-insecure-localhost',
]);

/**
 * get the command line args which are passed to the browser.
 * Only allows safe flags to prevent security issues.
 */
export function getBrowserArgs(): string[] {
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const browserArgs: string[] = settings.get('browserArgs') || [];

    const sanitized: string[] = [];
    const blocked: string[] = [];

    for (const arg of browserArgs) {
        const trimmed = arg.trim();
        if (!trimmed) {
            continue;
        }

        // Extract flag name (before = sign if present)
        const flagName = trimmed.split('=')[0];

        // Check if it's a dangerous flag
        if (DANGEROUS_FLAGS.has(flagName) || flagName.startsWith('--disable-')) {
            blocked.push(flagName);
            console.warn(`[Security] Blocked dangerous browser flag: ${flagName}`);
            continue;
        }

        // Check if it's on the allowlist
        if (SAFE_BROWSER_FLAGS.has(flagName)) {
            sanitized.push(trimmed);
        } else {
            // Unknown flag - log warning but don't block (conservative approach)
            console.warn(`[Security] Unknown browser flag (not on allowlist): ${flagName}. Allowing but consider reviewing.`);
            // For now, allow unknown flags that aren't explicitly dangerous
            // This prevents breaking existing configurations while still blocking known-bad flags
            sanitized.push(trimmed);
        }
    }

    // Show user-visible warning if dangerous flags were blocked
    if (blocked.length > 0) {
        void vscode.window.showWarningMessage(
            `Blocked ${blocked.length} dangerous browser flag(s) for security: ${blocked.join(', ')}. ` +
            'These flags can compromise browser security. See extension documentation for allowed flags.'
        );
    }

    return sanitized;
}

/**
 * Verifies and returns if the browser for the current session exists in the
 * desired flavor and platform. Providing a "default" flavor will scan for the
 * first browser available in the following order:
 * stable > beta > dev > canary
 * For windows it will try: program files > local app data
 *
 * @param flavor the desired browser flavor
 * @param platform the desired platform
 * @returns a promise with the path to the browser or an empty string if not found.
 */
async function verifyFlavorPath(flavor: BrowserFlavor | undefined, platform: Platform): Promise<string> {
    console.warn(`[Edge Detection] Starting browser detection - Flavor: ${flavor || 'Default'}, Platform: ${platform}`);

    let item = msEdgeBrowserMapping.get(flavor || 'Default');
    if (!item) {
        console.warn('[Edge Detection] No item found for flavor, searching all flavors...');
        // if no flavor is specified search for any path present.
        for (item of msEdgeBrowserMapping.values()) {
            const result = await findFlavorPath(item);
            if (result) {
                console.warn(`[Edge Detection] Found browser at: ${result}`);
                return result;
            }
        }
    }

    return await findFlavorPath(item);

    // Verifies if the path exists in disk.
    async function findFlavorPath(browserPath: IBrowserPath | undefined) {
        if (!browserPath) {
            console.warn('[Edge Detection] No browserPath provided');
            return '';
        }

        console.warn(`[Edge Detection] Checking primary Windows path: ${browserPath.windows.primary}`);
        const primaryExists = await fse.pathExists(browserPath.windows.primary);
        console.warn(`[Edge Detection] Primary path exists: ${primaryExists}, Platform check: ${platform === 'Windows' || flavor === 'Default'}`);

        if (primaryExists && (platform === 'Windows' || flavor === 'Default')) {
            console.warn(`[Edge Detection] SUCCESS - Using primary path: ${browserPath.windows.primary}`);
            return browserPath.windows.primary;
        }

        console.warn(`[Edge Detection] Checking secondary Windows path: ${browserPath.windows.secondary}`);
        const secondaryExists = await fse.pathExists(browserPath.windows.secondary);
        console.warn(`[Edge Detection] Secondary path exists: ${secondaryExists}`);

        if (secondaryExists && (platform === 'Windows' || flavor === 'Default')) {
            console.warn(`[Edge Detection] SUCCESS - Using secondary path: ${browserPath.windows.secondary}`);
            return browserPath.windows.secondary;
        }

        if (await fse.pathExists(browserPath.osx) &&
            (platform === 'OSX' || flavor === 'Default')) {
            console.warn(`[Edge Detection] SUCCESS - Using OSX path: ${browserPath.osx}`);
            return browserPath.osx;
        }

        if (await fse.pathExists(browserPath.debianLinux) &&
            (platform === 'Linux' || flavor === 'Default')) {
            console.warn(`[Edge Detection] SUCCESS - Using Linux path: ${browserPath.debianLinux}`);
            return browserPath.debianLinux;
        }

        console.warn('[Edge Detection] FAILED - No valid browser path found');
        return '';
    }
}

type ExtensionSettings = [string, boolean | string | {[key: string]: string} | undefined];

export function reportExtensionSettings(telemetryReporter: Readonly<TelemetryReporter>): void {
    const extensionSettingsList = Object.entries(vscode.workspace.getConfiguration(SETTINGS_STORE_NAME)).splice(4) as Array<ExtensionSettings>;
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const changedSettingsMap: Map<string, string> = new Map<string, string>();
    for (const currentSetting of extensionSettingsList) {
        const settingName: string = currentSetting[0];
        const settingValue: boolean | string | {[key: string]: string} | undefined = currentSetting[1];
        const settingInspect = settings.inspect(settingName);
        if (settingInspect) {
            const defaultValue = settingInspect.defaultValue;
            if (settingValue !== undefined && settingValue !== defaultValue) {
                if (defaultValue && typeof defaultValue === 'object' && typeof settingValue === 'object') {
                    for (const [key, value] of Object.entries(defaultValue)) {
                        if (settingValue[key] !== value) {
                            changedSettingsMap.set(settingName, JSON.stringify(settingValue));
                            break;
                        }
                    }
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-base-to-string
                    changedSettingsMap.set(settingName, settingValue.toString());
                }
            }
        }
    }
    const changedSettingsObject = {};
    Object.assign(changedSettingsObject, ...[...changedSettingsMap.entries()].map(([k, v]) => ({[k]: v})));
    telemetryReporter.sendTelemetryEvent('user/settingsChangedAtLaunch', changedSettingsObject);
}

export function reportChangedExtensionSetting(event: vscode.ConfigurationChangeEvent, telemetryReporter: Readonly<TelemetryReporter>): void {
    const extensionSettingsList = Object.entries(vscode.workspace.getConfiguration(SETTINGS_STORE_NAME)).splice(4) as Array<ExtensionSettings>;
    for (const currentSetting of extensionSettingsList) {
        const settingName: string = currentSetting[0];
        const settingValue: boolean | string | {[key: string]: string} | undefined = currentSetting[1];
        if (event.affectsConfiguration(`${SETTINGS_STORE_NAME}.${settingName}`)) {
            if (settingName !== undefined) {
                if (settingValue !== undefined) {
                    const telemetryObject: {[key: string]: string}  = {};
                    const objString = typeof settingValue !== 'object' ? settingValue.toString() : JSON.stringify(settingValue);
                    telemetryObject[settingName] = objString;
                    telemetryReporter.sendTelemetryEvent('user/settingsChanged', telemetryObject);
                }
            }
        }
    }
}

export function reportUrlType(url: string, telemetryReporter: Readonly<TelemetryReporter>): void {
    const localhostPattern = /^https?:\/\/localhost:/;
    const ipPattern = /(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/;
    const filePattern = /^file:\/\//;
    let urlType;
    if (localhostPattern.exec(url) || ipPattern.exec(url)) {
        urlType = 'localhost';
    } else if (filePattern.exec(url)) {
        urlType = 'file';
    } else {
        urlType = 'other';
    }
    telemetryReporter.sendTelemetryEvent('user/browserNavigation', { 'urlType': urlType });
}

export async function reportFileExtensionTypes(telemetryReporter: Readonly<TelemetryReporter>): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.*', '**/node_modules/**');
    const extensionMap: Map<string, number> = new Map<string, number>([
        ['html', 0],
        ['css', 0],
        ['js', 0],
        ['ts', 0],
        ['jsx', 0],
        ['scss', 0],
        ['json', 0],
        ['mjs', 0],
        ['other', 0],
    ]);
    for (const file of files) {
        const extension: string | undefined = file.path.split('.').pop();
        if (extension) {
            if (extensionMap.has(extension)) {
                const currentValue = extensionMap.get(extension);
                if (currentValue !== undefined) {
                    extensionMap.set(extension, currentValue + 1);
                }
            } else {
                const otherCount = extensionMap.get('other');
                if (otherCount !== undefined) {
                    extensionMap.set('other', otherCount + 1);
                }
            }
        }
    }
    extensionMap.set('total', files.length);

    // Creates Object from map
    const fileTypes: {[key: string]: number} = {};
    Object.assign(fileTypes, ...[...extensionMap.entries()].map(([k, v]) => ({[k]: v})));
    telemetryReporter.sendTelemetryEvent('workspace/metadata', undefined, fileTypes);
}

(function initialize() {
    console.warn('[Edge Detection] Initializing browser paths...');
    console.warn(`[Edge Detection] WIN_APP_DATA: ${WIN_APP_DATA}`);
    console.warn(`[Edge Detection] process.env.LOCALAPPDATA: ${process.env.LOCALAPPDATA}`);
    // insertion order matters.
    msEdgeBrowserMapping.set('Stable', {
        debianLinux: '/opt/microsoft/msedge/msedge',
        osx: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        windows: {
            primary: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            secondary: path.join(WIN_APP_DATA, 'Microsoft\\Edge\\Application\\msedge.exe'),
        },
    });
    msEdgeBrowserMapping.set('Beta', {
        debianLinux: '/opt/microsoft/msedge-beta/msedge',
        osx: '/Applications/Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta',
        windows: {
            primary: 'C:\\Program Files (x86)\\Microsoft\\Edge Beta\\Application\\msedge.exe',
            secondary: path.join(WIN_APP_DATA, 'Microsoft\\Edge Beta\\Application\\msedge.exe'),
        },
    });
    msEdgeBrowserMapping.set('Dev', {
        debianLinux: '/opt/microsoft/msedge-dev/msedge',
        osx: '/Applications/Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev',
        windows: {
            primary: 'C:\\Program Files (x86)\\Microsoft\\Edge Dev\\Application\\msedge.exe',
            secondary: path.join(WIN_APP_DATA, 'Microsoft\\Edge Dev\\Application\\msedge.exe'),
        },
    });
    msEdgeBrowserMapping.set('Canary', {
        debianLinux: '/opt/microsoft/msedge-canary/msedge',
        osx: '/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary',
        windows: {
            primary: 'C:\\Program Files (x86)\\Microsoft\\Edge SxS\\Application\\msedge.exe',
            secondary: path.join(WIN_APP_DATA, 'Microsoft\\Edge SxS\\Application\\msedge.exe'),
        },
    });

    console.warn('[Edge Detection] Browser mapping initialized with flavors:', Array.from(msEdgeBrowserMapping.keys()));
    console.warn('[Edge Detection] Stable primary path:', msEdgeBrowserMapping.get('Stable')?.windows.primary);
})();
