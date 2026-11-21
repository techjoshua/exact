import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { buildLibrary } from './library-build.js';
import { compileProjectArtifacts, transform } from './index.js';
import { artifactAnalysis } from './compilation/analysis-results.js';
import { createLibraryBuildFixture } from './test-support/library-build.fixture.js';

it.each(['component', 'caller'] as const)(
	'keeps class setter placement portable when the %s imports its installer',
	async (owner) => {
		const { root, json, manifest } = await createLibraryBuildFixture();
		const config = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'));
		await json('tsconfig.json', {
			...config,
			compilerOptions: { ...config.compilerOptions, lib: ['ES2022', 'DOM'], types: ['node'] }
		});
		await json('package.json', {
			...manifest,
			dependencies: { ...manifest.dependencies, '@exactjs/ssr': '^0.6.0' },
			exactCompileModules: ['src/Example.tsx']
		});
		const source = path.join(root, 'src');
		const entry = path.join(source, 'Example.tsx');
		const app = path.join(source, 'App.tsx');
		await writeFile(
			path.join(source, 'error.ts'),
			`export class DisplayError extends Error { constructor() { super('error'); this.name = 'DisplayError'; } }`
		);
		await writeFile(
			path.join(source, 'install.ts'),
			`import { DisplayError } from './error.js';
Object.defineProperty(DisplayError.prototype, 'name', { set(value: string) { document.title = value; } });`
		);
		await writeFile(
			entry,
			`${owner === 'component' ? "import './install.js';" : ''}
import { DisplayError } from './error.js';
function paint() {
	try { throw new DisplayError(); }
	catch (error) { if (error instanceof DisplayError) return error.message; throw error; }
}
export function Example() { return () => <p>{paint()}</p>; }`
		);
		await writeFile(
			app,
			`${owner === 'caller' ? "import './install.js';" : ''}
import { Example } from './Example.js';
export function App() { return () => <Example />; }`
		);
		const options = { rootDir: root, outDir: path.join(root, 'application') };
		const artifacts = await compileProjectArtifacts([app, entry], options);
		const example = artifacts.find((artifact) => artifact.inputFile === entry)!;
		const application = artifactAnalysis(example).components[0]!;
		if (owner === 'component') {
			expect(application.placement).toBe('client');
		} else {
			const [isolated] = await compileProjectArtifacts([entry], options);
			const standalone = artifactAnalysis(isolated!).components[0]!;
			expect(application.placement).toBe(standalone.placement);
			expect(application.artifactTargets).toEqual(standalone.artifactTargets);
			expect(application.placement).not.toBe('client');
		}
		await buildLibrary({ root });
		const library = JSON.parse(
			await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8')
		);
		for (const target of ['client', 'server']) {
			const module = library.modules.find(
				(module: { path: string }) => module.path === `dist/${target}/Example.js`
			);
			expect(module?.facts.components[0]).toMatchObject({
				placement: application.placement,
				artifactTargets: application.artifactTargets
			});
		}
	},
	30_000
);

it('keeps browser timer placement with Node ambient declarations loaded', async () => {
	const { root, json } = await createLibraryBuildFixture();
	const configFile = path.join(root, 'tsconfig.json');
	const config = JSON.parse(await readFile(configFile, 'utf8'));
	await json('tsconfig.json', {
		...config,
		compilerOptions: { ...config.compilerOptions, lib: ['ES2022', 'DOM'], types: ['node'] }
	});
	const filename = path.join(root, 'src/Example.tsx');
	const source = `import type {Component} from '@exactjs/core';export function Example(this:Component<{running:boolean}>){this.state.running=false;const step=()=>{this.state.running=false;};const advance=()=>{window.setInterval(()=>{if(this.state.running)step();},90);};advance();return()=> <p>{this.state.running}</p>;}`;
	await writeFile(filename, source);
	const options = {
		filename,
		root,
		configFile: path.join(root, 'tsconfig.json'),
		generatedValidation: 'semantic' as const
	};
	const output = transform(source, { ...options, target: 'client' });
	expect(output).toContain('__exactTaskInterval');
	expect(output).toMatch(/placement:\s*"current"/);
});

