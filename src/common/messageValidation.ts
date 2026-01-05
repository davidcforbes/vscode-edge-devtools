// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Lightweight message payload validation for webview events.
 * Provides type-safe validation without external dependencies.
 */

/**
 * Validation result type
 */
export interface ValidationResult<T> {
    success: boolean;
    value?: T;
    error?: string;
}

/**
 * Helper: Check if value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Helper: Check if value is a non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Websocket message payload validator
 * Expected format: { message: string }
 */
export interface WebsocketPayload {
    message: string;
}

export function validateWebsocketPayload(value: unknown): ValidationResult<WebsocketPayload> {
    if (!isObject(value)) {
        return {
            success: false,
            error: 'Websocket payload must be an object'
        };
    }

    if (!('message' in value)) {
        return {
            success: false,
            error: 'Websocket payload missing required field: message'
        };
    }

    if (!isNonEmptyString(value.message)) {
        return {
            success: false,
            error: 'Websocket payload message must be a non-empty string'
        };
    }

    return {
        success: true,
        value: { message: value.message }
    };
}

/**
 * Telemetry message payload validator
 * Expected format: { event: string, name: string, data: number | Record<string, unknown> }
 */
export interface TelemetryPayload {
    event: string;
    name: string;
    data: number | Record<string, unknown>;
}

export function validateTelemetryPayload(value: unknown): ValidationResult<TelemetryPayload> {
    if (!isObject(value)) {
        return {
            success: false,
            error: 'Telemetry payload must be an object'
        };
    }

    const requiredFields = ['event', 'name', 'data'] as const;
    for (const field of requiredFields) {
        if (!(field in value)) {
            return {
                success: false,
                error: `Telemetry payload missing required field: ${field}`
            };
        }
    }

    if (!isNonEmptyString(value.event) || !isNonEmptyString(value.name)) {
        return {
            success: false,
            error: 'Telemetry payload event and name must be non-empty strings'
        };
    }

    const data = value.data;
    const isValidData = typeof data === 'number' || isObject(data);
    if (!isValidData) {
        return {
            success: false,
            error: 'Telemetry payload data must be a number or object'
        };
    }

    return {
        success: true,
        value: {
            event: value.event,
            name: value.name,
            data
        }
    };
}

/**
 * Clipboard write payload validator
 * Expected format: { data: { message: string } }
 */
export interface ClipboardPayload {
    data: {
        message: string;
    };
}

export function validateClipboardPayload(value: unknown): ValidationResult<ClipboardPayload> {
    if (!isObject(value)) {
        return {
            success: false,
            error: 'Clipboard payload must be an object'
        };
    }

    if (!('data' in value) || !isObject(value.data)) {
        return {
            success: false,
            error: 'Clipboard payload must have data object'
        };
    }

    if (!('message' in value.data) || !isNonEmptyString(value.data.message)) {
        return {
            success: false,
            error: 'Clipboard payload data.message must be a non-empty string'
        };
    }

    return {
        success: true,
        value: {
            data: {
                message: value.data.message
            }
        }
    };
}
