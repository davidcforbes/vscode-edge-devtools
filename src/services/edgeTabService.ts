// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as http from 'http';
import * as https from 'https';

/**
 * Service for managing Edge browser tabs via CDP HTTP endpoints
 */
export class EdgeTabService {
    /**
     * Extract the target ID from a WebSocket URL
     * Format: ws://localhost:9222/devtools/page/{targetId}
     */
    static extractTargetId(targetUrl: string): string | null {
        try {
            const url = new URL(targetUrl);
            const pathParts = url.pathname.split('/');
            // Target ID is the last part of the path
            const targetId = pathParts[pathParts.length - 1];
            return targetId || null;
        } catch {
            return null;
        }
    }

    /**
     * Activate (focus) the browser tab with the given WebSocket URL
     */
    static activateTab(targetUrl: string): void {
        const targetId = this.extractTargetId(targetUrl);
        if (!targetId) {
            return;
        }

        try {
            // Extract hostname and port from WebSocket URL
            const url = new URL(targetUrl);
            const hostname = url.hostname;
            const port = url.port;
            // Use https if WebSocket URL uses wss
            const protocol = url.protocol === 'wss:' ? 'https' : 'http';

            // Use HTTP endpoint to activate the target (browser-level command)
            // GET /json/activate/{targetId}
            const httpModule = url.protocol === 'wss:' ? https : http;
            const req = httpModule.get(`${protocol}://${hostname}:${port}/json/activate/${targetId}`, res => {
                if (res.statusCode !== 200) {
                    console.warn(`[EdgeTabService] Failed to activate tab ${targetId}: HTTP ${res.statusCode}`);
                }
            });

            req.on('error', err => {
                console.error(`[EdgeTabService] Error activating tab ${targetId}:`, err);
            });
        } catch (error) {
            console.error('[EdgeTabService] Error in activateTab:', error);
        }
    }

    /**
     * Close the browser tab with the given WebSocket URL
     */
    static closeTab(targetUrl: string): void {
        const targetId = this.extractTargetId(targetUrl);
        if (!targetId) {
            return;
        }

        try {
            // Extract hostname and port from WebSocket URL
            const url = new URL(targetUrl);
            const hostname = url.hostname;
            const port = url.port;
            // Use https if WebSocket URL uses wss
            const protocol = url.protocol === 'wss:' ? 'https' : 'http';

            // Use HTTP endpoint to close the target (browser-level command)
            // GET /json/close/{targetId}
            const httpModule = url.protocol === 'wss:' ? https : http;
            const req = httpModule.get(`${protocol}://${hostname}:${port}/json/close/${targetId}`, res => {
                if (res.statusCode !== 200) {
                    console.warn(`[EdgeTabService] Failed to close tab ${targetId}: HTTP ${res.statusCode}`);
                }
            });

            req.on('error', err => {
                console.error(`[EdgeTabService] Error closing tab ${targetId}:`, err);
            });
        } catch (error) {
            console.error('[EdgeTabService] Error in closeTab:', error);
        }
    }
}
