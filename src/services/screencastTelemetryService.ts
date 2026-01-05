// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import {
    ITelemetryProps,
    ITelemetryMeasures,
    TelemetryData,
} from '../common/webviewEvents';

/**
 * Service for recording screencast-specific telemetry
 */
export class ScreencastTelemetryService {
    private readonly telemetryReporter: TelemetryReporter;
    private lastParseErrorTime = 0;
    private parseErrorNotificationShown = false;
    private lastConnectionErrorTime = 0;
    private connectionErrorNotificationShown = false;
    private static readonly PARSE_ERROR_THROTTLE_MS = 60000; // 1 minute
    private static readonly CONNECTION_ERROR_THROTTLE_MS = 60000; // 1 minute

    constructor(telemetryReporter: TelemetryReporter) {
        this.telemetryReporter = telemetryReporter;
    }

    /**
     * Record an enumerated histogram event
     */
    recordEnumeratedHistogram(actionName: string, actionCode: number): void {
        const properties: ITelemetryProps = {};
        properties[`${actionName}.actionCode`] = actionCode.toString();
        this.telemetryReporter.sendTelemetryEvent(
            `devtools/${actionName}`,
            properties);
    }

    /**
     * Record a performance histogram event
     */
    recordPerformanceHistogram(actionName: string, duration: number): void {
        const measures: ITelemetryMeasures = {};
        measures[`${actionName}.duration`] = duration;
        this.telemetryReporter.sendTelemetryEvent(
            `devtools/${actionName}`,
            undefined,
            measures);
    }

    /**
     * Handle and record telemetry from socket messages
     */
    handleSocketTelemetry(message: string): void {
        try {
            const telemetry: TelemetryData = JSON.parse(message) as TelemetryData;
            if (telemetry.event !== 'screencast') {
                return;
            }

            this.telemetryReporter.sendTelemetryEvent(
                `devtools/${telemetry.name}/${telemetry.data.event}`, {
                    'value': telemetry.data.value as string,
                });
        } catch (error) {
            console.error('[ScreencastTelemetryService] Failed to parse telemetry message:', error);
            // Ignore malformed telemetry - don't crash extension
        }
    }

    /**
     * Handle and report parse errors (with rate limiting and user notification)
     */
    handleParseError(errorData: unknown): void {
        // Rate limit parse error reporting to avoid spam
        const now = Date.now();
        if (now - this.lastParseErrorTime < ScreencastTelemetryService.PARSE_ERROR_THROTTLE_MS) {
            return; // Skip this error - too soon after last report
        }
        this.lastParseErrorTime = now;

        try {
            const error = errorData as { context: string; error: string; rawMessage: string };

            // Report to telemetry
            this.telemetryReporter.sendTelemetryErrorEvent('devtools/parseError', {
                'context': error.context || 'unknown',
                'error': error.error || 'unknown',
                'messagePreview': error.rawMessage ? error.rawMessage.substring(0, 100) : 'unavailable'
            });

            // Show user notification (only first occurrence per session to avoid annoyance)
            if (!this.parseErrorNotificationShown) {
                this.parseErrorNotificationShown = true;
                void vscode.window.showWarningMessage(
                    `Browser preview encountered a message parsing error. Check the output panel for details.`,
                    'Show Output'
                ).then(selection => {
                    if (selection === 'Show Output') {
                        void vscode.commands.executeCommand('workbench.action.output.toggleOutput');
                    }
                });
            }
        } catch (reportError) {
            console.error('[ScreencastTelemetryService] Failed to report parse error:', reportError);
        }
    }

    /**
     * Handle and report connection errors (with rate limiting and user notification)
     */
    handleConnectionError(errorData: unknown): void {
        // Rate limit connection error reporting to avoid spam
        const now = Date.now();
        if (now - this.lastConnectionErrorTime < ScreencastTelemetryService.CONNECTION_ERROR_THROTTLE_MS) {
            return; // Skip this error - too soon after last report
        }
        this.lastConnectionErrorTime = now;

        try {
            const error = errorData as { context: string; error: string; targetUrl: string };

            // Report to telemetry
            this.telemetryReporter.sendTelemetryErrorEvent('devtools/connectionError', {
                'context': error.context || 'unknown',
                'error': error.error || 'unknown',
                'targetUrl': error.targetUrl || 'unavailable'
            });

            // Show user notification (only first occurrence per session to avoid annoyance)
            if (!this.connectionErrorNotificationShown) {
                this.connectionErrorNotificationShown = true;
                void vscode.window.showWarningMessage(
                    `Browser preview lost connection to the browser. The connection may have been interrupted.`,
                    'Dismiss'
                ).then(() => {
                    // User dismissed notification
                });
            }
        } catch (reportError) {
            console.error('[ScreencastTelemetryService] Failed to report connection error:', reportError);
        }
    }
}
