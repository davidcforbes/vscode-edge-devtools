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
    name: 'PanelSocket Protocol Integration Tests',
    tests: [
        {
            name: 'should forward allowed CDP commands and receive responses',
            async run(context) {
                const targetId = await context.browserMock.createTarget('http://localhost:8080');
                const targets = context.browserMock.getTargetList() as Array<{ id: string; webSocketDebuggerUrl: string }>;
                const target = targets.find(item => item.id === targetId);
                if (!target) {
                    throw new Error('Failed to create test target');
                }

                const messages: Array<{ event: string; message?: string }> = [];
                const socket = new PanelSocket(target.webSocketDebuggerUrl, (event: string, message?: string) => {
                    messages.push({ event, message });
                });

                try {
                    socket.onMessageFromWebview('ready:');
                    await waitFor(() => messages.find(msg => msg.event === 'open'));

                    const command = { id: 1, method: 'Page.navigate', params: { url: 'http://example.com' } };
                    const payload = JSON.stringify({ message: JSON.stringify(command) });
                    socket.onMessageFromWebview(`websocket:${payload}`);

                    await waitFor(() => messages.find(msg => msg.event === 'message' && msg.message?.includes('"id":1')));
                } finally {
                    socket.dispose();
                }
            }
        },
        {
            name: 'should reject unauthorized CDP commands',
            async run(context) {
                const targetId = await context.browserMock.createTarget('http://localhost:8080');
                const targets = context.browserMock.getTargetList() as Array<{ id: string; webSocketDebuggerUrl: string }>;
                const target = targets.find(item => item.id === targetId);
                if (!target) {
                    throw new Error('Failed to create test target');
                }

                const messages: Array<{ event: string; message?: string }> = [];
                const socket = new PanelSocket(target.webSocketDebuggerUrl, (event: string, message?: string) => {
                    messages.push({ event, message });
                });

                try {
                    socket.onMessageFromWebview('ready:');
                    await waitFor(() => messages.find(msg => msg.event === 'open'));

                    const command = { id: 2, method: 'Browser.close', params: {} };
                    const payload = JSON.stringify({ message: JSON.stringify(command) });
                    socket.onMessageFromWebview(`websocket:${payload}`);

                    await new Promise(resolve => setTimeout(resolve, 200));
                    const response = messages.find(msg => msg.event === 'message' && msg.message?.includes('"id":2'));
                    if (response) {
                        throw new Error('Unauthorized command should not be forwarded');
                    }
                } finally {
                    socket.dispose();
                }
            }
        },
        {
            name: 'should emit parseError for invalid websocket payloads',
            async run(context) {
                const targetId = await context.browserMock.createTarget('http://localhost:8080');
                const targets = context.browserMock.getTargetList() as Array<{ id: string; webSocketDebuggerUrl: string }>;
                const target = targets.find(item => item.id === targetId);
                if (!target) {
                    throw new Error('Failed to create test target');
                }

                const socket = new PanelSocket(target.webSocketDebuggerUrl, () => {
                    // No-op
                });

                try {
                    const parseError = new Promise<void>((resolve, reject) => {
                        socket.on('parseError', () => resolve());
                        setTimeout(() => reject(new Error('Expected parseError event')), 500);
                    });

                    socket.onMessageFromWebview('ready:');
                    socket.onMessageFromWebview('websocket:{"message":123}');

                    await parseError;
                } finally {
                    socket.dispose();
                }
            }
        },
        {
            name: 'should emit clipboard events for webview messages',
            async run(context) {
                const targetId = await context.browserMock.createTarget('http://localhost:8080');
                const targets = context.browserMock.getTargetList() as Array<{ id: string; webSocketDebuggerUrl: string }>;
                const target = targets.find(item => item.id === targetId);
                if (!target) {
                    throw new Error('Failed to create test target');
                }

                const socket = new PanelSocket(target.webSocketDebuggerUrl, () => {
                    // No-op
                });

                try {
                    const writePromise = new Promise<string>((resolve) => {
                        socket.on('writeToClipboard', (message: string) => resolve(message));
                    });
                    const readPromise = new Promise<string>((resolve) => {
                        socket.on('readClipboard', (message: string) => resolve(message));
                    });

                    socket.onMessageFromWebview('writeToClipboard:{"data":{"message":"hello"}}');
                    socket.onMessageFromWebview('readClipboard:');

                    const writePayload = await writePromise;
                    if (!writePayload.includes('"hello"')) {
                        throw new Error('Unexpected clipboard payload');
                    }

                    const readPayload = await readPromise;
                    if (readPayload !== '') {
                        throw new Error('Expected empty payload for readClipboard');
                    }
                } finally {
                    socket.dispose();
                }
            }
        }
    ]
};
