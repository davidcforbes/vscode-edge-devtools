// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

export interface ProcessLaunchOptions {
    name: string;
    command: string;
    args?: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    logDir: string;
    readyPattern?: RegExp;
    timeoutMs?: number;
    verbose?: boolean;
}

export class ManagedProcess {
    private readonly name: string;
    private readonly logPath: string;
    private readonly process: ChildProcessWithoutNullStreams;
    private readonly logStream: fs.WriteStream;
    private readonly readyPattern?: RegExp;
    private readonly readyTimeoutMs: number;
    private readonly verbose: boolean;
    private readonly recentLines: string[] = [];
    private readonly maxRecentLines = 200;
    private readyResolver?: () => void;

    constructor(options: ProcessLaunchOptions, child: ChildProcessWithoutNullStreams, logPath: string) {
        this.name = options.name;
        this.logPath = logPath;
        this.process = child;
        this.logStream = fs.createWriteStream(logPath, { flags: 'a' });
        this.readyPattern = options.readyPattern;
        this.readyTimeoutMs = options.timeoutMs ?? 30000;
        this.verbose = Boolean(options.verbose);

        this.attachOutput(this.process.stdout);
        this.attachOutput(this.process.stderr);
    }

    private attachOutput(stream: NodeJS.ReadableStream): void {
        const rl = readline.createInterface({ input: stream });
        rl.on('line', (line: string) => {
            const stamped = `[${this.name}] ${line}`;
            this.logStream.write(stamped + '\n');
            if (this.verbose) {
                console.log(stamped);
            }

            this.recentLines.push(stamped);
            if (this.recentLines.length > this.maxRecentLines) {
                this.recentLines.shift();
            }

            if (this.readyPattern && this.readyPattern.test(line)) {
                if (this.readyResolver) {
                    this.readyResolver();
                    this.readyResolver = undefined;
                }
            }
        });
    }

    get pid(): number | undefined {
        return this.process.pid;
    }

    get logs(): string {
        return this.logPath;
    }

    async waitForReady(): Promise<void> {
        if (!this.readyPattern) {
            return;
        }

        if (!this.process.pid) {
            throw new Error(`[${this.name}] process not started`);
        }

        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                const recent = this.recentLines.slice(-10).join('\n');
                reject(new Error(`[${this.name}] ready pattern not found within ${this.readyTimeoutMs}ms\nRecent output:\n${recent}`));
            }, this.readyTimeoutMs);

            this.readyResolver = () => {
                clearTimeout(timeout);
                resolve();
            };
            // reject handled by timeout
        });
    }

    async stop(signal: NodeJS.Signals = 'SIGTERM', timeoutMs = 5000): Promise<void> {
        if (!this.process.pid) {
            return;
        }

        this.process.kill(signal);

        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                if (this.process.pid) {
                    this.process.kill('SIGKILL');
                }
                resolve();
            }, timeoutMs);

            this.process.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });

        this.logStream.end();
    }
}

export class ProcessManager {
    private readonly logDir: string;
    private readonly verbose: boolean;

    constructor(logDir: string, verbose = false) {
        this.logDir = logDir;
        this.verbose = verbose;
    }

    start(options: ProcessLaunchOptions): ManagedProcess {
        const logPath = path.join(this.logDir, `${options.name}.log`);
        const child = spawn(options.command, options.args ?? [], {
            cwd: options.cwd,
            env: options.env,
            stdio: ['pipe', 'pipe', 'pipe']
        }) as ChildProcessWithoutNullStreams;

        return new ManagedProcess({ ...options, verbose: options.verbose ?? this.verbose }, child, logPath);
    }
}
