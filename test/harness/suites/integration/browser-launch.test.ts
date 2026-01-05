// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TestSuite } from '../../types';

export const suite: TestSuite = {
    name: 'Browser Launch Integration Tests',
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
            name: 'should register attach command',
            async run(context) {
                const commands = Array.from(context.extensionMock.commands.keys());
                if (!commands.includes('vscode-edge-devtools.attach')) {
                    throw new Error('Attach command not registered');
                }
            }
        },
        {
            name: 'should register browser management commands',
            async run(context) {
                const requiredCommands = [
                    'vscode-edge-devtools.newBrowserWindow',
                    'vscode-edge-devtools.listOpenBrowsers',
                    'vscode-edge-devtools.switchToBrowser',
                    'vscode-edge-devtools.closeCurrentBrowser'
                ];

                const commands = Array.from(context.extensionMock.commands.keys());

                for (const cmd of requiredCommands) {
                    if (!commands.includes(cmd)) {
                        throw new Error(`Command not registered: ${cmd}`);
                    }
                }
            }
        },
        {
            name: 'should skip browser launch tests when SKIP_EDGE_LAUNCH is set',
            async run() {
                if (!process.env.SKIP_EDGE_LAUNCH) {
                    return;
                }
                console.log('[Test] SKIP_EDGE_LAUNCH set - skipping launch tests that require Edge');
            }
        },
        {
            name: 'should launch browser with default URL',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping browser launch test');
                    return;
                }
                // Execute launch command with default URL
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch'
                );

                await context.wait(200);

                // Verify panel was created
                const panels = context.getPanels('vscode-edge-devtools');
                if (panels.length === 0) {
                    throw new Error('No panel created after launch');
                }
            }
        },
        {
            name: 'should launch browser with custom URL',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping browser launch test');
                    return;
                }
                const testUrl = 'http://localhost:8080';

                // Execute launch command with custom URL
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: testUrl }
                );

                await context.wait(200);

                // Verify panel was created
                const panels = context.getPanels('vscode-edge-devtools');
                if (panels.length === 0) {
                    throw new Error('No panel created after launch with custom URL');
                }
            }
        },
        {
            name: 'should handle multiple browser instances',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping multi-instance launch test');
                    return;
                }
                const urls = [
                    'http://localhost:8080',
                    'http://localhost:9000',
                    'http://localhost:3000'
                ];

                // Launch multiple instances
                for (const url of urls) {
                    await context.extensionMock.executeCommand(
                        'vscode-edge-devtools.launch',
                        { launchUrl: url }
                    );
                    await context.wait(100);
                }

                // Verify multiple panels created
                const panels = context.getPanels('vscode-edge-devtools');
                if (panels.length !== urls.length) {
                    throw new Error(`Expected ${urls.length} panels, got ${panels.length}`);
                }
            }
        },
        {
            name: 'should cleanup on browser close',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping browser cleanup test');
                    return;
                }
                // Launch browser
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:8080' }
                );

                await context.wait(200);

                // Get the panel
                const panel = context.getLatestPanel();
                if (!panel) {
                    throw new Error('No panel found');
                }

                // Dispose the panel
                panel.dispose();
                await context.wait(100);

                // Verify panel is disposed
                const panels = context.getPanels('vscode-edge-devtools');
                const stillExists = panels.some(p => p === panel);
                if (stillExists) {
                    throw new Error('Panel should be disposed');
                }
            }
        },
        {
            name: 'should execute newBrowserWindow command',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping newBrowserWindow test');
                    return;
                }
                // Note: This command shows an input box, so it will use the default value from the mock
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.newBrowserWindow'
                );

                await context.wait(200);

                // Verify command executed without errors
                const panels = context.getPanels('vscode-edge-devtools');
                if (panels.length === 0) {
                    throw new Error('Expected panel to be created from newBrowserWindow');
                }
            }
        },
        {
            name: 'should list open browsers when none exist',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping listOpenBrowsers test');
                    return;
                }
                // Execute listOpenBrowsers with no open browsers
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.listOpenBrowsers'
                );

                // Should not throw - command handles empty state
                // The mock will show an information message
            }
        },
        {
            name: 'should list open browsers when some exist',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping listOpenBrowsers test');
                    return;
                }
                // Launch a browser first
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:8080' }
                );

                await context.wait(200);

                // List open browsers
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.listOpenBrowsers'
                );

                // Should show quick pick with one item
                // The mock will auto-select the first item
            }
        },
        {
            name: 'should switch between browser instances',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping switchToBrowser test');
                    return;
                }
                // Launch two browsers
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:8080' }
                );

                await context.wait(100);

                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:9000' }
                );

                await context.wait(100);

                // Switch browser
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.switchToBrowser'
                );

                // Should reveal the selected browser
                const panels = context.getPanels('vscode-edge-devtools');
                if (panels.length !== 2) {
                    throw new Error(`Expected 2 panels, got ${panels.length}`);
                }
            }
        },
        {
            name: 'should close current browser when only one exists',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping closeCurrentBrowser test');
                    return;
                }
                // Launch one browser
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:8080' }
                );

                await context.wait(200);

                // Close it
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.closeCurrentBrowser'
                );

                await context.wait(100);

                // Verify it's closed
                const panels = context.getPanels('vscode-edge-devtools');
                if (panels.length !== 0) {
                    throw new Error(`Expected 0 panels after close, got ${panels.length}`);
                }
            }
        },
        {
            name: 'should close selected browser when multiple exist',
            async run(context) {
                if (process.env.SKIP_EDGE_LAUNCH) {
                    console.log('[Test] SKIP_EDGE_LAUNCH set - skipping closeCurrentBrowser test');
                    return;
                }
                // Launch two browsers
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:8080' }
                );

                await context.wait(100);

                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.launch',
                    { launchUrl: 'http://localhost:9000' }
                );

                await context.wait(100);

                // Close one
                await context.extensionMock.executeCommand(
                    'vscode-edge-devtools.closeCurrentBrowser'
                );

                await context.wait(100);

                // Should still have one panel
                const panels = context.getPanels('vscode-edge-devtools');
                if (panels.length !== 1) {
                    throw new Error(`Expected 1 panel after close, got ${panels.length}`);
                }
            }
        }
    ]
};
