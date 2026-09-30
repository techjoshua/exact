import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /(?:chart-server\.fixtures|chart-table\.fixtures|components|plot|data-table)\.tsx?$/,
				reactCompatibility: false,
				target: 'server',
				internationalization: {
					owner: '@exactjs/charts',
					sourceLocale: 'en-US',
					locales: ['de-DE']
				}
			}
		})
	],
	test: {
		name: '@exactjs/charts-server',
		environment: 'node',
		include: ['src/chart-server.test.ts']
	}
});
