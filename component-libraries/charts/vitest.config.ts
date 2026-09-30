import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include:
					/(?:chart-behavior\.fixtures|chart-table\.fixtures|components|plot|data-table)\.tsx?$/,
				reactCompatibility: false,
				compileTestModules: true
			}
		})
	],
	test: {
		name: '@exactjs/charts-client',
		environment: 'jsdom',
		exclude: ['src/chart-server.test.ts']
	}
});
