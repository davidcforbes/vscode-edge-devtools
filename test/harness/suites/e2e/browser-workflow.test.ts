// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TestSuite } from '../../types';

export const suite: TestSuite = {
    name: 'Browser Workflow E2E Tests',
    tests: [
        {
            name: 'should create browser target and verify CDP endpoint availability',
            async run(context) {
                // Create a browser target in the mock
                const targetId = await context.browserMock.createTarget('http://localhost:8080', 'Test Page');

                if (!targetId) {
                    throw new Error('Failed to create browser target');
                }

                // Verify target is available in the target list
                const targets = context.browserMock.getTargetList() as any[];
                if (targets.length === 0) {
                    throw new Error('No targets available after creation');
                }

                const target: any = targets.find((t: any) => t.id === targetId);
                if (!target) {
                    throw new Error('Created target not found in target list');
                }

                // Verify target has required CDP properties
                if (!target.webSocketDebuggerUrl) {
                    throw new Error('Target missing webSocketDebuggerUrl');
                }

                // Close the target
                await context.browserMock.closeTarget(targetId);

                // Verify target was removed
                const remainingTargets = context.browserMock.getTargetList();
                const stillExists = remainingTargets.find((t: any) => t.id === targetId);
                if (stillExists) {
                    throw new Error('Target still exists after close');
                }
            }
        },
        {
            name: 'should manage multiple browser targets independently',
            async run(context) {
                const urls = [
                    'http://localhost:3000',
                    'http://localhost:8080',
                    'https://www.example.com'
                ];

                // Create 3 targets
                const targetIds: string[] = [];
                for (const url of urls) {
                    const targetId = await context.browserMock.createTarget(url, `Page: ${url}`);
                    targetIds.push(targetId);
                }

                // Verify all targets exist (plus the default one created during setup)
                const targets = context.browserMock.getTargetList() as any[];
                if (targets.length < 3) {
                    throw new Error(`Expected at least 3 targets, got ${targets.length}`);
                }

                // Verify each target has the correct URL
                for (let i = 0; i < targetIds.length; i++) {
                    const target: any = targets.find((t: any) => t.id === targetIds[i]);
                    if (!target) {
                        throw new Error(`Target ${targetIds[i]} not found`);
                    }

                    if (target.url !== urls[i]) {
                        throw new Error(`Target ${i} has wrong URL: expected ${urls[i]}, got ${target.url}`);
                    }
                }

                // Close all targets one by one
                for (const targetId of targetIds) {
                    await context.browserMock.closeTarget(targetId);
                }

                // Verify targets were removed
                const remainingTargets = context.browserMock.getTargetList();
                for (const targetId of targetIds) {
                    const stillExists = remainingTargets.find((t: any) => t.id === targetId);
                    if (stillExists) {
                        throw new Error(`Target ${targetId} still exists after close`);
                    }
                }
            }
        },
        {
            name: 'should handle rapid target creation and closure',
            async run(context) {
                const iterations = 5;

                for (let i = 0; i < iterations; i++) {
                    // Create target
                    const targetId = await context.browserMock.createTarget(
                        `http://localhost:${3000 + i}`,
                        `Test ${i}`
                    );

                    // Verify it exists
                    const targets = context.browserMock.getTargetList();
                    const target = targets.find((t: any) => t.id === targetId);
                    if (!target) {
                        throw new Error(`Target not found in iteration ${i}`);
                    }

                    // Immediate close
                    await context.browserMock.closeTarget(targetId);

                    // Verify cleanup
                    const remainingTargets = context.browserMock.getTargetList();
                    const stillExists = remainingTargets.find((t: any) => t.id === targetId);
                    if (stillExists) {
                        throw new Error(`Target not cleaned up in iteration ${i}`);
                    }
                }
            }
        },
        {
            name: 'should verify browser mock CDP server is running',
            async run(context) {
                // Verify browser mock has correct port
                if (context.browserMock.port !== 9222) {
                    throw new Error(`Expected port 9222, got ${context.browserMock.port}`);
                }

                // Create a target to verify CDP is working
                const targetId = await context.browserMock.createTarget('http://localhost:8080');

                const targets = context.browserMock.getTargetList() as any[];
                const target: any = targets.find((t: any) => t.id === targetId);

                if (!target) {
                    throw new Error('Target not found');
                }

                // Verify CDP URL structure
                const expectedWsUrl = `ws://localhost:9222/devtools/page/${targetId}`;
                if (target.webSocketDebuggerUrl !== expectedWsUrl) {
                    throw new Error(`Expected WebSocket URL ${expectedWsUrl}, got ${target.webSocketDebuggerUrl}`);
                }

                await context.browserMock.closeTarget(targetId);
            }
        },
        {
            name: 'should support browser target events',
            async run(context) {
                let targetCreated = false;
                let targetClosed = false;
                let createdTargetId: string | null = null;

                // Listen for target events
                context.browserMock.on('targetCreated', (event: any) => {
                    targetCreated = true;
                    createdTargetId = event.targetId;
                });

                context.browserMock.on('targetClosed', (event: any) => {
                    if (event.targetId === createdTargetId) {
                        targetClosed = true;
                    }
                });

                // Create and close a target
                const targetId = await context.browserMock.createTarget('http://test.com');
                await context.wait(100);

                if (!targetCreated) {
                    throw new Error('targetCreated event not fired');
                }

                if (createdTargetId !== targetId) {
                    throw new Error('Created target ID mismatch');
                }

                await context.browserMock.closeTarget(targetId);
                await context.wait(100);

                if (!targetClosed) {
                    throw new Error('targetClosed event not fired');
                }

                // Clean up listeners
                context.browserMock.removeAllListeners('targetCreated');
                context.browserMock.removeAllListeners('targetClosed');
            }
        },
        {
            name: 'should preserve target state across operations',
            async run(context) {
                const url = 'https://example.com';
                const title = 'Example Page';

                const targetId = await context.browserMock.createTarget(url, title);

                // Verify initial state
                let targets = context.browserMock.getTargetList();
                let target: any = targets.find((t: any) => t.id === targetId);

                if (target.url !== url) {
                    throw new Error('URL mismatch');
                }

                if (target.title !== title) {
                    throw new Error('Title mismatch');
                }

                // Perform operations and verify state persists
                await context.wait(100);

                targets = context.browserMock.getTargetList();
                target = targets.find((t: any) => t.id === targetId);

                if (!target) {
                    throw new Error('Target disappeared');
                }

                if (target.url !== url) {
                    throw new Error('URL changed unexpectedly');
                }

                await context.browserMock.closeTarget(targetId);
            }
        },
        {
            name: 'should cleanup all targets on browser close',
            async run(context) {
                // Create multiple targets
                const targetIds: string[] = [];
                for (let i = 0; i < 3; i++) {
                    const targetId = await context.browserMock.createTarget(`http://test${i}.com`);
                    targetIds.push(targetId);
                }

                // Verify targets exist
                let targets = context.browserMock.getTargetList();
                if (targets.length < 3) {
                    throw new Error('Not all targets created');
                }

                // Close browser (this happens in teardown, but we can test the behavior)
                // Note: We can't actually close the browser mock here as it's shared across tests
                // Instead, we'll verify individual target cleanup
                for (const targetId of targetIds) {
                    await context.browserMock.closeTarget(targetId);
                }

                // Verify all created targets are gone
                targets = context.browserMock.getTargetList();
                for (const targetId of targetIds) {
                    const stillExists = targets.find((t: any) => t.id === targetId);
                    if (stillExists) {
                        throw new Error(`Target ${targetId} not cleaned up`);
                    }
                }
            }
        },
        {
            name: 'should verify test context provides required utilities',
            async run(context) {
                // Verify context has required properties
                if (!context.extensionMock) {
                    throw new Error('Missing extensionMock');
                }

                if (!context.browserMock) {
                    throw new Error('Missing browserMock');
                }

                if (!context.workspaceFolder) {
                    throw new Error('Missing workspaceFolder');
                }

                // Verify context has required methods
                if (typeof context.wait !== 'function') {
                    throw new Error('Missing wait method');
                }

                if (typeof context.getPanels !== 'function') {
                    throw new Error('Missing getPanels method');
                }

                if (typeof context.getLatestPanel !== 'function') {
                    throw new Error('Missing getLatestPanel method');
                }

                // Verify wait method works
                const startTime = Date.now();
                await context.wait(100);
                const elapsed = Date.now() - startTime;

                if (elapsed < 90) {
                    throw new Error('Wait method not working correctly');
                }
            }
        }
    ]
};
