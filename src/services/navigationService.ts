// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

/**
 * Service for handling navigation events and generating panel titles
 */
export class NavigationService {
    /**
     * Extract a friendly display name from a URL
     * For localhost, includes port. For other URLs, returns hostname.
     */
    static extractFriendlyName(url: string): string {
        try {
            const urlObj = new URL(url);
            // For localhost, include port
            if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
                return `${urlObj.hostname}:${urlObj.port || '80'}`;
            }
            // For other URLs, just return hostname
            return urlObj.hostname;
        } catch {
            // If URL parsing fails, return the URL as-is
            return url;
        }
    }

    /**
     * Generate a panel title from the current page URL and instance number
     */
    static generatePanelTitle(currentPageUrl: string, instanceNumber: number): string {
        const friendlyName = currentPageUrl
            ? this.extractFriendlyName(currentPageUrl)
            : localize('panel.defaultTitle', 'Browser');
        return localize('panel.title', 'Browser {0}: {1}', instanceNumber, friendlyName);
    }

    /**
     * Parse a navigation message and extract the URL
     */
    static parseNavigationMessage(message: string): string | null {
        try {
            const navData = JSON.parse(message) as { url: string };
            return navData.url || null;
        } catch {
            // Ignore parse errors
            return null;
        }
    }
}
