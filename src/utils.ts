// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * DEPRECATED: This module re-exports from focused modules for backward compatibility.
 * New code should import directly from the focused modules:
 * - browser.ts: Browser discovery, launch, and path management
 * - network.ts: HTTP/WebSocket/CDP helpers
 * - config.ts: Configuration and settings
 * - telemetry.ts: Telemetry helpers
 */

// Re-export browser module
export {
    type Browser,
    type Target,
    TargetType,
    type BrowserFlavor,
    type Platform,
    getPlatform,
    isHeadlessEnabled,
    getBrowserArgs,
    getBrowserPath,
    launchBrowser,
} from './browser';

// Re-export network module
export {
    type IRemoteTargetJson,
    type IRequestCDPProxyResult,
    fetchUri,
    fixRemoteWebSocket,
    retryAsync,
    getMatchingTargets,
    getListOfTargets,
    openNewTab,
    getActiveDebugSessionId,
    getJsDebugCDPProxyWebsocketUrl,
} from './network';

// Re-export config module
export {
    type IStringDictionary,
    type IDevToolsSettings,
    type IUserConfig,
    type IRuntimeConfig,
    SETTINGS_STORE_NAME,
    SETTINGS_DEFAULT_USE_HTTPS,
    SETTINGS_DEFAULT_HOSTNAME,
    SETTINGS_DEFAULT_PORT,
    SETTINGS_DEFAULT_URL,
    SETTINGS_WEBVIEW_NAME,
    SETTINGS_SCREENCAST_WEBVIEW_NAME,
    SETTINGS_PREF_NAME,
    SETTINGS_PREF_DEFAULTS,
    SETTINGS_VIEW_NAME,
    SETTINGS_DEFAULT_PATH_MAPPING,
    SETTINGS_DEFAULT_PATH_OVERRIDES,
    SETTINGS_DEFAULT_WEB_ROOT,
    SETTINGS_DEFAULT_SOURCE_MAPS,
    SETTINGS_DEFAULT_ATTACH_TIMEOUT,
    SETTINGS_DEFAULT_ATTACH_INTERVAL,
    SETTINGS_DEFAULT_ENTRY_POINT,
    buttonCode,
    getRemoteEndpointSettings,
    getRuntimeConfig,
} from './config';

// Re-export telemetry module
export {
    createTelemetryReporter,
    reportExtensionSettings,
    reportChangedExtensionSetting,
    reportUrlType,
    reportFileExtensionTypes,
} from './telemetry';
