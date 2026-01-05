// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * URL schemes that pose security risks and should be blocked from navigation.
 * These schemes can execute code or access sensitive data in the browser context.
 */
const DANGEROUS_URL_SCHEMES = [
    'javascript:',  // Can execute arbitrary JavaScript
    'data:',        // Can contain embedded HTML/scripts
    'vbscript:',    // Can execute VBScript (legacy IE)
    'about:',       // Internal browser pages (except about:blank)
];

/**
 * URL schemes that are allowed for navigation.
 */
const ALLOWED_URL_SCHEMES = [
    'http://',
    'https://',
    'file://',
    'about:blank',  // Explicitly allow about:blank
];

/**
 * Validates a URL to ensure it doesn't use dangerous schemes that could
 * execute code or access sensitive data.
 *
 * @param url The URL to validate
 * @returns null if valid, error message string if invalid
 */
export function validateUrlScheme(url: string): string | null {
    if (!url || typeof url !== 'string') {
        return 'URL cannot be empty';
    }

    const normalizedUrl = url.trim().toLowerCase();

    // Allow about:blank specifically
    if (normalizedUrl === 'about:blank') {
        return null;
    }

    // Check for dangerous schemes
    for (const scheme of DANGEROUS_URL_SCHEMES) {
        if (normalizedUrl.startsWith(scheme)) {
            return `URL scheme "${scheme}" is not allowed for security reasons. Please use http://, https://, or file:// URLs.`;
        }
    }

    // Check if URL has an allowed scheme
    const hasAllowedScheme = ALLOWED_URL_SCHEMES.some(scheme =>
        normalizedUrl.startsWith(scheme)
    );

    // If no scheme detected, it will be auto-prefixed with http:// by the caller
    // This is safe because we've already blocked dangerous schemes above
    const hasNoScheme = !normalizedUrl.includes('://') &&
                        !normalizedUrl.startsWith('about:') &&
                        !normalizedUrl.startsWith('file:');

    if (!hasAllowedScheme && !hasNoScheme) {
        return 'URL must start with http://, https://, or file://';
    }

    return null;
}

/**
 * Sanitizes a URL by ensuring it uses a safe scheme.
 * If the URL has no scheme, prepends 'http://'.
 *
 * @param url The URL to sanitize
 * @returns Sanitized URL, or null if the URL is invalid/dangerous
 */
export function sanitizeUrl(url: string): string | null {
    const validation = validateUrlScheme(url);
    if (validation !== null) {
        return null; // URL is invalid/dangerous
    }

    let sanitized = url.trim();

    // Handle file paths (starting with / or drive letter like C:)
    if (sanitized.startsWith('/') || (sanitized.length > 1 && sanitized[1] === ':')) {
        try {
            sanitized = new URL(`file://${sanitized}`).href;
        } catch (e) {
            // If file URL conversion fails, return null
            return null;
        }
    }

    // If no scheme, prepend http://
    if (!sanitized.includes('://') &&
        !sanitized.startsWith('about:') &&
        !sanitized.startsWith('file:')) {
        sanitized = 'http://' + sanitized;
    }

    return sanitized;
}
