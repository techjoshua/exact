import { exactVitest } from '@exactjs/vitest';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const componentRuntimeTestSetup = fileURLToPath(
	new URL('./packages/core/src/test-support/runtime-surfaces.ts', import.meta.url)
);

export default defineConfig({
	plugins: [exactVitest({ compiler: { include: /\.fixtures\.tsx$/, reactCompatibility: false } })],
	oxc: {
		jsx: {
			runtime: 'automatic',
			importSource: '@exactjs/jsx'
		}
	},
	test: {
		setupFiles: [componentRuntimeTestSetup],
		maxWorkers: 2,
		exclude: [
			...configDefaults.exclude,
			'**/.tmp/**',
			'**/dist/**',
			'packages/bun-test/test-fixtures/**'
		]
	}
});
