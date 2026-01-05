// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { PanelSocket } from '../../../../src/panelSocket.js';
import { TestSuite } from '../../types';

function waitFor<T>(predicate: () => T | undefined, timeoutMs = 2000, intervalMs = 25): Promise<T> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            const value = predicate();
            if (value) {
                resolve(value);
                return;
            }
            if (Date.now() - start >= timeoutMs) {
                reject(new Error('Timeout waiting for condition'));
                return;
            }
            setTimeout(tick, intervalMs);
        };
        tick();
    });
}

export const suite: TestSuite = {
    name: 'Network Resilience Integration Tests',
    tests: [
        {
            name: 'should emit close event when target disconnects',
            async run(context) {
                const targetId = await context.browserMock.createTarget('http://localhost:8080');
                const targets = context.browserMock.getTargetList() as Array<{ id: string; webSocketDebuggerUrl: string }>;
                const target = targets.find(item => item.id === targetId);
                if (!target) {
                    throw new Error('Failed to create test target');
                }

                const messages: Array<{ event: string; message?: string }> = [];
                let openCount = 0;
                const socket = new PanelSocket(target.webSocketDebuggerUrl, (event: string, message?: string) => {
                    messages.push({ event, message });
                    if (event === 'open') {
                        openCount += 1;
                    }
                });

                try {
                    const closed = new Promise<void>((resolve, reject) => {
                        socket.on('close', () => resolve());
                        setTimeout(() => reject(new Error('Expected close event')), 1000);
                    });

                    socket.onMessageFromWebview('ready:');
                    await waitFor(() => openCount >= 1);
                    context.browserMock.disconnectTarget(targetId);

                    await closed;
                } finally {
                    socket.dispose();
                }
            }
        },
        {
            name: 'should recover after delayed CDP responses',
            async run(context) {
                const targetId = await context.browserMock.createTarget('http://localhost:8080');
                const targets = context.browserMock.getTargetList() as Array<{ id: string; webSocketDebuggerUrl: string }>;
                const target = targets.find(item => item.id === targetId);
                if (!target) {
                    throw new Error('Failed to create test target');
                }

                context.browserMock.setTargetResponseDelay(targetId, 300);

                const messages: Array<{ event: string; message?: string }> = [];
                let openCount = 0;
                const socket = new PanelSocket(target.webSocketDebuggerUrl, (event: string, message?: string) => {
                    messages.push({ event, message });
                    if (event === 'open') {
                        openCount += 1;
                    }
                });

                try {
                    socket.onMessageFromWebview('ready:');
                    await waitFor(() => openCount >= 1);

                    const command = { id: 33, method: 'Page.navigate', params: { url: 'http://example.com' } };
                    const payload = JSON.stringify({ message: JSON.stringify(command) });
                    socket.onMessageFromWebview(`websocket:${payload}`);

                    let timedOut = false;
                    try {
                        await waitFor(() => messages.find(msg => msg.event === 'message' && msg.message?.includes('"id":33')), 100);
                    } catch {
                        timedOut = true;
                    }

                    if (!timedOut) {
                        throw new Error('Expected short timeout before delayed response');
                    }

                    await waitFor(() => messages.find(msg => msg.event === 'message' && msg.message?.includes('"id":33')), 2000);
                } finally {
                    socket.dispose();
                }
            }
        },
        {
            name: 'should reconnect when websocket message arrives after disconnect',
            async run(context) {
                const targetId = await context.browserMock.createTarget('http://localhost:8080');
                const targets = context.browserMock.getTargetList() as Array<{ id: string; webSocketDebuggerUrl: string }>;
                const target = targets.find(item => item.id === targetId);
                if (!target) {
                    throw new Error('Failed to create test target');
                }

                const messages: Array<{ event: string; message?: string }> = [];
                let openCount = 0;
                const socket = new PanelSocket(target.webSocketDebuggerUrl, (event: string, message?: string) => {
                    messages.push({ event, message });
                    if (event === 'open') {
                        openCount += 1;
                    }
                });

                try {
                    socket.onMessageFromWebview('ready:');
                    await waitFor(() => openCount >= 1);

                    context.browserMock.disconnectTarget(targetId);
                    await waitFor(() => messages.find(msg => msg.event === 'close'), 1000);

                    const command = { id: 44, method: 'Page.navigate', params: { url: 'http://example.com' } };
                    const payload = JSON.stringify({ message: JSON.stringify(command) });
                    socket.onMessageFromWebview(`websocket:${payload}`);

                    await waitFor(() => openCount >= 2, 2000);
                } finally {
                    socket.dispose();
                }
            }
        }
    ]
};
