// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { ExtensionMock } from './mocks/extension.js';
import { BrowserMock } from './mocks/browser.js';
import { RunnerOptions } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rm);
const exists = promisify(fs.exists);

/**
 * Test context manager that handles test environment setup and teardown
 */
export class TestContext {
    public extensionMock!: ExtensionMock;
    public browserMock!: BrowserMock;
    public workspaceFolder: string;

    constructor(public options: RunnerOptions) {
        this.workspaceFolder = path.join(__dirname, '../fixtures/workspace');
    }

    /**
     * Set up test environment
     */
    async setup(): Promise<void> {
        // Create temporary workspace
        await this.createWorkspace();

        // Initialize extension mock
        this.extensionMock = new ExtensionMock();
        await this.extensionMock.activate();

        // Initialize browser mock
        this.browserMock = new BrowserMock();
        await this.browserMock.launch();
    }

    /**
     * Tear down test environment and clean up resources
     */
    async teardown(): Promise<void> {
        try {
            await this.browserMock?.close();
        } catch (error) {
            console.error('Error closing browser mock:', error);
        }

        try {
            await this.extensionMock?.deactivate();
        } catch (error) {
            console.error('Error deactivating extension mock:', error);
        }

        try {
            await this.cleanWorkspace();
        } catch (error) {
            console.error('Error cleaning workspace:', error);
        }
    }

    /**
     * Wait for a webview panel with the specified view type to be created
     */
    async waitForPanel(viewType: string, timeout = 5000): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const panel = this.extensionMock.panels.find(p => p.viewType === viewType);
            if (panel) {
                return;
            }
            await this.wait(50);
        }

        throw new Error(`Timeout waiting for panel with viewType: ${viewType}`);
    }

    /**
     * Wait for specified milliseconds
     */
    async wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get all webview panels of a specific type
     */
    getPanels(viewType: string) {
        return this.extensionMock.panels.filter(p => p.viewType === viewType);
    }

    /**
     * Get the most recently created panel
     */
    getLatestPanel() {
        return this.extensionMock.panels[this.extensionMock.panels.length - 1];
    }

    /**
     * Create temporary workspace directory
     */
    private async createWorkspace(): Promise<void> {
        try {
            const workspaceExists = await exists(this.workspaceFolder);
            if (!workspaceExists) {
                await mkdir(this.workspaceFolder, { recursive: true });
            }
        } catch (error) {
            // Ignore if directory already exists
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Clean up temporary workspace directory
     */
    private async cleanWorkspace(): Promise<void> {
        try {
            const workspaceExists = await exists(this.workspaceFolder);
            if (workspaceExists) {
                await rmdir(this.workspaceFolder, { recursive: true, force: true });
            }
        } catch (error) {
            // Ignore cleanup errors in tests
            console.warn('Failed to clean workspace:', error);
        }
    }
}
