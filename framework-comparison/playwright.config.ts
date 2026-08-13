import { defineConfig } from '@playwright/test';

/** Runs one observable behavior suite against every controlled-service participant. */
export default defineConfig({
	testDir: './e2e',
	globalSetup: './e2e/global-setup.ts',
	fullyParallel: false,
	retries: 0,
	reporter: 'line',
	use: {
		trace: 'retain-on-failure'
	}
});
