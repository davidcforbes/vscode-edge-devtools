// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export type WebviewEvent = 'getState' | 'getUrl' | 'openInEditor' | 'ready' | 'setState' | 'telemetry' | 'websocket'
| 'getVscodeSettings' | 'copyText' | 'focusEditor' | 'focusEditorGroup' | 'openUrl' | 'toggleScreencast' | 'toggleInspect' | 'replayConsoleMessages'
| 'devtoolsConnection' | 'writeToClipboard' | 'readClipboard';
export const webviewEventNames: WebviewEvent[] = [
    'getState',
    'getUrl',
    'openInEditor',
    'ready',
    'setState',
    'telemetry',
    'websocket',
    'getVscodeSettings',
    'copyText',
    'focusEditor',
    'focusEditorGroup',
    'openUrl',
    'toggleScreencast',
    'toggleInspect',
    'replayConsoleMessages',
    'devtoolsConnection',
    'writeToClipboard',
    'readClipboard',
];

export type FrameToolsEvent = 'sendMessageToBackend' | 'openInNewTab' | 'recordEnumeratedHistogram' |
'recordPerformanceHistogram' | 'reportError' | 'openInEditor' | 'toggleScreencast' | 'replayConsoleMessages';
export const FrameToolsEventNames: FrameToolsEvent[] = [
    'sendMessageToBackend',
    'openInNewTab',
    'openInEditor',
    'recordEnumeratedHistogram',
    'recordPerformanceHistogram',
    'reportError',
    'toggleScreencast',
    'replayConsoleMessages',
];

export type WebSocketEvent = 'open' | 'close' | 'error' | 'message';
export const webSocketEventNames: WebSocketEvent[] = [
    'open',
    'close',
    'error',
    'message',
];

export type TelemetryEvent = 'enumerated' | 'performance' | 'error';

export interface ITelemetryMeasures { [key: string]: number; }
export interface ITelemetryProps { [key: string]: string; }

export interface ITelemetryDataNumber {
    event: 'enumerated' | 'performance';
    name: string;
    data: number;
}
export interface ITelemetryDataObject {
    event: 'error' | 'screencast';
    name: string;
    data: Record<string, unknown>;
}
export type TelemetryData = ITelemetryDataNumber | ITelemetryDataObject;

export interface IOpenEditorData {
    url: string;
    line: number;
    column: number;
    ignoreTabChanges: boolean;
}

/**
 * Parse out the WebviewEvents type from a message and call the appropriate emit event
 *
 * @param message The message to parse
 * @param emit The emit callback to invoke with the event and args
 */
export function parseMessageFromChannel(
    message: string,
    emit: (eventName: WebviewEvent, args: string) => boolean): boolean {
    // Validate message length to prevent DOS attacks
    const MAX_MESSAGE_LENGTH = 10 * 1024 * 1024; // 10MB
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
        console.warn('[webviewEvents] Invalid or oversized message', {
            type: typeof message,
            length: typeof message === 'string' ? message.length : 0
        });
        return false;
    }

    // Find event separator
    const separatorIndex = message.indexOf(':');
    if (separatorIndex === -1) {
        console.warn('[webviewEvents] Message missing separator');
        return false;
    }

    const eventName = message.substring(0, separatorIndex);

    // Validate event name against allowlist
    if (!webviewEventNames.includes(eventName as WebviewEvent)) {
        console.warn(`[webviewEvents] Unknown event type: ${eventName}`);
        return false;
    }

    const argsString = message.substring(separatorIndex + 1);

    // Validate JSON structure if args provided
    if (argsString.length > 0) {
        try {
            JSON.parse(argsString);
        } catch (error) {
            console.warn(`[webviewEvents] Invalid JSON in message args for event ${eventName}:`, error);
            return false;
        }
    }

    emit(eventName as WebviewEvent, argsString);
    return true;
}

/**
 * Encode an event and arguments into a string and then post that message across via the
 * supplied object containing the postMessage function.
 * The message can be parsed on the other side using parseMessageFromChannel
 *
 * @param postMessageCallback The object which contains the postMessage function
 * @param eventType The type of the message to post
 * @param args The argument object to encode and post
 * @param origin The origin (if any) to use with the postMessage call
 */
export function encodeMessageForChannel(
    postMessageCallback: (message: string) => void,
    eventType: WebviewEvent,
    args?: unknown): void {
    // Validate event type is in allowlist
    if (!webviewEventNames.includes(eventType)) {
        console.error(`[webviewEvents] Attempted to encode unknown event type: ${eventType}`);
        return;
    }

    try {
        const argsString = args !== undefined ? JSON.stringify(args) : '';
        const message = `${eventType}:${argsString}`;
        postMessageCallback(message);
    } catch (error) {
        console.error(`[webviewEvents] Failed to encode message for event ${eventType}:`, error);
    }
}
