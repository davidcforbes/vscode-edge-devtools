// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as vscode from 'vscode';
import { ErrorReporter } from './errorReporter';
import { ErrorCodes } from './common/errorCodes';

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

export interface IRequestCDPProxyResult {
    host: string;
    port: number;
    path: string;
}

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
    if (lastError instanceof Error) {
        throw lastError;
    }
    throw new Error('retryAsync timed out');
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
