// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Smoke tests for test harness mocks
 * These tests verify that the mock infrastructure works correctly
 */

import { ExtensionMock, WebviewPanelMock } from './extension';
import { BrowserMock } from './browser';

describe('Test Harness Mocks', () => {
    describe('ExtensionMock', () => {
        it('should create extension mock', () => {
            const mock = new ExtensionMock();
            expect(mock).toBeDefined();
            expect(mock.commands).toBeInstanceOf(Map);
            expect(mock.panels).toBeInstanceOf(Array);
        });

        it('should register commands', async () => {
            const mock = new ExtensionMock();
            await mock.activate();

            const vscode = (global as any).vscode;
            let called = false;
            vscode.commands.registerCommand('test.command', () => {
                called = true;
            });

            expect(mock.commands.has('test.command')).toBe(true);

            await mock.executeCommand('test.command');
            expect(called).toBe(true);

            await mock.deactivate();
        });

        it('should create webview panels', async () => {
            const mock = new ExtensionMock();
            await mock.activate();

            const vscode = (global as any).vscode;
            const panel = vscode.window.createWebviewPanel(
                'test',
                'Test Panel',
                1,
                {}
            );

            expect(mock.panels).toHaveLength(1);
            expect(mock.panels[0]).toBeInstanceOf(WebviewPanelMock);
            expect(mock.panels[0].title).toBe('Test Panel');

            panel.dispose();
            expect(mock.panels).toHaveLength(0);

            await mock.deactivate();
        });
    });

    describe('BrowserMock', () => {
        let browser: BrowserMock;

        beforeEach(async () => {
            browser = new BrowserMock();
            await browser.launch();
        });

        afterEach(async () => {
            await browser.close();
        });

        it('should create browser mock', () => {
            expect(browser).toBeDefined();
            expect(browser.port).toBe(9222);
        });

        it('should create default target on launch', () => {
            const targets = browser.getTargetList();
            expect(targets).toHaveLength(1);
            expect((targets[0] as any).url).toBe('http://localhost:8080');
        });

        it('should create additional targets', async () => {
            const targetId = await browser.createTarget('http://example.com', 'Example');
            expect(targetId).toBeDefined();

            const targets = browser.getTargetList();
            expect(targets).toHaveLength(2);

            const target = targets.find((t: any) => t.id === targetId);
            expect(target).toBeDefined();
            expect((target as any).url).toBe('http://example.com');
            expect((target as any).title).toBe('Example');
        });

        it('should close targets', async () => {
            const targetId = await browser.createTarget('http://test.com');
            expect(browser.getTargetList()).toHaveLength(2);

            await browser.closeTarget(targetId);
            expect(browser.getTargetList()).toHaveLength(1);
        });
    });
});
