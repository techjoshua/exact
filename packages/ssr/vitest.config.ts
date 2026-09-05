import { exactVitest } from '@exactjs/vitest';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const coreRuntimeTestSetup = fileURLToPath(
	new URL('../core/src/test-support/runtime-surfaces.ts', import.meta.url)
);
const ssrRuntimeTestSetup = fileURLToPath(
	new URL('./src/test-support/runtime-surfaces.ts', import.meta.url)
);

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /\.fixtures\.test\.tsx$/,
				compileTestModules: true,
				typescriptConfig: fileURLToPath(new URL('./tsconfig.test.json', import.meta.url)),
				reactCompatibility: false,
				target: 'server'
			}
		})
	],
	oxc: {
		jsx: {
			runtime: 'automatic',
			importSource: '@exactjs/jsx'
		}
	},
	test: {
		setupFiles: [coreRuntimeTestSetup, ssrRuntimeTestSetup],
		maxWorkers: 2,
		exclude: [
			...configDefaults.exclude,
			'**/.tmp/**',
			'**/dist/**',
			'test-fixtures/**',
			'**/*.fixtures.test.tsx'
		]
	}
});
