// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { encodeMessageForChannel } from '../common/webviewEvents';

/**
 * Service for handling clipboard operations between webview and VS Code
 */
export class ClipboardService {
    /**
     * Write text to the VS Code clipboard
     */
    static async writeToClipboard(message: string): Promise<void> {
        try {
            const clipboardMessage = JSON.parse(message) as {data: {message: string}};
            await vscode.env.clipboard.writeText(clipboardMessage.data.message);
        } catch (error) {
            console.error('[ClipboardService] Failed to parse clipboard message:', error);
            // Ignore malformed message - don't crash extension
        }
    }

    /**
     * Read text from the VS Code clipboard and send it to the webview
     */
    static async readFromClipboard(postMessageCallback: (message: string) => void): Promise<void> {
        try {
            const clipboardText = await vscode.env.clipboard.readText();
            encodeMessageForChannel(postMessageCallback, 'readClipboard', { clipboardText });
        } catch (error) {
            console.error('[ClipboardService] Failed to read clipboard:', error);
        }
    }
}
