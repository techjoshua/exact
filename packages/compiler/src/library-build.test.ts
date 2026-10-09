import { createLibraryBuildFixture as fixture } from './test-support/library-build.fixture.js';
import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildLibrary } from './library-build.js';
import { runLibraryBuildCli } from './library-build/cli.js';
import { watchLibraryBuild } from './library-build/watch.js';
import { withLibraryOutput } from './library-build/output.js';

// Full TypeScript and native compiler builds also run through the package's own test command.
vi.setConfig({ testTimeout: 30_000 });

it('accepts contained source, declarations, facts, and exports whose names begin with two dots', async () => {
	const { root, manifest, json } = await fixture();
	await rm(path.join(root, 'src/Example.tsx'));
	await writeFile(
		path.join(root, 'src/..Example.tsx'),
		'export function Example(){return()=> <p>Contained</p>;}'
	);
	await writeFile(path.join(root, 'src/index.ts'), "export {Example} from './..Example.js';");
	const configured = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'));
	configured.compilerOptions.declarationDir = './dist/..types';
	await json('tsconfig.json', configured);
	await json('package.json', {
		...manifest,
		exactCompileModules: ['src/index.ts', 'src/..Example.tsx'],
		exactComponentLibrary: { protocol: 1, build: './dist/..facts.json' },
		exactCompiledComponents: { '.': ['Example'], './hidden': ['Example'] },
		exports: {
			'.': { ...manifest.exports['.'], types: './dist/..types/index.d.ts' },
			'./hidden': { browser: './dist/client/..Example.js', default: './dist/server/..Example.js' }
		}
	});
	await buildLibrary({ root });
	expect(await readFile(path.join(root, 'dist/..types/..Example.d.ts'), 'utf8')).toContain(
		'Example'
	);
	expect(
		JSON.parse(await readFile(path.join(root, 'dist/..facts.json'), 'utf8')).exports
	).toHaveLength(4);
});

it('honors the library project exclusions for both executable targets', async () => {
	const { root, json } = await fixture();
	await json('tsconfig.build.json', {
		extends: './tsconfig.json',
		exclude: ['src/Private.fixture.tsx']
	});
	await writeFile(
		path.join(root, 'src/Private.fixture.tsx'),
		'export function Private(){ return()=> <p>not published</p>; }'
	);
	await buildLibrary({ root, project: 'tsconfig.build.json' });
	for (const target of ['client', 'server'])
		await expect(
			readFile(path.join(root, `dist/${target}/Private.fixture.js`))
		).rejects.toMatchObject({ code: 'ENOENT' });
});

it('reports missing generated dependencies across both targets in one failure', async () => {
	const { root, manifest, json } = await fixture();
	await json('package.json', { ...manifest, dependencies: {} });
	await expect(buildLibrary({ root })).rejects.toThrow('@exactjs/core (client, server)');
});

it('stages only inside the ignored package cache and releases its lock', async () => {
	const { root } = await fixture();
	await withLibraryOutput(root, false, async () => {
		const cache = await readdir(path.join(root, '.exact'));
		expect(cache).toContain('library-build.lock');
		expect(cache.filter((name) => name.startsWith('library-build-'))).toHaveLength(1);
		expect((await readdir(root)).some((name) => name.startsWith('.exact-library-build'))).toBe(
			false
		);
	});
	expect(await readdir(path.join(root, '.exact'))).toEqual([]);
});

it('does not reject unrelated cache links or mutate their targets', async () => {
	const { root } = await fixture();
	await mkdir(path.join(root, '.exact'));
	await mkdir(path.join(root, 'shared'));
	await writeFile(path.join(root, 'shared/keep.txt'), 'unrelated cache');
	await symlink(path.join(root, 'shared'), path.join(root, '.exact/shared-cache'), 'dir');
	await withLibraryOutput(root, false, async () => {});
	expect(await readFile(path.join(root, 'shared/keep.txt'), 'utf8')).toBe('unrelated cache');
});

