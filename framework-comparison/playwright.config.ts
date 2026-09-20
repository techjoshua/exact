import { defineConfig } from '@playwright/test';

/** Runs one observable behavior suite against every controlled-service participant. */
export default defineConfig({
	testDir: './e2e',
	globalSetup: './e2e/global-setup.ts',
	fullyParallel: false,
	// Both suites reset one shared deterministic service.
	workers: 1,
	retries: 0,
	reporter: 'line',
	// Parity references are captured afresh on this browser/OS, never committed as golden images.
	snapshotPathTemplate:
		'{testDir}/../test-results/presentation-reference/{testFilePath}/{testName}/{arg}{ext}',
	use: {
		trace: 'retain-on-failure'
	}
});
