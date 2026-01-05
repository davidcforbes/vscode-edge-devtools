// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { parseMessageFromChannel, WebSocketEvent, WebviewEvent } from './common/webviewEvents';
import { validateWebsocketPayload } from './common/messageValidation';

export type IDevToolsPostMessageCallback = (e: WebSocketEvent, message?: string) => void;

// Allowlist of CDP commands that the webview is permitted to send
// This prevents malicious webview code from sending arbitrary CDP commands
const ALLOWED_CDP_METHODS = new Set([
    // Input handling
    'Input.dispatchMouseEvent',
    'Input.dispatchKeyEvent',
    'Input.emulateTouchFromMouseEvent',
    'Input.insertText',
    // Page navigation and control
    'Page.enable',
    'Page.getNavigationHistory',
    'Page.startScreencast',
    'Page.navigateToHistoryEntry',
    'Page.reload',
    'Page.navigate',
    'Page.screencastFrameAck',
    // Device emulation
    'Emulation.setUserAgentOverride',
    'Emulation.setDeviceMetricsOverride',
    'Emulation.setTouchEmulationEnabled',
    'Emulation.setEmulatedVisionDeficiency',
    'Emulation.setEmulatedMedia',
    'Emulation.setEmitTouchEventsForMouse',
    // Runtime evaluation (clipboard copy only - paste uses Input.insertText)
    'Runtime.evaluate',
]);

interface CDPCommand {
    id: number;
    method: string;
    params?: unknown;
}

function isCDPCommandAllowed(message: string): boolean {
    try {
        const command = JSON.parse(message) as CDPCommand;
        if (!command.method) {
            console.warn('[PanelSocket] CDP command missing method field');
            return false;
        }

        const isAllowed = ALLOWED_CDP_METHODS.has(command.method);
        if (!isAllowed) {
            console.warn(`[PanelSocket] Blocked unauthorized CDP command: ${command.method}`);
            return false;
        }

        // Additional validation for Runtime.evaluate to prevent arbitrary code execution
        if (command.method === 'Runtime.evaluate') {
            return isRuntimeEvaluateAllowed(command);
        }

        return true;
    } catch (error) {
        console.error('[PanelSocket] Failed to parse CDP command for validation:', error);
        return false;
    }
}

/**
 * Validates Runtime.evaluate expressions to only allow safe clipboard copy operation.
 * Prevents compromised webview from executing arbitrary JavaScript in target page.
 *
 * Note: Paste operations now use Input.insertText instead of Runtime.evaluate for better security.
 */
function isRuntimeEvaluateAllowed(command: CDPCommand): boolean {
    const params = command.params as { expression?: string } | undefined;
    const expression = params?.expression;

    if (!expression || typeof expression !== 'string') {
        console.warn('[PanelSocket] Runtime.evaluate missing expression parameter');
        return false;
    }

    // Allow clipboard copy only: exact match for getting selected text
    // This is the ONLY permitted Runtime.evaluate expression
    if (expression === 'document.getSelection().toString()') {
        return true;
    }

    console.warn(`[PanelSocket] Blocked Runtime.evaluate with unauthorized expression: ${expression.substring(0, 100)}`);
    return false;
}

export class PanelSocket extends EventEmitter {
    private readonly targetUrl: string;
    private readonly postMessageToDevTools: IDevToolsPostMessageCallback;
    protected socket: WebSocket | undefined;
    private isConnected = false;
    private isConnecting = false;
    private messages: string[] = [];
    private commandIdCounter = 0;

    constructor(targetUrl: string, postMessageToDevTools: IDevToolsPostMessageCallback) {
        super();
        this.targetUrl = targetUrl;
        this.postMessageToDevTools = postMessageToDevTools;
    }

    get isConnectedToTarget(): boolean {
        return this.isConnected;
    }

    onMessageFromWebview(message: string): void {
        parseMessageFromChannel(message, (eventName, args) => this.onMessageParsed(eventName, args));
    }

    sendCDPCommand(method: string, params?: unknown): void {
        if (!this.socket || !this.isConnected) {
            return;
        }

        // Use monotonic counter instead of Date.now() to prevent ID collisions
        const command = {
            id: ++this.commandIdCounter,
            method,
            params: params || {}
        };

        this.socket.send(JSON.stringify(command));
    }

