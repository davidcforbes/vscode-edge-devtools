// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { PanelSocket } from '../src/panelSocket';
import * as WebSocket from 'ws';

jest.mock('ws');

describe('PanelSocket', () => {
    let mockPostMessage: jest.Mock;
    let mockWebSocket: any;
    const targetUrl = 'ws://localhost:9222/devtools/page/123';

    beforeEach(() => {
        jest.clearAllMocks();

        mockPostMessage = jest.fn();

        // Create a mock WebSocket instance
        mockWebSocket = {
            send: jest.fn(),
            close: jest.fn(),
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
        };

        // Mock the WebSocket constructor
        (WebSocket as unknown as jest.Mock).mockImplementation(() => mockWebSocket);
    });

    describe('Constructor', () => {
        it('should create instance with target URL and callback', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            expect(socket).toBeInstanceOf(PanelSocket);
            expect(socket.isConnectedToTarget).toBe(false);
        });

        it('should not connect to target on construction', () => {
            new PanelSocket(targetUrl, mockPostMessage);

            expect(WebSocket).not.toHaveBeenCalled();
        });
    });

    describe('Connection State', () => {
        it('should return false when not connected', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            expect(socket.isConnectedToTarget).toBe(false);
        });

        it('should return true after successful connection', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            // Trigger connection
            socket.onMessageFromWebview('ready:');

            // Simulate WebSocket open event
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            expect(socket.isConnectedToTarget).toBe(true);
        });
    });

    describe('WebSocket Connection', () => {
        it('should connect to target on ready event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            socket.onMessageFromWebview('ready:');

            expect(WebSocket).toHaveBeenCalledWith(targetUrl);
        });

        it('should connect to target on websocket event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 1, method: 'Page.enable' }) })}`;
            socket.onMessageFromWebview(message);

            expect(WebSocket).toHaveBeenCalledWith(targetUrl);
        });

        it('should set up event handlers on connection', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            socket.onMessageFromWebview('ready:');

            expect(mockWebSocket.onopen).toBeDefined();
            expect(mockWebSocket.onmessage).toBeDefined();
            expect(mockWebSocket.onerror).toBeDefined();
            expect(mockWebSocket.onclose).toBeDefined();
        });
    });

    describe('Message Caching', () => {
        it('should cache messages sent before connection opens', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            // Send websocket message before connection opens
            const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 1, method: 'Page.enable' }) })}`;
            socket.onMessageFromWebview(message);

            // Should not send yet
            expect(mockWebSocket.send).not.toHaveBeenCalled();
        });

        it('should send cached messages after connection opens', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            // Send messages before connection opens
            const message1 = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 1, method: 'Page.enable' }) })}`;
            const message2 = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 2, method: 'Runtime.enable' }) })}`;

            socket.onMessageFromWebview(message1);
            socket.onMessageFromWebview(message2);

            // Trigger connection open
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            // Should send both cached messages
            expect(mockWebSocket.send).toHaveBeenCalledTimes(2);
            expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({ id: 1, method: 'Page.enable' }));
            expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
        });

        it('should send messages immediately when already connected', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            // Connect and open
            socket.onMessageFromWebview('ready:');
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            // Clear previous calls
            mockWebSocket.send.mockClear();

            // Send message after connection is open
            const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 1, method: 'Page.enable' }) })}`;
            socket.onMessageFromWebview(message);

            // Should send immediately
            expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
            expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({ id: 1, method: 'Page.enable' }));
        });

        it('should not cache non-JSON messages', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            const message = `websocket:${JSON.stringify({ message: 'not-json-message' })}`;

            socket.onMessageFromWebview(message);

            // Should not attempt to send
            expect(mockWebSocket.send).not.toHaveBeenCalled();
        });
    });

    describe('Message Handling', () => {
        it('should handle onopen event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            socket.onMessageFromWebview('ready:');

            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            expect(mockPostMessage).toHaveBeenCalledWith('open');
        });

        it('should handle onmessage event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            socket.onMessageFromWebview('ready:');

            // Open the connection first
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            const messageData = JSON.stringify({ id: 1, result: {} });

            if (mockWebSocket.onmessage) {
                mockWebSocket.onmessage({ data: messageData });
            }

            expect(mockPostMessage).toHaveBeenCalledWith('message', messageData);
        });

        it('should handle onerror event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            socket.onMessageFromWebview('ready:');

            // Open the connection first
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            if (mockWebSocket.onerror) {
                mockWebSocket.onerror(new Error('Connection error'));
            }

            expect(mockPostMessage).toHaveBeenCalledWith('error');
        });

        it('should handle onclose event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            socket.onMessageFromWebview('ready:');

            // Open the connection first
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            if (mockWebSocket.onclose) {
                mockWebSocket.onclose();
            }

            expect(mockPostMessage).toHaveBeenCalledWith('close');
        });
    });

    describe('Event Emission', () => {
        it('should emit ready event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const readyHandler = jest.fn();

            socket.on('ready', readyHandler);
            socket.onMessageFromWebview('ready:');

            expect(readyHandler).toHaveBeenCalled();
        });

        it('should emit websocket event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const websocketHandler = jest.fn();

            socket.on('websocket', websocketHandler);

            const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 1, method: 'Page.enable' }) })}`;
            socket.onMessageFromWebview(message);

            expect(websocketHandler).toHaveBeenCalled();
        });

        it('should emit telemetry event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const telemetryHandler = jest.fn();

            socket.on('telemetry', telemetryHandler);

            const telemetryMessage = `telemetry:${JSON.stringify({ data: { event: 'test' } })}`;

            socket.onMessageFromWebview(telemetryMessage);

            expect(telemetryHandler).toHaveBeenCalled();
        });

        it('should emit writeToClipboard event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const clipboardHandler = jest.fn();

            socket.on('writeToClipboard', clipboardHandler);

            const clipboardMessage = `writeToClipboard:${JSON.stringify({ data: { message: 'test content' } })}`;

            socket.onMessageFromWebview(clipboardMessage);

            expect(clipboardHandler).toHaveBeenCalled();
        });

        it('should emit readClipboard event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const clipboardHandler = jest.fn();

            socket.on('readClipboard', clipboardHandler);

            const clipboardMessage = 'readClipboard:';

            socket.onMessageFromWebview(clipboardMessage);

            expect(clipboardHandler).toHaveBeenCalled();
        });
    });

    describe('Disposal', () => {
        it('should close WebSocket on dispose', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            // Connect first
            socket.onMessageFromWebview('ready:');

            socket.dispose();

            expect(mockWebSocket.close).toHaveBeenCalled();
        });

        it('should set isConnected to false on dispose', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            // Connect and open
            socket.onMessageFromWebview('ready:');
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            expect(socket.isConnectedToTarget).toBe(true);

            socket.dispose();

            expect(socket.isConnectedToTarget).toBe(false);
        });

        it('should clear socket reference on dispose', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            // Connect first
            socket.onMessageFromWebview('ready:');

            socket.dispose();

            // Try to send message after disposal - should not throw
            const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 1, method: 'Page.enable' }) })}`;

            expect(() => socket.onMessageFromWebview(message)).not.toThrow();
        });

        it('should handle dispose when not connected', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            expect(() => socket.dispose()).not.toThrow();
        });

        it('should dispose existing socket on ready event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            // First connection
            socket.onMessageFromWebview('ready:');

            const firstSocket = mockWebSocket;

            // Create new mock for second connection
            const secondSocket = {
                send: jest.fn(),
                close: jest.fn(),
                onopen: null,
                onmessage: null,
                onerror: null,
                onclose: null,
            };

            (WebSocket as unknown as jest.Mock).mockImplementation(() => secondSocket);

            // Second ready event
            socket.onMessageFromWebview('ready:');

            // First socket should be closed
            expect(firstSocket.close).toHaveBeenCalled();
        });
    });

    describe('Connection Close', () => {
        it('should handle close event and emit close', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const closeHandler = jest.fn();

            socket.on('close', closeHandler);
            socket.onMessageFromWebview('ready:');

            // Open the connection first
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            if (mockWebSocket.onclose) {
                mockWebSocket.onclose();
            }

            expect(closeHandler).toHaveBeenCalled();
            expect(mockPostMessage).toHaveBeenCalledWith('close');
        });

        it('should set isConnected to false on close event', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            socket.onMessageFromWebview('ready:');

            // Open the connection
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            expect(socket.isConnectedToTarget).toBe(true);

            // Close the connection
            if (mockWebSocket.onclose) {
                mockWebSocket.onclose();
            }

            expect(socket.isConnectedToTarget).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should handle error event and call postMessage', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);

            socket.onMessageFromWebview('ready:');

            // Open the connection first
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            const error = new Error('Connection failed');

            if (mockWebSocket.onerror) {
                mockWebSocket.onerror(error);
            }

            expect(mockPostMessage).toHaveBeenCalledWith('error');
        });
    });
});
