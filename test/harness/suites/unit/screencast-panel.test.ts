// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TestSuite } from '../../types.js';

export const suite: TestSuite = {
    name: 'ScreencastPanel Unit Tests',
    tests: [
        {
            name: 'should register launch command',
            async run(context) {
                const commands = Array.from(context.extensionMock.commands.keys());

                if (!commands.includes('vscode-edge-devtools.launch')) {
                    throw new Error('Launch command not registered');
                }
            }
        },
        {
            name: 'should create panel on launch',
            async run(context) {
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:8080' }
                );

                await context.wait(200);

                const panels = context.getPanels('vscode-edge-devtools');

                if (panels.length === 0) {
                    throw new Error('No screencast panel created');
                }

                // Title should be "Browser 1: Browser" (instance 1 with no URL yet)
                if (!panels[0].title.startsWith('Browser 1:')) {
                    throw new Error(`Expected title to start with 'Browser 1:', got '${panels[0].title}'`);
                }
            }
        },
        {
            name: 'should dispose panel on close',
            async run(context) {
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:8080' }
                );

                await context.wait(200);

                const panel = context.getLatestPanel();
                let disposed = false;

                panel.on('dispose', () => {
                    disposed = true;
                });

                panel.dispose();
                await context.wait(50);

                if (!disposed) {
                    throw new Error('Panel was not disposed');
                }
            }
        }
    ]
};
