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
const domSource = fileURLToPath(new URL('../dom/src/', import.meta.url)).replaceAll('\\', '/');
const reactiveSource = fileURLToPath(new URL('../reactive/src/', import.meta.url)).replaceAll(
	'\\',
	'/'
);
const ssrSource = fileURLToPath(new URL('../ssr/src/', import.meta.url)).replaceAll('\\', '/');

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /(?:\.fixtures\.tsx$|packages[\\/]accessibility[\\/]src[\\/]components\.tsx$)/,
				compileTestModules: true,
				reactCompatibility: false
			}
		})
	],
	// Keep package roots and compiler-selected subpaths in one source module graph during tests.
	resolve: {
		alias: [
			{ find: /^@exactjs\/core\/(.+)$/, replacement: `${coreSource}$1.ts` },
			{ find: '@exactjs/core', replacement: `${coreSource}index.ts` },
			{ find: /^@exactjs\/dom\/(.+)$/, replacement: `${domSource}$1.ts` },
			{ find: '@exactjs/dom', replacement: `${domSource}index.ts` },
			{ find: /^@exactjs\/reactive\/(.+)$/, replacement: `${reactiveSource}$1.ts` },
			{ find: '@exactjs/reactive', replacement: `${reactiveSource}index.ts` },
			{ find: /^@exactjs\/ssr\/(.+)$/, replacement: `${ssrSource}$1.ts` },
			{ find: '@exactjs/ssr', replacement: `${ssrSource}index.ts` }
		]
	},
	oxc: {
		jsx: {
			runtime: 'automatic',
			importSource: '@exactjs/jsx'
		}
	},
	test: {
		setupFiles: [coreRuntimeTestSetup, ssrRuntimeTestSetup],
		maxWorkers: 2,
		exclude: [...configDefaults.exclude, '**/.tmp/**', '**/dist/**', 'test-fixtures/**']
	}
});
