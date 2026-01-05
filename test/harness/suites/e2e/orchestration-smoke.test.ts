// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { TestSuite } from '../../types';
import { OrchestrationHarness } from '../../orchestration/orchestrator.js';
import type { EdgeInstance } from '../../orchestration/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const suite: TestSuite = {
    name: 'Orchestration Smoke Tests',
    tests: [
        {
            name: 'should launch VS Code + Edge via orchestration harness',
            async run(context) {
                const vscodeBin = process.env.VSCODE_BIN;
                if (!vscodeBin) {
                    console.warn('[Test] VSCODE_BIN not set, skipping orchestration smoke test');
                    return;
                }

                const logDir = path.join(os.tmpdir(), `edge-devtools-orch-${Date.now()}`);
                const harness = new OrchestrationHarness({ logDir, verbose: Boolean(context.options.verbose) });
                await harness.initialize();

                let edgeInstance: EdgeInstance | undefined;

                try {
                    await harness.launchVSCode({
                        extensionPath: path.resolve(__dirname, '../../../../'),
                        workspacePath: path.resolve(__dirname, '../../../fixtures/workspace'),
                        userDataDir: path.join(logDir, 'vscode-user-data'),
                    });

                    edgeInstance = await harness.launchEdge({
                        url: 'about:blank',
                        userDataDir: path.join(logDir, 'edge-user-data')
                    });

                    await harness.verifyBrowserWebSocket(edgeInstance.browser);
                } finally {
                    try {
                        await harness.collectVSCodeLogs(path.join(logDir, 'vscode-logs'));
                    } catch (error) {
                        console.warn('[Test] Failed to collect VS Code logs:', error);
                    }
                    if (edgeInstance) {
                        try {
                            await edgeInstance.browser.close();
                        } catch (error) {
                            console.error('[Test] Failed to close Edge instance:', error);
                        }
                    }
                    await harness.shutdown();
                }
            }
        }
    ]
};
