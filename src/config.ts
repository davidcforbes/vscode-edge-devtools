// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { BrowserFlavor } from './browser';
import { validateCDPHostname, getHostnameType } from './common/hostnameValidation';
import { validateUserDataDir } from './common/pathValidation';

export interface IStringDictionary<T> {
    [name: string]: T;
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

/** Build-specified flags. */
declare const DEBUG: boolean;
declare const DEVTOOLS_BASE_URI: string | undefined;

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

    // Validate CDP hostname for security (SSRF prevention)
    const hostnameApproved = await validateCDPHostname(hostname);
    if (!hostnameApproved) {
        throw new Error(`CDP connection to remote hostname "${hostname}" was rejected by user for security reasons.`);
    }

    // Log hostname type for telemetry/audit
    const hostnameType = getHostnameType(hostname);
    console.log(`[CDP Security] Connecting to ${hostnameType} CDP endpoint: ${hostname}`);

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

    // Validate userDataDir path for security (path traversal prevention)
    if (typeof userDataDir === 'string' && userDataDir !== '') {
        const validation = validateUserDataDir(userDataDir);
        if (!validation.valid) {
            console.warn(`[Path Security] Invalid userDataDir "${userDataDir}": ${validation.error}`);
            void vscode.window.showWarningMessage(
                `Invalid userDataDir setting: ${validation.error}. Using default temp directory instead.`
            );
            // Fall back to auto-generated temp directory
            userDataDir = true;
        } else if (validation.normalized) {
            // Use normalized path
            userDataDir = validation.normalized;
            console.log(`[Path Security] Using validated userDataDir: ${userDataDir}`);
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
