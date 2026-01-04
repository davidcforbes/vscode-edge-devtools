// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { fileURLToPath } from 'url';
import { TestContext } from './context.js';
import { TestReporter } from './reporter.js';
import { loadTestSuites } from './loader.js';
import { RunnerOptions, TestSuite, TestCase, TestResult } from './types.js';

/**
 * Main test runner that executes test suites
 */
export class TestRunner {
    private context: TestContext;
    private reporter: TestReporter;

    constructor(options: RunnerOptions) {
        this.context = new TestContext(options);
        this.reporter = new TestReporter(options);
    }

    /**
     * Run all test suites
     */
    async run(): Promise<void> {
        console.log('🚀 Starting CLI Test Harness\n');

        try {
            const suites = await loadTestSuites(this.context.options);

            if (suites.length === 0) {
                console.log('No test suites found to run');
                process.exit(0);
            }

            console.log(`Found ${suites.length} test suite(s)\n`);

            await this.context.setup();

            for (const suite of suites) {
                await this.runSuite(suite);
            }

            this.reporter.printSummary();
            process.exit(this.reporter.hasFailures() ? 1 : 0);
        } catch (error) {
            this.reporter.printError(error);
            process.exit(1);
        } finally {
            await this.context.teardown();
        }
    }

    /**
     * Run a single test suite
     */
    private async runSuite(suite: TestSuite): Promise<void> {
        this.reporter.startSuite(suite.name);

        for (const test of suite.tests) {
            await this.runTest(test);
        }

        this.reporter.endSuite(suite.name);
    }

    /**
     * Run a single test case
     */
    private async runTest(test: TestCase): Promise<void> {
        const startTime = Date.now();
        const result: TestResult = {
            name: test.name,
            passed: false,
            duration: 0,
        };

        try {
            await test.run(this.context);
            result.passed = true;
        } catch (error) {
            result.passed = false;
            if (error instanceof Error) {
                result.error = error.message;
                result.stack = error.stack;
            } else {
                result.error = String(error);
            }
        } finally {
            result.duration = Date.now() - startTime;
            this.reporter.recordTest(result);
        }
    }
}

/**
 * Parse command-line arguments
 */
function parseArgs(args: string[]): RunnerOptions {
    const options: RunnerOptions = {
        verbose: false,
        watch: false,
        coverage: false,
        e2e: false,
        parallel: 1,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--verbose' || arg === '-v') {
            options.verbose = true;
        } else if (arg === '--watch' || arg === '-w') {
            options.watch = true;
        } else if (arg === '--coverage' || arg === '-c') {
            options.coverage = true;
        } else if (arg === '--e2e') {
            options.e2e = true;
        } else if (arg.startsWith('--suite=')) {
            options.suite = arg.split('=')[1];
        } else if (arg === '--suite') {
            options.suite = args[++i];
        } else if (arg.startsWith('--browser=')) {
            const browser = arg.split('=')[1];
            if (browser === 'stable' || browser === 'beta' || browser === 'dev' || browser === 'canary') {
                options.browser = browser;
            } else {
                console.warn(`Unknown browser flavor: ${browser}, using stable`);
                options.browser = 'stable';
            }
        } else if (arg === '--browser') {
            const browser = args[++i];
            if (browser === 'stable' || browser === 'beta' || browser === 'dev' || browser === 'canary') {
                options.browser = browser;
            }
        } else if (arg.startsWith('--parallel=')) {
            options.parallel = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--parallel') {
            options.parallel = parseInt(args[++i], 10);
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        } else if (!arg.startsWith('--')) {
            // Unknown argument - could be a suite name
            options.suite = arg;
        }
    }

    return options;
}

/**
 * Print CLI help
 */
function printHelp(): void {
    console.log(`
VS Code Edge DevTools CLI Test Harness

Usage: npm run test:harness [options]

Options:
  --suite=<name>        Run specific test suite (e.g., unit, integration, e2e)
  --verbose, -v         Verbose output with detailed logs
  --watch, -w           Watch mode (re-run tests on file changes)
  --coverage, -c        Generate coverage report
  --e2e                 Run only E2E tests
  --browser=<flavor>    Browser flavor: stable, beta, dev, canary
  --parallel=<n>        Run tests in parallel (number of workers)
  --help, -h            Show this help message

Examples:
  npm run test:harness
  npm run test:harness -- --verbose
  npm run test:harness -- --suite=unit
  npm run test:harness -- --e2e --browser=canary
  npm run test:harness -- --parallel=4
`);
}

// CLI entry point
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename || process.argv[1].endsWith('runner.js');

if (isMainModule) {
    const options = parseArgs(process.argv.slice(2));
    const runner = new TestRunner(options);
    runner.run().catch((error) => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
