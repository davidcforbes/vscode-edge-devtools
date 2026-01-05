// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { TestContext } from './context.js';

/**
 * CLI options for the test runner
 */
export interface RunnerOptions {
    suite?: string;
    verbose?: boolean;
    watch?: boolean;
    coverage?: boolean;
    e2e?: boolean;
    logDir?: string;
    browser?: 'stable' | 'beta' | 'dev' | 'canary';
    parallel?: number;
}

/**
 * Individual test case
 */
export interface TestCase {
    name: string;
    run: (context: TestContext) => Promise<void>;
}

/**
 * Test suite containing related test cases
 */
export interface TestSuite {
    name: string;
    tests: TestCase[];
}

/**
 * Result of a test execution
 */
export interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
    stack?: string;
}

/**
 * Telemetry event captured during testing
 */
export interface TelemetryEvent {
    name: string;
    properties?: Record<string, string>;
    measures?: Record<string, number>;
}
