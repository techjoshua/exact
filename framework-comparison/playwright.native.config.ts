import { defineConfig } from '@playwright/test';

/** Runs isolated correctness checks for native-full-stack participants only. */
export default defineConfig({
	testDir: './e2e-native',
	globalSetup: './e2e/native-global-setup.ts',
	fullyParallel: false,
	workers: 1,
	snapshotPathTemplate:
		'{testDir}/../test-results/presentation-reference/{testFilePath}/{testName}/{arg}{ext}',
	retries: 0,
	reporter: 'line',
	use: { trace: 'retain-on-failure' }
});
