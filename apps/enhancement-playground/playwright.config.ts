import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	outputDir: '../../.tmp/playwright/theme-lab',
	grep: /changes tab content|hold confirmation|preview actions|orb initially|released orb|physics walls|reactively republishes|renders every temperament|lets Chromium paint/,
	snapshotPathTemplate: '../docs/e2e/{testFileName}-snapshots/{arg}-{projectName}-{platform}{ext}',
	fullyParallel: false,
	timeout: 90_000,
	reporter: 'line',
	webServer: process.env.THEME_LAB_MANAGED_SERVER
		? undefined
		: {
				command: 'npm run dev -- --host 127.0.0.1 --port 4176',
				url: 'http://127.0.0.1:4176',
				reuseExistingServer: !process.env.CI,
				timeout: 120_000
			},
	use: {
		baseURL: 'http://127.0.0.1:4176',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				colorScheme: 'light',
				viewport: { width: 1440, height: 1000 }
			}
		}
	]
});
