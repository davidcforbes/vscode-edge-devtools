// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    validateWebsocketPayload,
    validateTelemetryPayload,
    validateClipboardPayload
} from '../../src/common/messageValidation';

describe('Message Validation', () => {
    describe('validateWebsocketPayload', () => {
        it('should accept valid websocket payload', () => {
            const input = { message: '{"id":1,"method":"Page.enable"}' };
            const result = validateWebsocketPayload(input);

            expect(result.success).toBe(true);
            expect(result.value).toEqual({ message: '{"id":1,"method":"Page.enable"}' });
            expect(result.error).toBeUndefined();
        });

        it('should reject non-object payload', () => {
            const inputs = [null, undefined, 'string', 123, [], true];

            for (const input of inputs) {
                const result = validateWebsocketPayload(input);
                expect(result.success).toBe(false);
                expect(result.error).toBe('Websocket payload must be an object');
            }
        });

        it('should reject payload missing message field', () => {
            const input = { foo: 'bar' };
            const result = validateWebsocketPayload(input);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Websocket payload missing required field: message');
        });

        it('should reject payload with non-string message', () => {
            const inputs = [
                { message: 123 },
                { message: null },
                { message: undefined },
                { message: {} },
                { message: [] }
            ];

            for (const input of inputs) {
                const result = validateWebsocketPayload(input);
                expect(result.success).toBe(false);
                expect(result.error).toBe('Websocket payload message must be a non-empty string');
            }
        });

        it('should reject payload with empty string message', () => {
            const input = { message: '' };
            const result = validateWebsocketPayload(input);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Websocket payload message must be a non-empty string');
        });
    });

    describe('validateTelemetryPayload', () => {
        it('should accept valid telemetry payload with number data', () => {
            const input = {
                event: 'performance',
                name: 'load.time',
                data: 123.45
            };
            const result = validateTelemetryPayload(input);

            expect(result.success).toBe(true);
            expect(result.value).toEqual({
                event: 'performance',
                name: 'load.time',
                data: 123.45
            });
        });

        it('should accept valid telemetry payload with object data', () => {
            const input = {
                event: 'error',
                name: 'runtime.error',
                data: { code: 500, message: 'Internal error' }
            };
            const result = validateTelemetryPayload(input);

            expect(result.success).toBe(true);
            expect(result.value).toEqual({
                event: 'error',
                name: 'runtime.error',
                data: { code: 500, message: 'Internal error' }
            });
        });

        it('should reject non-object payload', () => {
            const result = validateTelemetryPayload('not an object');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Telemetry payload must be an object');
        });

        it('should reject payload missing required fields', () => {
            const testCases = [
                { name: 'test', data: 123 }, // missing event
                { event: 'test', data: 123 }, // missing name
                { event: 'test', name: 'test' } // missing data
            ];

            for (const input of testCases) {
                const result = validateTelemetryPayload(input);
                expect(result.success).toBe(false);
                expect(result.error).toContain('missing required field');
            }
        });

        it('should reject payload with non-string event or name', () => {
            const testCases = [
                { event: 123, name: 'test', data: 1 },
                { event: 'test', name: 123, data: 1 },
                { event: '', name: 'test', data: 1 },
                { event: 'test', name: '', data: 1 }
            ];

            for (const input of testCases) {
                const result = validateTelemetryPayload(input);
                expect(result.success).toBe(false);
                expect(result.error).toBe('Telemetry payload event and name must be non-empty strings');
            }
        });

        it('should reject payload with invalid data type', () => {
            const testCases = [
                { event: 'test', name: 'test', data: 'string' },
                { event: 'test', name: 'test', data: [] },
                { event: 'test', name: 'test', data: null }
            ];

            for (const input of testCases) {
                const result = validateTelemetryPayload(input);
                expect(result.success).toBe(false);
                expect(result.error).toBe('Telemetry payload data must be a number or object');
            }
        });
    });

    describe('validateClipboardPayload', () => {
        it('should accept valid clipboard payload', () => {
            const input = {
                data: {
                    message: 'Hello, clipboard!'
                }
            };
            const result = validateClipboardPayload(input);

            expect(result.success).toBe(true);
            expect(result.value).toEqual({
                data: {
                    message: 'Hello, clipboard!'
                }
            });
        });

        it('should reject non-object payload', () => {
            const result = validateClipboardPayload(null);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Clipboard payload must be an object');
        });

        it('should reject payload missing data field', () => {
            const input = { foo: 'bar' };
            const result = validateClipboardPayload(input);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Clipboard payload must have data object');
        });

        it('should reject payload with non-object data', () => {
            const testCases = [
                { data: 'string' },
                { data: 123 },
                { data: null },
                { data: [] }
            ];

            for (const input of testCases) {
                const result = validateClipboardPayload(input);
                expect(result.success).toBe(false);
                expect(result.error).toBe('Clipboard payload must have data object');
            }
        });

        it('should reject payload with missing or invalid message', () => {
            const testCases = [
                { data: { foo: 'bar' } }, // missing message
                { data: { message: 123 } }, // non-string message
                { data: { message: '' } } // empty string message
            ];

            for (const input of testCases) {
                const result = validateClipboardPayload(input);
                expect(result.success).toBe(false);
                expect(result.error).toBe('Clipboard payload data.message must be a non-empty string');
            }
        });
    });
});