    dispose(): void {
        if (this.socket) {
            this.isConnecting = false;
            this.isConnected = false;
            this.socket.close();
            this.socket = undefined;
        }
    }

    private onMessageParsed(eventName: WebviewEvent, args: string): boolean {
        if (eventName === 'ready') {
            this.dispose();

            // First message, so connect a real websocket to the target
            // Only connect if not already connecting to prevent race conditions
            if (!this.isConnecting) {
                this.connectToTarget();
            }
        }

        if (eventName === 'websocket') {
            if (!this.socket && !this.isConnecting) {
                // Reconnect if we no longer have a websocket and not already connecting
                this.connectToTarget();
            }

            try {
                // Parse and validate websocket message payload
                const parsedArgs = JSON.parse(args);
                const validation = validateWebsocketPayload(parsedArgs);

                if (!validation.success || !validation.value) {
                    console.warn(`[PanelSocket] Invalid websocket payload: ${validation.error || 'No value returned'}`);
                    this.emit('parseError', {
                        context: 'webview-websocket-validation',
                        error: validation.error || 'Unknown validation error',
                        rawMessage: args.substring(0, 200)
                    });
                    return false;
                }

                const { message } = validation.value;
                if (message && message[0] === '{') {
                    // Validate CDP command before forwarding
                    if (!isCDPCommandAllowed(message)) {
                        console.warn('[PanelSocket] Rejecting unauthorized CDP command from webview');
                        return false;
                    }

                    if (!this.isConnected) {
                        // DevTools are sending a message before the real websocket has finished opening so cache it
                        this.messages.push(message);
                    } else {
                        // Websocket ready so send the message directly
                        if (this.socket) {
                            this.socket.send(message);
                        }
                    }
                }
            } catch (error) {
                console.error('[PanelSocket] Failed to parse webview websocket message:', error);
                // Emit parseError event for telemetry/user notification
                this.emit('parseError', {
                    context: 'webview-websocket',
                    error: error instanceof Error ? error.message : String(error),
                    rawMessage: args.substring(0, 200) // Truncate for safety
                });
                // Ignore malformed message - don't crash extension
                return false;
            }
        }

        return this.emit(eventName, args);
    }

    private connectToTarget(): void {
        // Prevent concurrent connection attempts
        this.isConnecting = true;

        // Create the websocket
        this.socket = new WebSocket(this.targetUrl);
        this.socket.onopen = () => this.onOpen();
        this.socket.onmessage = ev => this.onMessage(ev);
        this.socket.onerror = () => this.onError();
        this.socket.onclose = () => this.onClose();
    }

    protected onOpen(): void {
        this.isConnecting = false;
        this.isConnected = true;

        this.postMessageToDevTools('open');

        if (this.socket) {
            // Forward any cached messages onto the real websocket
            for (const message of this.messages) {
                this.socket.send(message);
            }
            this.messages = [];
        }
    }

    private onMessage(message: { data: WebSocket.Data }) {
        if (this.isConnected) {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            const messageStr = message.data.toString();

            // Check for navigation events in CDP messages
            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const cdpMessage = JSON.parse(messageStr);

                // Detect Page.frameNavigated event (fires when page navigates)
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                if (cdpMessage.method === 'Page.frameNavigated' && cdpMessage.params?.frame?.url) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                    this.emit('navigation', JSON.stringify({ url: cdpMessage.params.frame.url }));
                }

                // Detect Target.targetInfoChanged event (fires when target info changes, including URL)
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                if (cdpMessage.method === 'Target.targetInfoChanged' && cdpMessage.params?.targetInfo?.url) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                    this.emit('navigation', JSON.stringify({ url: cdpMessage.params.targetInfo.url }));
                }
            } catch {
                // Ignore parse errors - message may not be JSON
            }

            // Forward the message onto the devtools
            this.postMessageToDevTools('message', messageStr);
        }
    }

    private onError() {
        this.isConnecting = false;

        if (this.isConnected) {
            // Tell the devtools that there was a connection error
            this.postMessageToDevTools('error');
        }
    }

    private onClose() {
        this.isConnecting = false;

        if (this.isConnected) {
            // Tell the devtools that the real websocket was closed
            this.postMessageToDevTools('close');
            this.emit('close');
        }

        this.isConnected = false;
    }
}