it('rejects a linked staging cache before writing outside its package', async () => {
	const { root } = await fixture();
	await mkdir(path.join(root, 'outside'));
	await writeFile(path.join(root, 'outside/keep.txt'), 'unchanged');
	await symlink(path.join(root, 'outside'), path.join(root, '.exact'), 'dir');
	await expect(withLibraryOutput(root, false, async () => {})).rejects.toThrow('Library cache');
	expect(await readdir(path.join(root, 'outside'))).toEqual(['keep.txt']);
});

it('compiles imported production dependencies even when excluded as project roots', async () => {
	const { root, json } = await fixture();
	await json('tsconfig.build.json', { extends: './tsconfig.json', exclude: ['src/message.ts'] });
	await writeFile(
		path.join(root, 'src/message.ts'),
		'export const message = "Imported dependency";'
	);
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		'import {message} from "./message.js"; export function Example(){return()=> <p>{message}</p>;}'
	);
	await buildLibrary({ root, project: 'tsconfig.build.json' });
	for (const target of ['client', 'server'])
		expect(await readFile(path.join(root, `dist/${target}/message.js`), 'utf8')).toContain(
			'Imported dependency'
		);
});

it('keeps dedicated declaration trees outside both executable target trees', async () => {
	const { root, json } = await fixture();
	await json('tsconfig.types.json', {
		extends: './tsconfig.json',
		compilerOptions: { outDir: 'dist/types' }
	});
	await buildLibrary({ root, project: 'tsconfig.types.json' });
	for (const target of ['client', 'server'])
		await expect(readdir(path.join(root, `dist/${target}/types`))).rejects.toMatchObject({
			code: 'ENOENT'
		});
	expect(await readFile(path.join(root, 'dist/types/Example.d.ts'), 'utf8')).toContain('Example');
});

