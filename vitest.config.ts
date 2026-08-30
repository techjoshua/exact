import { exactVitest } from '@exactjs/vitest';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const componentRuntimeTestSetup = fileURLToPath(
	new URL('./packages/core/src/test-support/runtime-surfaces.ts', import.meta.url)
);
const domSource = fileURLToPath(new URL('./packages/dom/src/', import.meta.url)).replaceAll(
	'\\',
	'/'
);
const coreSource = fileURLToPath(new URL('./packages/core/src/', import.meta.url)).replaceAll(
	'\\',
	'/'
);
const reactiveSource = fileURLToPath(
	new URL('./packages/reactive/src/', import.meta.url)
).replaceAll('\\', '/');

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include:
					/(?:\.fixtures\.tsx$|packages[\\/]core[\\/]src[\\/]component[\\/]error-boundary\.tsx$|packages[\\/]dom[\\/]src[\\/]testing-component\.tsx$|packages[\\/]dom[\\/]src[\\/].*\.test\.tsx$|packages[\\/](?:intl|theme)[\\/]src[\\/]components\.ts$|plugins[\\/]microfrontends[\\/]src[\\/]client\.ts$)/,
				compileTestModules: true,
				debug: { runtime: false, catalog: false },
				typescriptConfig: fileURLToPath(
					new URL('./packages/dom/tsconfig.test.json', import.meta.url)
				),
				reactCompatibility: false
			}
		})
	],
	// exactc emits package subpath imports. Keep compiled DOM fixtures and the renderer under test in
	// one source module graph so a focused test never depends on a previously built package artifact.
	resolve: {
		alias: [
			{ find: /^@exactjs\/reactive\/(.+)$/, replacement: `${reactiveSource}$1.ts` },
			{ find: '@exactjs/reactive', replacement: `${reactiveSource}index.ts` },
			{ find: /^@exactjs\/core\/(.+)$/, replacement: `${coreSource}$1.ts` },
			{ find: '@exactjs/core', replacement: `${coreSource}index.ts` },
			{ find: /^@exactjs\/dom\/(.+)$/, replacement: `${domSource}$1.ts` },
			{ find: '@exactjs/dom', replacement: `${domSource}index.ts` }
		]
	},
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
