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
    name: 'Screencast Frame Artifact Integration Tests',
    tests: [
        {
            name: 'should emit screencast frames for capture',
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

                    const command = { id: 101, method: 'Page.startScreencast', params: {} };
                    const payload = JSON.stringify({ message: JSON.stringify(command) });
                    socket.onMessageFromWebview(`websocket:${payload}`);

                    await waitFor(() => messages.find(msg => msg.event === 'message' && msg.message?.includes('Page.screencastFrame')));
                } finally {
                    socket.dispose();
                }
            }
        }
    ]
};
