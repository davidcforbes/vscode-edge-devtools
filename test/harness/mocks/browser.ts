// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';

export interface CDPMessage {
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
}

export class CDPTargetMock extends EventEmitter {
    private socket?: WebSocket;

    constructor(
        public id: string,
        public url: string,
        public title = 'Test Page'
    ) {
        super();
    }

    attachSocket(socket: WebSocket): void {
        this.socket = socket;

        socket.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString()) as CDPMessage;
                this.handleCommand(message);
            } catch (error) {
                console.error('Failed to parse CDP message:', error);
            }
        });

        socket.on('close', () => {
            this.socket = undefined;
        });
    }

    private handleCommand(message: CDPMessage): void {
        const { id, method, params } = message;

        if (!id || !method) {
            return;
        }

        // Simulate CDP responses based on method
        switch (method) {
            case 'Page.navigate':
                this.url = (params as any)?.url || this.url;
                this.sendResponse(id, {
                    frameId: 'main-frame',
                    loaderId: `loader-${Date.now()}`,
                });
                // Send loadEventFired after navigation
                setTimeout(() => {
                    this.sendEvent('Page.loadEventFired', { timestamp: Date.now() });
                }, 100);
                break;

            case 'Page.getLayoutMetrics':
                this.sendResponse(id, {
                    layoutViewport: {
                        pageX: 0,
                        pageY: 0,
                        clientWidth: 1280,
                        clientHeight: 720,
                    },
                    visualViewport: {
                        offsetX: 0,
                        offsetY: 0,
                        pageX: 0,
                        pageY: 0,
                        clientWidth: 1280,
                        clientHeight: 720,
                        scale: 1,
                        zoom: 1,
                    },
                    contentSize: {
                        x: 0,
                        y: 0,
                        width: 1280,
                        height: 720,
                    },
                });
                break;

            case 'Page.captureScreenshot':
                this.sendResponse(id, {
                    data: Buffer.from('fake-screenshot-data').toString('base64'),
                });
                break;

            case 'Runtime.evaluate':
                this.sendResponse(id, {
                    result: {
                        type: 'string',
                        value: 'mock eval result',
                    },
                });
                break;

            case 'Target.getTargetInfo':
                this.sendResponse(id, {
                    targetInfo: {
                        targetId: this.id,
                        type: 'page',
                        title: this.title,
                        url: this.url,
                        attached: true,
                        canAccessOpener: false,
                    },
                });
                break;

            case 'Page.enable':
            case 'Runtime.enable':
            case 'Network.enable':
            case 'DOM.enable':
            case 'CSS.enable':
            case 'Overlay.enable':
            case 'Emulation.setDeviceMetricsOverride':
            case 'Emulation.setVisibleSize':
                // Acknowledge enable commands with empty result
                this.sendResponse(id, {});
                break;

            default:
                // Unknown command - send empty result
                this.sendResponse(id, {});
                break;
        }
    }

    private sendResponse(id: number, result: unknown): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ id, result }));
        }
    }

    private sendEvent(method: string, params: unknown): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ method, params }));
        }
    }

    close(): void {
        this.socket?.close();
        this.socket = undefined;
    }
}

export class BrowserMock extends EventEmitter {
    private wsServer?: WebSocketServer;
    private cdpTargets: Map<string, CDPTargetMock> = new Map();
    public port = 9222;

    async launch(): Promise<void> {
        // Start WebSocket server to simulate CDP endpoint
        this.wsServer = new WebSocketServer({ port: this.port });

        this.wsServer.on('connection', (ws, req) => {
            const url = req.url || '';
            const targetId = this.extractTargetId(url);

            if (targetId) {
                const target = this.cdpTargets.get(targetId);
                if (target) {
                    target.attachSocket(ws);
                }
            }
        });

        this.wsServer.on('error', (error) => {
            console.error('WebSocket server error:', error);
        });

        // Create default target
        await this.createTarget('http://localhost:8080');
    }

    async createTarget(url: string, title = 'Test Page'): Promise<string> {
        const targetId = `target-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const target = new CDPTargetMock(targetId, url, title);
        this.cdpTargets.set(targetId, target);
        this.emit('targetCreated', { targetId, url, title });
        return targetId;
    }

    async closeTarget(targetId: string): Promise<void> {
        const target = this.cdpTargets.get(targetId);
        if (target) {
            target.close();
            this.cdpTargets.delete(targetId);
            this.emit('targetClosed', { targetId });
        }
    }

    async close(): Promise<void> {
        // Close all targets
        for (const target of this.cdpTargets.values()) {
            target.close();
        }
        this.cdpTargets.clear();

        // Close WebSocket server
        if (this.wsServer) {
            await new Promise<void>((resolve, reject) => {
                this.wsServer!.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            this.wsServer = undefined;
        }
    }

    getTargetList(): unknown[] {
        return Array.from(this.cdpTargets.values()).map((target) => ({
            id: target.id,
            type: 'page',
            title: target.title,
            url: target.url,
            description: '',
            devtoolsFrontendUrl: `/devtools/inspector.html?ws=localhost:${this.port}/devtools/page/${target.id}`,
            webSocketDebuggerUrl: `ws://localhost:${this.port}/devtools/page/${target.id}`,
            faviconUrl: '',
        }));
    }

    private extractTargetId(url: string): string | null {
        // Extract target ID from WebSocket URL
        // Example: /devtools/page/target-123 -> target-123
        const match = url.match(/\/devtools\/page\/(.+?)(\?|$)/);
        return match ? match[1] : null;
    }
}
