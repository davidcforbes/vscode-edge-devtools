// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TestSuite } from '../../types';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import WebSocket from 'ws';

// Import real browser utilities
const getBrowserPath = async () => {
    // Dynamically import from the built extension
    // @ts-ignore - Dynamic import from compiled output
    const extensionModule = await import('../../../../extension.js');
    return extensionModule.getBrowserPath?.() || null;
};

const launchBrowser = async (browserPath: string, port: number, url: string, userDataDir: string) => {
    // @ts-ignore - Dynamic import from compiled output
    const extensionModule = await import('../../../../extension.js');
    return extensionModule.launchBrowser?.(browserPath, port, url, userDataDir, false) || null;
};

export const suite: TestSuite = {
    name: 'Real Browser WebSocket Integration Tests',
    tests: [
        {
            name: 'should launch real browser and verify CDP WebSocket connection',
            async run(context) {
                let browser: any = null;
                let userDataDir: string | null = null;

                try {
                    // Check if browser is available
                    const browserPath = await getBrowserPath();
                    if (!browserPath) {
                        console.warn('[Test] Microsoft Edge not found, skipping real browser test');
                        return; // Skip test if browser not available
                    }

                    // Create temp user data directory
                    userDataDir = path.join(os.tmpdir(), `edge-devtools-test-${Date.now()}`);
                    await fs.mkdir(userDataDir, { recursive: true });

                    // Launch real browser
                    const testPort = 9223; // Use different port to avoid conflicts
                    const testUrl = 'about:blank';

                    browser = await launchBrowser(browserPath, testPort, testUrl, userDataDir);

                    if (!browser) {
                        throw new Error('Failed to launch real browser instance');
                    }

                    // Wait for browser to fully start
                    await context.wait(2000);

                    // Get WebSocket endpoint from browser
                    const wsEndpoint = browser.wsEndpoint?.();
                    if (!wsEndpoint) {
                        throw new Error('Browser instance has no WebSocket endpoint');
                    }

                    // Verify endpoint format
                    if (!wsEndpoint.startsWith('ws://')) {
                        throw new Error(`Invalid WebSocket endpoint format: ${wsEndpoint}`);
                    }

                    // Test WebSocket connection
                    const ws = new WebSocket(wsEndpoint);

                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('WebSocket connection timeout'));
                        }, 5000);

                        ws.on('open', () => {
                            clearTimeout(timeout);
                            resolve(void 0);
                        });

                        ws.on('error', (error) => {
                            clearTimeout(timeout);
                            reject(error);
                        });
                    });

                    // Send CDP command to verify communication
                    const messageReceived = new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('CDP response timeout'));
                        }, 5000);

                        ws.on('message', (data) => {
                            clearTimeout(timeout);
                            const response = JSON.parse(data.toString());
                            if (response.id === 1) {
                                resolve(response);
                            }
                        });
                    });

                    // Send Browser.getVersion command
                    ws.send(JSON.stringify({
                        id: 1,
                        method: 'Browser.getVersion',
                        params: {}
                    }));

                    const response: any = await messageReceived;

                    // Verify response structure
                    if (!response.result) {
                        throw new Error('CDP command did not return result');
                    }

                    if (!response.result.product) {
                        throw new Error('CDP response missing product information');
                    }

                    // Verify it's Microsoft Edge
                    if (!response.result.product.includes('Edge')) {
                        throw new Error(`Expected Edge browser, got: ${response.result.product}`);
                    }

                    // Close WebSocket
                    ws.close();

                    console.log('[Test] Successfully verified real browser CDP WebSocket communication');

                } finally {
                    // Cleanup
                    if (browser) {
                        try {
                            await browser.close();
                        } catch (error) {
                            console.error('[Test] Error closing browser:', error);
                        }
                    }

                    if (userDataDir) {
                        try {
                            await fs.rm(userDataDir, { recursive: true, force: true });
                        } catch (error) {
                            console.error('[Test] Error cleaning up user data dir:', error);
                        }
                    }
                }
            }
        },
        {
            name: 'should handle CDP navigation commands on real browser',
            async run(context) {
                let browser: any = null;
                let userDataDir: string | null = null;

                try {
                    // Check if browser is available
                    const browserPath = await getBrowserPath();
                    if (!browserPath) {
                        console.warn('[Test] Microsoft Edge not found, skipping real browser test');
                        return;
                    }

                    // Create temp user data directory
                    userDataDir = path.join(os.tmpdir(), `edge-devtools-test-${Date.now()}`);
                    await fs.mkdir(userDataDir, { recursive: true });

                    // Launch real browser
                    const testPort = 9224; // Use different port
                    const testUrl = 'about:blank';

                    browser = await launchBrowser(browserPath, testPort, testUrl, userDataDir);

                    if (!browser) {
                        throw new Error('Failed to launch real browser instance');
                    }

                    await context.wait(2000);

                    // Get target pages
                    const targets = await browser.targets?.();
                    if (!targets || targets.length === 0) {
                        throw new Error('No targets available in real browser');
                    }

                    // Get first page target
                    const pageTarget = targets.find((t: any) => t.type?.() === 'page');
                    if (!pageTarget) {
                        throw new Error('No page target found');
                    }

                    // Get CDP session for the page
                    const page = await pageTarget.page?.();
                    if (!page) {
                        throw new Error('Failed to get page from target');
                    }

                    // Get the CDP client
                    const client = await page.createCDPSession?.();
                    if (!client) {
                        throw new Error('Failed to create CDP session');
                    }

                    // Test navigation command
                    const navigationResult = await client.send('Page.navigate', {
                        url: 'about:blank'
                    });

                    if (!navigationResult.frameId) {
                        throw new Error('Navigation did not return frameId');
                    }

                    // Wait for navigation to complete
                    await context.wait(1000);

                    console.log('[Test] Successfully executed CDP navigation on real browser');

                } finally {
                    // Cleanup
                    if (browser) {
                        try {
                            await browser.close();
                        } catch (error) {
                            console.error('[Test] Error closing browser:', error);
                        }
                    }

                    if (userDataDir) {
                        try {
                            await fs.rm(userDataDir, { recursive: true, force: true });
                        } catch (error) {
                            console.error('[Test] Error cleaning up user data dir:', error);
                        }
                    }
                }
            }
        },
        {
            name: 'should verify browser isConnected() state changes on real browser',
            async run(context) {
                let browser: any = null;
                let userDataDir: string | null = null;

                try {
                    // Check if browser is available
                    const browserPath = await getBrowserPath();
                    if (!browserPath) {
                        console.warn('[Test] Microsoft Edge not found, skipping real browser test');
                        return;
                    }

                    // Create temp user data directory
                    userDataDir = path.join(os.tmpdir(), `edge-devtools-test-${Date.now()}`);
                    await fs.mkdir(userDataDir, { recursive: true });

                    // Launch real browser
                    const testPort = 9225; // Use different port
                    const testUrl = 'about:blank';

                    browser = await launchBrowser(browserPath, testPort, testUrl, userDataDir);

                    if (!browser) {
                        throw new Error('Failed to launch real browser instance');
                    }

                    await context.wait(2000);

                    // Verify browser is connected
                    if (!browser.isConnected?.()) {
                        throw new Error('Browser should be connected after launch');
                    }

                    // Close browser
                    await browser.close();
                    await context.wait(500);

                    // Verify browser is disconnected
                    if (browser.isConnected?.()) {
                        throw new Error('Browser should be disconnected after close');
                    }

                    console.log('[Test] Successfully verified browser connection state changes');

                } finally {
                    // Cleanup user data dir
                    if (userDataDir) {
                        try {
                            await fs.rm(userDataDir, { recursive: true, force: true });
                        } catch (error) {
                            console.error('[Test] Error cleaning up user data dir:', error);
                        }
                    }
                }
            }
        }
    ]
};
