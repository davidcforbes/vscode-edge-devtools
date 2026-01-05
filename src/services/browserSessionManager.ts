// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Browser } from '../browser';
import { openNewTab, IRemoteTargetJson } from '../network';

/**
 * Service that encapsulates shared browser session lifecycle, liveness checks, and cleanup.
 * Replaces global sharedBrowserInstance/sharedBrowserPort variables with a dedicated service.
 */
export class BrowserSessionManager {
    private sharedBrowser: Browser | null = null;
    private sharedPort: number | null = null;

    /**
     * Get the current shared browser instance if it exists and is still connected.
     * Automatically clears stale references if browser is disconnected.
     * @returns The shared browser and port, or null if none exists or is disconnected
     */
    getSharedSession(): { browser: Browser; port: number } | null {
        if (this.sharedBrowser && this.sharedPort) {
            // Verify browser is still alive before returning
            if (!this.sharedBrowser.isConnected()) {
                console.warn('[BrowserSessionManager] Shared browser is no longer connected, clearing stale reference');
                this.clearSharedSession();
                return null;
            }
            return { browser: this.sharedBrowser, port: this.sharedPort };
        }
        return null;
    }

    /**
     * Set the shared browser instance for reuse across multiple screencast panels.
     * Automatically registers disconnect handler to clean up when browser closes.
     * @param browser The browser instance to share
     * @param port The CDP port the browser is listening on
     */
    setSharedSession(browser: Browser, port: number): void {
        // Only set if there's not already a shared instance
        if (!this.sharedBrowser) {
            this.sharedBrowser = browser;
            this.sharedPort = port;
            console.warn(`[BrowserSessionManager] Set shared browser session on port ${port}`);

            // Register disconnect handler to clear reference when browser closes
            browser.on('disconnected', () => {
                console.warn('[BrowserSessionManager] Shared browser disconnected, clearing session');
                this.clearSharedSession();
            });
        }
    }

    /**
     * Check if there's a shared browser session available.
     * @returns true if a shared session exists and is connected
     */
    hasSharedSession(): boolean {
        return this.getSharedSession() !== null;
    }

    /**
     * Try to open a new tab in the existing shared browser.
     * @param hostname CDP endpoint hostname
     * @param targetUrl URL to open in the new tab
     * @param useHttps Whether to use HTTPS for CDP connection
     * @returns Target info if successful, null if failed or no shared browser
     */
    async openNewTabInSharedBrowser(
        hostname: string,
        targetUrl: string,
        useHttps: boolean = false
    ): Promise<IRemoteTargetJson | null> {
        const session = this.getSharedSession();
        if (!session) {
            return null;
        }

        console.warn(`[BrowserSessionManager] Reusing existing browser on port ${session.port}, creating new tab for: ${targetUrl}`);
        try {
            const target = await openNewTab(hostname, session.port, targetUrl, useHttps);
            if (target && target.webSocketDebuggerUrl) {
                return target;
            }
            console.warn('[BrowserSessionManager] Failed to create new tab in existing browser');
            return null;
        } catch (error) {
            console.warn('[BrowserSessionManager] Error creating new tab:', error);
            return null;
        }
    }

    /**
     * Close the shared browser instance and clear the session.
     * Safe to call even if no shared browser exists.
     */
    async closeSharedBrowser(): Promise<void> {
        if (this.sharedBrowser) {
            const browserToClose = this.sharedBrowser;
            console.warn('[BrowserSessionManager] Closing shared browser instance');

            try {
                await browserToClose.close();
                console.warn('[BrowserSessionManager] Shared browser closed successfully');
            } catch (error) {
                console.error('[BrowserSessionManager] Error closing shared browser:', error);
            }

            this.clearSharedSession();
        }
    }

    /**
     * Clear the shared session reference without closing the browser.
     * Used when browser is already disconnected or will be closed externally.
     */
    clearSharedSession(): void {
        this.sharedBrowser = null;
        this.sharedPort = null;
    }
}
