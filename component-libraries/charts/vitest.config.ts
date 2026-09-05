import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /(?:chart-behavior\.fixtures|components|plot)\.tsx?$/,
				reactCompatibility: false
			}
		})
	],
	test: {
		name: '@exactjs/charts-client',
		environment: 'jsdom',
		exclude: ['src/chart-server.test.ts']
	}
});
