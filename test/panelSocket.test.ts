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

            // Send messages before connection opens (using allowed commands)
            const message1 = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 1, method: 'Page.enable' }) })}`;
            const message2 = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 2, method: 'Page.reload' }) })}`;

            socket.onMessageFromWebview(message1);
            socket.onMessageFromWebview(message2);

            // Trigger connection open
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            // Should send both cached messages
            expect(mockWebSocket.send).toHaveBeenCalledTimes(2);
            expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({ id: 1, method: 'Page.enable' }));
            expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({ id: 2, method: 'Page.reload' }));
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

        it('should cap message queue at 100 messages and drop oldest', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const queueOverflowSpy = jest.fn();
            socket.on('queueOverflow', queueOverflowSpy);

            // Send 150 messages before connection opens
            for (let i = 1; i <= 150; i++) {
                const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: i, method: 'Page.enable' }) })}`;
                socket.onMessageFromWebview(message);
            }

            // Should have emitted queueOverflow event 50 times (once for each message over 100)
            expect(queueOverflowSpy).toHaveBeenCalledTimes(50);

            // Verify event payload structure
            expect(queueOverflowSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: 'message-queue-cap',
                    queueSize: expect.any(Number),
                    maxSize: 100
                })
            );

            // Trigger connection open
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            // Should send exactly 100 messages (the last 100, messages 51-150)
            expect(mockWebSocket.send).toHaveBeenCalledTimes(100);

            // First sent message should be id: 51 (oldest message that wasn't dropped)
            expect(mockWebSocket.send).toHaveBeenNthCalledWith(1, JSON.stringify({ id: 51, method: 'Page.enable' }));

            // Last sent message should be id: 150 (newest message)
            expect(mockWebSocket.send).toHaveBeenNthCalledWith(100, JSON.stringify({ id: 150, method: 'Page.enable' }));
        });

        it('should not drop messages when queue is under the cap', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const queueOverflowSpy = jest.fn();
            socket.on('queueOverflow', queueOverflowSpy);

            // Send 50 messages (under the 100 cap)
            for (let i = 1; i <= 50; i++) {
                const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: i, method: 'Page.enable' }) })}`;
                socket.onMessageFromWebview(message);
            }

            // Should not emit queueOverflow
            expect(queueOverflowSpy).not.toHaveBeenCalled();

            // Trigger connection open
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            // Should send all 50 messages
            expect(mockWebSocket.send).toHaveBeenCalledTimes(50);
        });

        it('should handle exactly 100 messages without overflow', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const queueOverflowSpy = jest.fn();
            socket.on('queueOverflow', queueOverflowSpy);

            // Send exactly 100 messages (at the cap)
            for (let i = 1; i <= 100; i++) {
                const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: i, method: 'Page.enable' }) })}`;
                socket.onMessageFromWebview(message);
            }

            // Should not emit queueOverflow
            expect(queueOverflowSpy).not.toHaveBeenCalled();

            // Trigger connection open
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            // Should send all 100 messages
            expect(mockWebSocket.send).toHaveBeenCalledTimes(100);
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

    describe('CDP Allowlist', () => {
        describe('Allowed CDP Commands', () => {
            const allowedCommands = [
                'Input.dispatchMouseEvent',
                'Input.dispatchKeyEvent',
                'Input.emulateTouchFromMouseEvent',
                'Input.insertText',
                'Page.enable',
                'Page.getNavigationHistory',
                'Page.startScreencast',
                'Page.navigateToHistoryEntry',
                'Page.reload',
                'Page.navigate',
                'Page.screencastFrameAck',
                'Emulation.setUserAgentOverride',
                'Emulation.setDeviceMetricsOverride',
                'Emulation.setTouchEmulationEnabled',
                'Emulation.setEmulatedVisionDeficiency',
                'Emulation.setEmulatedMedia',
                'Emulation.setEmitTouchEventsForMouse',
            ];

            allowedCommands.forEach(method => {
                it(`should allow ${method} command`, () => {
                    const socket = new PanelSocket(targetUrl, mockPostMessage);

                    // Connect and open
                    socket.onMessageFromWebview('ready:');
                    if (mockWebSocket.onopen) {
                        mockWebSocket.onopen();
                    }

                    mockWebSocket.send.mockClear();

                    const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 1, method }) })}`;
                    socket.onMessageFromWebview(message);

                    expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({ id: 1, method }));
                });
            });
        });

        describe('Blocked CDP Commands', () => {
            const blockedCommands = [
                'Debugger.enable',
                'Debugger.setBreakpoint',
                'Runtime.callFunctionOn',
                'Network.setCookie',
                'Storage.clearCookies',
                'Target.attachToTarget',
                'Browser.close',
                'SystemInfo.getInfo',
            ];

            blockedCommands.forEach(method => {
                it(`should block ${method} command`, () => {
                    const socket = new PanelSocket(targetUrl, mockPostMessage);

                    // Connect and open
                    socket.onMessageFromWebview('ready:');
                    if (mockWebSocket.onopen) {
                        mockWebSocket.onopen();
                    }

                    mockWebSocket.send.mockClear();

                    const message = `websocket:${JSON.stringify({ message: JSON.stringify({ id: 1, method }) })}`;
                    socket.onMessageFromWebview(message);

                    expect(mockWebSocket.send).not.toHaveBeenCalled();
                });
            });
        });

        describe('Runtime.evaluate Restrictions', () => {
            it('should allow clipboard copy operation', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                const expression = 'document.getSelection().toString()';
                const command = { id: 1, method: 'Runtime.evaluate', params: { expression } };
                const message = `websocket:${JSON.stringify({ message: JSON.stringify(command) })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(command));
            });

            it('should block Runtime.evaluate without expression', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                const command = { id: 1, method: 'Runtime.evaluate', params: {} };
                const message = `websocket:${JSON.stringify({ message: JSON.stringify(command) })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).not.toHaveBeenCalled();
            });

            it('should block Runtime.evaluate with arbitrary code', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                const expression = 'alert("XSS attack")';
                const command = { id: 1, method: 'Runtime.evaluate', params: { expression } };
                const message = `websocket:${JSON.stringify({ message: JSON.stringify(command) })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).not.toHaveBeenCalled();
            });

            it('should block Runtime.evaluate with malicious execCommand', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                // Malicious: different command than insertText
                const expression = 'document.execCommand("delete", false, "");';
                const command = { id: 1, method: 'Runtime.evaluate', params: { expression } };
                const message = `websocket:${JSON.stringify({ message: JSON.stringify(command) })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).not.toHaveBeenCalled();
            });

            it('should block Runtime.evaluate with code injection attempt', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                // Injection attempt: extra code after execCommand
                const expression = 'document.execCommand("insertText", false, "test"); alert(1);';
                const command = { id: 1, method: 'Runtime.evaluate', params: { expression } };
                const message = `websocket:${JSON.stringify({ message: JSON.stringify(command) })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).not.toHaveBeenCalled();
            });

            it('should block Runtime.evaluate with execCommand insertText (use Input.insertText instead)', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                // execCommand paste is no longer allowed - use Input.insertText instead
                const expression = 'document.execCommand("insertText", false, "test content");';
                const command = { id: 1, method: 'Runtime.evaluate', params: { expression } };
                const message = `websocket:${JSON.stringify({ message: JSON.stringify(command) })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).not.toHaveBeenCalled();
            });
        });

        describe('Invalid/Malformed Messages', () => {
            it('should block command without method field', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                const command = { id: 1, params: {} };
                const message = `websocket:${JSON.stringify({ message: JSON.stringify(command) })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).not.toHaveBeenCalled();
            });

            it('should not crash on invalid CDP command JSON', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                // Valid outer JSON but invalid CDP command format
                const message = `websocket:${JSON.stringify({ message: '{not valid json}' })}`;

                expect(() => socket.onMessageFromWebview(message)).not.toThrow();
                expect(mockWebSocket.send).not.toHaveBeenCalled();
            });
        });

        describe('Payload Validation', () => {
            it('should reject websocket payload missing message field', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);
                const parseErrorSpy = jest.fn();
                socket.on('parseError', parseErrorSpy);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                // Missing message field
                const message = `websocket:${JSON.stringify({ foo: 'bar' })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).not.toHaveBeenCalled();
                expect(parseErrorSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        context: 'webview-websocket-validation',
                        error: 'Websocket payload missing required field: message'
                    })
                );
            });

            it('should reject websocket payload with non-string message', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);
                const parseErrorSpy = jest.fn();
                socket.on('parseError', parseErrorSpy);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                // message is a number instead of string
                const message = `websocket:${JSON.stringify({ message: 123 })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).not.toHaveBeenCalled();
                expect(parseErrorSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        context: 'webview-websocket-validation',
                        error: 'Websocket payload message must be a non-empty string'
                    })
                );
            });

            it('should reject websocket payload with empty string message', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);
                const parseErrorSpy = jest.fn();
                socket.on('parseError', parseErrorSpy);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                // message is an empty string
                const message = `websocket:${JSON.stringify({ message: '' })}`;

                socket.onMessageFromWebview(message);

                expect(mockWebSocket.send).not.toHaveBeenCalled();
                expect(parseErrorSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        context: 'webview-websocket-validation',
                        error: 'Websocket payload message must be a non-empty string'
                    })
                );
            });

            it('should accept valid websocket payload', () => {
                const socket = new PanelSocket(targetUrl, mockPostMessage);
                const parseErrorSpy = jest.fn();
                socket.on('parseError', parseErrorSpy);

                socket.onMessageFromWebview('ready:');
                if (mockWebSocket.onopen) {
                    mockWebSocket.onopen();
                }

                mockWebSocket.send.mockClear();

                // Valid payload with proper structure
                const cdpCommand = { id: 1, method: 'Page.enable', params: {} };
                const message = `websocket:${JSON.stringify({ message: JSON.stringify(cdpCommand) })}`;

                socket.onMessageFromWebview(message);

                // Should send the CDP command (it's in the allowlist)
                expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(cdpCommand));
                expect(parseErrorSpy).not.toHaveBeenCalled();
            });
        });
    });

    describe('Connection Error Handling', () => {
        it('should emit connectionError event when WebSocket errors', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const connectionErrorSpy = jest.fn();
            socket.on('connectionError', connectionErrorSpy);

            socket.onMessageFromWebview('ready:');
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            // Trigger WebSocket error
            if (mockWebSocket.onerror) {
                mockWebSocket.onerror();
            }

            expect(connectionErrorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: 'websocket-connection',
                    error: 'WebSocket connection error',
                    targetUrl
                })
            );
        });

        it('should emit connectionError event when WebSocket closes unexpectedly', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const connectionErrorSpy = jest.fn();
            socket.on('connectionError', connectionErrorSpy);

            socket.onMessageFromWebview('ready:');
            if (mockWebSocket.onopen) {
                mockWebSocket.onopen();
            }

            // Trigger WebSocket close
            if (mockWebSocket.onclose) {
                mockWebSocket.onclose();
            }

            expect(connectionErrorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: 'websocket-close',
                    error: 'WebSocket connection closed unexpectedly',
                    targetUrl
                })
            );
        });

        it('should not emit connectionError before connection is established', () => {
            const socket = new PanelSocket(targetUrl, mockPostMessage);
            const connectionErrorSpy = jest.fn();
            socket.on('connectionError', connectionErrorSpy);

            socket.onMessageFromWebview('ready:');

            // Trigger error before onopen
            if (mockWebSocket.onerror) {
                mockWebSocket.onerror();
            }

            // Should not emit error since connection was never established
            expect(connectionErrorSpy).not.toHaveBeenCalled();
        });
    });
});
