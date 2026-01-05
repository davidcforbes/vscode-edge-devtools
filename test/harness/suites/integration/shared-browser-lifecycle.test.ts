// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TestSuite } from '../../types';

export const suite: TestSuite = {
    name: 'Shared Browser Lifecycle Integration Tests',
    tests: [
        {
            name: 'should reuse shared browser instance for multiple launches',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping shared browser lifecycle tests');
                    return;
                }

                await context.extensionMock.executeCommand('vscode-edge-devtools.launch', { launchUrl: 'http://localhost:8080' });
                await context.wait(200);
                await context.extensionMock.executeCommand('vscode-edge-devtools.launch', { launchUrl: 'http://localhost:8081' });
                await context.wait(200);

                const panels = context.getPanels('vscode-edge-devtools');
                if (panels.length < 2) {
                    throw new Error('Expected multiple panels for shared browser reuse');
                }
            }
        },
        {
            name: 'should clear shared browser when last panel closes',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping shared browser lifecycle tests');
                    return;
                }

                await context.extensionMock.executeCommand('vscode-edge-devtools.launch', { launchUrl: 'http://localhost:8082' });
                await context.wait(200);

                const panel = context.getLatestPanel();
                if (!panel) {
                    throw new Error('Expected panel to be created');
                }

                panel.dispose();
                await context.wait(200);

                const remaining = context.getPanels('vscode-edge-devtools');
                if (remaining.length !== 0) {
                    throw new Error('Expected all panels to be closed');
                }
            }
        }
    ]
};
