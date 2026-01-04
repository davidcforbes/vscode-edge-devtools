// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { RunnerOptions, TestSuite } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

/**
 * Load test suites based on runner options
 */
export async function loadTestSuites(options: RunnerOptions): Promise<TestSuite[]> {
    const suites: TestSuite[] = [];
    const suitesDir = path.join(__dirname, 'suites');

    // Determine which suite directories to scan
    const directories: string[] = [];

    if (options.suite) {
        // Load specific suite directory
        directories.push(path.join(suitesDir, options.suite));
    } else if (options.e2e) {
        // Load only E2E suites
        directories.push(path.join(suitesDir, 'e2e'));
    } else {
        // Load all suite directories
        directories.push(
            path.join(suitesDir, 'unit'),
            path.join(suitesDir, 'integration'),
            path.join(suitesDir, 'e2e')
        );
    }

    // Load suites from each directory
    for (const dir of directories) {
        try {
            const dirSuites = await loadSuitesFromDirectory(dir);
            suites.push(...dirSuites);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.warn(`Warning: Failed to load suites from ${dir}:`, error);
            }
            // Directory doesn't exist yet - this is OK during development
        }
    }

    if (suites.length === 0) {
        console.warn('Warning: No test suites found');
    }

    return suites;
}

/**
 * Load all test suites from a directory
 */
async function loadSuitesFromDirectory(dir: string): Promise<TestSuite[]> {
    const suites: TestSuite[] = [];

    const files = await readdir(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const fileStat = await stat(filePath);

        if (fileStat.isDirectory()) {
            // Recursively load from subdirectories
            const subSuites = await loadSuitesFromDirectory(filePath);
            suites.push(...subSuites);
        } else if (file.endsWith('.test.js')) {
            // Load test suite from compiled JS file
            try {
                const suite = await loadSuiteFromFile(filePath);
                if (suite) {
                    suites.push(suite);
                }
            } catch (error) {
                console.error(`Error loading suite from ${filePath}:`, error);
            }
        }
    }

    return suites;
}

/**
 * Load a single test suite from a file
 */
async function loadSuiteFromFile(filePath: string): Promise<TestSuite | null> {
    try {
        // Dynamic import of the test suite file (ES modules need file:// URLs)
        const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;
        const module = await import(fileUrl);

        // Look for exported TestSuite
        // Support both default export and named exports
        const suite = module.default || module.suite || findTestSuiteInModule(module);

        if (!suite) {
            console.warn(`No test suite found in ${filePath}`);
            return null;
        }

        // Validate suite structure
        if (!suite.name || !Array.isArray(suite.tests)) {
            console.warn(`Invalid test suite structure in ${filePath}`);
            return null;
        }

        return suite as TestSuite;
    } catch (error) {
        console.error(`Failed to load suite from ${filePath}:`, error);
        return null;
    }
}

/**
 * Find a TestSuite object in a module's exports
 */
function findTestSuiteInModule(module: any): TestSuite | null {
    // Look through all exports for something that looks like a TestSuite
    for (const key of Object.keys(module)) {
        const value = module[key];
        if (value && typeof value === 'object' && value.name && Array.isArray(value.tests)) {
            return value as TestSuite;
        }
    }
    return null;
}
