import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onTestFinished } from 'vitest';

/** Creates an owned library checkout and removes it after the requesting test. */
export async function createLibraryBuildFixture() {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-library-builder-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await symlink(
		fileURLToPath(new URL('../../../../node_modules', import.meta.url)),
		path.join(root, 'node_modules'),
		'dir'
	);
	await mkdir(path.join(root, 'src'));
	const manifest = {
		name: '@fixture/library',
		version: '1.0.0',
		type: 'module',
		files: ['dist'],
		exports: {
			'.': {
				types: './dist/index.d.ts',
				browser: './dist/client/index.js',
				default: './dist/server/index.js'
			}
		},
		exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' },
		exactCompiledComponents: ['Example'],
		dependencies: {
			'@exactjs/core': '^0.6.0',
			'@exactjs/dom': '^0.6.0',
			'@exactjs/component-library': '^0.6.0'
		}
	};
	const json = (file: string, value: unknown) =>
		writeFile(path.join(root, file), JSON.stringify(value));
	await json('package.json', manifest);
	await json('tsconfig.json', {
		compilerOptions: {
			target: 'ES2022',
			module: 'NodeNext',
			moduleResolution: 'NodeNext',
			strict: true,
			jsx: 'react-jsx',
			jsxImportSource: '@exactjs/jsx',
			skipLibCheck: true,
			rootDir: 'src',
			outDir: 'dist',
			declaration: true,
			declarationMap: true,
			inlineSources: true,
			sourceMap: true
		},
		include: ['src']
	});
	await writeFile(path.join(root, 'src/index.ts'), "export { Example } from './Example.js';");
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		'export function Example() { return () => <p>Hello library</p>; }'
	);
	return { root, manifest, json };
}
