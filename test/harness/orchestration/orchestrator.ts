// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import WebSocket from 'ws';
import type { Browser } from 'puppeteer-core';
import { ProcessManager, ManagedProcess } from './processManager.js';

export interface OrchestrationOptions {
    logDir: string;
    verbose?: boolean;
}

export interface VSCodeLaunchOptions {
    extensionPath: string;
    workspacePath: string;
    userDataDir?: string;
    extensionsDir?: string;
    args?: string[];
    readyPattern?: RegExp;
    timeoutMs?: number;
}

export interface EdgeLaunchOptions {
    browserPath?: string;
    port?: number;
    url?: string;
    userDataDir?: string;
    timeoutMs?: number;
}

export interface EdgeInstance {
    browser: Browser;
    userDataDir?: string;
}

export class OrchestrationHarness {
    private readonly processManager: ProcessManager;
    private readonly logDir: string;
    private readonly verbose: boolean;
    private processes: ManagedProcess[] = [];
    private lastVSCodeLogsDir?: string;

    constructor(options: OrchestrationOptions) {
        this.logDir = options.logDir;
        this.verbose = Boolean(options.verbose);
        this.processManager = new ProcessManager(this.logDir, this.verbose);
    }

    async initialize(): Promise<void> {
        await fsp.mkdir(this.logDir, { recursive: true });
    }

    async launchVSCode(options: VSCodeLaunchOptions): Promise<ManagedProcess> {
        const codeBin = process.env.VSCODE_BIN || 'code';
        const userDataDir = options.userDataDir || path.join(os.tmpdir(), `vscode-edge-devtools-test-${Date.now()}`);
        const extensionsDir = options.extensionsDir || path.join(userDataDir, 'extensions');

        await fsp.mkdir(userDataDir, { recursive: true });
        await fsp.mkdir(extensionsDir, { recursive: true });

        const args = [
            '--disable-extensions',
            `--extensionDevelopmentPath=${options.extensionPath}`,
            `--user-data-dir=${userDataDir}`,
            `--extensions-dir=${extensionsDir}`,
            options.workspacePath,
            ...(options.args ?? [])
        ];

        const proc = this.processManager.start({
            name: 'vscode',
            command: codeBin,
            args,
            logDir: this.logDir,
            readyPattern: options.readyPattern,
            timeoutMs: options.timeoutMs,
            verbose: this.verbose
        });

        this.processes.push(proc);
        await proc.waitForReady();
        this.lastVSCodeLogsDir = path.join(userDataDir, 'logs');
        return proc;
    }

    async launchEdge(options: EdgeLaunchOptions = {}): Promise<EdgeInstance> {
        const { browserPath, port = 0, url = 'about:blank' } = options;
        const userDataDir = options.userDataDir || path.join(os.tmpdir(), `edge-devtools-test-${Date.now()}`);

        await fsp.mkdir(userDataDir, { recursive: true });

        // Dynamically import from built output to avoid bundling puppeteer in tests
        // @ts-ignore - dynamic import from compiled output
        const extensionModule = await import('../../../../extension.js');
        const resolvedBrowserPath = browserPath || await extensionModule.getBrowserPath?.();
        if (!resolvedBrowserPath) {
            throw new Error('Microsoft Edge not found for orchestration tests');
        }

        const browser = await extensionModule.launchBrowser?.(resolvedBrowserPath, port, url, userDataDir, false);
        if (!browser) {
            throw new Error('Failed to launch browser for orchestration tests');
        }

        this.attachBrowserLogs(browser, path.join(this.logDir, 'edge.log'));

        return { browser, userDataDir };
    }

    async connectToBrowserWebSocket(browser: Browser, timeoutMs = 5000): Promise<WebSocket> {
        const wsEndpoint = browser.wsEndpoint?.();
        if (!wsEndpoint || typeof wsEndpoint !== 'string') {
            throw new Error('Browser did not expose a WebSocket endpoint');
        }

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsEndpoint);
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket connection timeout'));
            }, timeoutMs);

            ws.on('open', () => {
                clearTimeout(timeout);
                resolve(ws);
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    async verifyBrowserWebSocket(browser: Browser, timeoutMs = 5000): Promise<void> {
        const ws = await this.connectToBrowserWebSocket(browser, timeoutMs);

        try {
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Browser.getVersion response timeout'));
                }, timeoutMs);

                ws.on('message', (data) => {
                    try {
                        const response = JSON.parse(data.toString()) as { id?: number; result?: { product?: string } };
                        if (response.id === 1 && response.result?.product) {
                            clearTimeout(timeout);
                            resolve();
                        }
                    } catch (error) {
                        clearTimeout(timeout);
                        reject(error);
                    }
                });

                ws.send(JSON.stringify({
                    id: 1,
                    method: 'Browser.getVersion',
                    params: {}
                }));
            });
        } finally {
            ws.close();
        }
    }

    async collectVSCodeLogs(destinationDir?: string): Promise<void> {
        if (!this.lastVSCodeLogsDir) {
            return;
        }

        const targetDir = destinationDir || path.join(this.logDir, 'vscode-logs');
        await fsp.mkdir(targetDir, { recursive: true });

        const logRoots = await fsp.readdir(this.lastVSCodeLogsDir, { withFileTypes: true });
        const logDirs = logRoots.filter(entry => entry.isDirectory()).map(entry => entry.name);
        if (logDirs.length === 0) {
            return;
        }

        let newestDir = logDirs[0];
        let newestMtime = 0;
        for (const dir of logDirs) {
            const stat = await fsp.stat(path.join(this.lastVSCodeLogsDir, dir));
            if (stat.mtimeMs > newestMtime) {
                newestMtime = stat.mtimeMs;
                newestDir = dir;
            }
        }

        const logsPath = path.join(this.lastVSCodeLogsDir, newestDir);
        const files = await fsp.readdir(logsPath);
        const candidates = files.filter(file => /(exthost|renderer|window).*\\.log$/i.test(file));

        await Promise.all(candidates.map(async (file) => {
            const src = path.join(logsPath, file);
            const dest = path.join(targetDir, file);
            const content = await fsp.readFile(src, 'utf8');
            const redacted = redactSensitive(content);
            await fsp.writeFile(dest, redacted, 'utf8');
        }));
    }

    private attachBrowserLogs(browser: Browser, logPath: string): void {
        const child = browser.process?.();
        if (!child) {
            return;
        }

        const stream = fs.createWriteStream(logPath, { flags: 'a' });
        child.stdout?.on('data', (chunk) => {
            stream.write(redactSensitive(chunk.toString()));
        });
        child.stderr?.on('data', (chunk) => {
            stream.write(redactSensitive(chunk.toString()));
        });
        child.on('exit', () => {
            stream.end();
        });
    }

    async shutdown(): Promise<void> {
        const processes = this.processes.slice();
        this.processes = [];

        for (const proc of processes) {
            try {
                await proc.stop();
            } catch (error) {
                console.warn(`[OrchestrationHarness] Failed to stop process ${proc.logs}:`, error);
            }
        }
    }
}

function redactSensitive(text: string): string {
    return text
        .replace(/ghp_[A-Za-z0-9]{20,}/g, '[REDACTED]')
        .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED]')
        .replace(/(authorization:\\s*bearer\\s+)[A-Za-z0-9._\\-]+/gi, '$1[REDACTED]')
        .replace(/(token=)[A-Za-z0-9._\\-]+/gi, '$1[REDACTED]')
        .replace(/(password=)\\S+/gi, '$1[REDACTED]');
}
