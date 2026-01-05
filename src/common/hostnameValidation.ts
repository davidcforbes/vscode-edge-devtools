// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';

/**
 * Hostnames that are considered safe for CDP connections (localhost variants).
 */
const SAFE_CDP_HOSTNAMES = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    '[::1]', // IPv6 with brackets
]);

/**
 * Checks if a hostname is a localhost variant and safe for CDP connections.
 *
 * @param hostname The hostname to check
 * @returns true if hostname is localhost, false otherwise
 */
export function isLocalhostHostname(hostname: string): boolean {
    if (!hostname) {
        return false;
    }

    const normalized = hostname.trim().toLowerCase();
    return SAFE_CDP_HOSTNAMES.has(normalized);
}

/**
 * Validates a CDP hostname and shows a security warning for remote hosts.
 * Requires user confirmation before allowing connection to non-localhost hosts.
 *
 * @param hostname The hostname to validate
 * @returns true if connection should proceed, false if blocked by user
 */
export async function validateCDPHostname(hostname: string): Promise<boolean> {
    // Localhost is always safe
    if (isLocalhostHostname(hostname)) {
        return true;
    }

    // Remote host - show security warning and require confirmation
    const message = `Security Warning: The extension is configured to connect to a remote CDP endpoint at "${hostname}". ` +
                    `This could expose internal network services if configured incorrectly. ` +
                    `Only proceed if you trust this hostname and understand the security implications.`;

    const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        'Connect Anyway',
        'Cancel'
    );

    const approved = choice === 'Connect Anyway';

    // Log for audit trail
    console.warn(`[CDP Hostname Validation] Remote hostname "${hostname}" - User ${approved ? 'approved' : 'rejected'} connection`);

    return approved;
}

/**
 * Gets a display-friendly description of the hostname type for telemetry.
 *
 * @param hostname The hostname to classify
 * @returns 'localhost' or 'remote'
 */
export function getHostnameType(hostname: string): 'localhost' | 'remote' {
    return isLocalhostHostname(hostname) ? 'localhost' : 'remote';
}
