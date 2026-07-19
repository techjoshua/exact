import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	webServer: {
		command: 'npm run dev',
		port: 4175,
		reuseExistingServer: true
	},
	use: { baseURL: 'http://127.0.0.1:4175' },
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
