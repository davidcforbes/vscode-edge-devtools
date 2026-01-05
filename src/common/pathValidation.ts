// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';

/**
 * Validates a userDataDir path to prevent path traversal and ensure security.
 *
 * @param userDataDir The user data directory path to validate
 * @returns Object with {valid: boolean, error?: string, normalized?: string}
 */
export function validateUserDataDir(userDataDir: string | boolean | undefined): {
    valid: boolean;
    error?: string;
    normalized?: string;
} {
    // Boolean or undefined values are handled separately by the caller
    if (typeof userDataDir !== 'string') {
        return { valid: true };
    }

    // Empty string is valid (explicit opt-out)
    if (userDataDir === '') {
        return { valid: true, normalized: '' };
    }

    try {
        // Normalize the path to resolve . and .. components
        const normalized = path.normalize(userDataDir);

        // Check for path traversal attempts (.. components)
        // After normalization, if the path still contains .., it's trying to escape
        const absoluteNormalized = path.resolve(normalized);
        const relativeToResolved = path.relative(absoluteNormalized, normalized);

        if (relativeToResolved.startsWith('..') || normalized.includes('..')) {
            return {
                valid: false,
                error: 'Path traversal detected: userDataDir cannot contain ".." components'
            };
        }

        // Require absolute paths for security
        if (!path.isAbsolute(normalized)) {
            return {
                valid: false,
                error: 'userDataDir must be an absolute path'
            };
        }

        return {
            valid: true,
            normalized
        };
    } catch (error) {
        return {
            valid: false,
            error: `Invalid path: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
