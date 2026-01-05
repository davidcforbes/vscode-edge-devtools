// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import packageJson from '../package.json';
import { DebugTelemetryReporter } from './debugTelemetryReporter';
import { SETTINGS_STORE_NAME } from './config';

type ExtensionSettings = [string, boolean | string | {[key: string]: string} | undefined];

/**
 * Settings that are safe to send to telemetry without redaction.
 * Excludes settings that may contain sensitive data like file paths, URLs, or custom arguments.
 */
const TELEMETRY_SAFE_SETTINGS = new Set([
    'hostname',      // Usually localhost or IP (acceptable for telemetry)
    'port',          // Port number (safe)
    'useHttps',      // Boolean flag (safe)
    'headless',      // Boolean flag (safe)
    'timeout',       // Numeric timeout value (safe)
    'browserFlavor'  // Enum value: Default/Stable/Beta/Dev/Canary (safe)
]);

/**
 * Redacts sensitive setting values to prevent leaking personal information via telemetry.
 * Only settings in TELEMETRY_SAFE_SETTINGS allowlist are sent with actual values.
 *
 * @param settingName The name of the setting (without the extension prefix)
 * @param settingValue The setting value to potentially redact
 * @returns The original value if safe, otherwise "<redacted>"
 */
function scrubSettingValue(settingName: string, settingValue: boolean | string | {[key: string]: string} | undefined): string {
    if (settingValue === undefined) {
        return 'undefined';
    }

    // Check if this setting is on the safe list
    if (TELEMETRY_SAFE_SETTINGS.has(settingName)) {
        // Safe setting - send actual value
        return typeof settingValue !== 'object' ? settingValue.toString() : JSON.stringify(settingValue);
    }

    // Sensitive setting (userDataDir, browserArgs, defaultUrl, etc.) - redact the value
    return '<redacted>';
}

/**
 * Create a telemetry reporter that can be used for this extension
 *
 * @param context The vscode context
 */
export function createTelemetryReporter(_context: vscode.ExtensionContext): Readonly<TelemetryReporter> {
    if (packageJson && (_context.extensionMode === vscode.ExtensionMode.Production)) {
        // Use the real telemetry reporter
        return new TelemetryReporter(packageJson.oneDSKey);
    }
        // Fallback to a fake telemetry reporter
        return new DebugTelemetryReporter();

}

export function reportExtensionSettings(telemetryReporter: Readonly<TelemetryReporter>): void {
    const extensionSettingsList = Object.entries(vscode.workspace.getConfiguration(SETTINGS_STORE_NAME)).splice(4) as Array<ExtensionSettings>;
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const changedSettingsMap: Map<string, string> = new Map<string, string>();
    for (const currentSetting of extensionSettingsList) {
        const settingName: string = currentSetting[0];
        const settingValue: boolean | string | {[key: string]: string} | undefined = currentSetting[1];
        const settingInspect = settings.inspect(settingName);
        if (settingInspect) {
            const defaultValue = settingInspect.defaultValue;
            if (settingValue !== undefined && settingValue !== defaultValue) {
                if (defaultValue && typeof defaultValue === 'object' && typeof settingValue === 'object') {
                    for (const [key, value] of Object.entries(defaultValue)) {
                        if (settingValue[key] !== value) {
                            changedSettingsMap.set(settingName, scrubSettingValue(settingName, settingValue));
                            break;
                        }
                    }
                } else {
                    changedSettingsMap.set(settingName, scrubSettingValue(settingName, settingValue));
                }
            }
        }
    }
    const changedSettingsObject = {};
    Object.assign(changedSettingsObject, ...[...changedSettingsMap.entries()].map(([k, v]) => ({[k]: v})));
    telemetryReporter.sendTelemetryEvent('user/settingsChangedAtLaunch', changedSettingsObject);
}

export function reportChangedExtensionSetting(event: vscode.ConfigurationChangeEvent, telemetryReporter: Readonly<TelemetryReporter>): void {
    const extensionSettingsList = Object.entries(vscode.workspace.getConfiguration(SETTINGS_STORE_NAME)).splice(4) as Array<ExtensionSettings>;
    for (const currentSetting of extensionSettingsList) {
        const settingName: string = currentSetting[0];
        const settingValue: boolean | string | {[key: string]: string} | undefined = currentSetting[1];
        if (event.affectsConfiguration(`${SETTINGS_STORE_NAME}.${settingName}`)) {
            if (settingName !== undefined) {
                if (settingValue !== undefined) {
                    const telemetryObject: {[key: string]: string}  = {};
                    telemetryObject[settingName] = scrubSettingValue(settingName, settingValue);
                    telemetryReporter.sendTelemetryEvent('user/settingsChanged', telemetryObject);
                }
            }
        }
    }
}

export function reportUrlType(url: string, telemetryReporter: Readonly<TelemetryReporter>): void {
    const localhostPattern = /^https?:\/\/localhost:/;
    const ipPattern = /(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/;
    const filePattern = /^file:\/\//;
    let urlType;
    if (localhostPattern.exec(url) || ipPattern.exec(url)) {
        urlType = 'localhost';
    } else if (filePattern.exec(url)) {
        urlType = 'file';
    } else {
        urlType = 'other';
    }
    telemetryReporter.sendTelemetryEvent('user/browserNavigation', { 'urlType': urlType });
}

export async function reportFileExtensionTypes(telemetryReporter: Readonly<TelemetryReporter>): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.*', '**/node_modules/**');
    const extensionMap: Map<string, number> = new Map<string, number>([
        ['html', 0],
        ['css', 0],
        ['js', 0],
        ['ts', 0],
        ['jsx', 0],
        ['scss', 0],
        ['json', 0],
        ['mjs', 0],
        ['other', 0],
    ]);
    for (const file of files) {
        const extension: string | undefined = file.path.split('.').pop();
        if (extension) {
            if (extensionMap.has(extension)) {
                const currentValue = extensionMap.get(extension);
                if (currentValue !== undefined) {
                    extensionMap.set(extension, currentValue + 1);
                }
            } else {
                const otherCount = extensionMap.get('other');
                if (otherCount !== undefined) {
                    extensionMap.set('other', otherCount + 1);
                }
            }
        }
    }
    extensionMap.set('total', files.length);

    // Creates Object from map
    const fileTypes: {[key: string]: number} = {};
    Object.assign(fileTypes, ...[...extensionMap.entries()].map(([k, v]) => ({[k]: v})));
    telemetryReporter.sendTelemetryEvent('workspace/metadata', undefined, fileTypes);
}
