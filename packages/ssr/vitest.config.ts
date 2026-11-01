import { exactVitest } from '@exactjs/vitest';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const coreRuntimeTestSetup = fileURLToPath(
	new URL('../core/src/test-support/runtime-surfaces.ts', import.meta.url)
);
const ssrRuntimeTestSetup = fileURLToPath(
	new URL('./src/test-support/runtime-surfaces.ts', import.meta.url)
);

const coreSource = fileURLToPath(new URL('../core/src/', import.meta.url)).replaceAll('\\', '/');
const reactiveSource = fileURLToPath(new URL('../reactive/src/', import.meta.url)).replaceAll(
	'\\',
	'/'
);

export default defineConfig({
	// Compiler dependency markers and consumers must share the source module graph.
	resolve: {
		alias: [
			{ find: /^@exactjs\/core\/(.+)$/, replacement: `${coreSource}$1.ts` },
			{ find: '@exactjs/core', replacement: `${coreSource}index.ts` },
			{ find: /^@exactjs\/reactive\/(.+)$/, replacement: `${reactiveSource}$1.ts` },
			{ find: '@exactjs/reactive', replacement: `${reactiveSource}index.ts` }
		]
	},
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
