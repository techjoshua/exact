import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	oxc: {
		jsx: {
			runtime: 'automatic',
			importSource: '@exactjs/jsx'
		}
	},
	test: {
		maxWorkers: 2,
		exclude: [
			...configDefaults.exclude,
			'**/.tmp/**',
			'**/dist/**',
			'packages/bun-test/test-fixtures/**'
		]
	}
});
