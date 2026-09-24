import { defineConfig } from '@playwright/test';

const productionUrl = process.env.EXACT_SHIPPING_ACCEPTANCE_URL;

export default defineConfig({
	workers: productionUrl ? 1 : undefined,
	outputDir: process.env.EXACT_SHIPPING_EVIDENCE ?? 'test-results',
	testDir: './e2e',
	webServer: productionUrl
		? undefined
		: {
				command: 'npm run dev',
				port: 4175,
				reuseExistingServer: true
			},
	use: { baseURL: productionUrl ?? 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
	projects: [
		{ name: 'mobile-light', use: { viewport: { width: 390, height: 844 }, colorScheme: 'light' } },
		{
			name: 'tablet-dark',
			use: { viewport: { width: 768, height: 1024 }, colorScheme: 'dark', reducedMotion: 'reduce' }
		},
		{
			name: 'desktop-light',
			use: { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' }
		}
	]
});