it('builds a clean library with declarations, paired exports and deterministic metadata', async () => {
	const { root } = await fixture();
	await writeFile(path.join(root, 'src/unused.test.ts'), 'const invalid: number = "test-only";');
	await writeFile(path.join(root, 'src/unused.spec.ts'), 'const invalid: number = "test-only";');
	await writeFile(path.join(root, 'src/unused.jest.ts'), 'const invalid: number = "test-only";');
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

it('emits authored declarations for named tasks with a component receiver', async () => {
	const { root, manifest, json } = await fixture();
	await json('package.json', {
		...manifest,
		dependencies: { ...manifest.dependencies, '@exactjs/ssr': '^0.7.0' }
	});
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`import {TaskContext,type Component} from '@exactjs/core';
export function Example(this:Component<{value:number}>, props:{initial:number}) {
 this.state.value=props.initial;
 function increment(task:TaskContext=TaskContext.server()){this.state.value++;}
 return ()=> <button onClick={()=>increment()}>{this.state.value}</button>;
}`
	);
	await buildLibrary({ root });
	const declaration = await readFile(path.join(root, 'dist/Example.d.ts'), 'utf8');
	expect(declaration).toContain('initial: number');
	expect(declaration).toContain('Component<');
	expect(declaration).not.toContain('increment');
});

it.each([
	[
		'task assignment',
		`function task(ctx:TaskContext=TaskContext.server()){this.state.value='invalid';}`
	],
	['ordinary receiver', `function ordinary(){return this.state.value;} void ordinary();`],
	['ordinary assignment', `const invalid:number='invalid';`]
])(
	'retains authored validation for invalid %s during declaration emission',
	async (_name, body) => {
		const { root } = await fixture();
		await writeFile(
			path.join(root, 'src/Example.tsx'),
			`import {TaskContext,type Component} from '@exactjs/core';
export function Example(this:Component<{value:number}>){this.state.value=0;${body} return()=> <p>{this.state.value}</p>;}`
		);
		await expect(buildLibrary({ root })).rejects.toThrow();
		await expect(readdir(path.join(root, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' });
	}
);

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

it('checks support modules omitted from selective lowering before emitting their declarations', async () => {
	const { root, manifest, json } = await fixture();
	await json('package.json', { ...manifest, exactCompileModules: ['src/Example.tsx'] });
	await writeFile(path.join(root, 'src/support.ts'), 'export const invalid:number="invalid";');
	await expect(buildLibrary({ root })).rejects.toThrow(/TS2322/);
	await expect(readdir(path.join(root, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects server-only placement in a declared paired public component export', async () => {
	const { root } = await fixture();
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		'/** @exact server */ export function Example(){return()=> <p>server only</p>;}'
	);
	await expect(buildLibrary({ root })).rejects.toThrow(
		/server boundary|compiled component artifact/
	);
	await expect(readdir(path.join(root, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' });
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

it('emits declarations without neutral JavaScript or stale lowered-module maps', async () => {
	const { root } = await fixture();
	await buildLibrary({ root });
	for (const file of ['index.js', 'Example.js', 'client/Example.js.map', 'server/Example.js.map'])
		await expect(readFile(path.join(root, 'dist', file))).rejects.toMatchObject({ code: 'ENOENT' });
});

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
	await expect(readFile(path.join(root, 'dist/node/server/helper.d.ts'))).rejects.toMatchObject({
		code: 'ENOENT'
	});
});

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
		const { root, json } = await fixture();
		await writeFile(path.join(root, 'src/helper.' + extension), 'const answer = 42;');
		await json('tsconfig.commonjs.json', {
			extends: './tsconfig.json',
			compilerOptions: { allowJs: true }
		});
		await expect(buildLibrary({ root, project: 'tsconfig.commonjs.json' })).rejects.toThrow(
			/does not support CommonJS/
		);
		await expect(readdir(path.join(root, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' });
	}
);

it('retains selective-build support modules but removes maps for lowered modules', async () => {
	const { root, manifest, json } = await fixture();
	await json('package.json', { ...manifest, exactCompileModules: ['src/Example.tsx'] });
	await buildLibrary({ root });
	for (const target of ['client', 'server']) {
		expect(await readFile(path.join(root, `dist/${target}/index.js`), 'utf8')).toContain('Example');
		expect(
			JSON.parse(await readFile(path.join(root, `dist/${target}/index.js.map`), 'utf8')).sources
		).toEqual(['../../src/index.ts']);
		await expect(readFile(path.join(root, `dist/${target}/Example.js.map`))).rejects.toMatchObject({
			code: 'ENOENT'
		});
	}
});

it.each(['mts', 'mjs'])(
	'publishes paired .%s entry points and their component metadata',
	async (extension) => {
		const { root, manifest, json } = await fixture();
		await rm(path.join(root, 'src/index.ts'));
		await writeFile(
			path.join(root, `src/index.${extension}`),
			"export { Example } from './Example.js';"
		);
		await json('tsconfig.entries.json', {
			extends: './tsconfig.json',
			compilerOptions: { allowJs: true }
		});
		await json('package.json', {
			...manifest,
			exports: {
				'.': {
					types: './dist/index.d.mts',
					browser: './dist/client/index.mjs',
					default: './dist/server/index.mjs'
				}
			}
		});
		await buildLibrary({ root, project: 'tsconfig.entries.json' });
		const facts = JSON.parse(
			await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8')
		);
		expect(facts.exports.map((entry: { module: string }) => entry.module).sort()).toEqual([
			'dist/client/index.mjs',
			'dist/server/index.mjs'
		]);
		expect(await readFile(path.join(root, 'dist/index.d.mts'), 'utf8')).toContain('Example');
	}
);

it('watches source and inherited config changes, recovers after failure, and closes its owner', async () => {
	const { root, json } = await fixture();
	await mkdir(path.join(root, 'configuration'));
	await json('configuration/base.json', { compilerOptions: { strict: true } });
	const config = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'));
	await json('tsconfig.json', { ...config, extends: './configuration/base.json' });
	let builds = 0;
	const failures: unknown[] = [];
	const watcher = watchLibraryBuild(
		{ root },
		{
			onBuild: () => {
				builds++;
			},
			onError: (error) => failures.push(error)
		}
	);
	const output = path.join(root, 'dist/server/Example.js');
	const source = path.join(root, 'src/Example.tsx');
	try {
		await watcher.ready;
		expect(failures).toEqual([]);
		expect(builds).toBe(1);
		await writeFile(source, 'export function Example(){return()=> <p>Updated library</p>;}');
		await vi.waitFor(() => expect(builds).toBeGreaterThan(1), { timeout: 15000 });
		expect(await readFile(output, 'utf8')).toContain('Updated library');
		const successful = await readFile(output, 'utf8');
		await writeFile(source, 'export function Example(){return()=> <p>');
		await vi.waitFor(() => expect(failures.length).toBeGreaterThan(0), { timeout: 15000 });
		expect(await readFile(output, 'utf8')).toBe(successful);
		const beforeRecovery = builds;
		await writeFile(source, 'export function Example(){return()=> <p>Recovered library</p>;}');
		await vi.waitFor(() => expect(builds).toBeGreaterThan(beforeRecovery), { timeout: 15000 });
		const beforeCreation = builds;
		await mkdir(path.join(root, 'src/nested'));
		await writeFile(path.join(root, 'src/nested/Additional.ts'), 'export const additional=1;');
		await vi.waitFor(() => expect(builds).toBeGreaterThan(beforeCreation), { timeout: 15000 });
		expect(await readFile(path.join(root, 'dist/server/nested/Additional.js'), 'utf8')).toContain(
			'additional'
		);
		const beforeRemoval = builds;
		await rm(path.join(root, 'src/nested/Additional.ts'));
		await vi.waitFor(() => expect(builds).toBeGreaterThan(beforeRemoval), { timeout: 15000 });
		await expect(
			readFile(path.join(root, 'dist/server/nested/Additional.js'))
		).rejects.toMatchObject({ code: 'ENOENT' });
		const beforeConfig = builds;
		await json('configuration/base.json', { compilerOptions: { strict: false } });
		await vi.waitFor(() => expect(builds).toBeGreaterThan(beforeConfig), { timeout: 15000 });
		await watcher.close();
		const final = builds;
		await writeFile(source, 'export function Example(){return()=> <p>Closed</p>;}');
		await new Promise((resolve) => setTimeout(resolve, 350));
		expect(builds).toBe(final);
		expect(await readFile(output, 'utf8')).toContain('Recovered library');
	} finally {
		await watcher.close();
	}
}, 70000);

it.each([
	'test-support/value.ts',
	'__tests__/value.ts',
	'value.test.ts',
	'value.spec.ts',
	'value.jest.ts'
])('rejects production imports of unpublished %s before replacing output', async (dependency) => {
	const { root } = await fixture();
	await mkdir(path.dirname(path.join(root, 'src', dependency)), { recursive: true });
	await writeFile(path.join(root, 'src', dependency), 'export const label="fixture";');
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`import {label} from './${dependency.replace(/\.ts$/, '.js')}'; export function Example(){return()=> <p>{label}</p>;}`
	);
	await mkdir(path.join(root, 'dist'));
	await writeFile(path.join(root, 'dist/previous.txt'), 'previous generation');
	await expect(buildLibrary({ root, declarations: false })).rejects.toThrow(
		/unpublished.*source|source.*unpublished/i
	);
	await expect(readFile(path.join(root, 'dist/previous.txt'), 'utf8')).resolves.toBe(
		'previous generation'
	);
});

it('rejects unpublished imports in selectively lowered libraries', async () => {
	const { root, manifest, json } = await fixture();
	await json('package.json', { ...manifest, exactCompileModules: ['src/Example.tsx'] });
	await mkdir(path.join(root, 'src/test-support'));
	await writeFile(path.join(root, 'src/test-support/label.ts'), 'export const label="fixture";');
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`import {label} from './test-support/label.js'; export function Example(){return()=> <p>{label}</p>;}`
	);
	await expect(buildLibrary({ root, declarations: false })).rejects.toThrow(/unpublished.*source/);
});
