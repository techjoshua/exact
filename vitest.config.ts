import { exactVitest } from '@exactjs/vitest';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [exactVitest({ compiler: { include: /\.fixtures\.tsx$/, reactCompatibility: false } })],
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
