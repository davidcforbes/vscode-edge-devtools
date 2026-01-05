// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import puppeteer, {Browser, Target, TargetType} from 'puppeteer-core';
import type { IUserConfig } from './config';

// Re-export puppeteer types for lazy loading
// This prevents eager loading of puppeteer-core at extension activation time
// Note: TargetType is exported as value (enum), others as types only
export type { Browser, Target };
export { TargetType };

export type BrowserFlavor = 'Default' | 'Stable' | 'Beta' | 'Dev' | 'Canary';

export type Platform = 'Windows' | 'OSX' | 'Linux';

interface IBrowserPath {
    debianLinux: string;
    windows: {
        primary: string;
        secondary: string;
    };
    osx: string;
}

const WIN_APP_DATA = process.env.LOCALAPPDATA || '/';
const msEdgeBrowserMapping: Map<BrowserFlavor, IBrowserPath> = new Map<BrowserFlavor, IBrowserPath>();

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
    '--disable-site-per-process',  // Disables process isolation (critical security feature)
    '--allow-file-access-from-files',
    '--disable-features',
    '--disable-blink-features',     // Can disable security features
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
    '--enable-automation',          // Can bypass bot detection and security checks
    '--remote-debugging-address',   // Could bind to public IP instead of localhost
]);

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
 * Verifies if the headless checkbox in extension settings is enabled.
 */
export function isHeadlessEnabled(): boolean {
    const settings = vscode.workspace.getConfiguration('vscode-edge-devtools');
    const headless: boolean = settings.get('headless') || false;
    return headless;
}

/**
 * get the command line args which are passed to the browser.
 * Only allows safe flags to prevent security issues.
 */
export function getBrowserArgs(): string[] {
    const settings = vscode.workspace.getConfiguration('vscode-edge-devtools');
    const browserArgs: string[] = settings.get('browserArgs') || [];

    const sanitized: string[] = [];
    const blockedDangerous: string[] = [];
    const blockedUnknown: string[] = [];

    for (const arg of browserArgs) {
        const trimmed = arg.trim();
        if (!trimmed) {
            continue;
        }

        // Extract flag name (before = sign if present)
        const flagName = trimmed.split('=')[0];

        // Special case: Allow --disable-blink-features=AutomationControlled for Cloudflare bypass
        // This is safe as it only hides automation detection, not a security feature
        if (trimmed === '--disable-blink-features=AutomationControlled') {
            sanitized.push(trimmed);
            continue;
        }

        // Check if it's a dangerous flag
        if (DANGEROUS_FLAGS.has(flagName) || flagName.startsWith('--disable-')) {
            blockedDangerous.push(flagName);
            console.warn(`[Security] Blocked dangerous browser flag: ${flagName}`);
            continue;
        }

        // Check if it's on the allowlist
        if (SAFE_BROWSER_FLAGS.has(flagName)) {
            sanitized.push(trimmed);
        } else {
            // Unknown flag - block for security (strict allowlist)
            blockedUnknown.push(flagName);
            console.warn(`[Security] Blocked unknown browser flag (not on allowlist): ${flagName}`);
        }
    }

    // Show user-visible warning if any flags were blocked
    const allBlocked = [...blockedDangerous, ...blockedUnknown];
    if (allBlocked.length > 0) {
        const dangerousMsg = blockedDangerous.length > 0
            ? `${blockedDangerous.length} dangerous flag(s): ${blockedDangerous.join(', ')}`
            : '';
        const unknownMsg = blockedUnknown.length > 0
            ? `${blockedUnknown.length} unknown flag(s): ${blockedUnknown.join(', ')}`
            : '';
        const separator = dangerousMsg && unknownMsg ? '; ' : '';

        void vscode.window.showWarningMessage(
            `Blocked browser flags for security: ${dangerousMsg}${separator}${unknownMsg}. ` +
            'Only flags on the safe allowlist are permitted. See extension documentation for allowed flags.'
        );
    }

    return sanitized;
}

/**
 * Gets the browser path for the specified browser flavor.
 *
 * @param config The settings specified by a launch config, if any
 */
export async function getBrowserPath(config: Partial<IUserConfig> = {}): Promise<string> {
    const settings = vscode.workspace.getConfiguration('vscode-edge-devtools');
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
        '--disable-blink-features=AutomationControlled', // Hide automation signals for Cloudflare bypass
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
 * Launch browser with timeout protection to prevent indefinite hangs.
 *
 * @param browserPath The path of the browser to launch
 * @param port The port on which to enable remote debugging
 * @param targetUrl The url of the page to open
 * @param userDataDir The user data directory for the launched instance
 * @param forceHeadless This force overrides the --headless arg for browser launch
 * @param timeoutMs Timeout in milliseconds (default: 30000)
 * @returns Promise that resolves to Browser instance or rejects on timeout
 * @throws Error if browser launch times out or fails
 */
export async function launchBrowserWithTimeout(
    browserPath: string,
    port: number,
    targetUrl: string,
    userDataDir?: string,
    forceHeadless?: boolean,
    timeoutMs: number = 30000
): Promise<Browser> {
    return Promise.race([
        launchBrowser(browserPath, port, targetUrl, userDataDir, forceHeadless),
        new Promise<Browser>((_, reject) =>
            setTimeout(() => reject(new Error(`Browser launch timed out after ${timeoutMs}ms. This may indicate browser installation issues or resource constraints.`)), timeoutMs)
        )
    ]);
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

// Initialize browser path mapping
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
