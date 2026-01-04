// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';

export class BrowserAction extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly commandId: string,
        public readonly iconName: string,
        public readonly description?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: commandId,
            title: label,
        };
        this.iconPath = new vscode.ThemeIcon(iconName);
        this.tooltip = description || label;
    }
}

export class BrowserViewProvider implements vscode.TreeDataProvider<BrowserAction> {
    private _onDidChangeTreeData: vscode.EventEmitter<BrowserAction | undefined | null | void> = new vscode.EventEmitter<BrowserAction | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BrowserAction | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BrowserAction): vscode.TreeItem {
        return element;
    }

    getChildren(element?: BrowserAction): Thenable<BrowserAction[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const actions: BrowserAction[] = [
            new BrowserAction(
                'Open Browser',
                'vscode-edge-devtools.launch',
                'globe',
                'Launch Edge browser with a URL'
            ),
            new BrowserAction(
                'New Browser Window',
                'vscode-edge-devtools.newBrowserWindow',
                'window',
                'Open a new browser instance'
            ),
            new BrowserAction(
                'List Open Browsers',
                'vscode-edge-devtools.listOpenBrowsers',
                'list-tree',
                'View all open browser instances'
            ),
            new BrowserAction(
                'Switch to Browser',
                'vscode-edge-devtools.switchToBrowser',
                'arrow-swap',
                'Switch to a different browser instance'
            ),
            new BrowserAction(
                'Navigate Browser',
                'vscode-edge-devtools.navigateBrowser',
                'link-external',
                'Navigate current browser to a new URL'
            ),
            new BrowserAction(
                'Close Current Browser',
                'vscode-edge-devtools.closeCurrentBrowser',
                'close',
                'Close the active browser instance'
            ),
            new BrowserAction(
                'Attach to Browser',
                'vscode-edge-devtools.attach',
                'plug',
                'Attach to a running browser instance'
            ),
        ];

        return Promise.resolve(actions);
    }
}