it('publishes inspected paired artifacts without converting unresolved placement into neutrality', async () => {
	const { root } = await createLibraryBuildFixture();
	await buildLibrary({ root });
	const output = path.join(root, 'dist/client/Example.js');
	const previous = await readFile(output, 'utf8');
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`declare const provider:{read():string};export function Example(){const value=provider.read();return()=> <p>{value}</p>;}`
	);
	await buildLibrary({ root });
	const facts = JSON.parse(
		await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8')
	);
	const unknown = facts.modules.flatMap(
		(module: { facts: { components: { placement: string; artifactTargets: string[] }[] } }) =>
			module.facts.components
	);
	expect(unknown).toContainEqual(
		expect.objectContaining({ placement: 'unknown', artifactTargets: [] })
	);
	expect(facts.exports.map((record: { target: string }) => record.target).sort()).toEqual([
		'client',
		'server'
	]);
	expect(await readFile(output, 'utf8')).not.toBe(previous);
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`const provider={read(){return 'Verified';}};export function Example(){const value=provider.read();return()=> <p>{value}</p>;}`
	);
	await buildLibrary({ root });
	expect(await readFile(output, 'utf8')).toContain('Verified');
}, 30_000);

it.each([
	['value.fixture.ts', false],
	['value.fixtures.ts', false],
	['value.fixture.ts', true],
	['value.fixtures.ts', true]
] as const)(
	'rejects imports of manifest-excluded %s with selective compilation %s',
	async (name, selective) => {
		const { root, manifest, json } = await createLibraryBuildFixture();
		await json('package.json', {
			...manifest,
			files: ['dist', '!dist/**/*.fixtures.*'],
			...(selective ? { exactCompileModules: ['src/Example.tsx'] } : {})
		});
		await writeFile(path.join(root, 'src', name), 'export const value="support";');
		await writeFile(
			path.join(root, 'src/Example.tsx'),
			`import {value} from './${name.replace(/\.ts$/, '.js')}';export function Example(){return()=> <p>{value}</p>;}`
		);
		await expect(buildLibrary({ root, declarations: false })).rejects.toThrow(
			/unpublished.*source/
		);
	}
);

// Publication must use declaration ownership, even when ambient declarations or
// service names resemble portable globals. Failed generations keep prior output.
it('retains borrowed native uncertainty while publishing independently inspected artifacts', async () => {
	const { root } = await createLibraryBuildFixture();
	await buildLibrary({ root, declarations: false });
	const output = path.join(root, 'dist/client/Example.js');
	await writeFile(
		path.join(root, 'src/lib.es.fixture.d.ts'),
		`interface ReadonlyArray<T>{custom():number;}declare namespace Intl{interface NumberFormat{custom():number;}}declare namespace Shadow{interface Array<T>{map():number;}}`
	);
	for (const source of [
		`declare const Math:{read():number};export function Example(){Math.read();return()=> <p/>;}`,
		`export function Example(props:{value:readonly number[]}){props.value.custom();return()=> <p/>;}`,
		`export function Example(props:{value:Intl.NumberFormat}){props.value.custom();return()=> <p/>;}`,
		`export function Example(props:{value:Shadow.Array<number>}){props.value.map();return()=> <p/>;}`
	]) {
		await writeFile(path.join(root, 'src/Example.tsx'), source);
		await buildLibrary({ root, declarations: false });
		const facts = JSON.parse(
			await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8')
		);
		expect(
			facts.modules.flatMap(
				(module: { facts: { components: { placement: string }[] } }) => module.facts.components
			)
		).toContainEqual(expect.objectContaining({ placement: 'unknown', artifactTargets: [] }));
	}
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`export function Example(props:{value:readonly number[]}){return()=> <p>{props.value.map(value=>value+1).join(',')}</p>;}`
	);
	await buildLibrary({ root, declarations: false });
	expect(await readFile(output, 'utf8')).toContain('.map(');
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`import{peek}from'@exactjs/core';export function Example(props:{value:Intl.NumberFormat}){const text=peek(()=>props.value.format(1));return()=> <p>{text}</p>;}`
	);
	await buildLibrary({ root, declarations: false });
	expect(await readFile(output, 'utf8')).toContain('.format(');
}, 30000);
