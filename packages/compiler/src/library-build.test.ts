import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, onTestFinished, vi } from 'vitest';
import { buildLibrary } from './library-build.js';
import { runLibraryBuildCli } from './library-build/cli.js';
import { withLibraryOutput } from './library-build/output.js';

// Full TypeScript and native compiler builds also run through the package's own test command.
vi.setConfig({ testTimeout: 30_000 });

async function fixture() {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-library-builder-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await symlink(
		fileURLToPath(new URL('../../../node_modules', import.meta.url)),
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

it('builds a clean library with declarations, paired exports and deterministic metadata', async () => {
	const { root } = await fixture();
	await writeFile(path.join(root, 'src/unused.test.ts'), 'const invalid: number = "test-only";');
	await mkdir(path.join(root, 'src/test-support'));
	await writeFile(
		path.join(root, 'src/test-support/only.ts'),
		'const invalid: number = "test-only";'
	);
	await runLibraryBuildCli(['--root', root]);
	expect(await readFile(path.join(root, 'dist/index.d.ts'), 'utf8')).toContain('Example');
	await expect(readFile(path.join(root, 'dist/unused.test.js'))).rejects.toMatchObject({
		code: 'ENOENT'
	});
	await expect(readdir(path.join(root, 'dist/test-support'))).rejects.toMatchObject({
		code: 'ENOENT'
	});
	const facts = JSON.parse(
		await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8')
	);
	expect(facts.exports).toHaveLength(2);
	expect(facts.exports.map((entry: { condition: string }) => entry.condition).sort()).toEqual([
		'browser',
		'default'
	]);
	expect(
		facts.exports.every((entry: { componentModule: string }) =>
			entry.componentModule.endsWith('/Example.js')
		)
	).toBe(true);
	for (const target of ['client', 'server']) {
		expect(await readFile(path.join(root, `dist/${target}/Example.js`), 'utf8')).toContain(
			'Hello library'
		);
		const map = JSON.parse(
			await readFile(path.join(root, `dist/${target}/index.d.ts.map`), 'utf8')
		);
		expect(map.sources).toEqual(['../../src/index.ts']);
	}
	await buildLibrary({ root });
	expect(
		JSON.parse(await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8'))
	).toEqual(facts);
}, 30_000);

it('rebuilds transitive exports without stale module caches, and restores output after failure', async () => {
	const { root, manifest, json } = await fixture();
	await buildLibrary({ root });
	const previous = await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8');
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		'export function Changed() { return () => <p>Changed</p>; }'
	);
	await writeFile(
		path.join(root, 'src/index.ts'),
		"export { Changed as Example } from './Example.js';"
	);
	await buildLibrary({ root });
	const updated = await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8');
	expect(updated).not.toBe(previous);
	await json('package.json', { ...manifest, exactCompiledComponents: ['Missing'] });
	await expect(buildLibrary({ root })).rejects.toThrow(/not a compiled component artifact/);
	expect(await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8')).toBe(updated);
	expect((await readdir(root)).some((name) => name.startsWith('.exact-library-build'))).toBe(false);
}, 30_000);

it('rejects undeclared generated dependencies and cleans a failed first build', async () => {
	const { root, manifest, json } = await fixture();
	await json('package.json', { ...manifest, dependencies: {} });
	await expect(buildLibrary({ root })).rejects.toThrow(
		/must declare dependencies imported by compiled artifacts/
	);
	await expect(readdir(path.join(root, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each([
	{ exactTargetDirectories: { client: 'same', server: 'same' } },
	{ exactTargetDirectories: { client: '../src' } },
	{ exactComponentLibrary: { protocol: 1, build: '../outside.json' } },
	{ exactCompileModules: ['../outside.ts'] }
])('rejects unsafe build plans before touching previous output: %j', async (change) => {
	const { root, manifest, json } = await fixture();
	await mkdir(path.join(root, 'dist'));
	await writeFile(path.join(root, 'dist/keep.txt'), 'previous');
	await json('package.json', { ...manifest, ...change });
	await expect(buildLibrary({ root, declarations: false })).rejects.toThrow();
	expect(await readFile(path.join(root, 'dist/keep.txt'), 'utf8')).toBe('previous');
});

it('does not follow an output symlink or overlap another build', async () => {
	const { root } = await fixture();
	const outside = path.join(root, 'outside');
	await mkdir(outside);
	await writeFile(path.join(outside, 'keep'), 'untouched');
	await symlink(outside, path.join(root, 'dist'), 'dir');
	await expect(buildLibrary({ root })).rejects.toThrow(/symbolic links/);
	expect(await readFile(path.join(outside, 'keep'), 'utf8')).toBe('untouched');
	await rm(path.join(root, 'dist'));
	await withLibraryOutput(root, false, async () => {
		await expect(buildLibrary({ root })).rejects.toThrow(/already owns/);
	});
});

it.each([['--project'], ['--root'], ['--unknown']])(
	'rejects invalid CLI arguments %s',
	async (arg) => {
		await expect(runLibraryBuildCli([arg])).rejects.toThrow();
	}
);

it('confines declaration output and restores a previously successful generation', async () => {
	const { root, json } = await fixture();
	await buildLibrary({ root });
	const previous = await readFile(path.join(root, 'dist/server/Example.js'), 'utf8');
	await json('tsconfig.types.json', {
		extends: './tsconfig.json',
		compilerOptions: { outDir: 'outside' }
	});
	await expect(buildLibrary({ root, project: 'tsconfig.types.json' })).rejects.toThrow(
		/must stay inside dist/
	);
	await expect(readdir(path.join(root, 'outside'))).rejects.toMatchObject({ code: 'ENOENT' });
	expect(await readFile(path.join(root, 'dist/server/Example.js'), 'utf8')).toBe(previous);
});

it('supports declaration-only projects and custom paired target names', async () => {
	const { root, manifest, json } = await fixture();
	await json('tsconfig.types.json', {
		extends: './tsconfig.json',
		compilerOptions: { outDir: 'dist/types', emitDeclarationOnly: true }
	});
	await json('package.json', {
		...manifest,
		exactTargetDirectories: { client: 'browser', server: 'node' },
		exports: {
			'.': {
				types: './dist/types/index.d.ts',
				browser: './dist/browser/index.js',
				default: './dist/node/index.js'
			}
		}
	});
	await runLibraryBuildCli(['--root', root, '--project', 'tsconfig.types.json']);
	expect(await readFile(path.join(root, 'dist/types/index.d.ts'), 'utf8')).toContain('Example');
	expect(await readFile(path.join(root, 'dist/browser/Example.js'), 'utf8')).toContain(
		'Hello library'
	);
	expect(await readFile(path.join(root, 'dist/node/Example.js'), 'utf8')).toContain(
		'Hello library'
	);
	await expect(readFile(path.join(root, 'dist/index.js'))).rejects.toMatchObject({
		code: 'ENOENT'
	});
});

it('rejects an export path that traverses out of its declared target', async () => {
	const { root, manifest, json } = await fixture();
	await json('package.json', {
		...manifest,
		exports: {
			'.': {
				browser: './dist/client/../../src/Example.js',
				default: './dist/server/index.js'
			}
		}
	});
	await expect(buildLibrary({ root })).rejects.toThrow(/export escapes its target directory/);
});

it.each(['outDir', 'declarationDir'])(
	'rejects %s inside a replaceable target tree',
	async (field) => {
		const { root, json } = await fixture();
		await json('tsconfig.types.json', {
			extends: './tsconfig.json',
			compilerOptions: { [field]: 'dist/server/types' }
		});
		await expect(buildLibrary({ root, project: 'tsconfig.types.json' })).rejects.toThrow(
			/outside the client and server target directories/
		);
	}
);

it('preserves NodeNext .mjs imports and declaration extensions', async () => {
	const { root } = await fixture();
	await writeFile(path.join(root, 'src/helper.mts'), 'export const message = "NodeNext library";');
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		'import { message } from "./helper.mjs"; export function Example() { return () => <p>{message}</p>; }'
	);
	await buildLibrary({ root });
	await expect(readFile(path.join(root, 'dist/client/helper.js'))).rejects.toMatchObject({
		code: 'ENOENT'
	});
	// Export validation imports both complete target graphs in fresh Node processes.
	for (const target of ['client', 'server']) {
		expect(await readFile(path.join(root, `dist/${target}/helper.mjs`), 'utf8')).toContain(
			'NodeNext library'
		);
		expect(await readFile(path.join(root, `dist/${target}/helper.d.mts`), 'utf8')).toContain(
			'message'
		);
	}
});

it.each(['cts', 'cjs'])(
	'rejects CommonJS .%s sources before replacing output',
	async (extension) => {
		const { root } = await fixture();
		await writeFile(path.join(root, 'src/helper.' + extension), 'const answer = 42;');
		await expect(buildLibrary({ root })).rejects.toThrow(/does not support CommonJS/);
		await expect(readdir(path.join(root, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' });
	}
);

it('rejects inferred declaration collisions and supports renamed target directories', async () => {
	const { root, manifest, json } = await fixture();
	await buildLibrary({ root });
	const previous = await readFile(path.join(root, 'dist/server/Example.js'), 'utf8');
	await mkdir(path.join(root, 'src/server'));
	await writeFile(path.join(root, 'src/server/helper.ts'), 'export const answer = 42;');
	await expect(buildLibrary({ root })).rejects.toThrow(/overlaps a target directory/);
	expect(await readFile(path.join(root, 'dist/server/Example.js'), 'utf8')).toBe(previous);
	await json('package.json', {
		...manifest,
		exactTargetDirectories: { client: 'browser', server: 'node' },
		exports: {
			'.': {
				types: './dist/index.d.ts',
				browser: './dist/browser/index.js',
				default: './dist/node/index.js'
			}
		}
	});
	await buildLibrary({ root });
	expect(await readFile(path.join(root, 'dist/server/helper.d.ts'), 'utf8')).toContain('answer');
	expect(await readFile(path.join(root, 'dist/node/server/helper.d.ts'), 'utf8')).toContain(
		'answer'
	);
});
