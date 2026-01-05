// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs';
import * as path from 'path';
import { RunnerOptions, TestResult } from './types.js';

/**
 * Test reporter that collects and displays test results
 */
export class TestReporter {
    private results: TestResult[] = [];
    private startTime = 0;
    private suiteStartTime = 0;
    private resultsPath?: string;

    constructor(private options: RunnerOptions) {
        this.startTime = Date.now();
        if (options.logDir) {
            fs.mkdirSync(options.logDir, { recursive: true });
            this.resultsPath = path.join(options.logDir, 'test-results.json');
        }
    }

    /**
     * Called when a test suite starts
     */
    startSuite(name: string): void {
        this.suiteStartTime = Date.now();
        if (this.options.verbose) {
            console.log(`\n📦 ${name}`);
        }
    }

    /**
     * Called when a test suite ends
     */
    endSuite(name: string): void {
        const duration = Date.now() - this.suiteStartTime;
        if (this.options.verbose) {
            console.log(`✅ Completed in ${duration}ms\n`);
        }
    }

    /**
     * Record a test result and print it
     */
    recordTest(result: TestResult): void {
        this.results.push(result);

        const icon = result.passed ? '✅' : '❌';
        const durationStr = `(${result.duration}ms)`;

        if (result.passed) {
            console.log(`  ${icon} ${result.name} ${durationStr}`);
        } else {
            console.log(`  ${icon} ${result.name} ${durationStr}`);
            if (result.error) {
                console.log(`     Error: ${result.error}`);
            }
            if (result.stack && this.options.verbose) {
                console.log(`     ${result.stack.split('\n').join('\n     ')}`);
            }
        }
    }

    /**
     * Print error message
     */
    printError(error: unknown): void {
        console.error('\n❌ Fatal Error:');
        if (error instanceof Error) {
            console.error(`   ${error.message}`);
            if (this.options.verbose && error.stack) {
                console.error(`\n${error.stack}`);
            }
        } else {
            console.error(`   ${String(error)}`);
        }
        console.error('');
    }

    /**
     * Print test summary
     */
    printSummary(): void {
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;
        const failed = total - passed;
        const totalDuration = Date.now() - this.startTime;

        console.log('\n' + '='.repeat(60));
        console.log(`\n📊 Test Summary:`);
        console.log(`   Total:    ${total}`);
        console.log(`   Passed:   ${passed} ✅`);
        console.log(`   Failed:   ${failed} ❌`);
        console.log(`   Duration: ${totalDuration}ms`);
        console.log('\n' + '='.repeat(60) + '\n');

        if (this.options.coverage) {
            this.printCoverage();
        }

        if (failed > 0) {
            console.log('Failed tests:');
            this.results
                .filter(r => !r.passed)
                .forEach(r => {
                    console.log(`  ❌ ${r.name}`);
                    if (r.error) {
                        console.log(`     ${r.error}`);
                    }
                });
            console.log('');
        }

        this.writeResults({ total, passed, failed, duration: totalDuration });
    }

    /**
     * Check if there are any test failures
     */
    hasFailures(): boolean {
        return this.results.some(r => !r.passed);
    }

    /**
     * Print coverage report (stub for future implementation)
     */
    private printCoverage(): void {
        console.log('\n📈 Coverage Report:');
        console.log('   Coverage reporting not yet implemented');
        console.log('');
    }

    /**
     * Get all test results
     */
    getResults(): TestResult[] {
        return [...this.results];
    }

    /**
     * Get test statistics
     */
    getStats() {
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;
        const failed = total - passed;
        const duration = Date.now() - this.startTime;

        return { total, passed, failed, duration };
    }

    private writeResults(stats: { total: number; passed: number; failed: number; duration: number }): void {
        if (!this.resultsPath) {
            return;
        }

        try {
            const payload = {
                stats,
                results: this.results,
            };
            fs.writeFileSync(this.resultsPath, JSON.stringify(payload, null, 2), 'utf8');
            console.log(`\n📝 Test results written to ${this.resultsPath}`);
        } catch (error) {
            console.warn('Failed to write test results:', error);
        }
    }
}
