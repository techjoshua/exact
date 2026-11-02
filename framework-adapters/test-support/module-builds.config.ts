import { defineConfig } from 'vitest/config';

// These tests compile their fixtures through each adapter's own build hooks.
// They do not mount components or need the workspace component-runtime setup.
export default defineConfig({
	test: {
		include: [
			'framework-adapters/vite-plugin/src/project-source-isolation.integration.test.ts',
			'framework-adapters/webpack-plugin/src/project-source-isolation.integration.test.ts'
		],
		maxWorkers: 2
	}
});
