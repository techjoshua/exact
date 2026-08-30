import { exactVitest } from '@exactjs/vitest';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const source = (relativePath: string) =>
	fileURLToPath(new URL(relativePath, import.meta.url)).replaceAll('\\', '/');

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /\.fixtures\.tsx$/,
				compileTestModules: true,
				typescriptConfig: source('./tsconfig.test.json'),
				reactCompatibility: false
			}
		})
	],
	resolve: {
		alias: [
			{ find: /^@exactjs\/core\/(.+)$/, replacement: `${source('../core/src/')}$1.ts` },
			{ find: '@exactjs/core', replacement: source('../core/src/index.ts') },
			{ find: /^@exactjs\/dom\/(.+)$/, replacement: `${source('../dom/src/')}$1.ts` },
			{ find: '@exactjs/dom', replacement: source('../dom/src/index.ts') },
			{ find: /^@exactjs\/hydrate\/(.+)$/, replacement: `${source('../hydrate/src/')}$1.ts` },
			{ find: '@exactjs/hydrate', replacement: source('../hydrate/src/index.ts') },
			{ find: /^@exactjs\/reactive\/(.+)$/, replacement: `${source('../reactive/src/')}$1.ts` },
			{ find: '@exactjs/reactive', replacement: source('../reactive/src/index.ts') },
			{ find: /^@exactjs\/ssr\/(.+)$/, replacement: `${source('../ssr/src/')}$1.ts` },
			{ find: '@exactjs/ssr', replacement: source('../ssr/src/index.ts') }
		]
	},
	oxc: { jsx: { runtime: 'automatic', importSource: '@exactjs/jsx' } },
	test: {
		environment: 'jsdom',
		setupFiles: [
			source('../core/src/test-support/runtime-surfaces.ts'),
			source('../ssr/src/test-support/runtime-surfaces.ts')
		],
		maxWorkers: 2,
		exclude: [...configDefaults.exclude, '**/.tmp/**', '**/dist/**']
	}
});
